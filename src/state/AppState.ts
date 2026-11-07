import { inferTimezone } from '../time/tz';

export type ViewMode = 'space' | 'ground' | 'moon';
export type ScaleMode = 'schematic' | 'realistic';
export type UiMode = 'simple' | 'pro';
export type SpaceCameraPreset =
  | 'free'
  | 'earth'
  | 'moon'
  | 'sun'
  | 'eclipticNorth'
  | 'sunMoonLine';

export interface EarthLocation {
  name: string;
  lat: number;
  lon: number;
  elevation: number; // meters
  timezone: string;
}

export interface MoonLocation {
  name: string;
  lat: number; // selenographic latitude (-90..90)
  lon: number; // selenographic longitude (-180..180, 0 = sub-Earth center)
}

export interface OverlayFlags {
  moonOrbit: boolean;
  earthOrbit: boolean;
  eclipticPlane: boolean;
  observerMarker: boolean;
  sightLines: boolean;
  eclipsePath: boolean;
  shadowCones: boolean;
  latLonGrid: boolean;
  skyTrajectories: boolean;
  constellationGrid: boolean;
  constellations: boolean;
  planets: boolean;
}

export interface EclipseReplayState {
  active: boolean;
  startUtcMs: number;
  peakUtcMs: number;
  endUtcMs: number;
  u2UtcMs?: number | null;
  u3UtcMs?: number | null;
}

export interface UndoSnapshot {
  label: string;
  timeUtc: number;
  isRealtimeSync: boolean;
  playing: boolean;
  speedMultiplier: number;
  viewMode: ViewMode;
  spaceCameraPreset: SpaceCameraPreset;
  groundLockTarget: 'free' | 'sun' | 'moon';
  moonLockTarget: 'earth' | 'sun' | 'free';
  earthObserver: EarthLocation;
  moonObserver: MoonLocation;
  activeEclipsePeakUtc: number | null;
  activeEclipseKind: 'solar' | 'lunar' | null;
  selectedEclipseId: string | null;
}

export interface AppStateData {
  timeUtc: number;
  playing: boolean;
  speedMultiplier: number; // 1 = real-time, 60 = 1min/s, 3600 = 1h/s, 86400 = 1d/s
  isRealtimeSync: boolean;
  viewMode: ViewMode;
  scaleMode: ScaleMode;
  uiMode: UiMode;
  spaceCameraPreset: SpaceCameraPreset;
  groundLockTarget: 'free' | 'sun' | 'moon';
  moonLockTarget: 'earth' | 'sun' | 'free';
  earthObserver: EarthLocation;
  moonObserver: MoonLocation;
  groundBodyScale: number; // 1 = true angular size (~0.5 deg), up to 8x for easier visual inspection
  groundFov: number; // degrees, 1..110
  overlays: OverlayFlags;
  activeEclipsePeakUtc: number | null;
  activeEclipseKind: 'solar' | 'lunar' | null;
  selectedEclipseId: string | null;
  eclipseReplay: EclipseReplayState | null;
  uiHidden: boolean;
}

type Listener = (state: AppStateData, changedKeys: Set<keyof AppStateData>) => void;

const UI_MODE_STORAGE_KEY = 'moonsun_ui_mode';

function loadSavedUiMode(): UiMode {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(UI_MODE_STORAGE_KEY);
      if (v === 'pro' || v === 'simple') return v;
    }
  } catch {
    // ignore
  }
  return 'simple';
}

export const DEFAULT_MOON_SITES: MoonLocation[] = [
  { name: '正面中心 (中央湾)', lat: 0, lon: 0 },
  { name: '阿波罗11号着陆点 (静海基地)', lat: 0.674, lon: 23.473 },
  { name: '嫦娥三号着陆点 (广寒宫·虹湾)', lat: 44.12, lon: -19.51 },
  { name: '嫦娥五号采样点 (风暴洋吕姆克山)', lat: 43.06, lon: -51.92 },
  { name: '嫦娥四号着陆点 (月球背面·冯卡门坑)', lat: -45.44, lon: 177.59 },
  { name: '月球南极 (沙克尔顿环形山)', lat: -89.54, lon: 0.0 },
];

export class AppState {
  private data: AppStateData;
  private listeners: Set<Listener> = new Set();
  private undoStack: UndoSnapshot[] = [];

  constructor(initial?: Partial<AppStateData>) {
    const now = Date.now();
    this.data = {
      timeUtc: now,
      playing: true,
      speedMultiplier: 1,
      isRealtimeSync: true,
      viewMode: 'space',
      scaleMode: 'schematic',
      uiMode: loadSavedUiMode(),
      spaceCameraPreset: 'earth',
      groundLockTarget: 'sun',
      moonLockTarget: 'earth',
      earthObserver: {
        name: '北京',
        lat: 39.9042,
        lon: 116.4074,
        elevation: 50,
        timezone: 'Asia/Shanghai',
      },
      moonObserver: DEFAULT_MOON_SITES[0],
      groundBodyScale: 3,
      groundFov: 60,
      overlays: {
        moonOrbit: true,
        earthOrbit: true,
        eclipticPlane: false,
        observerMarker: true,
        sightLines: true,
        eclipsePath: true,
        shadowCones: false,
        latLonGrid: false,
        skyTrajectories: true,
        constellationGrid: true,
        constellations: true,
        planets: true,
      },
      activeEclipsePeakUtc: null,
      activeEclipseKind: null,
      selectedEclipseId: null,
      eclipseReplay: null,
      uiHidden: false,
      ...initial,
    };
  }

