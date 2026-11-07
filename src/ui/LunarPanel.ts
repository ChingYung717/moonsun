import { LunarMonth } from 'lunar-javascript';
import { AppState } from '../state/AppState';
import {
  computeLunarDetail,
  getTraditionalFestivalUtc,
  LunarDetailInfo,
  lunarToUtcMs,
} from '../lunar/lunarInfo';
import { buildLunarMonthGrid } from '../lunar/monthGrid';
import { drawMoonPhaseDisc } from './moonDiscCanvas';
import { computeLunarEclipseShadow } from '../astro/eclipses/obscuration';
import { FrameAstroData } from '../render/Renderer';
import { showToast } from './Toast';
import { termTipHtml } from './tooltips';

export class LunarPanel {
  public readonly el: HTMLElement;
  private lastMonthGridKey = '';
  private latestLunar: LunarDetailInfo | null = null;
  private browsedLunarYear: number | null = null;
  private browsedRawMonth: number | null = null;

  constructor(private state: AppState) {
    this.el = document.createElement('section');
    this.el.className = 'side-panel glass-panel lunar-panel';
    this.render();
  }

  private stepBrowsedMonth(delta: number): void {
    const info = computeLunarDetail(this.state.get().timeUtc);
    this.latestLunar = info;
    const curYear = this.browsedLunarYear ?? info.lunarYear;
    const curRawMonth =
      this.browsedRawMonth ?? (info.isLeapMonth ? -info.lunarMonth : info.lunarMonth);
    try {
      const lm = LunarMonth.fromYm(curYear, curRawMonth);
      if (!lm) return;
      const nextLm = lm.next(delta);
      if (!nextLm) return;
      this.browsedLunarYear = nextLm.getYear();
      this.browsedRawMonth = nextLm.getMonth();
      this.lastMonthGridKey = '';
      this.rebuildMonthGrid();
    } catch {
      // ignore out of range
    }
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="panel-header">
        <h2>🏮 中国传统农历与月相盈亏</h2>
        <span class="sub-badge">北京时间 UTC+8 授时</span>
      </div>

      <div class="panel-body">
        <div class="lunar-hero" id="tour-lunar-hero">
          <canvas id="lunar-hero-canvas" width="76" height="76"></canvas>
          <div class="lunar-hero-info">
            <div class="lunar-main-date" id="lunar-main-date">--</div>
            <div class="lunar-ganzhi" id="lunar-ganzhi">--</div>
            <div class="lunar-phase-row">
              <span class="phase-pill" id="lunar-phase-name">--</span>
              <span id="lunar-age-illum">--</span>
            </div>
            <div class="lunar-jieqi" id="lunar-jieqi">--</div>
          </div>
        </div>

        <div class="fullmoon-callout" id="fullmoon-callout">--</div>

        <div class="lunar-quick-demos">
          <button type="button" class="btn-chip" id="demo-new">🌑 本月朔(初一)</button>
          <button type="button" class="btn-chip" id="demo-fq">🌓 上弦月</button>
          <button type="button" class="btn-chip" id="demo-day15">🌕 农历十五晚</button>
          <button type="button" class="btn-chip accent" id="demo-full">✨ 实际最圆(望)</button>
          <button type="button" class="btn-chip" id="demo-tq">🌗 下弦月</button>
          <button type="button" class="btn-chip" id="demo-lantern">🏮 今年元宵</button>
          <button type="button" class="btn-chip" id="demo-midautumn">🥮 今年中秋</button>
          <button type="button" class="btn-chip" id="demo-next-jq">🌿 下个节气</button>
        </div>

        <div class="lunar-grid-header pro-only">
          <button type="button" class="btn-chip" id="btn-prev-lmonth" title="查看上一个农历月">◀ 上月</button>
          <span id="lunar-grid-title">本月农历月相日历</span>
          <button type="button" class="btn-chip" id="btn-next-lmonth" title="查看下一个农历月">下月 ▶</button>
        </div>
        <div class="lunar-month-grid pro-only" id="lunar-month-grid"></div>

        <div class="lunar-reverse-box pro-only">
          <div class="sub-title">🔍 农历转公历反查跳转</div>
          <div class="latlon-row">
            <div class="dt-field">
              <span>农历年</span>
              <input type="number" id="rev-lyear" value="2026" min="1901" max="2099" />
            </div>
            <div class="dt-field">
              <span>农历月</span>
              <input type="number" id="rev-lmonth" value="8" min="1" max="12" />
            </div>
            <div class="dt-field">
              <span>农历日</span>
              <input type="number" id="rev-lday" value="15" min="1" max="30" />
            </div>
            <label class="checkbox-pill">
              <input type="checkbox" id="rev-leap" /> 闰月
            </label>
            <button type="button" class="btn-primary" id="btn-rev-jump">反查跳转</button>
          </div>
          <div id="rev-inline-msg" class="inline-error-msg" style="display:none;"></div>
        </div>
      </div>
    `;

    this.el.querySelector('#btn-prev-lmonth')?.addEventListener('click', () => {
      this.stepBrowsedMonth(-1);
    });
    this.el.querySelector('#btn-next-lmonth')?.addEventListener('click', () => {
      this.stepBrowsedMonth(1);
    });

    this.el.querySelector('#demo-new')?.addEventListener('click', () => {
      const info = computeLunarDetail(this.state.get().timeUtc);
      this.browsedLunarYear = null;
      this.browsedRawMonth = null;
      this.state.pushUndoSnapshot('跳转到本月朔');
      this.state.setTimeUtc(info.phase.prevNewMoonUtc, true);
    });
    this.el.querySelector('#demo-fq')?.addEventListener('click', () => {
      const info = computeLunarDetail(this.state.get().timeUtc);
      this.browsedLunarYear = null;
      this.browsedRawMonth = null;
      this.state.pushUndoSnapshot('跳转到上弦月');
      this.state.setTimeUtc(info.phase.firstQuarterUtc, true);
    });
    this.el.querySelector('#demo-day15')?.addEventListener('click', () => {
      const info = computeLunarDetail(this.state.get().timeUtc);
      this.browsedLunarYear = null;
      this.browsedRawMonth = null;
      this.state.pushUndoSnapshot('跳转到农历十五晚');
      this.state.setTimeUtc(info.lunarDay15NoonUtcMs, true);
    });
    this.el.querySelector('#demo-full')?.addEventListener('click', () => {
      const info = computeLunarDetail(this.state.get().timeUtc);
      this.browsedLunarYear = null;
      this.browsedRawMonth = null;
      this.state.pushUndoSnapshot('跳转到实际最圆(望)');
      this.state.setTimeUtc(info.phase.fullMoonUtc, true);
    });
    this.el.querySelector('#demo-tq')?.addEventListener('click', () => {
      const info = computeLunarDetail(this.state.get().timeUtc);
      this.browsedLunarYear = null;
      this.browsedRawMonth = null;
      this.state.pushUndoSnapshot('跳转到下弦月');
      this.state.setTimeUtc(info.phase.thirdQuarterUtc, true);
    });
    this.el.querySelector('#demo-lantern')?.addEventListener('click', () => {
      const y = computeLunarDetail(this.state.get().timeUtc).lunarYear;
      const ms = getTraditionalFestivalUtc(y, 'lantern');
      if (ms) {
        this.browsedLunarYear = null;
        this.browsedRawMonth = null;
        this.state.pushUndoSnapshot('跳转到今年元宵');
        this.state.setTimeUtc(ms, true);
      }
    });
    this.el.querySelector('#demo-midautumn')?.addEventListener('click', () => {
      const y = computeLunarDetail(this.state.get().timeUtc).lunarYear;
      const ms = getTraditionalFestivalUtc(y, 'midAutumn');
      if (ms) {
        this.browsedLunarYear = null;
        this.browsedRawMonth = null;
        this.state.pushUndoSnapshot('跳转到今年中秋');
        this.state.setTimeUtc(ms, true);
      }
    });
    this.el.querySelector('#demo-next-jq')?.addEventListener('click', () => {
      const info = computeLunarDetail(this.state.get().timeUtc);
      this.browsedLunarYear = null;
      this.browsedRawMonth = null;
      this.state.pushUndoSnapshot('跳转到下个节气');
      this.state.setTimeUtc(info.nextJieQiUtcMs, true);
    });

    // B8: Replace alert() with inline error message
    this.el.querySelector('#btn-rev-jump')?.addEventListener('click', () => {
      const parseStrict = (sel: string): number => {
        const raw = (this.el.querySelector(sel) as HTMLInputElement).value.trim();
        return raw === '' ? NaN : Number(raw);
      };
      const ly = parseStrict('#rev-lyear');
      const lm = parseStrict('#rev-lmonth');
      const ld = parseStrict('#rev-lday');
      const isLeap = (this.el.querySelector('#rev-leap') as HTMLInputElement).checked;
      const msgEl = this.el.querySelector<HTMLElement>('#rev-inline-msg')!;
      const utc = lunarToUtcMs(ly, lm, ld, isLeap, 20);
      if (utc !== null) {
        msgEl.style.display = 'none';
        this.browsedLunarYear = null;
        this.browsedRawMonth = null;
        this.state.pushUndoSnapshot('农历反查跳转');
        this.state.setTimeUtc(utc, true);
        showToast({
          message: `已跳转到农历 ${ly}年${isLeap ? '闰' : ''}${lm}月${ld}日 当晚20:00`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
      } else {
        msgEl.style.display = 'block';
        msgEl.textContent =
          '⚠️ 该农历日期不存在或超出范围（支持 1901–2099 年，请检查该年是否有此闰月或该月是否有三十）';
        showToast({
          message: '⚠️ 该农历日期不存在，请检查年份范围、闰月或大小月',
          type: 'warn',
        });
      }
    });
  }

  private rebuildMonthGrid(): void {
    const s = this.state.get();
    const info = this.latestLunar;
    if (!info) return;

    const targetYear = this.browsedLunarYear ?? info.lunarYear;
    const targetRawMonth =
      this.browsedRawMonth ?? (info.isLeapMonth ? -info.lunarMonth : info.lunarMonth);
    const activeDay =
      targetYear === info.lunarYear &&
      targetRawMonth === (info.isLeapMonth ? -info.lunarMonth : info.lunarMonth)
        ? info.lunarDay
        : -1;

    const gridData = buildLunarMonthGrid(targetYear, targetRawMonth, activeDay);
    const gridEl = this.el.querySelector('#lunar-month-grid')!;
    if (!gridData) {
      gridEl.innerHTML = `<div class="empty-msg">当前年份超出农历月历表范围 (1901–2099)</div>`;
      return;
    }

    this.el.querySelector('#lunar-grid-title')!.textContent =
      `${gridData.monthTitleZh} · 每日20:00月相`;

    gridEl.innerHTML = gridData.days
      .map(
        (cell) => `
        <div class="lunar-day-cell ${cell.isTodaySelected ? 'active' : ''}" data-utc="${cell.utcMsEvening}" title="公历 ${cell.gregorianMonth}月${cell.gregorianDay}日 20:00 | 照明 ${(cell.illuminatedFraction * 100).toFixed(0)}%">
          <canvas class="cell-moon-canvas" width="26" height="26" data-angle="${cell.phaseAngleDeg}"></canvas>
          <span class="cell-lday">${cell.lunarDayNameZh}</span>
          <span class="cell-gday">${cell.gregorianMonth}/${cell.gregorianDay}</span>
          ${cell.badgeZh ? `<span class="cell-badge">${cell.badgeZh}</span>` : ''}
        </div>
      `
      )
      .join('');

    gridEl.querySelectorAll<HTMLCanvasElement>('.cell-moon-canvas').forEach((cv) => {
      const angle = parseFloat(cv.dataset.angle || '0');
      drawMoonPhaseDisc(cv, angle, {
        isSouthernHemisphere: s.earthObserver.lat < 0,
      });
    });

    gridEl.querySelectorAll<HTMLElement>('.lunar-day-cell').forEach((cellEl) => {
      cellEl.addEventListener('click', () => {
        const utc = parseFloat(cellEl.dataset.utc!);
        if (Number.isFinite(utc)) {
          // Keep browsed month pinned when clicking a day in that month (B8)
          this.browsedLunarYear = targetYear;
          this.browsedRawMonth = targetRawMonth;
          this.state.setTimeUtc(utc, true);
          this.state.update({ playing: false });
        }
      });
    });
  }

  public refreshDisplay(frame: FrameAstroData): void {
    const s = this.state.get();
    if (s.uiHidden) return;
    const info = computeLunarDetail(s.timeUtc);
    this.latestLunar = info;

    const shadow = computeLunarEclipseShadow(frame.eph.sunEclKm, frame.eph.moonEclKm);
    const heroCanvas = this.el.querySelector<HTMLCanvasElement>('#lunar-hero-canvas')!;
    drawMoonPhaseDisc(heroCanvas, info.phase.phaseAngleDeg, {
      isSouthernHemisphere: s.earthObserver.lat < 0,
      lunarEclipseObscuration: shadow.umbralMagnitude > 0 ? shadow.umbralMagnitude : 0,
    });

    const fests = info.festivalsZh.length > 0 ? ` · 🎉 ${info.festivalsZh.join(' / ')}` : '';
    this.el.querySelector('#lunar-main-date')!.textContent = `${info.fullLunarLabelZh}${fests}`;

    this.el.querySelector('#lunar-ganzhi')!.textContent =
      `八字干支：${info.lunarYearGanZhi}年 ${info.lunarMonthGanZhi}月 ${info.lunarDayGanZhi}日 ${info.lunarTimeGanZhi}时`;

    this.el.querySelector('#lunar-phase-name')!.textContent =
      `${info.phase.phaseNameZh} (${info.phase.phaseAliasZh})`;

    this.el.querySelector('#lunar-age-illum')!.innerHTML =
      `${termTipHtml('月龄')} ${info.phase.lunarAgeDays.toFixed(1)}天 · 照明 ${(info.phase.illuminatedFraction * 100).toFixed(1)}% · ${termTipHtml('黄经差')} ${info.phase.phaseAngleDeg.toFixed(1)}°`;

    const jqText = info.currentJieQi
      ? `今日节气：【${info.currentJieQi}】 | 下个节气：${info.nextJieQiName} (${info.nextJieQiTimeStr})`
      : `上个节气：${info.prevJieQiName} | 下个节气：${info.nextJieQiName} (${info.nextJieQiTimeStr})`;
    this.el.querySelector('#lunar-jieqi')!.textContent = jqText;

    this.el.querySelector('#fullmoon-callout')!.textContent = `💡 ${info.fullMoonSummaryZh}`;

    const targetYear = this.browsedLunarYear ?? info.lunarYear;
    const targetRawMonth =
      this.browsedRawMonth ?? (info.isLeapMonth ? -info.lunarMonth : info.lunarMonth);
    const gridKey = `${targetYear}_${targetRawMonth}_${info.lunarDay}_${s.earthObserver.lat < 0 ? 'S' : 'N'}`;
    if (gridKey !== this.lastMonthGridKey) {
      this.lastMonthGridKey = gridKey;
      this.rebuildMonthGrid();
    }
  }
}
