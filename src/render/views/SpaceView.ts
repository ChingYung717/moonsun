import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AppState, SpaceCameraPreset } from '../../state/AppState';
import { SunBody } from '../bodies/Sun';
import { EarthBody } from '../bodies/Earth';
import { MoonBody } from '../bodies/Moon';
import { Starfield } from '../bodies/Starfield';
import { SpaceOverlays } from '../overlays/SpaceOverlays';
import { PlanetaryTextures } from '../textures';
import { EphemerisSnapshot } from '../../astro/ephemeris';
import {
  computeEarthOrientation,
  EarthOrientation,
  latLonToSceneDir,
  scenePointToLatLon,
} from '../../astro/earthOrientation';
import { MoonOrientation } from '../../astro/moonOrientation';
import { SceneScaleParams } from '../scale';
import { showToast } from '../../ui/Toast';

export class SpaceView {
  public readonly scene = new THREE.Scene();
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;

  public readonly sun: SunBody;
  public readonly earth: EarthBody;
  public readonly moon: MoonBody;
  public readonly starfield: Starfield;
  public readonly overlays: SpaceOverlays;

  private lastPreset: SpaceCameraPreset | null = null;
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = new THREE.Vector2();
  private lastEarthOrientation: EarthOrientation | null = null;

  private pickMenuEl: HTMLElement | null = null;
  private markerLayerEl: HTMLElement | null = null;
  private moonMarkerBtn: HTMLButtonElement | null = null;
  private sunMarkerBtn: HTMLButtonElement | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    textures: PlanetaryTextures,
    private state: AppState
  ) {
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.08,
      75000
    );
    this.camera.position.set(0, 2.2, 4.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 35000;

    this.starfield = new Starfield(textures.starsMilkyWay);
    this.sun = new SunBody(textures.sunSurface);
    this.earth = new EarthBody(textures);
    this.moon = new MoonBody(textures);
    this.overlays = new SpaceOverlays();

    // Attach Earth-fixed overlays (lat/lon grid + solar eclipse path) directly to Earth mesh
    this.earth.mesh.add(this.overlays.earthLocalGroup);

    this.scene.add(
      this.starfield.group,
      this.sun.group,
      this.earth.group,
      this.moon.group,
      this.overlays.group
    );

    this.setupPicking(canvas);
    this.setupScreenMarkers();

    this.state.subscribe((s, changed) => {
      if (
        (changed.has('viewMode') && s.viewMode !== 'space') ||
        (changed.has('scaleMode') && s.scaleMode !== 'realistic') ||
        (changed.has('uiHidden') && s.uiHidden)
      ) {
        this.setHudVisible(false);
      }
    });
  }

  public setHudVisible(visible: boolean): void {
    if (!visible) {
      if (this.markerLayerEl) {
        this.markerLayerEl.style.display = 'none';
      }
      if (this.moonMarkerBtn) {
        this.moonMarkerBtn.style.display = 'none';
      }
      if (this.sunMarkerBtn) {
        this.sunMarkerBtn.style.display = 'none';
      }
      this.hidePickMenu();
    }
  }

  private setupScreenMarkers(): void {
    const layer = document.createElement('div');
    layer.className = 'ms-space-markers';

    const moonBtn = document.createElement('button');
    moonBtn.type = 'button';
    moonBtn.className = 'ms-body-marker ms-body-marker-moon';
    moonBtn.innerHTML = `<span class="ms-marker-dot"></span><span>🌙 月球 (点击聚焦)</span>`;
    moonBtn.style.display = 'none';
    moonBtn.addEventListener('click', () => {
      this.state.update({ spaceCameraPreset: 'moon' });
    });

    const sunBtn = document.createElement('button');
    sunBtn.type = 'button';
    sunBtn.className = 'ms-body-marker ms-body-marker-sun';
    sunBtn.innerHTML = `<span class="ms-marker-dot"></span><span>☀️ 太阳</span>`;
    sunBtn.style.display = 'none';
    sunBtn.addEventListener('click', () => {
      this.state.update({ spaceCameraPreset: 'sun' });
    });

    layer.append(moonBtn, sunBtn);
    document.body.appendChild(layer);
    this.markerLayerEl = layer;
    this.moonMarkerBtn = moonBtn;
    this.sunMarkerBtn = sunBtn;
  }

  private hidePickMenu(): void {
    if (this.pickMenuEl) {
      this.pickMenuEl.remove();
      this.pickMenuEl = null;
    }
  }

  private showEarthPickMenu(x: number, y: number, lat: number, lon: number): void {
    this.hidePickMenu();
    const coordStr = `${lat >= 0 ? lat.toFixed(2) + '°N' : (-lat).toFixed(2) + '°S'}, ${
      lon >= 0 ? lon.toFixed(2) + '°E' : (-lon).toFixed(2) + '°W'
    }`;

    const menu = document.createElement('div');
    menu.className = 'ms-earth-pick-menu';
    const left = Math.min(window.innerWidth - 220, Math.max(12, x + 8));
    const top = Math.min(window.innerHeight - 150, Math.max(58, y - 16));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.innerHTML = `
      <div class="ms-pick-title">📍 地球选点 (${coordStr})</div>
      <div class="ms-pick-actions">
        <button type="button" class="ms-pick-btn ms-pick-primary" data-act="set">设为观测点</button>
        <button type="button" class="ms-pick-btn" data-act="ground">进入此地地面视角</button>
        <button type="button" class="ms-pick-btn ms-pick-cancel" data-act="cancel">取消</button>
      </div>
    `;

    menu.querySelector('[data-act="set"]')?.addEventListener('click', () => {
      this.state.pushUndoSnapshot('修改观测点');
      this.state.setEarthLocation({ lat, lon });
      this.hidePickMenu();
      showToast({
        message: `已将观测点设为 ${coordStr}`,
        actionLabel: '↩ 返回上一位置',
        onAction: () => {
          this.state.undoLastJump();
        },
      });
    });

    menu.querySelector('[data-act="ground"]')?.addEventListener('click', () => {
      this.state.pushUndoSnapshot('进入地面视角');
      this.state.setEarthLocation({ lat, lon });
      this.state.update({ viewMode: 'ground' });
      this.hidePickMenu();
      showToast({
        message: `已进入 ${coordStr} 地面视角`,
        actionLabel: '↩ 返回',
        onAction: () => {
          this.state.undoLastJump();
        },
      });
    });

    menu.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      this.hidePickMenu();
    });

    document.body.appendChild(menu);
    this.pickMenuEl = menu;
  }

  private setupPicking(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDownPos.set(e.clientX, e.clientY);
      if (this.pickMenuEl && !this.pickMenuEl.contains(e.target as Node)) {
        this.hidePickMenu();
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (this.state.get().viewMode !== 'space') return;
      const moveDist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );
      if (moveDist > 5) return; // Was a drag, not a click

      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObject(this.earth.mesh, false);
      if (hits.length > 0 && this.lastEarthOrientation) {
        const hitPoint = hits[0].point.clone().normalize();
        const { lat, lon } = scenePointToLatLon(hitPoint, this.lastEarthOrientation);
        this.showEarthPickMenu(e.clientX, e.clientY, lat, lon);
      }
    });

    canvas.addEventListener('dblclick', (e) => {
      if (this.state.get().viewMode !== 'space') return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(ndc, this.camera);

      const earthHits = this.raycaster.intersectObject(this.earth.mesh, false);
      if (earthHits.length > 0 && this.lastEarthOrientation) {
        this.hidePickMenu();
        const hitPoint = earthHits[0].point.clone().normalize();
        const { lat, lon } = scenePointToLatLon(hitPoint, this.lastEarthOrientation);
        this.state.pushUndoSnapshot('双击进入地面视角');
        this.state.setEarthLocation({ lat, lon });
        this.state.update({ viewMode: 'ground' });
        showToast({
          message: `已进入 ${this.state.get().earthObserver.name} 地面视角`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
        return;
      }

      const moonHits = this.raycaster.intersectObject(this.moon.mesh, false);
      if (moonHits.length > 0) {
        this.hidePickMenu();
        this.state.pushUndoSnapshot('双击进入月面视角');
        this.state.update({ viewMode: 'moon' });
      }
    });
  }

  public applyCameraPreset(
    preset: SpaceCameraPreset,
    scale: SceneScaleParams,
    eph: EphemerisSnapshot
  ): void {
    const s = this.state.get();
    if (preset === 'earth') {
      this.controls.target.set(0, 0, 0);
      // C4: Orient camera so BOTH the observer and the sunlit/terminator side are visible!
      let viewDir = eph.sunDirThree
        .clone()
        .add(new THREE.Vector3(0.2, 0.32, 0.25))
        .normalize();
      if (this.lastEarthOrientation) {
        const obsDir = latLonToSceneDir(
          s.earthObserver.lat,
          s.earthObserver.lon,
          this.lastEarthOrientation
        );
        // Blend observer direction with sun direction so terminator & observer both appear on screen
        viewDir = obsDir
          .clone()
          .multiplyScalar(0.72)
          .add(eph.sunDirThree.clone().multiplyScalar(0.45))
          .add(new THREE.Vector3(0, 0.2, 0))
          .normalize();
      }
      this.camera.position.copy(viewDir.multiplyScalar(3.2));
    } else if (preset === 'moon') {
      this.controls.target.copy(scale.moonPositionThree);
      const toEarth = scale.moonPositionThree.clone().negate().normalize();
      const viewDir = toEarth
        .add(eph.sunDirThree.clone().multiplyScalar(0.6))
        .add(new THREE.Vector3(0, 0.2, 0))
        .normalize();
      this.camera.position
        .copy(scale.moonPositionThree)
        .add(viewDir.multiplyScalar(scale.moonRadius * 4.8));
    } else if (preset === 'sun') {
      this.controls.target.set(0, 0, 0);
      const pos = scale.sunPositionThree
        .clone()
        .multiplyScalar(0.85)
        .add(new THREE.Vector3(0, scale.sunRadius * 1.2, 0));
      this.camera.position.copy(pos);
    } else if (preset === 'eclipticNorth') {
      this.controls.target.set(0, 0, 0);
      const dist = scale.moonPositionThree.length() * 2.3;
      this.camera.position.set(0, dist, 0.01);
    } else if (preset === 'sunMoonLine') {
      this.controls.target.set(0, 0.1, 0);
      const sunSide = eph.sunDirThree
        .clone()
        .add(new THREE.Vector3(0.12, 0.22, 0.1))
        .normalize();
      this.camera.position.copy(sunSide.multiplyScalar(2.85));
    }
    this.controls.update();
  }

  public focusOnEarthLatLon(lat: number, lon: number, dist = 2.8): void {
    const ori = computeEarthOrientation(this.state.get().timeUtc);
    this.lastEarthOrientation = ori;
    const obsDir = latLonToSceneDir(lat, lon, ori);
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(obsDir.multiplyScalar(dist));
    this.controls.update();
  }

  private updateScreenMarkers(scale: SceneScaleParams): void {
    const s = this.state.get();
    if (!this.markerLayerEl || !this.moonMarkerBtn || !this.sunMarkerBtn) return;

    if (s.viewMode !== 'space' || s.uiHidden) {
      this.setHudVisible(false);
      return;
    }
    this.markerLayerEl.style.display = 'block';

    // Show screen-space markers in realistic scale (or when Moon is far from camera)
    const showMarkers = s.scaleMode === 'realistic';
    if (!showMarkers) {
      this.moonMarkerBtn.style.display = 'none';
      this.sunMarkerBtn.style.display = 'none';
      return;
    }

    const placeMarker = (btn: HTMLButtonElement, worldPos: THREE.Vector3) => {
      const p = worldPos.clone().project(this.camera);
      if (p.z > 1) {
        btn.style.display = 'none';
        return;
      }
      const x = ((p.x + 1) * 0.5) * window.innerWidth;
      const y = ((-p.y + 1) * 0.5) * window.innerHeight;
      if (x < 10 || x > window.innerWidth - 10 || y < 44 || y > window.innerHeight - 36) {
        const clampedX = Math.max(60, Math.min(window.innerWidth - 80, x));
        const clampedY = Math.max(56, Math.min(window.innerHeight - 56, y));
        btn.style.left = `${clampedX}px`;
        btn.style.top = `${clampedY}px`;
        btn.style.display = 'inline-flex';
      } else {
        btn.style.left = `${x}px`;
        btn.style.top = `${y}px`;
        btn.style.display = 'inline-flex';
      }
    };

    placeMarker(this.moonMarkerBtn, scale.moonPositionThree);
    placeMarker(this.sunMarkerBtn, scale.sunPositionThree);
  }

  update(
    eph: EphemerisSnapshot,
    earthOri: EarthOrientation,
    moonOri: MoonOrientation,
    scale: SceneScaleParams,
    moonIllumFraction: number
  ): void {
    this.lastEarthOrientation = earthOri;
    const s = this.state.get();

    this.starfield.setShowConstellations(s.overlays.constellations);
    this.sun.update(scale.sunPositionThree, scale.sunRadius, eph.utcMs);
    this.earth.update(eph, earthOri);
    this.moon.update(
      eph,
      moonOri,
      scale.moonPositionThree,
      scale.moonRadius,
      moonIllumFraction
    );
    this.overlays.update(s, eph, earthOri, scale);

    if (s.spaceCameraPreset !== this.lastPreset) {
      this.lastPreset = s.spaceCameraPreset;
      this.applyCameraPreset(s.spaceCameraPreset, scale, eph);
    } else if (s.spaceCameraPreset === 'moon') {
      this.controls.target.copy(scale.moonPositionThree);
    }

    this.controls.update();
    this.updateScreenMarkers(scale);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
