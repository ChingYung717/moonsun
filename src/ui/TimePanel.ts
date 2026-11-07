import * as Astronomy from 'astronomy-engine';
import { AppState, MAX_VALID_UTC_MS, MIN_VALID_UTC_MS } from '../state/AppState';
import { SimulationClock, togglePlayPause } from '../time/Clock';
import {
  formatDateTime,
  GREGORIAN_REFORM_MS,
  historicalDateLabelZh,
  isLowPrecisionYear,
  isValidCalendarDateTime,
  localPartsToUtc,
  utcToLocalParts,
} from '../time/tz';
import { makeAstroTime } from '../astro/ephemeris';
import { computeEarthObserverSky, computeRiseSetTimes } from '../astro/observer';
import { COMMON_TIMEZONES } from './cities';
import { showToast } from './Toast';
import { termTipHtml } from './tooltips';

export class TimePanel {
  public readonly el: HTMLElement;
  private isFocused = false;
  private isDirty = false;

  constructor(
    private state: AppState,
    private clock: SimulationClock
  ) {
    this.el = document.createElement('section');
    this.el.className = 'side-panel glass-panel';
    this.render();
    this.state.subscribe((s, changed) => {
      if (s.uiHidden) return;
      if (
        changed.has('uiHidden') ||
        changed.has('earthObserver') ||
        changed.has('playing') ||
        changed.has('speedMultiplier') ||
        (changed.has('timeUtc') && !s.playing)
      ) {
        this.refreshDisplay();
      }
    });
  }

  private setDirty(dirty: boolean): void {
    this.isDirty = dirty;
    const dtBox = this.el.querySelector('#dt-inputs');
    const applyBtn = this.el.querySelector('#btn-apply-dt');
    const hintEl = this.el.querySelector<HTMLElement>('#dt-dirty-hint');
    dtBox?.classList.toggle('is-dirty', dirty);
    applyBtn?.classList.toggle('pulse-highlight', dirty);
    if (hintEl) {
      hintEl.style.display = dirty ? 'block' : 'none';
    }
  }

