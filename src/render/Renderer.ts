import * as THREE from 'three';
import { AppState } from '../state/AppState';
import { loadPlanetaryTextures, PlanetaryTextures } from './textures';
import { ScaleController, SceneScaleParams } from './scale';
import { SpaceView } from './views/SpaceView';
import { GroundView } from './views/GroundView';
import { MoonSurfaceView } from './views/MoonSurfaceView';
import { computeEphemeris, EphemerisSnapshot } from '../astro/ephemeris';
import { computeEarthOrientation, EarthOrientation } from '../astro/earthOrientation';
import { computeMoonOrientation, MoonOrientation } from '../astro/moonOrientation';
import {
  computeEarthObserverSky,
  computeMoonSurfaceSky,
  EarthObserverSky,
  MoonSurfaceSky,
} from '../astro/observer';
import { computeMoonPhase, MoonPhaseInfo } from '../astro/phase';
import { showToast } from '../ui/Toast';

export interface FrameAstroData {
  eph: EphemerisSnapshot;
  earthOri: EarthOrientation;
  moonOri: MoonOrientation;
  scale: SceneScaleParams;
  earthSky: EarthObserverSky;
  moonSky: MoonSurfaceSky;
  phase: MoonPhaseInfo;
}

export class MasterRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly textures: PlanetaryTextures;
  public readonly scaleController = new ScaleController();

  public readonly spaceView: SpaceView;
  public readonly groundView: GroundView;
  public readonly moonSurfaceView: MoonSurfaceView;

  private lastFrameTime = performance.now();
  private isContextLost = false;
  private contextLostTimer: number | null = null;

  private cachedEarthSky: EarthObserverSky | null = null;
  private lastEarthSkyKey = { timeUtc: NaN, lat: NaN, lon: NaN, elevation: NaN };

  private cachedMoonSky: MoonSurfaceSky | null = null;
  private lastMoonSkyKey = { timeUtc: NaN, lat: NaN, lon: NaN };

  constructor(
    public readonly canvas: HTMLCanvasElement,
    private state: AppState,
    onTextureProgress?: (loaded: number, total: number) => void
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = loadPlanetaryTextures(maxAniso, undefined, onTextureProgress);

    this.spaceView = new SpaceView(canvas, this.textures, state);
    this.groundView = new GroundView(canvas, this.textures, state);
    this.moonSurfaceView = new MoonSurfaceView(canvas, this.textures, state);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.isContextLost = true;
      if (this.contextLostTimer !== null) {
        window.clearTimeout(this.contextLostTimer);
      }
      this.contextLostTimer = window.setTimeout(() => {
        this.contextLostTimer = null;
        if (this.isContextLost) {
          showToast({
            message: '⚠️ WebGL 渲染上下文已丢失且未能自动恢复，请尝试刷新页面或释放显存',
            type: 'warn',
            durationMs: 8000,
          });
        }
      }, 3000);
    });

    canvas.addEventListener('webglcontextrestored', () => {
      this.isContextLost = false;
      if (this.contextLostTimer !== null) {
        window.clearTimeout(this.contextLostTimer);
        this.contextLostTimer = null;
      }
      for (const tex of Object.values(this.textures)) {
        if (tex && typeof tex === 'object' && 'needsUpdate' in tex) {
          (tex as THREE.Texture).needsUpdate = true;
        }
      }
      showToast('✨ WebGL 3D 渲染上下文已自动恢复');
    });

    window.addEventListener('resize', () => this.onResize());
  }

  public isWebGLContextLost(): boolean {
    return this.isContextLost;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.spaceView.resize(w, h);
    this.groundView.resize(w, h);
    this.moonSurfaceView.resize(w, h);
  }

  public renderFrame(needHudSky = true): FrameAstroData {
    const now = performance.now();
    const dtSec = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    const s = this.state.get();
    this.scaleController.setMode(s.scaleMode);
    this.scaleController.update(dtSec);

    const eph = computeEphemeris(s.timeUtc);
    const earthOri = computeEarthOrientation(s.timeUtc);
    const moonOri = computeMoonOrientation(s.timeUtc);
    const scale = this.scaleController.computeSceneScale(eph);
    const phase = computeMoonPhase(s.timeUtc);

    const earthInputsChanged =
      s.timeUtc !== this.lastEarthSkyKey.timeUtc ||
      s.earthObserver.lat !== this.lastEarthSkyKey.lat ||
      s.earthObserver.lon !== this.lastEarthSkyKey.lon ||
      s.earthObserver.elevation !== this.lastEarthSkyKey.elevation;

    if (!this.cachedEarthSky || (earthInputsChanged && (s.viewMode === 'ground' || needHudSky))) {
      this.cachedEarthSky = computeEarthObserverSky(
        s.timeUtc,
        s.earthObserver.lat,
        s.earthObserver.lon,
        s.earthObserver.elevation
      );
      this.lastEarthSkyKey = {
        timeUtc: s.timeUtc,
        lat: s.earthObserver.lat,
        lon: s.earthObserver.lon,
        elevation: s.earthObserver.elevation,
      };
    }
    const earthSky = this.cachedEarthSky;

    const moonInputsChanged =
      s.timeUtc !== this.lastMoonSkyKey.timeUtc ||
      s.moonObserver.lat !== this.lastMoonSkyKey.lat ||
      s.moonObserver.lon !== this.lastMoonSkyKey.lon;

    if (!this.cachedMoonSky || (moonInputsChanged && s.viewMode === 'moon')) {
      this.cachedMoonSky = computeMoonSurfaceSky(
        s.timeUtc,
        s.moonObserver.lat,
        s.moonObserver.lon,
        eph.sunEclKm,
        eph.moonEclKm
      );
      this.lastMoonSkyKey = {
        timeUtc: s.timeUtc,
        lat: s.moonObserver.lat,
        lon: s.moonObserver.lon,
      };
    }
    const moonSky = this.cachedMoonSky;

    if (s.viewMode === 'space') {
      this.spaceView.controls.enabled = true;
      this.groundView.setHudVisible(false);
      this.moonSurfaceView.setHudVisible(false);
      this.spaceView.update(eph, earthOri, moonOri, scale, phase.illuminatedFraction);
      if (!this.isContextLost) {
        this.renderer.render(this.spaceView.scene, this.spaceView.camera);
      }
    } else if (s.viewMode === 'ground') {
      this.spaceView.controls.enabled = false;
      this.spaceView.setHudVisible(false);
      this.moonSurfaceView.setHudVisible(false);
      this.groundView.update(eph, earthSky, phase.illuminatedFraction, earthOri, moonOri);
      if (!this.isContextLost) {
        this.renderer.render(this.groundView.scene, this.groundView.camera);
      }
    } else {
      this.spaceView.controls.enabled = false;
      this.spaceView.setHudVisible(false);
      this.groundView.setHudVisible(false);
      this.moonSurfaceView.update(eph, moonSky, earthOri, moonOri);
      if (!this.isContextLost) {
        this.renderer.render(this.moonSurfaceView.scene, this.moonSurfaceView.camera);
      }
    }

    return {
      eph,
      earthOri,
      moonOri,
      scale,
      earthSky,
      moonSky,
      phase,
    };
  }
}