  get(): Readonly<AppStateData> {
    return this.data;
  }

  update(patch: Partial<AppStateData>): void {
    const changed = new Set<keyof AppStateData>();
    for (const key of Object.keys(patch) as Array<keyof AppStateData>) {
      const nextVal = patch[key];
      if (nextVal !== undefined && this.data[key] !== nextVal) {
        (this.data as any)[key] = nextVal;
        changed.add(key);
      }
    }
    if (changed.has('uiMode')) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(UI_MODE_STORAGE_KEY, this.data.uiMode);
        }
      } catch {
        // ignore
      }
    }
    if (changed.size > 0) {
      for (const l of this.listeners) {
        l(this.data, changed);
      }
    }
  }

  setUiMode(mode: UiMode): void {
    this.update({ uiMode: mode });
  }

  pushUndoSnapshot(label = '画面跳转'): void {
    const snap: UndoSnapshot = {
      label,
      timeUtc: this.data.timeUtc,
      isRealtimeSync: this.data.isRealtimeSync,
      playing: this.data.playing,
      speedMultiplier: this.data.speedMultiplier,
      viewMode: this.data.viewMode,
      spaceCameraPreset: this.data.spaceCameraPreset,
      groundLockTarget: this.data.groundLockTarget,
      moonLockTarget: this.data.moonLockTarget,
      earthObserver: { ...this.data.earthObserver },
      moonObserver: { ...this.data.moonObserver },
      activeEclipsePeakUtc: this.data.activeEclipsePeakUtc,
      activeEclipseKind: this.data.activeEclipseKind,
      selectedEclipseId: this.data.selectedEclipseId,
    };
    this.undoStack.push(snap);
    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undoLastJump(): UndoSnapshot | null {
    const snap = this.undoStack.pop();
    if (!snap) return null;
    const restoredGroundLock =
      snap.activeEclipseKind === 'solar'
        ? 'sun'
        : snap.activeEclipseKind === 'lunar'
          ? 'moon'
          : snap.groundLockTarget;
    const restoredMoonLock = snap.activeEclipseKind ? 'earth' : snap.moonLockTarget;
    this.update({
      timeUtc: snap.timeUtc,
      isRealtimeSync: snap.isRealtimeSync,
      playing: snap.playing,
      speedMultiplier: snap.speedMultiplier,
      viewMode: snap.viewMode,
      spaceCameraPreset: snap.spaceCameraPreset,
      groundLockTarget: restoredGroundLock,
      moonLockTarget: restoredMoonLock,
      earthObserver: { ...snap.earthObserver },
      moonObserver: { ...snap.moonObserver },
      activeEclipsePeakUtc: snap.activeEclipsePeakUtc,
      activeEclipseKind: snap.activeEclipseKind,
      selectedEclipseId: snap.selectedEclipseId,
      eclipseReplay: null,
    });
    return snap;
  }

  setTimeUtc(utc: number, breakRealtime = true, keepReplay = false): void {
    this.data.timeUtc = utc;
    const changed = new Set<keyof AppStateData>(['timeUtc']);
    if (breakRealtime && this.data.isRealtimeSync) {
      this.data.isRealtimeSync = false;
      changed.add('isRealtimeSync');
    }
    if (breakRealtime && !keepReplay && this.data.eclipseReplay !== null) {
      this.data.eclipseReplay = null;
      changed.add('eclipseReplay');
    }
    for (const l of this.listeners) {
      l(this.data, changed);
    }
  }

  setEarthLocation(loc: Partial<EarthLocation> & { lat: number; lon: number }): void {
    const safeLat = Number.isFinite(loc.lat) ? Math.max(-90, Math.min(90, loc.lat)) : 0;
    const safeLon = Number.isFinite(loc.lon) ? Math.max(-180, Math.min(180, loc.lon)) : 0;
    const timezone = loc.timezone || inferTimezone(safeLat, safeLon);
    const name =
      loc.name ||
      `${safeLat >= 0 ? safeLat.toFixed(2) + '°N' : (-safeLat).toFixed(2) + '°S'}, ${
        safeLon >= 0 ? safeLon.toFixed(2) + '°E' : (-safeLon).toFixed(2) + '°W'
      }`;
    this.update({
      earthObserver: {
        name,
        lat: safeLat,
        lon: safeLon,
        elevation: Number.isFinite(loc.elevation) ? loc.elevation! : 0,
        timezone,
      },
    });
  }

  setMoonLocation(loc: Partial<MoonLocation> & { lat: number; lon: number }): void {
    const safeLat = Number.isFinite(loc.lat) ? Math.max(-90, Math.min(90, loc.lat)) : 0;
    const safeLon = Number.isFinite(loc.lon) ? Math.max(-180, Math.min(180, loc.lon)) : 0;
    const matched = DEFAULT_MOON_SITES.find(
      (s) => Math.abs(s.lat - safeLat) < 0.05 && Math.abs(s.lon - safeLon) < 0.05
    );
    const name =
      loc.name ||
      matched?.name ||
      `月面 (${safeLat >= 0 ? safeLat.toFixed(1) + '°N' : (-safeLat).toFixed(1) + '°S'}, ${
        safeLon >= 0 ? safeLon.toFixed(1) + '°E' : (-safeLon).toFixed(1) + '°W'
      })`;
    this.update({
      moonObserver: {
        name,
        lat: safeLat,
        lon: safeLon,
      },
    });
  }

  toggleOverlay(key: keyof OverlayFlags): void {
    this.update({
      overlays: {
        ...this.data.overlays,
        [key]: !this.data.overlays[key],
      },
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function buildShareSearchParams(s: Readonly<AppStateData>): URLSearchParams {
  const params = new URLSearchParams();
  params.set('t', new Date(s.timeUtc).toISOString());
  params.set('lat', s.earthObserver.lat.toFixed(2));
  params.set('lon', s.earthObserver.lon.toFixed(2));
  if (s.earthObserver.name) {
    params.set('name', s.earthObserver.name);
  }
  params.set('mlat', s.moonObserver.lat.toFixed(2));
  params.set('mlon', s.moonObserver.lon.toFixed(2));
  if (s.moonObserver.name) {
    params.set('mname', s.moonObserver.name);
  }
  params.set('view', s.viewMode);
  params.set('scale', s.scaleMode);
  if (s.selectedEclipseId) {
    params.set('ecl', s.selectedEclipseId);
  }
  return params;
}

export function syncBrowserUrlNow(state: AppState): string {
  const params = buildShareSearchParams(state.get());
  const relUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', relUrl);
  return `${window.location.origin}${relUrl}`;
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MIN_VALID_UTC_MS = Date.UTC(-1999, 0, 1);
const MAX_VALID_UTC_MS = Date.UTC(3000, 11, 31, 23, 59, 59);

export function parseUrlInitialState(
  state: AppState,
  searchStr = typeof window !== 'undefined' ? window.location.search : ''
): {
  initialEclipseId?: string;
  hasTime: boolean;
  hasLocation: boolean;
  hasMoonLocation: boolean;
  hasView: boolean;
  openTour?: boolean;
  openHelp?: boolean;
} {
  const params = new URLSearchParams(searchStr);

  let hasTime = false;
  const tParam = params.get('t');
  if (tParam) {
    const ms = Date.parse(tParam);
    if (Number.isFinite(ms) && ms >= MIN_VALID_UTC_MS && ms <= MAX_VALID_UTC_MS) {
      state.update({ timeUtc: ms, playing: false, isRealtimeSync: false });
      hasTime = true;
    }
  }

  let hasLocation = false;
  const latStr = params.get('lat');
  const lonStr = params.get('lon');
  if (latStr !== null && lonStr !== null && latStr.trim() !== '' && lonStr.trim() !== '') {
    const lat = Number(latStr);
    const lon = Number(lonStr);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      state.setEarthLocation({
        name: params.get('name') || undefined,
        lat,
        lon,
      });
      hasLocation = true;
    }
  }

  let hasMoonLocation = false;
  const mlatStr = params.get('mlat');
  const mlonStr = params.get('mlon');
  if (mlatStr !== null && mlonStr !== null && mlatStr.trim() !== '' && mlonStr.trim() !== '') {
    const mlat = Number(mlatStr);
    const mlon = Number(mlonStr);
    if (
      Number.isFinite(mlat) &&
      Number.isFinite(mlon) &&
      mlat >= -90 &&
      mlat <= 90 &&
      mlon >= -180 &&
      mlon <= 180
    ) {
      state.setMoonLocation({
        name: params.get('mname') || undefined,
        lat: mlat,
        lon: mlon,
      });
      hasMoonLocation = true;
    }
  }

  let hasView = false;
  const view = params.get('view') as ViewMode | null;
  if (view === 'space' || view === 'ground' || view === 'moon') {
    state.update({ viewMode: view });
    hasView = true;
  }
  const scale = params.get('scale') as ScaleMode | null;
  if (scale === 'schematic' || scale === 'realistic') {
    state.update({ scaleMode: scale });
  }
  const ecl = params.get('ecl') || undefined;

  return {
    initialEclipseId: ecl,
    hasTime,
    hasLocation,
    hasMoonLocation,
    hasView,
    openTour: params.get('tour') === '1',
    openHelp: params.get('help') === '1',
  };
}