  private render(): void {
    const tzOptions = COMMON_TIMEZONES.map(
      (t) => `<option value="${t.zone}">${t.label}</option>`
    ).join('');

    this.el.innerHTML = `
      <div class="panel-header">
        <h2>⏱ 时间与年限控制</h2>
        <button type="button" class="btn-chip accent" id="btn-now" title="同步到当前系统真实时间 (快捷键 N)">⚡ 实时现在</button>
      </div>

      <div class="panel-body">
        <div class="clock-readout">
          <div class="clock-main" id="clock-local">--</div>
          <div class="clock-sub">
            <span id="clock-beijing">北京时间: --</span>
            <span id="clock-utc">UTC: --</span>
          </div>
          <div class="precision-warning" id="precision-warn" style="display:none;"></div>
        </div>

        <div class="quick-date-chips">
          <button type="button" class="btn-chip" id="q-today">📅 今天此刻</button>
          <button type="button" class="btn-chip" id="q-tonight">🌃 今晚 20:00</button>
          <button type="button" class="btn-chip" id="q-sunrise">🌅 明早日出</button>
          <button type="button" class="btn-chip" id="q-next-solar">🌑 下次日食</button>
          <button type="button" class="btn-chip" id="q-next-lunar">🌕 下次月食</button>
        </div>

        <div class="form-row pro-only">
          <label for="tz-select">观察时区</label>
          <select id="tz-select" class="input-control">
            ${tzOptions}
            <option value="__custom__" id="tz-custom-opt" style="display:none;"></option>
          </select>
        </div>

        <div class="datetime-inputs" id="dt-inputs">
          <div class="dt-field" style="flex:1.4;">
            <span>年份</span>
            <input type="number" id="in-year" min="-1999" max="3000" step="1" title="支持公元前(-1999)至公元3000年" />
          </div>
          <div class="dt-field">
            <span>月</span>
            <input type="number" id="in-month" min="1" max="12" />
          </div>
          <div class="dt-field">
            <span>日</span>
            <input type="number" id="in-day" min="1" max="31" />
          </div>
          <div class="dt-field">
            <span>时</span>
            <input type="number" id="in-hour" min="0" max="23" />
          </div>
          <div class="dt-field">
            <span>分</span>
            <input type="number" id="in-min" min="0" max="59" />
          </div>
          <div class="dt-field pro-only">
            <span>秒</span>
            <input type="number" id="in-sec" min="0" max="59" />
          </div>
          <button type="button" class="btn-primary" id="btn-apply-dt">跳转</button>
        </div>
        <div id="dt-inline-msg" class="inline-error-msg" style="display:none;"></div>
        <div id="dt-dirty-hint" class="dirty-hint" style="display:none;">
          ✏️ 已修改时间参数，请点击「跳转」或按 Enter 生效（按 Esc 取消修改）
        </div>

        <div class="playback-controls">
          <button type="button" class="btn-play" id="btn-play-toggle">⏸ 暂停</button>
          <select id="speed-select" class="input-control">
            <option value="-2592000">⏪ -30天/秒</option>
            <option value="-86400">⏪ -1天/秒</option>
            <option value="-3600">⏪ -1小时/秒</option>
            <option value="-60">⏪ -1分钟/秒</option>
            <option value="1" selected>▶ 1× 真实时间速率</option>
            <option value="60">⏩ 60× (1分钟/秒 · 日月食推荐)</option>
            <option value="600">⏩ 600× (10分钟/秒)</option>
            <option value="3600">⏩ 3600× (1小时/秒 · 看地球自转)</option>
            <option value="86400">⏩ 1天/秒 (看月球公转与月相)</option>
            <option value="604800">⏩ 1周/秒</option>
            <option value="2548800">⏩ 1朔望月/秒</option>
          </select>
        </div>

        <div class="step-buttons pro-only">
          <button type="button" class="btn-step" data-step="-86400000">-1天</button>
          <button type="button" class="btn-step" data-step="-3600000">-1小时</button>
          <button type="button" class="btn-step" data-step="-60000">-1分</button>
          <button type="button" class="btn-step" data-step="60000">+1分</button>
          <button type="button" class="btn-step" data-step="3600000">+1小时</button>
          <button type="button" class="btn-step" data-step="86400000">+1天</button>
          <button type="button" class="btn-step" data-step="2551442800" title="步进一个平均朔望月 (29.53天)">+1朔望月</button>
        </div>
      </div>
    `;

    this.el.querySelector('#btn-now')?.addEventListener('click', () => {
      this.setDirty(false);
      this.clock.resetToNow();
    });

    // Quick date chips (B7)
    this.el.querySelector('#q-today')?.addEventListener('click', () => {
      this.setDirty(false);
      this.clock.resetToNow();
    });

    this.el.querySelector('#q-tonight')?.addEventListener('click', () => {
      this.setDirty(false);
      const s = this.state.get();
      const parts = utcToLocalParts(s.timeUtc, s.earthObserver.timezone);
      const utc = localPartsToUtc(
        parts.year,
        parts.month,
        parts.day,
        20,
        0,
        0,
        s.earthObserver.timezone
      );
      this.state.pushUndoSnapshot('跳到今晚20:00');
      this.state.setTimeUtc(utc, true);
      this.state.update({ playing: false });
      if (utc >= MIN_VALID_UTC_MS && utc <= MAX_VALID_UTC_MS) {
        showToast('已跳转到当地今晚 20:00');
      }
    });

    this.el.querySelector('#q-sunrise')?.addEventListener('click', () => {
      this.setDirty(false);
      const s = this.state.get();
      const nextDayUtc = s.timeUtc + 86400000;
      if (nextDayUtc > MAX_VALID_UTC_MS) {
        showToast({
          message: '⚠️ 已到达支持时间上限（公元 3000 年），无法继续向后搜索次日日出',
          type: 'warn',
        });
        return;
      }
      const parts = utcToLocalParts(nextDayUtc, s.earthObserver.timezone);
      const rs = computeRiseSetTimes(
        nextDayUtc,
        s.earthObserver.lat,
        s.earthObserver.lon,
        parts.offsetMinutes,
        s.earthObserver.elevation
      );
      if (rs.sunRiseUtc === null || rs.sunRiseUtc > MAX_VALID_UTC_MS) {
        const noonUtc = localPartsToUtc(
          parts.year,
          parts.month,
          parts.day,
          12,
          0,
          0,
          s.earthObserver.timezone
        );
        const noonSky = computeEarthObserverSky(
          noonUtc,
          s.earthObserver.lat,
          s.earthObserver.lon,
          s.earthObserver.elevation
        );
        const polarState = noonSky.sun.altitudeDeg < 0 ? '极夜' : '极昼';
        showToast({
          message: `⚠️ 次日无日出（当前地点处于${polarState}期，正午太阳高度 ${noonSky.sun.altitudeDeg.toFixed(1)}°）`,
          type: 'warn',
        });
        return;
      }
      this.state.pushUndoSnapshot('跳到明早日出');
      this.state.setTimeUtc(rs.sunRiseUtc, true);
      this.state.update({ playing: false });
      showToast('已跳转到明早日出时刻');
    });

    this.el.querySelector('#q-next-solar')?.addEventListener('click', () => {
      this.setDirty(false);
      const s = this.state.get();
      const searchFrom = s.timeUtc + 6 * 3600 * 1000;
      if (searchFrom > MAX_VALID_UTC_MS) {
        showToast({
          message: '⚠️ 已达支持时间上限（公元 3000 年），支持区间内无后续日食',
          type: 'warn',
        });
        return;
      }
      const nextSolar = Astronomy.SearchGlobalSolarEclipse(makeAstroTime(searchFrom));
      if (nextSolar) {
        const peakMs = nextSolar.peak.date.getTime();
        if (peakMs > MAX_VALID_UTC_MS) {
          showToast({
            message: '⚠️ 公元 3000 年底之前无后续全球日食',
            type: 'warn',
          });
          return;
        }
        this.state.pushUndoSnapshot('跳到下次日食');
        this.state.update({
          timeUtc: peakMs,
          playing: false,
          isRealtimeSync: false,
          activeEclipsePeakUtc: peakMs,
          activeEclipseKind: 'solar',
          eclipseReplay: null,
        });
        showToast({
          message: `已跳转到下次全球日食 (${formatDateTime(peakMs, 'Asia/Shanghai', false)})`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
      }
    });

    this.el.querySelector('#q-next-lunar')?.addEventListener('click', () => {
      this.setDirty(false);
      const s = this.state.get();
      const searchFrom = s.timeUtc + 6 * 3600 * 1000;
      if (searchFrom > MAX_VALID_UTC_MS) {
        showToast({
          message: '⚠️ 已达支持时间上限（公元 3000 年），支持区间内无后续月食',
          type: 'warn',
        });
        return;
      }
      const nextLunar = Astronomy.SearchLunarEclipse(makeAstroTime(searchFrom));
      if (nextLunar) {
        const peakMs = nextLunar.peak.date.getTime();
        if (peakMs > MAX_VALID_UTC_MS) {
          showToast({
            message: '⚠️ 公元 3000 年底之前无后续月食',
            type: 'warn',
          });
          return;
        }
        this.state.pushUndoSnapshot('跳到下次月食');
        this.state.update({
          timeUtc: peakMs,
          playing: false,
          isRealtimeSync: false,
          activeEclipsePeakUtc: peakMs,
          activeEclipseKind: 'lunar',
          eclipseReplay: null,
        });
        showToast({
          message: `已跳转到下次月食 (${formatDateTime(peakMs, 'Asia/Shanghai', false)})`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
      }
    });

    const tzSelect = this.el.querySelector<HTMLSelectElement>('#tz-select')!;
    tzSelect.addEventListener('change', () => {
      const s = this.state.get();
      this.state.update({
        earthObserver: {
          ...s.earthObserver,
          timezone: tzSelect.value,
        },
      });
    });

    const dtContainer = this.el.querySelector('#dt-inputs')!;
    dtContainer.addEventListener('focusin', () => {
      this.isFocused = true;
    });
    dtContainer.addEventListener('focusout', () => {
      setTimeout(() => {
        this.isFocused = false;
      }, 150);
    });

    const applyDt = () => {
      const parseStrict = (sel: string, fallback?: number): number => {
        const raw = (this.el.querySelector(sel) as HTMLInputElement).value.trim();
        if (raw === '') return fallback !== undefined ? fallback : NaN;
        return Number(raw);
      };
      const y = parseStrict('#in-year');
      const m = parseStrict('#in-month');
      const d = parseStrict('#in-day');
      const h = parseStrict('#in-hour', 0);
      const min = parseStrict('#in-min', 0);
      const sec = parseStrict('#in-sec', 0);
      const msgEl = this.el.querySelector<HTMLElement>('#dt-inline-msg');

      const tz = this.state.get().earthObserver.timezone;
      const isEdgeLocalYear =
        (y === -2000 || y === 3001) &&
        isValidCalendarDateTime(2000 + (((y % 400) + 400) % 400), m, d, h, min, sec);
      const candidateUtc =
        isValidCalendarDateTime(y, m, d, h, min, sec) || isEdgeLocalYear
          ? localPartsToUtc(y, m, d, h, min, sec, tz)
          : NaN;

      if (
        !Number.isFinite(candidateUtc) ||
        (isEdgeLocalYear && (candidateUtc < MIN_VALID_UTC_MS || candidateUtc > MAX_VALID_UTC_MS))
      ) {
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.textContent = '⚠️ 日期不存在或超出有效范围（支持天文年 -1999 至 3000 年，请检查大小月、平年2月天数或时分秒范围）';
        }
        showToast({
          message: '⚠️ 日期不存在或超出支持范围，请检查年月日数值是否有效',
          type: 'warn',
        });
        return;
      }

      if (msgEl) {
        msgEl.style.display = 'none';
      }
      this.state.pushUndoSnapshot('输入时间跳转');
      this.state.setTimeUtc(candidateUtc, true);
      this.setDirty(false);
      this.isFocused = false;
    };

    this.el.querySelector('#btn-apply-dt')?.addEventListener('click', applyDt);
    dtContainer.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const msgEl = this.el.querySelector<HTMLElement>('#dt-inline-msg');
        if (msgEl) msgEl.style.display = 'none';
        this.setDirty(true);
      });
      inp.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter') {
          e.preventDefault();
          applyDt();
        } else if (ke.key === 'Escape') {
          e.preventDefault();
          const msgEl = this.el.querySelector<HTMLElement>('#dt-inline-msg');
          if (msgEl) msgEl.style.display = 'none';
          this.setDirty(false);
          (inp as HTMLInputElement).blur();
          this.refreshDisplay();
        }
      });
    });

    const playBtn = this.el.querySelector<HTMLButtonElement>('#btn-play-toggle')!;
    playBtn.addEventListener('click', () => {
      togglePlayPause(this.state);
    });

    const speedSel = this.el.querySelector<HTMLSelectElement>('#speed-select')!;
    speedSel.addEventListener('change', () => {
      const mult = parseFloat(speedSel.value);
      this.state.update({
        speedMultiplier: mult,
        playing: true,
        isRealtimeSync: false,
        eclipseReplay: null,
      });
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseFloat(btn.dataset.step!);
        this.clock.stepByMs(delta);
      });
    });
  }

  public refreshDisplay(): void {
    const s = this.state.get();
    if (s.uiHidden) return;
    const tz = s.earthObserver.timezone;
    const parts = utcToLocalParts(s.timeUtc, tz);

    const localEl = this.el.querySelector('#clock-local')!;
    localEl.textContent = `${formatDateTime(s.timeUtc, tz, true)} · ${s.earthObserver.name}`;

    const bjEl = this.el.querySelector('#clock-beijing')!;
    bjEl.textContent = `北京时间: ${formatDateTime(s.timeUtc, 'Asia/Shanghai', true)}`;

    const utcEl = this.el.querySelector('#clock-utc')!;
    utcEl.textContent = `UTC: ${formatDateTime(s.timeUtc, 'UTC', true)}`;

    const warnEl = this.el.querySelector<HTMLElement>('#precision-warn')!;
    const lowPrecision = isLowPrecisionYear(parts.year);
    warnEl.style.display = lowPrecision ? 'block' : 'none';
    if (lowPrecision) {
      const julianNote =
        s.timeUtc < GREGORIAN_REFORM_MS
          ? `史料通用的儒略历日期：<b>${historicalDateLabelZh(s.timeUtc)}</b>（上方为外推格里历）。`
          : '';
      warnEl.innerHTML = `⚠️ 当前年份超出 1600–2200 年，地球自转修正 ${termTipHtml('ΔT')} 存在不确定性，日食带位置可能有数十至数百公里偏移。${julianNote}`;
    }

    const tzSelect = this.el.querySelector<HTMLSelectElement>('#tz-select')!;
    const hasMatch = COMMON_TIMEZONES.some((t) => t.zone === tz);
    const customOpt = this.el.querySelector<HTMLOptionElement>('#tz-custom-opt')!;
    if (!hasMatch) {
      customOpt.value = tz;
      customOpt.textContent = `${tz} (${parts.offsetLabel})`;
      customOpt.style.display = 'block';
    }
    if (tzSelect.value !== tz) {
      tzSelect.value = tz;
    }

    // Never overwrite inputs when user has edited them (isDirty) or is actively typing (isFocused) (B7)
    if (!this.isFocused && !this.isDirty) {
      (this.el.querySelector('#in-year') as HTMLInputElement).value = String(parts.year);
      (this.el.querySelector('#in-month') as HTMLInputElement).value = String(parts.month);
      (this.el.querySelector('#in-day') as HTMLInputElement).value = String(parts.day);
      (this.el.querySelector('#in-hour') as HTMLInputElement).value = String(parts.hour);
      (this.el.querySelector('#in-min') as HTMLInputElement).value = String(parts.minute);
      (this.el.querySelector('#in-sec') as HTMLInputElement).value = String(parts.second);
    }

    const playBtn = this.el.querySelector<HTMLButtonElement>('#btn-play-toggle')!;
    playBtn.textContent = s.playing ? '⏸ 暂停' : '▶ 播放';
    playBtn.classList.toggle('paused', !s.playing);

    const speedSel = this.el.querySelector<HTMLSelectElement>('#speed-select')!;
    if (String(s.speedMultiplier) !== speedSel.value) {
      speedSel.value = String(s.speedMultiplier);
    }
  }
}
