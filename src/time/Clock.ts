import { AppState, EclipseReplayState, sanitizeTimeUtc } from '../state/AppState';

export interface EclipseReplayMetrics {
  frac: number;
  ended: boolean;
  inTotalityWindow: boolean;
  desiredSpeed: number;
  badgeText: string;
}

export function computeEclipseReplayMetrics(
  timeUtc: number,
  rep: EclipseReplayState
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
  const badgeText = ended
    ? '✅ 已复圆结束'
    : inTotalityWindow
      ? `🔥 食既~生光自动慢放 (${desiredSpeed}×)`
      : `⏩ 偏食阶段快进 (${desiredSpeed}×)`;
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
 * - Automatically stops playback and marks replay inactive when timeUtc >= endUtcMs
 * - Automatically adjusts speedMultiplier between partial-phase fast-forward and totality slow-mo
 */
export function syncEclipseReplayState(state: AppState): void {
  const s = state.get();
  const rep = s.eclipseReplay;
  if (!rep || !s.playing) return;

  if (s.timeUtc >= rep.endUtcMs) {
    state.update({
      playing: false,
      eclipseReplay: { ...rep, active: false },
    });
    return;
  }

  if (rep.active) {
    const { desiredSpeed } = computeEclipseReplayMetrics(s.timeUtc, rep);
    if (Math.abs(s.speedMultiplier - desiredSpeed) > 5) {
      state.update({ speedMultiplier: desiredSpeed });
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

    const s = this.state.get();
    if (!s.playing) return;

    if (s.eclipseReplay && s.timeUtc >= s.eclipseReplay.endUtcMs) {
      syncEclipseReplayState(this.state);
      return;
    }

    if (s.isRealtimeSync && s.speedMultiplier === 1) {
      this.state.setTimeUtc(Date.now(), false);
    } else if (Number.isFinite(s.speedMultiplier)) {
      const nextUtc = s.timeUtc + dtSec * 1000 * s.speedMultiplier;
      this.state.setTimeUtc(nextUtc, false);
    }

    syncEclipseReplayState(this.state);
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

