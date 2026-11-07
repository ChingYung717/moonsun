import { AppState, sanitizeTimeUtc } from '../state/AppState';

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

    if (s.isRealtimeSync && s.speedMultiplier === 1) {
      this.state.setTimeUtc(Date.now(), false);
    } else if (Number.isFinite(s.speedMultiplier)) {
      const nextUtc = s.timeUtc + dtSec * 1000 * s.speedMultiplier;
      this.state.setTimeUtc(nextUtc, false);
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

