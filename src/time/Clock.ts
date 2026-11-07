import { AppState, EclipseReplayState, UndoSnapshot, sanitizeTimeUtc } from '../state/AppState';

export interface EclipseReplayMetrics {
  frac: number;
  ended: boolean;
  inTotalityWindow: boolean;
  desiredSpeed: number;
  badgeText: string;
}

export function computeEclipseReplayMetrics(
  timeUtc: number,
  rep: EclipseReplayState,
  playing = true
): EclipseReplayMetrics {
  const span = Math.max(1000, rep.endUtcMs - rep.startUtcMs);
  const frac = Math.max(0, Math.min(1, (timeUtc - rep.startUtcMs) / span));
  const totalSpanSec = span / 1000;
  const fastSpeed = Math.max(60, Math.round(totalSpanSec / 48));
  const inTotalityWindow =
    rep.u2UtcMs && rep.u3UtcMs
      ? timeUtc >= rep.u2UtcMs - 90 * 1000 && timeUtc <= rep.u3UtcMs + 90 * 1000
      : Math.abs(timeUtc - rep.peakUtcMs) < 5 * 60 * 1000;
  const desiredSpeed = inTotalityWindow
    ? Math.max(12, Math.round(fastSpeed * 0.22))
    : fastSpeed;
  const ended = !rep.active || timeUtc >= rep.endUtcMs;
  const phaseLabel = inTotalityWindow
    ? `🔥 食既~生光自动慢放 (${desiredSpeed}×)`
    : `⏩ 偏食阶段快进 (${desiredSpeed}×)`;
  const badgeText = ended
    ? '✅ 已复圆结束'
    : playing
      ? phaseLabel
      : `⏸ 已暂停 · ${phaseLabel}`;
  return {
    frac,
    ended,
    inTotalityWindow,
    desiredSpeed,
    badgeText,
  };
}

/**
 * Advance/control eclipse replay playback state independently of DOM visibility or UI throttling:
 * - Automatically stops playback, clamps timeUtc to endUtcMs, and marks replay inactive when timeUtc >= endUtcMs
 * - Automatically adjusts speedMultiplier between partial-phase fast-forward and totality slow-mo
 */
export function syncEclipseReplayState(state: AppState): void {
  const s = state.get();
  const rep = s.eclipseReplay;
  if (!rep || !rep.active || !s.playing) return;

  if (s.timeUtc >= rep.endUtcMs) {
    state.update({
      timeUtc: rep.endUtcMs,
      playing: false,
      isRealtimeSync: false,
      eclipseReplay: { ...rep, active: false },
    });
    return;
  }

  const { desiredSpeed } = computeEclipseReplayMetrics(s.timeUtc, rep, s.playing);
  const needSpeedUpdate = Math.abs(s.speedMultiplier - desiredSpeed) > 5;
  if (needSpeedUpdate || s.isRealtimeSync) {
    state.update({
      ...(needSpeedUpdate ? { speedMultiplier: desiredSpeed } : {}),
      ...(s.isRealtimeSync ? { isRealtimeSync: false } : {}),
    });
  }
}

/**
 * Unified play/pause toggle shared by Space shortcut, TopBar #top-play-btn, and TimePanel #btn-play-toggle:
 * - If an active eclipse replay is in progress (or scrubbed to < endUtcMs while paused), toggles
 *   playing/paused while preserving eclipseReplay and syncing replay speed.
 * - If an eclipse replay has already finished (!active || timeUtc >= endUtcMs) and the user
 *   resumes playback, clears the finished eclipseReplay and restores 1× normal speed so simulation
 *   does not run away at ~200× with a stale "✅ 已复圆结束" badge.
 */
export function togglePlayPause(state: AppState): void {
  const s = state.get();
  const rep = s.eclipseReplay;

  if (s.playing) {
    if (rep && (!rep.active || s.timeUtc >= rep.endUtcMs)) {
      state.update({
        playing: false,
        isRealtimeSync: false,
        eclipseReplay: null,
      });
    } else {
      state.update({
        playing: false,
        isRealtimeSync: false,
      });
    }
    return;
  }

  if (rep) {
    if (rep.active && s.timeUtc < rep.endUtcMs) {
      const metrics = computeEclipseReplayMetrics(s.timeUtc, rep, true);
      state.update({
        playing: true,
        isRealtimeSync: false,
        speedMultiplier: metrics.desiredSpeed,
      });
      return;
    }
    state.update({
      playing: true,
      isRealtimeSync: false,
      eclipseReplay: null,
      speedMultiplier: 1,
    });
    return;
  }

  state.update({
    playing: true,
    isRealtimeSync: false,
  });
}

