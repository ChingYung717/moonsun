import { inferTimezone, isValidCalendarDateTime } from '../time/tz';

export const MIN_SUPPORTED_YEAR = -1999;
export const MAX_SUPPORTED_YEAR = 3000;

/**
 * Construct a UTC timestamp from an astronomical calendar year without JS Date.UTC's 0..99 -> 1900..1999 mapping.
 */
export function utcCalendarDateMs(
  year: number,
  monthIndex = 0,
  day = 1,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): number {
  const d = new Date(0);
  d.setUTCHours(hour, minute, second, ms);
  d.setUTCFullYear(year, monthIndex, day);
  return d.getTime();
}

export const MIN_VALID_UTC_MS = utcCalendarDateMs(MIN_SUPPORTED_YEAR, 0, 1, 0, 0, 0, 0);
export const MAX_VALID_UTC_MS = utcCalendarDateMs(MAX_SUPPORTED_YEAR, 11, 31, 23, 59, 59, 999);

export type TimeBoundaryHit = 'min' | 'max';

export interface SanitizedTimeResult {
  valid: boolean;
  timeUtc: number;
  clamped: TimeBoundaryHit | null;
}

/**
 * Validate and clamp a candidate UTC timestamp against [MIN_VALID_UTC_MS, MAX_VALID_UTC_MS].
 * Non-finite values (NaN, ±Infinity) are rejected and retain fallbackUtc.
 * Finite out-of-range values are clamped to the nearest supported boundary.
 */
