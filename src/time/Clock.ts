import { AppState } from '../state/AppState';

export class SimulationClock {
  private lastPerfNow = performance.now();

  constructor(private state: AppState) {}

  tick(nowPerf = performance.now()): void {
    const dtSec = Math.min((nowPerf - this.lastPerfNow) / 1000, 0.25);
    this.lastPerfNow = nowPerf;

    const s = this.state.get();
    if (!s.playing) return;

    if (s.isRealtimeSync && s.speedMultiplier === 1) {
      this.state.setTimeUtc(Date.now(), false);
    } else {
      const nextUtc = s.timeUtc + dtSec * 1000 * s.speedMultiplier;
      this.state.setTimeUtc(nextUtc, false);
    }
  }

  stepByMs(deltaMs: number): void {
    const s = this.state.get();
    this.state.update({
      timeUtc: s.timeUtc + deltaMs,
      isRealtimeSync: false,
      eclipseReplay: null,
    });
  }

  resetToNow(): void {
    this.state.update({
      timeUtc: Date.now(),
      playing: true,
      speedMultiplier: 1,
      isRealtimeSync: true,
      eclipseReplay: null,
    });
  }
}
