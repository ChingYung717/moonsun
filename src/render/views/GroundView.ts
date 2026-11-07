import * as THREE from 'three';
import { AppState } from '../../state/AppState';
import { PlanetaryTextures } from '../textures';
import { SKY_FRAGMENT_SHADER, SKY_VERTEX_SHADER } from '../shaders/sky.glsl';
import { MOON_FRAGMENT_SHADER, MOON_VERTEX_SHADER } from '../shaders/moon.glsl';
import {
  EarthObserverSky,
  computeDailySunMoonEvents,
  sampleDailyTrajectory,
} from '../../astro/observer';
import { EphemerisSnapshot } from '../../astro/ephemeris';
import { EarthOrientation } from '../../astro/earthOrientation';
import { MoonOrientation } from '../../astro/moonOrientation';
import { sceneToEarthHorizonMatrix } from '../../astro/horizonFrames';
import { PlanetState, computeNakedEyePlanets } from '../../astro/planets';
import { RealCelestialSphere } from '../bodies/RealStarfield';
import { DEG2RAD, astroToThreeVec, clamp } from '../../utils/math';
import { formatTimeShort, utcToLocalParts } from '../../time/tz';
import { showToast } from '../../ui/Toast';

function createTextSprite(text: string, color = '#90e0ef', fontSize = 44): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(90, 45, 1);
  return sprite;
}

function createEclipseCoronaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 256;
    const cy = 256;

    const grad = ctx.createRadialGradient(cx, cy, 42, cx, cy, 250);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.12, 'rgba(240, 248, 255, 0.95)');
    grad.addColorStop(0.32, 'rgba(180, 215, 255, 0.45)');
    grad.addColorStop(0.65, 'rgba(120, 170, 240, 0.12)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 24; i++) {
      ctx.rotate((Math.PI * 2) / 24);
      const len = i % 3 === 0 ? 245 : 185;
      const g = ctx.createLinearGradient(38, 0, len, 0);
      g.addColorStop(0, 'rgba(235, 245, 255, 0.35)');
      g.addColorStop(1, 'rgba(180, 210, 255, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(38, -8);
      ctx.lineTo(len, -1);
      ctx.lineTo(len, 1);
      ctx.lineTo(38, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function altAzToHorizVec(altDeg: number, azDeg: number, radius: number): THREE.Vector3 {
  const alt = altDeg * DEG2RAD;
  const az = azDeg * DEG2RAD;
  return new THREE.Vector3(
    radius * Math.cos(alt) * Math.sin(az),
    radius * Math.sin(alt),
    -radius * Math.cos(alt) * Math.cos(az)
  );
}

export class GroundView {
  public readonly scene = new THREE.Scene();
  public readonly camera: THREE.PerspectiveCamera;

  public lockTarget: 'free' | 'sun' | 'moon' = 'sun';
  private lookAzimuthDeg = 180;
  private lookAltitudeDeg = 30;
  private isDragging = false;
  private prevPointer = { x: 0, y: 0 };
  private pinchStartDist = 0;
  private pinchStartFov = 60;
  private onLockChangeCallbacks: Array<() => void> = [];

  private skyDomeMat: THREE.ShaderMaterial;
  private celestialSphere: RealCelestialSphere;
  private altAzGridGroup: THREE.Group;
  private sunTrajectoryLine: THREE.Line;
  private moonTrajectoryLine: THREE.Line;

  private sunGroup = new THREE.Group();
  private sunMesh: THREE.Mesh;
  private sunGlareSprite: THREE.Sprite;
  private totalityCoronaSprite: THREE.Sprite;

  private moonGroup = new THREE.Group();
  private moonMesh: THREE.Mesh;
  private moonMat: THREE.ShaderMaterial;

  private planetMeshes: Map<string, THREE.Mesh> = new Map();
  private planetGroup = new THREE.Group();
  private cachedPlanets: PlanetState[] = [];
  private lastPlanetCalcUtc = -Infinity;
  private lastPlanetLocKey = '';

  private hudOverlayEl: HTMLElement | null = null;
  private sunLabelEl: HTMLElement | null = null;
  private moonLabelEl: HTMLElement | null = null;
  private planetLabelEls: Map<string, HTMLElement> = new Map();

  private lastTrajectoryDayKey = '';

  constructor(
    canvas: HTMLCanvasElement,
    textures: PlanetaryTextures,
    private state: AppState
  ) {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      5000
    );
    this.camera.position.set(0, 1.6, 0);

    // 1. Atmospheric Sky Dome
    const skyGeo = new THREE.SphereGeometry(2000, 64, 48);
    this.skyDomeMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uEclipseObscuration: { value: 0.0 },
        uIsTotalEclipse: { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(skyGeo, this.skyDomeMat));

    // 2. Real Star Catalog + Constellation Lines & Labels (transformed by H into local horizon frame!)
    this.celestialSphere = new RealCelestialSphere(1800);
    this.celestialSphere.group.matrixAutoUpdate = false;
    this.scene.add(this.celestialSphere.group);

    // 2b. 5 Naked-eye planets layer
    this.buildPlanetMarkers();
    this.scene.add(this.planetGroup);

    // 3. Ground Plane & Horizon Ring
    const groundGeo = new THREE.CircleGeometry(1950, 96);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x0b131e,
      transparent: true,
      opacity: 0.92,
    });
    this.scene.add(new THREE.Mesh(groundGeo, groundMat));

    // 4. Alt-Az Celestial Grid & Compass Labels
    this.altAzGridGroup = this.buildAltAzGridAndCompass();
    this.scene.add(this.altAzGridGroup);

    // 5. Daily Sun & Moon Trajectory Curves
    this.sunTrajectoryLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.65 })
    );
    this.moonTrajectoryLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x8ecae6, transparent: true, opacity: 0.6 })
    );
    this.scene.add(this.sunTrajectoryLine, this.moonTrajectoryLine);

    // 6. Sun on Sky Dome
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      new THREE.MeshBasicMaterial({ map: textures.sunSurface, color: 0xfff8e0 })
    );
    const coronaTex = createEclipseCoronaTexture();
    this.sunGlareSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: coronaTex,
        color: 0xffd166,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.totalityCoronaSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: coronaTex,
        color: 0xe6f2ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      })
    );
    this.sunGroup.add(this.sunMesh, this.sunGlareSprite, this.totalityCoronaSprite);
    this.scene.add(this.sunGroup);

    // 7. Moon on Sky Dome (with real phase + Blood Moon shader!)
    this.moonMat = new THREE.ShaderMaterial({
      vertexShader: MOON_VERTEX_SHADER,
      fragmentShader: MOON_FRAGMENT_SHADER,
      uniforms: {
        uMoonTex: { value: textures.moonColor },
        uSunDirThree: { value: new THREE.Vector3(1, 0, 0) },
        uSunPosKmThree: { value: new THREE.Vector3(149597870, 0, 0) },
        uMoonPosKmThree: { value: new THREE.Vector3(384400, 0, 0) },
        uEarthshineIntensity: { value: 0.5 },
      },
    });
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), this.moonMat);
    this.moonMesh.matrixAutoUpdate = false;
    this.moonGroup.add(this.moonMesh);
    this.scene.add(this.moonGroup);

    this.setupHudLabels();
    this.setupControls(canvas);
    this.state.subscribe((s, changed) => {
      if (changed.has('groundLockTarget') && this.lockTarget !== s.groundLockTarget) {
        this.lockTarget = s.groundLockTarget;
        this.notifyLockChange();
      }
    });
  }

  public onLockChange(cb: () => void): void {
    this.onLockChangeCallbacks.push(cb);
  }

  private notifyLockChange(): void {
    for (const cb of this.onLockChangeCallbacks) cb();
  }

  public setLockTarget(target: 'free' | 'sun' | 'moon', sky?: EarthObserverSky): void {
    this.lockTarget = target;
    this.state.update({ groundLockTarget: target });
    if (sky && (target === 'sun' || target === 'moon')) {
      this.aimAt(target, sky);
    } else {
      this.notifyLockChange();
    }
  }

  /**
   * B3: When entering GroundView, automatically aim at a visible sky object:
   * Sun if above horizon, else Moon if above horizon, else towards Moon azimuth at +20° altitude
   * with a toast telling when the Moon/Sun rises next!
   */
  public autoAimOnEnter(sky: EarthObserverSky): void {
    const s = this.state.get();
    if (sky.sun.altitudeDeg > 0) {
      this.aimAt('sun', sky);
    } else if (sky.moon.altitudeDeg > 0) {
      this.aimAt('moon', sky);
    } else {
      this.lockTarget = 'free';
      this.state.update({ groundLockTarget: 'free' });
      this.lookAzimuthDeg = sky.moon.azimuthDeg;
      this.lookAltitudeDeg = 20;
      this.notifyLockChange();

      const localParts = utcToLocalParts(s.timeUtc, s.earthObserver.timezone);
      const events = computeDailySunMoonEvents(
        s.timeUtc,
        s.earthObserver.lat,
        s.earthObserver.lon,
        localParts.offsetMinutes,
        s.earthObserver.elevation
      );
      const formatNextRise = (targetUtc: number): string => {
        const tp = utcToLocalParts(targetUtc, s.earthObserver.timezone);
        const isSameDay =
          tp.year === localParts.year && tp.month === localParts.month && tp.day === localParts.day;
        return `${isSameDay ? '今日' : '明日'} ${formatTimeShort(targetUtc, s.earthObserver.timezone)}`;
      };

      const moonVisibleOnRise =
        events.moonriseUtc !== null &&
        sky.solarObscuration.angularSeparationDeg >= 20 &&
        (events.sunriseUtc === null || events.moonriseUtc < events.sunriseUtc);

      if (moonVisibleOnRise && events.moonriseUtc) {
        const tStr = formatNextRise(events.moonriseUtc);
        showToast({
          message: `当前太阳与月亮均在地平线以下，已朝向月亮方位（下次月出：${tStr}）`,
          actionLabel: '跳到月出',
          onAction: () => {
            if (events.moonriseUtc) {
              this.state.pushUndoSnapshot('跳到月出');
              this.state.setTimeUtc(events.moonriseUtc + 10 * 60 * 1000, true);
              this.setLockTarget('moon');
            }
          },
        });
      } else if (events.sunriseUtc) {
        const tStr = formatNextRise(events.sunriseUtc);
        showToast({
          message: `当前太阳与月亮均在地平线以下（下次日出：${tStr}）`,
          actionLabel: '跳到日出',
          onAction: () => {
            if (events.sunriseUtc) {
              this.state.pushUndoSnapshot('跳到日出');
              this.state.setTimeUtc(events.sunriseUtc + 15 * 60 * 1000, true);
              this.setLockTarget('sun');
            }
          },
        });
      } else if (events.moonriseUtc) {
        const tStr = formatNextRise(events.moonriseUtc);
        showToast({
          message: `当前太阳与月亮均在地平线以下（下次月出：${tStr}）`,
          actionLabel: '跳到月出',
          onAction: () => {
            if (events.moonriseUtc) {
              this.state.pushUndoSnapshot('跳到月出');
              this.state.setTimeUtc(events.moonriseUtc + 10 * 60 * 1000, true);
              this.setLockTarget('moon');
            }
          },
        });
      }
    }
  }

  private buildPlanetMarkers(): void {
    const ids: Array<{ id: string; color: number }> = [
      { id: 'mercury', color: 0xd5d8e2 },
      { id: 'venus', color: 0xfff5cc },
      { id: 'mars', color: 0xff7b54 },
      { id: 'jupiter', color: 0xffe3b3 },
      { id: 'saturn', color: 0xf3d58d },
    ];
    for (const p of ids) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 16, 16),
        new THREE.MeshBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        })
      );
      this.planetMeshes.set(p.id, m);
      this.planetGroup.add(m);
    }
  }

  private setupHudLabels(): void {
    const overlay = document.createElement('div');
    overlay.className = 'ms-ground-labels';
    overlay.style.display = 'none';

    const sunEl = document.createElement('button');
    sunEl.type = 'button';
    sunEl.className = 'ms-sky-label ms-sky-label-sun';
    sunEl.addEventListener('click', () => {
      this.setLockTarget('sun');
    });

    const moonEl = document.createElement('button');
    moonEl.type = 'button';
    moonEl.className = 'ms-sky-label ms-sky-label-moon';
    moonEl.addEventListener('click', () => {
      this.setLockTarget('moon');
    });

    overlay.append(sunEl, moonEl);

    for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
      const pEl = document.createElement('span');
      pEl.className = 'ms-sky-label ms-sky-label-planet';
      pEl.style.display = 'none';
      overlay.appendChild(pEl);
      this.planetLabelEls.set(id, pEl);
    }

    document.body.appendChild(overlay);
    this.hudOverlayEl = overlay;
    this.sunLabelEl = sunEl;
    this.moonLabelEl = moonEl;
  }

  private buildAltAzGridAndCompass(): THREE.Group {
    const g = new THREE.Group();
    const r = 1600;

    for (const alt of [0, 15, 30, 45, 60, 75]) {
      const pts: THREE.Vector3[] = [];
      for (let az = 0; az <= 360; az += 3) {
        pts.push(altAzToHorizVec(alt, az, r));
      }
      const isHorizon = alt === 0;
      g.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({
            color: isHorizon ? 0x4ea8de : 0x2b4c7e,
            transparent: true,
            opacity: isHorizon ? 0.75 : 0.25,
          })
        )
      );
    }

    for (let az = 0; az < 360; az += 30) {
      const pts: THREE.Vector3[] = [];
      for (let alt = 0; alt <= 90; alt += 3) {
        pts.push(altAzToHorizVec(alt, az, r));
      }
      g.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({
            color: 0x2b4c7e,
            transparent: true,
            opacity: 0.25,
          })
        )
      );
    }

    const dirs = [
      { label: '北 N (0°)', az: 0, color: '#ff6b6b' },
      { label: '东北 NE', az: 45, color: '#8ecae6' },
      { label: '东 E (90°)', az: 90, color: '#ffd166' },
      { label: '东南 SE', az: 135, color: '#8ecae6' },
      { label: '南 S (180°)', az: 180, color: '#4ea8de' },
      { label: '西南 SW', az: 225, color: '#8ecae6' },
      { label: '西 W (270°)', az: 270, color: '#ffd166' },
      { label: '西北 NW', az: 315, color: '#8ecae6' },
    ];
    for (const d of dirs) {
      const sp = createTextSprite(d.label, d.color, d.az % 90 === 0 ? 42 : 32);
      sp.position.copy(altAzToHorizVec(2.2, d.az, r * 0.95));
      g.add(sp);
    }

    return g;
  }

  private setupControls(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      if (this.state.get().viewMode !== 'ground') return;
      this.isDragging = true;
      this.prevPointer = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || this.state.get().viewMode !== 'ground') return;
      const dx = e.clientX - this.prevPointer.x;
      const dy = e.clientY - this.prevPointer.y;
      this.prevPointer = { x: e.clientX, y: e.clientY };

      if (Math.hypot(dx, dy) > 2 && this.lockTarget !== 'free') {
        this.setLockTarget('free');
      }
      const fovScale = this.state.get().groundFov / 60;
      this.lookAzimuthDeg = (((this.lookAzimuthDeg - dx * 0.18 * fovScale) % 360) + 360) % 360;
      this.lookAltitudeDeg = clamp(this.lookAltitudeDeg + dy * 0.18 * fovScale, -45, 89.5);
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // Pinch-to-zoom for mobile (B2)
    canvas.addEventListener(
      'touchstart',
      (e) => {
        if (this.state.get().viewMode !== 'ground') return;
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
        if (this.state.get().viewMode !== 'ground' || e.touches.length !== 2) return;
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

    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.state.get().viewMode !== 'ground') return;
        e.preventDefault();
        const curFov = this.state.get().groundFov;
        const factor = e.deltaY > 0 ? 1.12 : 0.89;
        const nextFov = clamp(Math.round(curFov * factor * 10) / 10, 1.5, 100);
        this.state.update({ groundFov: nextFov });
      },
      { passive: false }
    );
  }

  public aimAt(target: 'sun' | 'moon', sky: EarthObserverSky): void {
    this.lockTarget = target;
    this.state.update({ groundLockTarget: target });
    if (target === 'sun') {
      this.lookAzimuthDeg = sky.sun.azimuthDeg;
      this.lookAltitudeDeg = clamp(sky.sun.altitudeDeg, -20, 89);
    } else {
      this.lookAzimuthDeg = sky.moon.azimuthDeg;
      this.lookAltitudeDeg = clamp(sky.moon.altitudeDeg, -20, 89);
    }
    this.notifyLockChange();
  }

  public setHudVisible(visible: boolean): void {
    if (this.hudOverlayEl) {
      const next = visible ? 'block' : 'none';
      if (this.hudOverlayEl.style.display !== next) {
        this.hudOverlayEl.style.display = next;
      }
    }
  }

  private updateHudLabels(sky: EarthObserverSky, starAlpha: number): void {
    const s = this.state.get();
    if (!this.hudOverlayEl || !this.sunLabelEl || !this.moonLabelEl) return;

    if (s.viewMode !== 'ground' || s.uiHidden) {
      this.setHudVisible(false);
      return;
    }
    this.setHudVisible(true);

    const w = window.innerWidth;
    const h = window.innerHeight;

    const placeBodyLabel = (
      el: HTMLElement,
      worldPos: THREE.Vector3,
      icon: string,
      name: string,
      altDeg: number,
      azDeg: number,
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

      const marginX = 74;
      const marginTop = 64;
      const marginBottom = 88;
      const onScreen =
        !behind &&
        sx >= marginX &&
        sx <= w - marginX &&
        sy >= marginTop &&
        sy <= h - marginBottom;

      const altText = `${altDeg >= 0 ? '+' : ''}${altDeg.toFixed(1)}°`;
      if (onScreen) {
        el.classList.remove('ms-sky-label-edge');
        el.style.left = `${sx}px`;
        el.style.top = `${clamp(sy + yOffsetPx, marginTop, h - marginBottom)}px`;
        el.textContent = `${icon} ${name} (${altText}, 方位${azDeg.toFixed(0)}°)${isLocked ? ' · 已锁定' : ''}`;
      } else {
        el.classList.add('ms-sky-label-edge');
        const cx = clamp(sx, marginX, w - marginX);
        const cy = clamp(sy + yOffsetPx * 0.35, marginTop, h - marginBottom);
        const arrow = behind ? '⇄' : sx < marginX ? '←' : sx > w - marginX ? '→' : sy < marginTop ? '↑' : '↓';
        el.style.left = `${cx}px`;
        el.style.top = `${cy}px`;
        el.textContent = `${arrow} ${icon}${name} (${altText}${altDeg < 0 ? ' 地平线下' : ''})`;
      }
    };

    placeBodyLabel(
      this.sunLabelEl,
      this.sunGroup.position,
      '☀️',
      '太阳',
      sky.sun.altitudeDeg,
      sky.sun.azimuthDeg,
      this.lockTarget === 'sun',
      -58
    );
    placeBodyLabel(
      this.moonLabelEl,
      this.moonGroup.position,
      '🌙',
      '月亮',
      sky.moon.altitudeDeg,
      sky.moon.azimuthDeg,
      this.lockTarget === 'moon',
      78
    );

    // Planet labels
    const showPlanets = s.overlays.planets && starAlpha > 0.1;
    for (const p of this.cachedPlanets) {
      const pEl = this.planetLabelEls.get(p.id);
      const pMesh = this.planetMeshes.get(p.id);
      if (!pEl || !pMesh) continue;
      if (!showPlanets || p.altitudeDeg <= 0.5) {
        pEl.style.display = 'none';
        continue;
      }
      const proj = pMesh.position.clone().project(this.camera);
      if (proj.z > 1) {
        pEl.style.display = 'none';
        continue;
      }
      const px = ((proj.x + 1) * 0.5) * w;
      const py = ((-proj.y + 1) * 0.5) * h;
      if (px < 50 || px > w - 50 || py < 56 || py > h - 76) {
        pEl.style.display = 'none';
        continue;
      }
      pEl.style.display = 'inline-block';
      pEl.style.left = `${px}px`;
      pEl.style.top = `${py + 14}px`;
      pEl.textContent = `${p.nameZh}`;
    }
  }

  update(
    eph: EphemerisSnapshot,
    sky: EarthObserverSky,
    moonIllumFraction: number,
    earthOri: EarthOrientation,
    moonOri: MoonOrientation
  ): void {
    const s = this.state.get();

    this.camera.fov = s.groundFov;
    this.camera.updateProjectionMatrix();

    const domeRadius = 1200;
    const sunDir = altAzToHorizVec(sky.sun.altitudeDeg, sky.sun.azimuthDeg, 1).normalize();
    const moonDirTrue = altAzToHorizVec(sky.moon.altitudeDeg, sky.moon.azimuthDeg, 1).normalize();

    const magScale = s.groundBodyScale;
    let moonDirEffective = moonDirTrue.clone();
    if (sky.solarObscuration.angularSeparationDeg < 6.0 && magScale > 1) {
      const offset = moonDirTrue.clone().sub(sunDir);
      moonDirEffective = sunDir.clone().add(offset.multiplyScalar(magScale)).normalize();
    }

    // Update sky dome uniforms
    const occ = sky.sun.altitudeDeg > -2 ? sky.solarObscuration.areaFraction : 0;
    const isTotal = sky.solarObscuration.isTotal && sky.sun.altitudeDeg > 0 ? 1.0 : 0.0;
    this.skyDomeMat.uniforms.uSunDir.value.copy(sunDir);
    this.skyDomeMat.uniforms.uMoonDir.value.copy(moonDirTrue);
    this.skyDomeMat.uniforms.uEclipseObscuration.value = occ;
    this.skyDomeMat.uniforms.uIsTotalEclipse.value = isTotal;

    // Exact Horizon Matrix H for stars, constellations, and Moon orientation!
    const H = sceneToEarthHorizonMatrix(earthOri, s.earthObserver.lat, s.earthObserver.lon);

    // Real Starfield & Constellations visibility (fades in at night or during totality)
    const nightStrength = clamp(-sky.sun.altitudeDeg / 10, 0, 1);
    const eclipseStarStrength = smoothstep(0.9, 1.0, occ);
    const starAlpha = Math.max(nightStrength * 0.95, eclipseStarStrength * 0.9);
    this.celestialSphere.group.matrix.copy(H);
    this.celestialSphere.group.matrixWorldNeedsUpdate = true;
    this.celestialSphere.setOpacity(starAlpha, s.overlays.constellations);

    // 5 Naked-Eye Planets
    this.planetGroup.visible = s.overlays.planets && starAlpha > 0.08;
    if (s.overlays.planets) {
      const locKey = `${s.earthObserver.lat.toFixed(2)},${s.earthObserver.lon.toFixed(2)}`;
      if (
        Math.abs(eph.utcMs - this.lastPlanetCalcUtc) > 60 * 1000 ||
        locKey !== this.lastPlanetLocKey
      ) {
        this.cachedPlanets = computeNakedEyePlanets(
          eph.utcMs,
          s.earthObserver.lat,
          s.earthObserver.lon,
          s.earthObserver.elevation
        );
        this.lastPlanetCalcUtc = eph.utcMs;
        this.lastPlanetLocKey = locKey;
      }
      for (const p of this.cachedPlanets) {
        const m = this.planetMeshes.get(p.id);
        if (!m) continue;
        m.visible = p.altitudeDeg > 0 && starAlpha > 0.08;
        m.position.copy(p.horizonDirThree.clone().multiplyScalar(domeRadius * 1.15));
        const sizeScale = clamp(1.4 - p.magnitude * 0.22, 0.65, 2.1);
        m.scale.setScalar(sizeScale);
        (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, starAlpha * 1.15);
      }
    }

    // Position & scale Sun on sky dome
    const sunDist = domeRadius;
    const sunRadiusLinear =
      sunDist * Math.tan(sky.sun.angularRadiusDeg * DEG2RAD) * magScale;
    this.sunGroup.position.copy(sunDir.clone().multiplyScalar(sunDist));
    this.sunMesh.scale.setScalar(sunRadiusLinear);
    this.sunGlareSprite.scale.setScalar(sunRadiusLinear * 6.5 * (1.0 - occ * 0.88));
    this.totalityCoronaSprite.scale.setScalar(sunRadiusLinear * 7.5);
    (this.totalityCoronaSprite.material as THREE.SpriteMaterial).opacity =
      smoothstep(0.95, 1.0, occ);

    // Position & scale Moon slightly closer (domeRadius * 0.96)
    const moonDist = domeRadius * 0.96;
    const moonRadiusLinear =
      moonDist * Math.tan(sky.moon.angularRadiusDeg * DEG2RAD) * magScale;
    const moonPos = moonDirEffective.clone().multiplyScalar(moonDist);
    this.moonGroup.position.copy(moonPos);

    this.moonMesh.matrix
      .copy(H)
      .multiply(moonOri.matrixThree)
      .multiply(new THREE.Matrix4().makeScale(moonRadiusLinear, moonRadiusLinear, moonRadiusLinear));
    this.moonMesh.matrixWorldNeedsUpdate = true;

    const sunKmThree = astroToThreeVec(eph.sunEclKm.x, eph.sunEclKm.y, eph.sunEclKm.z);
    const moonKmThree = astroToThreeVec(eph.moonEclKm.x, eph.moonEclKm.y, eph.moonEclKm.z);
    const moonToSunHoriz = sunKmThree.clone().sub(moonKmThree).normalize().transformDirection(H);

    this.moonMat.uniforms.uSunDirThree.value.copy(moonToSunHoriz);
    this.moonMat.uniforms.uSunPosKmThree.value.copy(sunKmThree.applyMatrix4(H));
    this.moonMat.uniforms.uMoonPosKmThree.value.copy(moonKmThree.applyMatrix4(H));
    this.moonMat.uniforms.uEarthshineIntensity.value = Math.max(0, 1 - moonIllumFraction);

    // Overlays visibility
    this.altAzGridGroup.visible = s.overlays.constellationGrid;
    this.sunTrajectoryLine.visible = s.overlays.skyTrajectories;
    this.moonTrajectoryLine.visible = s.overlays.skyTrajectories;

    if (s.overlays.skyTrajectories) {
      const localParts = utcToLocalParts(eph.utcMs, s.earthObserver.timezone);
      const dayKey = `${localParts.year}-${localParts.month}-${localParts.day}_${s.earthObserver.lat.toFixed(2)}_${s.earthObserver.lon.toFixed(2)}`;
      if (dayKey !== this.lastTrajectoryDayKey) {
        this.lastTrajectoryDayKey = dayKey;
        const sunTraj = sampleDailyTrajectory(
          eph.utcMs,
          s.earthObserver.lat,
          s.earthObserver.lon,
          localParts.offsetMinutes,
          'sun',
          96
        );
        const moonTraj = sampleDailyTrajectory(
          eph.utcMs,
          s.earthObserver.lat,
          s.earthObserver.lon,
          localParts.offsetMinutes,
          'moon',
          96
        );
        this.sunTrajectoryLine.geometry.setFromPoints(
          sunTraj.map((p) => altAzToHorizVec(p.altitudeDeg, p.azimuthDeg, domeRadius * 0.98))
        );
        this.moonTrajectoryLine.geometry.setFromPoints(
          moonTraj.map((p) => altAzToHorizVec(p.altitudeDeg, p.azimuthDeg, domeRadius * 0.97))
        );
      }
    }

    // Update camera look direction
    if (this.lockTarget === 'sun') {
      this.lookAzimuthDeg = sky.sun.azimuthDeg;
      this.lookAltitudeDeg = clamp(sky.sun.altitudeDeg, -25, 89);
    } else if (this.lockTarget === 'moon') {
      this.lookAzimuthDeg = sky.moon.azimuthDeg;
      this.lookAltitudeDeg = clamp(sky.moon.altitudeDeg, -25, 89);
    }

    const lookTarget = altAzToHorizVec(this.lookAltitudeDeg, this.lookAzimuthDeg, 100);
    this.camera.lookAt(lookTarget);
    this.updateHudLabels(sky, starAlpha);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