export function sanitizeTimeUtc(candidate: unknown, fallbackUtc: number): SanitizedTimeResult {
  const safeFallback =
    typeof fallbackUtc === 'number' && Number.isFinite(fallbackUtc)
      ? Math.max(MIN_VALID_UTC_MS, Math.min(MAX_VALID_UTC_MS, fallbackUtc))
      : Date.now();
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return { valid: false, timeUtc: safeFallback, clamped: null };
  }
  if (candidate < MIN_VALID_UTC_MS) {
    return { valid: true, timeUtc: MIN_VALID_UTC_MS, clamped: 'min' };
  }
  if (candidate > MAX_VALID_UTC_MS) {
    return { valid: true, timeUtc: MAX_VALID_UTC_MS, clamped: 'max' };
  }
  return { valid: true, timeUtc: candidate, clamped: null };
}

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
type BoundaryListener = (bound: TimeBoundaryHit, clampedUtcMs: number) => void;

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
  private boundaryListeners: Set<BoundaryListener> = new Set();
  private lastNotifiedBoundary: TimeBoundaryHit | null = null;
  private undoStack: UndoSnapshot[] = [];

  constructor(initial?: Partial<AppStateData>) {
    const now = sanitizeTimeUtc(Date.now(), 0).timeUtc;
    const initSanitized =
      initial && 'timeUtc' in initial && initial.timeUtc !== undefined
        ? sanitizeTimeUtc(initial.timeUtc, now)
        : { valid: true, timeUtc: now, clamped: null as TimeBoundaryHit | null };

    this.data = {
      timeUtc: initSanitized.timeUtc,
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

    this.data.timeUtc = initSanitized.timeUtc;
    if (initSanitized.clamped) {
      this.data.playing = false;
      this.data.isRealtimeSync = false;
      this.data.eclipseReplay = null;
      this.lastNotifiedBoundary = initSanitized.clamped;
    }
    if (!Number.isFinite(this.data.speedMultiplier)) {
      this.data.speedMultiplier = 1;
    }
  }

  get(): Readonly<AppStateData> {
    return this.data;
  }

  private handleTimeBoundary(clamped: TimeBoundaryHit | null, timeUtc: number): void {
    if (clamped) {
      if (this.lastNotifiedBoundary !== clamped) {
        this.lastNotifiedBoundary = clamped;
        for (const cb of this.boundaryListeners) {
          cb(clamped, timeUtc);
        }
      }
    } else if (timeUtc > MIN_VALID_UTC_MS && timeUtc < MAX_VALID_UTC_MS) {
      this.lastNotifiedBoundary = null;
    }
  }

  onTimeBoundaryReached(listener: BoundaryListener): () => void {
    this.boundaryListeners.add(listener);
    return () => this.boundaryListeners.delete(listener);
  }

  update(patch: Partial<AppStateData>): void {
    const normalizedPatch: Partial<AppStateData> = { ...patch };
    let clampedHit: TimeBoundaryHit | null = null;

    if ('timeUtc' in normalizedPatch && normalizedPatch.timeUtc !== undefined) {
      const check = sanitizeTimeUtc(normalizedPatch.timeUtc, this.data.timeUtc);
      if (!check.valid) {
        delete normalizedPatch.timeUtc;
      } else {
        normalizedPatch.timeUtc = check.timeUtc;
        clampedHit = check.clamped;
        if (clampedHit) {
          normalizedPatch.playing = false;
          normalizedPatch.isRealtimeSync = false;
          normalizedPatch.eclipseReplay = null;
        }
      }
    }

    if (
      'speedMultiplier' in normalizedPatch &&
      normalizedPatch.speedMultiplier !== undefined &&
      !Number.isFinite(normalizedPatch.speedMultiplier)
    ) {
      delete normalizedPatch.speedMultiplier;
    }

    const changed = new Set<keyof AppStateData>();
    for (const key of Object.keys(normalizedPatch) as Array<keyof AppStateData>) {
      const nextVal = normalizedPatch[key];
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
    if ('timeUtc' in normalizedPatch && normalizedPatch.timeUtc !== undefined) {
      this.handleTimeBoundary(clampedHit, this.data.timeUtc);
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
      speedMultiplier: Number.isFinite(snap.speedMultiplier) ? snap.speedMultiplier : 1,
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
    return {
      ...snap,
      timeUtc: this.data.timeUtc,
      playing: this.data.playing,
      isRealtimeSync: this.data.isRealtimeSync,
    };
  }

  setTimeUtc(utc: number, breakRealtime = true, keepReplay = false): void {
    const check = sanitizeTimeUtc(utc, this.data.timeUtc);
    if (!check.valid) {
      return;
    }
    const changed = new Set<keyof AppStateData>();
    if (this.data.timeUtc !== check.timeUtc) {
      this.data.timeUtc = check.timeUtc;
      changed.add('timeUtc');
    }
    if ((breakRealtime || check.clamped) && this.data.isRealtimeSync) {
      this.data.isRealtimeSync = false;
      changed.add('isRealtimeSync');
    }
    if (check.clamped && this.data.playing) {
      this.data.playing = false;
      changed.add('playing');
    }
    if (((breakRealtime && !keepReplay) || check.clamped) && this.data.eclipseReplay !== null) {
      this.data.eclipseReplay = null;
      changed.add('eclipseReplay');
    }
    if (changed.size > 0) {
      for (const l of this.listeners) {
        l(this.data, changed);
      }
    }
    this.handleTimeBoundary(check.clamped, this.data.timeUtc);
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
  const safeTimeUtc = sanitizeTimeUtc(s.timeUtc, Date.now()).timeUtc;
  params.set('t', new Date(safeTimeUtc).toISOString());
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

/**
 * Determine whether the diagnostic window.__MOONSUN__ handle should be exposed.
 * Only enabled in development builds (isDev === true) or when ?debug=1 / ?debug=true
 * or ?audit=1 / ?audit=true is explicitly passed in the query string.
 * Falsy values such as ?debug=0, ?debug=false, ?audit=0, ?audit=false, or empty values are rejected.
 */
export function shouldExposeDebugHandle(
  searchStr = typeof window !== 'undefined' ? window.location.search : '',
  isDev = false
): boolean {
  const params = new URLSearchParams(searchStr);
  const debugVal = params.get('debug')?.trim().toLowerCase() ?? null;
  const auditVal = params.get('audit')?.trim().toLowerCase() ?? null;
  const isExplicitlyDisabled = (val: string | null): boolean =>
    val === '0' || val === 'false' || val === 'no' || val === 'off';
  const isExplicitlyEnabled = (val: string | null): boolean =>
    val === '1' || val === 'true';

  if (isExplicitlyEnabled(debugVal) || isExplicitlyEnabled(auditVal)) {
    return true;
  }
  if (isExplicitlyDisabled(debugVal) || isExplicitlyDisabled(auditVal)) {
    return false;
  }
  return isDev;
}

function parseUrlTimestamp(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const m = trimmed.match(
    /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z?)?$/
  );
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const hour = m[4] !== undefined ? parseInt(m[4], 10) : 0;
    const minute = m[5] !== undefined ? parseInt(m[5], 10) : 0;
    const second = m[6] !== undefined ? parseInt(m[6], 10) : 0;
    const ms = m[7] !== undefined ? parseInt(m[7].padEnd(3, '0'), 10) : 0;
    if (!Number.isInteger(year) || year < -100000 || year > 100000) {
      return NaN;
    }
    // Check calendar day/month/time validity using an equivalent leap/non-leap year in [2000, 2399]
    const eqYear = 2000 + (((year % 400) + 400) % 400);
    if (!isValidCalendarDateTime(eqYear, month, day, hour, minute, second)) {
      return NaN;
    }
    return utcCalendarDateMs(year, month - 1, day, hour, minute, second, ms);
  }
  return Date.parse(trimmed);
}

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
  if (tParam !== null) {
    const ms = parseUrlTimestamp(tParam);
    const check = sanitizeTimeUtc(ms, state.get().timeUtc);
    if (check.valid) {
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
