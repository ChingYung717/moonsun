import * as Astronomy from 'astronomy-engine';
import { AppState, escapeHtml, MAX_VALID_UTC_MS } from '../state/AppState';
import { FrameAstroData } from '../render/Renderer';
import { computeRiseSetTimes, RiseSetTimes } from '../astro/observer';
import { computeLunarEclipseShadow } from '../astro/eclipses/obscuration';
import { makeAstroTime } from '../astro/ephemeris';
import { formatDateTime, formatTimeOnly, utcToLocalParts } from '../time/tz';
import { showToast } from './Toast';
import { termTipHtml } from './tooltips';

export class InfoHUD {
  public readonly el: HTMLElement;
  private expanded = false;
  private lastRiseSetKey = '';
  private cachedRiseSet: RiseSetTimes | null = null;
  private lastFrame: FrameAstroData | null = null;

  constructor(private state: AppState) {
    this.el = document.createElement('footer');
    this.el.className = 'bottom-hud glass-panel is-compact';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="ms-hud-compact-bar" id="hud-compact-bar" role="button" tabindex="0" aria-label="展开或收起底部天文数据栏" title="点击展开或收起详细实时天文数据">
        <span id="hud-compact-summary">--</span>
        <span class="ms-hud-toggle-btn" id="hud-toggle-label">展开详情 ▴</span>
      </div>
      <div class="ms-hud-full-grid" id="hud-full-grid" style="display:none;">
        <div class="hud-section" id="hud-sun"></div>
        <div class="hud-section" id="hud-moon"></div>
        <div class="hud-section" id="hud-riseset"></div>
        <div class="hud-section" id="hud-eclipse-status"></div>
      </div>
    `;

    const toggleBar = this.el.querySelector('#hud-compact-bar')!;
    toggleBar.addEventListener('click', (e) => {
      if ((e.target as HTMLElement)?.closest?.('.ms-term-tip, .hud-jump-btn')) return;
      this.expanded = !this.expanded;
      this.el.classList.toggle('is-compact', !this.expanded);
      const grid = this.el.querySelector<HTMLElement>('#hud-full-grid')!;
      const label = this.el.querySelector<HTMLElement>('#hud-toggle-label')!;
      grid.style.display = this.expanded ? 'grid' : 'none';
      label.textContent = this.expanded ? '收起详情 ▾' : '展开详情 ▴';
      if (this.expanded && this.lastFrame) {
        this.refreshDisplay(this.lastFrame);
      }
    });

    this.el.addEventListener('click', (e) => {
      const jumpBtn = (e.target as HTMLElement)?.closest?.('.hud-jump-btn') as HTMLElement | null;
      if (jumpBtn) {
        e.stopPropagation();
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
          this.state.pushUndoSnapshot('从数据栏跳转下次日食');
          this.state.update({
            timeUtc: peakMs,
            playing: false,
            isRealtimeSync: false,
            activeEclipsePeakUtc: peakMs,
            activeEclipseKind: 'solar',
            eclipseReplay: null,
          });
          showToast({
            message: `已跳至下次日食 (${formatDateTime(peakMs, 'Asia/Shanghai', false)})`,
            actionLabel: '↩ 返回',
            onAction: () => this.state.undoLastJump(),
          });
        }
      }
    });
  }

  public refreshDisplay(frame: FrameAstroData): void {
    this.lastFrame = frame;
    const s = this.state.get();
    if (s.uiHidden) return;
    const tz = s.earthObserver.timezone;
    const sky = frame.earthSky;
    const lunarShadow = computeLunarEclipseShadow(frame.eph.sunEclKm, frame.eph.moonEclKm);

    // Compact 1-line summary (B1)
    let eclSummary = `<span class="hud-c-tag">当前无交食</span>`;
    if (s.viewMode === 'moon') {
      const mSky = frame.moonSky;
      const earthOcc = mSky.solarEclipseByEarth;
      eclSummary =
        earthOcc.areaFraction > 0.01
          ? `<span class="hud-c-tag alert">🔴 地球遮日 ${(earthOcc.areaFraction * 100).toFixed(1)}%</span>`
          : `<span class="hud-c-tag">🌍 地相 ${(mSky.earthIlluminatedFraction * 100).toFixed(0)}%</span>`;
    } else if (sky.solarObscuration.areaFraction > 0.001) {
      const so = sky.solarObscuration;
      const k = so.isTotal ? '日全食' : so.isAnnular ? '日环食' : '日偏食';
      eclSummary = `<span class="hud-c-tag alert">⚡ ${k} 遮挡 ${(so.areaFraction * 100).toFixed(1)}%</span>`;
    } else if (lunarShadow.inShadow) {
      const k =
        lunarShadow.umbralMagnitude >= 1.0
          ? '月全食(红月亮)'
          : lunarShadow.umbralMagnitude > 0
            ? '月偏食'
            : '半影月食';
      eclSummary = `<span class="hud-c-tag alert">🔴 ${k} 食分 ${lunarShadow.umbralMagnitude.toFixed(2)}</span>`;
    }

    const safeEarthName = escapeHtml(s.earthObserver.name);
    const safeMoonName = escapeHtml(s.moonObserver.name);

    const compactEl = this.el.querySelector('#hud-compact-summary')!;
    compactEl.innerHTML = `
      <span>📍 <b>${safeEarthName}</b></span>
      <span class="hud-sep">|</span>
      <span>☀️ 太阳 高 <b>${sky.sun.altitudeDeg.toFixed(1)}°</b> · 方位 <b>${sky.sun.azimuthDeg.toFixed(0)}°</b></span>
      <span class="hud-sep">|</span>
      <span>🌙 ${frame.phase.phaseNameZh} 高 <b>${sky.moon.altitudeDeg.toFixed(1)}°</b> · 方位 <b>${sky.moon.azimuthDeg.toFixed(0)}°</b> (亮面 <b>${(frame.phase.illuminatedFraction * 100).toFixed(0)}%</b>)</span>
      <span class="hud-sep">|</span>
      ${eclSummary}
    `;

    if (!this.expanded) return;

    // 1. Sun telemetry
    const sunEl = this.el.querySelector('#hud-sun')!;
    sunEl.innerHTML = `
      <div class="hud-title">☀️ 太阳实时站心数据 (${safeEarthName})</div>
      <div class="hud-metrics">
        <span>高度角: <b>${sky.sun.altitudeDeg.toFixed(2)}°</b></span>
        <span>方位角: <b>${sky.sun.azimuthDeg.toFixed(2)}°</b></span>
        <span>赤经/赤纬: <b>${sky.sun.raHours.toFixed(2)}h / ${sky.sun.decDeg.toFixed(2)}°</b></span>
        <span>日地距离: <b>${(frame.eph.sunDistanceKm / 10000).toFixed(1)} 万km</b></span>
      </div>
    `;

    // 2. Moon telemetry
    const moonEl = this.el.querySelector('#hud-moon')!;
    moonEl.innerHTML = `
      <div class="hud-title">🌕 月球实时站心数据 (${frame.phase.phaseNameZh})</div>
      <div class="hud-metrics">
        <span>高度角: <b>${sky.moon.altitudeDeg.toFixed(2)}°</b></span>
        <span>方位角: <b>${sky.moon.azimuthDeg.toFixed(2)}°</b></span>
        <span>照明比例: <b>${(frame.phase.illuminatedFraction * 100).toFixed(1)}%</b></span>
        <span>地月距离: <b>${Math.round(frame.eph.moonDistanceKm).toLocaleString()} km</b></span>
      </div>
    `;

    // 3. Rise / Set / Twilight times
    const parts = utcToLocalParts(s.timeUtc, tz);
    const rsKey = `${parts.year}-${parts.month}-${parts.day}_${s.earthObserver.lat.toFixed(2)}_${s.earthObserver.lon.toFixed(2)}_${parts.offsetMinutes}`;
    if (rsKey !== this.lastRiseSetKey) {
      this.lastRiseSetKey = rsKey;
      this.cachedRiseSet = computeRiseSetTimes(
        s.timeUtc,
        s.earthObserver.lat,
        s.earthObserver.lon,
        parts.offsetMinutes,
        s.earthObserver.elevation
      );
    }

    const rs = this.cachedRiseSet!;
    const rsEl = this.el.querySelector('#hud-riseset')!;
    rsEl.innerHTML = `
      <div class="hud-title">🌅 当日升降时刻 (${parts.offsetLabel})</div>
      <div class="hud-metrics">
        <span>日出: <b>${formatTimeOnly(rs.sunRiseUtc, tz)}</b></span>
        <span>日落: <b>${formatTimeOnly(rs.sunSetUtc, tz)}</b></span>
        <span>月出: <b>${formatTimeOnly(rs.moonRiseUtc, tz)}</b></span>
        <span>月落: <b>${formatTimeOnly(rs.moonSetUtc, tz)}</b></span>
      </div>
    `;

    // 4. Active Eclipse / Moon Surface Status
    const eclEl = this.el.querySelector('#hud-eclipse-status')!;
    if (s.viewMode === 'moon') {
      const mSky = frame.moonSky;
      const earthOcc = mSky.solarEclipseByEarth;
      let statusBadge = `<span class="status-pill normal">${termTipHtml('地相')} ${(mSky.earthIlluminatedFraction * 100).toFixed(1)}% · ${mSky.isLunarDay ? '月昼' : '月夜'}</span>`;
      if (earthOcc.areaFraction > 0.01) {
        statusBadge = `<span class="status-pill alert">🔴 地球正在遮挡太阳 (${earthOcc.isTotal ? '月面日全食 · 红环奇观' : '月面日偏食'} ${(earthOcc.areaFraction * 100).toFixed(1)}%)</span>`;
      }
      eclEl.innerHTML = `
        <div class="hud-title">🌕 月面站点：${safeMoonName}</div>
        <div class="hud-metrics">
          <span>地球高度/方位: <b>${mSky.earthAltitudeDeg.toFixed(1)}° / ${mSky.earthAzimuthDeg.toFixed(1)}°</b></span>
          <span>太阳高度/方位: <b>${mSky.sunAltitudeDeg.toFixed(1)}° / ${mSky.sunAzimuthDeg.toFixed(1)}°</b></span>
          ${statusBadge}
        </div>
      `;
    } else if (sky.solarObscuration.areaFraction > 0.001) {
      const so = sky.solarObscuration;
      const kindStr = so.isTotal
        ? '日全食 (食既~生光)'
        : so.isAnnular
          ? '日环食 (金环阶段)'
          : '日偏食进行中';
      eclEl.innerHTML = `
        <div class="hud-title">🌑 本地日食实时监测 (${safeEarthName})</div>
        <div class="hud-metrics">
          <span class="status-pill alert">⚡ ${kindStr}</span>
          <span>${termTipHtml('遮挡面积比')}: <b>${(so.areaFraction * 100).toFixed(2)}%</b></span>
          <span>${termTipHtml('线性食分')}: <b>${so.magnitude.toFixed(3)}</b></span>
          <span>日月圆心角距: <b>${so.angularSeparationDeg.toFixed(3)}°</b></span>
        </div>
      `;
    } else if (lunarShadow.inShadow) {
      const kindStr =
        lunarShadow.umbralMagnitude >= 1.0
          ? '月全食 (红月亮本影食)'
          : lunarShadow.umbralMagnitude > 0
            ? '月偏食 (本影食)'
            : '半影月食进行中';
      eclEl.innerHTML = `
        <div class="hud-title">🌕 全球月食实时监测</div>
        <div class="hud-metrics">
          <span class="status-pill alert">🔴 ${kindStr}</span>
          <span>${termTipHtml('本影食分')}: <b>${lunarShadow.umbralMagnitude.toFixed(3)}</b></span>
          <span>${termTipHtml('半影食分')}: <b>${lunarShadow.penumbralMagnitude.toFixed(3)}</b></span>
          <span>地影轴心距: <b>${Math.round(lunarShadow.axisDistanceKm)} km</b></span>
        </div>
      `;
    } else {
      eclEl.innerHTML = `
        <div class="hud-title">🔭 日月食交食状态</div>
        <div class="hud-metrics">
          <span class="status-pill normal">当前无交食</span>
          <span>日月角距: <b>${sky.solarObscuration.angularSeparationDeg.toFixed(1)}°</b></span>
          <button type="button" class="btn-chip accent hud-jump-btn">跳转下次日食 →</button>
        </div>
      `;
    }
  }
}
