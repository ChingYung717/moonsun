import * as Astronomy from 'astronomy-engine';
import { Solar } from 'lunar-javascript';
import { AppState, MAX_VALID_UTC_MS, MIN_VALID_UTC_MS } from '../state/AppState';
import { makeAstroTime } from '../astro/ephemeris';
import { formatDateTime, localPartsToUtc } from '../time/tz';

export interface TimelineTick {
  utcMs: number;
  kind: 'newMoon' | 'fullMoon' | 'jieQi' | 'eclipse';
  eclipseKind?: 'solar' | 'lunar';
  label: string;
  icon: string;
}

export class TimelineBar {
  public readonly el: HTMLElement;
  private spanDays: 1 | 45 | 180 = 45;
  private isDragging = false;
  private dragBaseUtc = 0;
  private dragStartX = 0;
  private lastTicksCenterUtc = -Infinity;
  private lastTicksSpanDays = 0;
  private cachedTicks: TimelineTick[] = [];
  private lastRenderedUtc = -Infinity;
  private lastRenderedSpanDays = 0;
  private lastRenderedTz = '';
  private tickElements = new Map<string, HTMLButtonElement>();

  constructor(private state: AppState) {
    this.el = document.createElement('div');
    this.el.className = 'ms-timeline glass-panel';
    this.el.id = 'tour-timeline';
    this.render();
    this.state.subscribe((s, changed) => {
      if (s.uiHidden) return;
      if (
        changed.has('uiHidden') ||
        changed.has('earthObserver') ||
        (changed.has('timeUtc') && (!s.playing || Math.abs(s.timeUtc - this.lastRenderedUtc) > 60000))
      ) {
        this.refreshDisplay();
      }
    });
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="ms-tl-head">
        <span class="ms-tl-label" id="tl-center-readout">--</span>
        <div class="ms-tl-zoom" role="group" aria-label="时间轴缩放范围">
          <button type="button" class="ms-tl-zbtn" data-span="1" title="时间轴范围 ±1天">±1天</button>
          <button type="button" class="ms-tl-zbtn active" data-span="45" title="时间轴范围 ±45天">±45天</button>
          <button type="button" class="ms-tl-zbtn" data-span="180" title="时间轴范围 ±半年">±半年</button>
        </div>
      </div>
      <div class="ms-tl-track" id="tl-track" role="slider" tabindex="0" aria-label="左右拖动时间轴改变时间" aria-valuemin="-45" aria-valuemax="45" aria-valuenow="0">
        <div class="ms-tl-ticks" id="tl-ticks"></div>
        <div class="ms-tl-center-marker" title="当前时刻 (左右拖动时间轴可连续改变时间)"></div>
      </div>
    `;

    this.el.querySelectorAll<HTMLButtonElement>('[data-span]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.spanDays = parseInt(btn.dataset.span!, 10) as 1 | 45 | 180;
        this.el.querySelectorAll<HTMLButtonElement>('[data-span]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        this.lastTicksCenterUtc = -Infinity;
        this.refreshDisplay();
      });
    });

    const track = this.el.querySelector<HTMLElement>('#tl-track')!;
    track.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('.ms-tl-tick')) return;
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragBaseUtc = this.state.get().timeUtc;
      this.state.update({ playing: false, isRealtimeSync: false, eclipseReplay: null });
      track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const rect = track.getBoundingClientRect();
      const dx = e.clientX - this.dragStartX;
      const totalSpanMs = this.spanDays * 2 * 86400 * 1000;
      // Dragging track right moves backward in time, or dragging scrubber style:
      const deltaMs = -(dx / Math.max(200, rect.width)) * totalSpanMs;
      this.state.setTimeUtc(this.dragBaseUtc + deltaMs, true);
    });

    const endDrag = () => {
      this.isDragging = false;
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    const ticksContainer = this.el.querySelector<HTMLElement>('#tl-ticks')!;
    ticksContainer.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement)?.closest<HTMLButtonElement>('[data-tutc]');
      if (!btn) return;
      e.stopPropagation();
      const utcMs = parseFloat(btn.dataset.tutc!);
      const eclKind = btn.dataset.eclkind as 'solar' | 'lunar' | undefined;
      if (Number.isFinite(utcMs)) {
        this.state.pushUndoSnapshot('时间轴刻度跳转');
        this.state.update({
          playing: false,
          isRealtimeSync: false,
          eclipseReplay: null,
          ...(eclKind ? { activeEclipsePeakUtc: utcMs, activeEclipseKind: eclKind } : {}),
        });
        this.state.setTimeUtc(utcMs, true);
      }
    });
  }

  public computeTicks(centerUtcMs: number, spanDays: number): TimelineTick[] {
    if (!Number.isFinite(centerUtcMs) || !Number.isFinite(spanDays) || spanDays <= 0) {
      return [];
    }
    const startMs = Math.max(MIN_VALID_UTC_MS, centerUtcMs - spanDays * 86400 * 1000);
    const endMs = Math.min(MAX_VALID_UTC_MS, centerUtcMs + spanDays * 86400 * 1000);
    if (startMs > endMs) return [];
    const ticks: TimelineTick[] = [];

    try {
      // 1. New Moons & Full Moons
      let tNew = Astronomy.SearchMoonPhase(0, makeAstroTime(startMs), spanDays * 2 + 35);
      while (tNew && tNew.date.getTime() <= endMs) {
        const ms = tNew.date.getTime();
        if (ms >= startMs) {
          ticks.push({ utcMs: ms, kind: 'newMoon', label: '朔 (新月)', icon: '🌑' });
        }
        tNew = Astronomy.SearchMoonPhase(0, makeAstroTime(ms + 20 * 86400000), 35);
      }

      let tFull = Astronomy.SearchMoonPhase(180, makeAstroTime(startMs), spanDays * 2 + 35);
      while (tFull && tFull.date.getTime() <= endMs) {
        const ms = tFull.date.getTime();
        if (ms >= startMs) {
          ticks.push({ utcMs: ms, kind: 'fullMoon', label: '望 (满月)', icon: '🌕' });
        }
        tFull = Astronomy.SearchMoonPhase(180, makeAstroTime(ms + 20 * 86400000), 35);
      }

      // 2. Solar & Lunar Eclipses in window
      let sEcl = Astronomy.SearchGlobalSolarEclipse(makeAstroTime(startMs));
      while (sEcl && sEcl.peak.date.getTime() <= endMs) {
        const ms = sEcl.peak.date.getTime();
        if (ms >= startMs) {
          ticks.push({
            utcMs: ms,
            kind: 'eclipse',
            eclipseKind: 'solar',
            label: '日食食甚',
            icon: '⚡日食',
          });
        }
        sEcl = Astronomy.SearchGlobalSolarEclipse(makeAstroTime(ms + 20 * 86400000));
      }
      let lEcl = Astronomy.SearchLunarEclipse(makeAstroTime(startMs));
      while (lEcl && lEcl.peak.date.getTime() <= endMs) {
        const ms = lEcl.peak.date.getTime();
        if (ms >= startMs) {
          ticks.push({
            utcMs: ms,
            kind: 'eclipse',
            eclipseKind: 'lunar',
            label: '月食食甚',
            icon: '🔴月食',
          });
        }
        lEcl = Astronomy.SearchLunarEclipse(makeAstroTime(ms + 20 * 86400000));
      }

      // 3. 24 Solar Terms (if spanDays <= 45 and year in 1900..2100)
      const centerYear = new Date(centerUtcMs).getUTCFullYear();
      if (spanDays <= 45 && centerYear >= 1901 && centerYear <= 2099) {
        for (let d = -spanDays; d <= spanDays; d++) {
          const dt = new Date(centerUtcMs + d * 86400000 + 8 * 3600000);
          const lunar = Solar.fromYmd(
            dt.getUTCFullYear(),
            dt.getUTCMonth() + 1,
            dt.getUTCDate()
          ).getLunar();
          const jq = lunar.getJieQi();
          if (jq) {
            const jqSolar = (
              lunar.getJieQiTable() as Record<
                string,
                {
                  getYear(): number;
                  getMonth(): number;
                  getDay(): number;
                  getHour(): number;
                  getMinute(): number;
                  getSecond(): number;
                }
              >
            )[jq];
            const ms = jqSolar
              ? localPartsToUtc(
                  jqSolar.getYear(),
                  jqSolar.getMonth(),
                  jqSolar.getDay(),
                  jqSolar.getHour(),
                  jqSolar.getMinute(),
                  jqSolar.getSecond(),
                  'Asia/Shanghai'
                )
              : Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 4, 0);
            if (ms >= startMs && ms <= endMs) {
              ticks.push({ utcMs: ms, kind: 'jieQi', label: `节气·${jq}`, icon: `🌿${jq}` });
            }
          }
        }
      }
    } catch {
      // ignore out-of-range
    }

    return ticks;
  }

  public refreshDisplay(): void {
    const s = this.state.get();
    if (s.uiHidden) return;
    const nowUtc = s.timeUtc;
    const tz = s.earthObserver.timezone;

    if (
      nowUtc === this.lastRenderedUtc &&
      this.spanDays === this.lastRenderedSpanDays &&
      tz === this.lastRenderedTz
    ) {
      return;
    }
    this.lastRenderedUtc = nowUtc;
    this.lastRenderedSpanDays = this.spanDays;
    this.lastRenderedTz = tz;

    const spanMs = this.spanDays * 86400 * 1000;

    const readout = this.el.querySelector('#tl-center-readout')!;
    readout.textContent = `⏱ 时间轴 (${formatDateTime(nowUtc, tz, false)} · 拖动可快进快退，点击刻度可跳转朔望/节气/交食)`;

    const recomputeThreshold = spanMs * 0.25;
    if (
      Math.abs(nowUtc - this.lastTicksCenterUtc) > recomputeThreshold ||
      this.spanDays !== this.lastTicksSpanDays
    ) {
      this.lastTicksCenterUtc = nowUtc;
      this.lastTicksSpanDays = this.spanDays;
      this.cachedTicks = this.computeTicks(nowUtc, this.spanDays);
    }

    const ticksContainer = this.el.querySelector<HTMLElement>('#tl-ticks')!;
    const startMs = nowUtc - spanMs;
    const totalMs = spanMs * 2;

    const visibleTicks = this.cachedTicks.filter(
      (t) => t.utcMs >= startMs && t.utcMs <= nowUtc + spanMs
    );

    const activeKeys = new Set<string>();
    for (const t of visibleTicks) {
      const key = `${t.kind}:${t.utcMs}`;
      activeKeys.add(key);
      const pct = ((t.utcMs - startMs) / totalMs) * 100;
      let btn = this.tickElements.get(key);
      if (!btn) {
        const dateStr = formatDateTime(t.utcMs, 'Asia/Shanghai', false).slice(5, 16);
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ms-tl-tick tick-${t.kind}`;
        btn.dataset.tutc = String(t.utcMs);
        if (t.eclipseKind) {
          btn.dataset.eclkind = t.eclipseKind;
        }
        btn.title = `${t.label} (${dateStr})`;
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tick-icon';
        iconSpan.textContent = t.icon;
        btn.appendChild(iconSpan);
        ticksContainer.appendChild(btn);
        this.tickElements.set(key, btn);
      }
      btn.style.left = `${pct.toFixed(2)}%`;
    }

    for (const [key, btn] of this.tickElements.entries()) {
      if (!activeKeys.has(key)) {
        btn.remove();
        this.tickElements.delete(key);
      }
    }
  }
}