export interface GlobalKeydownContext {
  state: AppState;
  clock: SimulationClock;
  activeElement?: unknown;
  onToggleHelp?: () => void;
  onNotifyResetToNow?: () => void;
  onNotifyUndo?: (snap: UndoSnapshot) => void;
}

export function shouldIgnoreGlobalKeydown(
  activeEl: unknown,
  e: Pick<KeyboardEvent, 'code' | 'key'>
): boolean {
  if (!activeEl || typeof activeEl !== 'object') return false;
  const tagName =
    typeof (activeEl as { tagName?: unknown }).tagName === 'string'
      ? ((activeEl as { tagName: string }).tagName || '').toUpperCase()
      : '';
  const isSelect =
    (typeof HTMLSelectElement !== 'undefined' && activeEl instanceof HTMLSelectElement) ||
    tagName === 'SELECT';
  const isTextArea =
    (typeof HTMLTextAreaElement !== 'undefined' && activeEl instanceof HTMLTextAreaElement) ||
    tagName === 'TEXTAREA';
  if (isSelect || isTextArea) {
    return true;
  }
  const isInput =
    (typeof HTMLInputElement !== 'undefined' && activeEl instanceof HTMLInputElement) ||
    tagName === 'INPUT';
  if (isInput) {
    const inputType =
      typeof (activeEl as { type?: unknown }).type === 'string'
        ? (activeEl as { type: string }).type.toLowerCase()
        : '';
    if (
      inputType === 'range' &&
      (e.code === 'Space' || e.key === ' ' || e.key === 'h' || e.key === 'H')
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function handleGlobalKeydown(
  e: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey' | 'defaultPrevented' | 'preventDefault'>,
  ctx: GlobalKeydownContext
): void {
  if (e.defaultPrevented) return;
  const activeEl =
    ctx.activeElement !== undefined
      ? ctx.activeElement
      : typeof document !== 'undefined'
        ? document.activeElement
        : null;
  if (shouldIgnoreGlobalKeydown(activeEl, e)) {
    return;
  }
  const { state, clock } = ctx;
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault?.();
    togglePlayPause(state);
  } else if (e.key === 'h' || e.key === 'H') {
    state.update({ uiHidden: !state.get().uiHidden });
  } else if (e.key === 'n' || e.key === 'N') {
    clock.resetToNow();
    ctx.onNotifyResetToNow?.();
  } else if (e.key === '1') {
    state.update({ viewMode: 'space' });
  } else if (e.key === '2') {
    state.update({ viewMode: 'ground' });
  } else if (e.key === '3') {
    state.update({ viewMode: 'moon' });
  } else if (e.key === 'ArrowRight') {
    clock.stepByMs(e.shiftKey ? 86400000 : 60000);
  } else if (e.key === 'ArrowLeft') {
    clock.stepByMs(e.shiftKey ? -86400000 : -60000);
  } else if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
    e.preventDefault?.();
    ctx.onToggleHelp?.();
  } else if (e.key === 'Backspace') {
    if (state.canUndo()) {
      e.preventDefault?.();
      const snap = state.undoLastJump();
      if (snap) {
        ctx.onNotifyUndo?.(snap);
      }
    }
  }
}

export class SimulationClock {
  private lastPerfNow = performance.now();
  private resetListeners: Set<() => void> = new Set();

  constructor(private state: AppState) {}

  onReset(listener: () => void): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  tick(nowPerf = performance.now()): void {
    if (!Number.isFinite(nowPerf)) return;
    const rawDtSec = (nowPerf - this.lastPerfNow) / 1000;
    const dtSec = Number.isFinite(rawDtSec) && rawDtSec > 0 ? Math.min(rawDtSec, 0.25) : 0;
    this.lastPerfNow = nowPerf;

    if (!this.state.get().playing) return;

    const pre = this.state.get();
    if (pre.eclipseReplay) {
      if (pre.eclipseReplay.active) {
        syncEclipseReplayState(this.state);
      } else if (pre.timeUtc >= pre.eclipseReplay.endUtcMs) {
        this.state.update({
          eclipseReplay: null,
          speedMultiplier: 1,
        });
      }
    }

    const s = this.state.get();
    if (!s.playing) return;

    if (s.isRealtimeSync && s.speedMultiplier === 1 && !s.eclipseReplay?.active) {
      this.state.setTimeUtc(Date.now(), false);
    } else if (Number.isFinite(s.speedMultiplier)) {
      const rawNextUtc = s.timeUtc + dtSec * 1000 * s.speedMultiplier;
      const nextUtc =
        s.eclipseReplay?.active && s.speedMultiplier > 0
          ? Math.min(rawNextUtc, s.eclipseReplay.endUtcMs)
          : rawNextUtc;
      this.state.setTimeUtc(nextUtc, false);
    }

    if (this.state.get().eclipseReplay?.active) {
      syncEclipseReplayState(this.state);
    }
  }

  stepByMs(deltaMs: number): void {
    if (!Number.isFinite(deltaMs)) return;
    const s = this.state.get();
    this.state.update({
      timeUtc: s.timeUtc + deltaMs,
      isRealtimeSync: false,
      eclipseReplay: null,
    });
  }

  resetToNow(): void {
    this.lastPerfNow = performance.now();
    this.state.update({
      timeUtc: Date.now(),
      playing: true,
      speedMultiplier: 1,
      isRealtimeSync: true,
      eclipseReplay: null,
    });
    for (const cb of this.resetListeners) {
      cb();
    }
  }
}

/**
 * Recoverable animation-frame error boundary.
 * On an unexpected calculation/render exception:
 * - Pauses playback and exits realtime sync
 * - Restores the last known valid timeUtc so the last valid frame stays on screen
 * - Logs and notifies once (no per-frame retry/log spam)
 * - Recovers cleanly when recoverToNow() or clock.resetToNow() is triggered
 */
export class FrameRunner {
  private lastValidTimeUtc: number;
  private hasActiveError = false;
  private isExecutingFrame = false;
  private errorCount = 0;

  constructor(
    private state: AppState,
    private clock: SimulationClock,
    private renderAndRefresh: (nowPerf: number) => void,
    private onError?: (err: unknown, recoverToNow: () => void) => void
  ) {
    this.lastValidTimeUtc = sanitizeTimeUtc(state.get().timeUtc, Date.now()).timeUtc;
    this.clock.onReset(() => {
      this.hasActiveError = false;
      this.lastValidTimeUtc = sanitizeTimeUtc(this.state.get().timeUtc, Date.now()).timeUtc;
    });
    this.state.subscribe((s, changed) => {
      if (
        !this.isExecutingFrame &&
        this.hasActiveError &&
        (changed.has('timeUtc') || (changed.has('playing') && s.playing))
      ) {
        this.hasActiveError = false;
        this.lastValidTimeUtc = sanitizeTimeUtc(s.timeUtc, this.lastValidTimeUtc).timeUtc;
      }
    });
  }

  isPausedOnError(): boolean {
    return this.hasActiveError;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  getLastValidTimeUtc(): number {
    return this.lastValidTimeUtc;
  }

  recoverToNow(): void {
    this.hasActiveError = false;
    this.clock.resetToNow();
  }

  runFrame(nowPerf = performance.now()): boolean {
    if (this.hasActiveError) {
      return false;
    }
    const prevValidTime = this.lastValidTimeUtc;
    this.isExecutingFrame = true;
    try {
      this.clock.tick(nowPerf);
      this.renderAndRefresh(nowPerf);
      this.lastValidTimeUtc = sanitizeTimeUtc(this.state.get().timeUtc, prevValidTime).timeUtc;
      return true;
    } catch (err) {
      this.hasActiveError = true;
      this.errorCount += 1;
      this.state.update({
        timeUtc: prevValidTime,
        playing: false,
        isRealtimeSync: false,
        eclipseReplay: null,
      });
      console.error('[moonsun] 模拟帧计算异常，已暂停模拟并保留上一有效画面:', err);
      this.onError?.(err, () => this.recoverToNow());
      return false;
    } finally {
      this.isExecutingFrame = false;
    }
  }
}

