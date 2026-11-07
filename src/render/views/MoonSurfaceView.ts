import * as THREE from 'three';
import { AppState } from '../../state/AppState';
import { PlanetaryTextures } from '../textures';
import { Starfield } from '../bodies/Starfield';
import { EARTH_FRAGMENT_SHADER, EARTH_VERTEX_SHADER } from '../shaders/earth.glsl';
import { EphemerisSnapshot } from '../../astro/ephemeris';
import { MoonSurfaceSky } from '../../astro/observer';
import { EarthOrientation } from '../../astro/earthOrientation';
import { MoonOrientation } from '../../astro/moonOrientation';
import { sceneToMoonHorizonMatrix } from '../../astro/horizonFrames';
import { altAzToHorizVec } from './GroundView';
import { DEG2RAD, astroToThreeVec, clamp } from '../../utils/math';

function createRedRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 256;
    const cy = 256;

    const grad = ctx.createRadialGradient(cx, cy, 102, cx, cy, 248);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.0)');
    grad.addColorStop(0.06, 'rgba(255, 70, 15, 0.0)');
    grad.addColorStop(0.12, 'rgba(255, 110, 30, 1.0)');
    grad.addColorStop(0.22, 'rgba(255, 180, 75, 0.95)');
    grad.addColorStop(0.42, 'rgba(220, 55, 15, 0.45)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MoonSurfaceView {
  public readonly scene = new THREE.Scene();
  public readonly camera: THREE.PerspectiveCamera;

  public lockTarget: 'earth' | 'sun' | 'free' = 'earth';
  private lookAzimuthDeg = 180;
  private lookAltitudeDeg = 45;
  private isDragging = false;
  private prevPointer = { x: 0, y: 0 };
  private pinchStartDist = 0;
  private pinchStartFov = 55;
  private onLockChangeCallbacks: Array<() => void> = [];

  private starfield: Starfield;
  private terrainMesh: THREE.Mesh;
  private horizonRimLine: THREE.Line;
  private terrainLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  private sunGroup = new THREE.Group();
  private sunMesh: THREE.Mesh;
  private sunCoronaSprite: THREE.Sprite;

  private earthGroup = new THREE.Group();
  private earthMesh: THREE.Mesh;
  private earthMat: THREE.ShaderMaterial;
  private earthEclipseRedRing: THREE.Sprite;

  private hudOverlayEl: HTMLElement | null = null;
  private earthLabelEl: HTMLElement | null = null;
  private sunLabelEl: HTMLElement | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    textures: PlanetaryTextures,
    private state: AppState
  ) {
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      60000
    );
    this.camera.position.set(0, 2.2, 0);

    // 1. Starfield in airless black lunar sky
    this.starfield = new Starfield(textures.starsMilkyWay);
    this.scene.add(this.starfield.group);

    // 2. Cratered Lunar Regolith Terrain + Horizon Mountain Silhouette
    const terrainGeo = new THREE.PlaneGeometry(2400, 2400, 128, 128);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const r = Math.hypot(x, z);
      const az = Math.atan2(x, -z);
      const crater1 = Math.sin(r * 0.025) * Math.cos(x * 0.015) * 6.5;
      const crater2 = Math.cos(z * 0.04 + x * 0.03) * 2.2;
      // Add distant lunar mountain ridge near horizon (r > 700) so up/down orientation is unmistakable (B3)
      const ridge =
        r > 650
          ? (Math.sin(az * 7) * 18 + Math.cos(az * 13 + 1.1) * 11 + 26) *
            clamp((r - 650) / 400, 0, 1)
          : 0;
      const distMask = clamp((r - 18) / 80, 0, 1);
      posAttr.setY(i, (crater1 + crater2) * distMask + ridge - 0.5);
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      map: textures.moonColor,
      color: 0x99999e,
      roughness: 0.95,
      metalness: 0.02,
    });
    this.terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    this.scene.add(this.terrainMesh);

    // Subtle horizon reference outline
    const rimPts: THREE.Vector3[] = [];
    for (let az = 0; az <= 360; az += 2) {
      const rad = az * DEG2RAD;
      const ridgeAlt = 1.6 + Math.sin(rad * 7) * 0.9 + Math.cos(rad * 13 + 1.1) * 0.55;
      rimPts.push(altAzToHorizVec(ridgeAlt, az, 1100));
    }
    this.horizonRimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(rimPts),
      new THREE.LineBasicMaterial({ color: 0x455a75, transparent: true, opacity: 0.45 })
    );
    this.scene.add(this.horizonRimLine);

    this.terrainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.ambientLight = new THREE.AmbientLight(0x222634, 0.35);
    this.scene.add(this.terrainLight, this.ambientLight);

    // 3. Sun in Lunar Sky
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      new THREE.MeshBasicMaterial({ map: textures.sunSurface, color: 0xffffff })
    );
    const redRingTex = createRedRingTexture();
    this.sunCoronaSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: redRingTex,
        color: 0xffe6aa,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.sunGroup.add(this.sunMesh, this.sunCoronaSprite);
    this.scene.add(this.sunGroup);

    // 4. Earth in Lunar Sky (shows true Earth Phase & continents + Red Ring when eclipsing Sun!)
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX_SHADER,
      fragmentShader: EARTH_FRAGMENT_SHADER,
      uniforms: {
        uDayTex: { value: textures.earthDay },
        uNightTex: { value: textures.earthNight },
        uCloudsTex: { value: textures.earthClouds },
        uSpecularTex: { value: textures.earthSpecular },
        uNormalTex: { value: textures.earthNormal },
        uSunDirThree: { value: new THREE.Vector3(1, 0, 0) },
        uSunPosKmThree: { value: new THREE.Vector3(149597870, 0, 0) },
        uMoonPosKmThree: { value: new THREE.Vector3(384400, 0, 0) },
        uCloudsRotationRad: { value: 0 },
      },
    });
    this.earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), this.earthMat);
    this.earthMesh.matrixAutoUpdate = false;
    this.earthEclipseRedRing = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: redRingTex,
        color: 0xff5522,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        opacity: 0,
      })
    );
    this.earthGroup.add(this.earthMesh, this.earthEclipseRedRing);
    this.scene.add(this.earthGroup);

    this.setupHudLabels();
    this.setupControls(canvas);
  }

  public onLockChange(cb: () => void): void {
    this.onLockChangeCallbacks.push(cb);
  }

  private notifyLockChange(): void {
    for (const cb of this.onLockChangeCallbacks) cb();
  }

  public setLockTarget(target: 'earth' | 'sun' | 'free'): void {
    this.lockTarget = target;
    this.notifyLockChange();
  }

  private setupHudLabels(): void {
    const overlay = document.createElement('div');
    overlay.className = 'ms-ground-labels';
    overlay.style.display = 'none';

    const earthEl = document.createElement('button');
    earthEl.type = 'button';
    earthEl.className = 'ms-sky-label ms-sky-label-moon';
    earthEl.addEventListener('click', () => {
      this.setLockTarget('earth');
    });

    const sunEl = document.createElement('button');
    sunEl.type = 'button';
    sunEl.className = 'ms-sky-label ms-sky-label-sun';
    sunEl.addEventListener('click', () => {
      this.setLockTarget('sun');
    });

    overlay.append(earthEl, sunEl);
    document.body.appendChild(overlay);
    this.hudOverlayEl = overlay;
    this.earthLabelEl = earthEl;
    this.sunLabelEl = sunEl;
  }

  private setupControls(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      if (this.state.get().viewMode !== 'moon') return;
      this.isDragging = true;
      this.prevPointer = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || this.state.get().viewMode !== 'moon') return;
      const dx = e.clientX - this.prevPointer.x;
      const dy = e.clientY - this.prevPointer.y;
      this.prevPointer = { x: e.clientX, y: e.clientY };
      if (Math.hypot(dx, dy) > 2 && this.lockTarget !== 'free') {
        this.lockTarget = 'free';
        this.notifyLockChange();
      }
      const fovScale = this.state.get().groundFov / 60;
      this.lookAzimuthDeg = (((this.lookAzimuthDeg - dx * 0.2 * fovScale) % 360) + 360) % 360;
      this.lookAltitudeDeg = clamp(this.lookAltitudeDeg + dy * 0.2 * fovScale, -35, 89.5);
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // B3: Wheel zoom in MoonSurfaceView
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.state.get().viewMode !== 'moon') return;
        e.preventDefault();
        const curFov = this.state.get().groundFov;
        const factor = e.deltaY > 0 ? 1.12 : 0.89;
        const nextFov = clamp(Math.round(curFov * factor * 10) / 10, 1.5, 100);
        this.state.update({ groundFov: nextFov });
      },
      { passive: false }
    );

    // B2: Pinch-to-zoom on mobile
    canvas.addEventListener(
      'touchstart',
      (e) => {
        if (this.state.get().viewMode !== 'moon') return;
        if (e.touches.length === 2) {
          this.isDragging = false;
          this.pinchStartDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          this.pinchStartFov = this.state.get().groundFov;
        }
      },
      { passive: true }
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        if (this.state.get().viewMode !== 'moon' || e.touches.length !== 2) return;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (this.pinchStartDist > 10 && dist > 10) {
          const nextFov = clamp(
            Math.round((this.pinchStartFov * (this.pinchStartDist / dist)) * 10) / 10,
            2,
            100
          );
          this.state.update({ groundFov: nextFov });
        }
      },
      { passive: true }
    );
  }

  public setHudVisible(visible: boolean): void {
    if (this.hudOverlayEl) {
      this.hudOverlayEl.style.display = visible ? 'block' : 'none';
    }
  }

  private updateHudLabels(moonSky: MoonSurfaceSky): void {
    const s = this.state.get();
    if (!this.hudOverlayEl || !this.earthLabelEl || !this.sunLabelEl) return;

    if (s.viewMode !== 'moon' || s.uiHidden) {
      this.hudOverlayEl.style.display = 'none';
      return;
    }
    this.hudOverlayEl.style.display = 'block';

    const w = window.innerWidth;
    const h = window.innerHeight;

    const place = (
      el: HTMLElement,
      worldPos: THREE.Vector3,
      label: string,
      altDeg: number,
      isLocked: boolean,
      yOffsetPx: number
    ) => {
      const p = worldPos.clone().project(this.camera);
      const behind = p.z > 1;
      let sx = ((p.x + 1) * 0.5) * w;
      let sy = ((-p.y + 1) * 0.5) * h;
      if (behind) {
        sx = w - sx;
        sy = h - sy;
      }
      const marginX = 76;
      const marginTop = 64;
      const marginBottom = 88;
      const onScreen =
        !behind &&
        sx >= marginX &&
        sx <= w - marginX &&
        sy >= marginTop &&
        sy <= h - marginBottom;

      if (onScreen) {
        el.classList.remove('ms-sky-label-edge');
        el.style.left = `${sx}px`;
        el.style.top = `${clamp(sy + yOffsetPx, marginTop, h - marginBottom)}px`;
        el.textContent = `${label} (高 ${altDeg.toFixed(1)}°)${isLocked ? ' · 已锁定' : ''}`;
      } else {
        el.classList.add('ms-sky-label-edge');
        el.style.left = `${clamp(sx, marginX, w - marginX)}px`;
        el.style.top = `${clamp(sy + yOffsetPx * 0.35, marginTop, h - marginBottom)}px`;
        const arrow = behind ? '⇄' : sx < marginX ? '←' : sx > w - marginX ? '→' : sy < marginTop ? '↑' : '↓';
        el.textContent = `${arrow} ${label} (高 ${altDeg.toFixed(1)}°)`;
      }
    };

    place(
      this.earthLabelEl,
      this.earthGroup.position,
      `🌍 地球 · 地相 ${(moonSky.earthIlluminatedFraction * 100).toFixed(0)}%`,
      moonSky.earthAltitudeDeg,
      this.lockTarget === 'earth',
      -108
    );
    place(
      this.sunLabelEl,
      this.sunGroup.position,
      '☀️ 太阳',
      moonSky.sunAltitudeDeg,
      this.lockTarget === 'sun',
      128
    );
  }

  update(
    eph: EphemerisSnapshot,
    moonSky: MoonSurfaceSky,
    earthOri: EarthOrientation,
    moonOri: MoonOrientation
  ): void {
    const s = this.state.get();

    // B3: Apply groundFov slider & wheel zoom in MoonSurfaceView!
    this.camera.fov = s.groundFov;
    this.camera.updateProjectionMatrix();

    this.starfield.setShowConstellations(s.overlays.constellations);

    const domeRadius = 1200;
    const magScale = s.groundBodyScale;

    const sunDir = altAzToHorizVec(
      moonSky.sunAltitudeDeg,
      moonSky.sunAzimuthDeg,
      1
    ).normalize();
    const earthDirTrue = altAzToHorizVec(
      moonSky.earthAltitudeDeg,
      moonSky.earthAzimuthDeg,
      1
    ).normalize();

    let earthDirEffective = earthDirTrue.clone();
    if (moonSky.solarEclipseByEarth.angularSeparationDeg < 8.0 && magScale > 1) {
      const offset = earthDirTrue.clone().sub(sunDir);
      earthDirEffective = sunDir.clone().add(offset.multiplyScalar(magScale)).normalize();
    }

    // Position Sun at domeRadius
    const sunRadiusLinear =
      domeRadius * Math.tan(moonSky.sunAngularRadiusDeg * DEG2RAD) * magScale;
    this.sunGroup.position.copy(sunDir.clone().multiplyScalar(domeRadius));
    this.sunMesh.scale.setScalar(sunRadiusLinear);
    this.sunCoronaSprite.scale.setScalar(
      sunRadiusLinear * 5.0 * (1.0 - moonSky.solarEclipseByEarth.areaFraction * 0.85)
    );

    // Position Earth slightly closer (domeRadius * 0.94)
    const earthDist = domeRadius * 0.94;
    const earthRadiusLinear =
      earthDist * Math.tan(moonSky.earthAngularRadiusDeg * DEG2RAD) * magScale;
    this.earthGroup.position.copy(earthDirEffective.clone().multiplyScalar(earthDist));
    const H = sceneToMoonHorizonMatrix(moonOri, s.moonObserver.lat, s.moonObserver.lon);
    this.earthMesh.matrix
      .copy(H)
      .multiply(earthOri.matrixThree)
      .multiply(new THREE.Matrix4().makeScale(earthRadiusLinear, earthRadiusLinear, earthRadiusLinear));
    this.earthMesh.matrixWorldNeedsUpdate = true;

    const sunKmThree = astroToThreeVec(eph.sunEclKm.x, eph.sunEclKm.y, eph.sunEclKm.z);
    const moonKmThree = astroToThreeVec(eph.moonEclKm.x, eph.moonEclKm.y, eph.moonEclKm.z);
    this.earthMat.uniforms.uSunDirThree.value.copy(eph.sunDirThree.clone().transformDirection(H));
    this.earthMat.uniforms.uSunPosKmThree.value.copy(sunKmThree.applyMatrix4(H));
    this.earthMat.uniforms.uMoonPosKmThree.value.copy(moonKmThree.applyMatrix4(H));

    // Red atmospheric refraction ring around Earth when Earth eclipses the Sun (= Lunar Eclipse on Earth!)
    const occ = moonSky.solarEclipseByEarth.areaFraction;
    this.earthEclipseRedRing.scale.setScalar(earthRadiusLinear * 4.5);
    (this.earthEclipseRedRing.material as THREE.SpriteMaterial).opacity =
      occ > 0.4 ? Math.min(1, (occ - 0.4) * 1.8) : 0;

    // Lunar terrain illumination
    this.terrainLight.position.copy(sunDir.clone().multiplyScalar(500));
    if (moonSky.sunAltitudeDeg > 0) {
      if (occ > 0.95) {
        this.terrainLight.color.setHex(0xd93814);
        this.terrainLight.intensity = 0.65;
        this.ambientLight.color.setHex(0x4a1208);
      } else {
        this.terrainLight.color.setHex(0xffffff);
        this.terrainLight.intensity = 2.2 * (1 - occ * 0.8);
        this.ambientLight.color.setHex(0x222634);
      }
    } else {
      this.terrainLight.intensity = 0.05;
      this.ambientLight.color.setHex(0x141824);
    }

    // Update camera look direction
    if (this.lockTarget === 'earth' && moonSky.earthAltitudeDeg > -25) {
      this.lookAzimuthDeg = moonSky.earthAzimuthDeg;
      this.lookAltitudeDeg = clamp(moonSky.earthAltitudeDeg, -20, 89);
    } else if (this.lockTarget === 'sun') {
      this.lookAzimuthDeg = moonSky.sunAzimuthDeg;
      this.lookAltitudeDeg = clamp(moonSky.sunAltitudeDeg, -20, 89);
    }

    const lookTarget = altAzToHorizVec(this.lookAltitudeDeg, this.lookAzimuthDeg, 100);
    this.camera.lookAt(lookTarget);
    this.updateHudLabels(moonSky);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
