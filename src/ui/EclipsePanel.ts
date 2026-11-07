import * as Astronomy from 'astronomy-engine';
import { AppState, DEFAULT_MOON_SITES, escapeHtml } from '../state/AppState';
import {
  CURATED_ECLIPSE_CATALOG,
  filterCuratedCatalog,
  getCuratedCatalogStats,
} from '../astro/eclipses/catalog';
import {
  EclipseCategory,
  EclipseEventItem,
  describeRegionZh,
  searchEclipsesInYear,
  searchUpcomingLocalSolarEclipses,
} from '../astro/eclipses/search';
import { makeAstroTime } from '../astro/ephemeris';
import { computeEclipseReplayMetrics, syncEclipseReplayState } from '../time/Clock';
import { formatDateTime, formatTimeShort, inferTimezone, utcToLocalParts } from '../time/tz';
import { MasterRenderer } from '../render/Renderer';
import { showToast } from './Toast';
import { termTipHtml } from './tooltips';

interface EclipseContactPoint {
  code: string;
  labelZh: string;
  utcMs: number;
  isKey?: boolean;
}

interface EclipseContactSite {
  name: string;
  lat: number;
  lon: number;
  isFallbackSite: boolean;
}

export class EclipsePanel {
  public readonly el: HTMLElement;
  public readonly floatingCardEl: HTMLElement;
  private activeTab: 'curated' | 'byYear' | 'local' = 'curated';
  private selectedEvent: EclipseEventItem | null = null;
  private isFloatingCardOpen = false;
  private currentContacts: EclipseContactPoint[] = [];
  private currentContactSite: EclipseContactSite | null = null;
  private onEventSelectedCallback: (() => void) | null = null;

  public onEventSelected(cb: () => void): void {
    this.onEventSelectedCallback = cb;
  }

  constructor(
    private state: AppState,
    private renderer: MasterRenderer
  ) {
    this.el = document.createElement('section');
    this.el.className = 'side-panel glass-panel eclipse-panel';

    this.floatingCardEl = document.createElement('div');
    this.floatingCardEl.className = 'ms-eclipse-floating-card glass-panel';
    this.floatingCardEl.style.display = 'none';

    this.render();
    this.state.subscribe((s, changed) => {
      if (changed.has('uiMode')) {
        this.renderCuratedList();
      }
      let cardRenderedForSelection = false;
      let lockSyncedForSelection = false;
      if (changed.has('selectedEclipseId')) {
        if (!s.selectedEclipseId) {
          this.selectedEvent = null;
          this.currentContacts = [];
          this.currentContactSite = null;
          this.isFloatingCardOpen = false;
          this.floatingCardEl.style.display = 'none';
        } else if (this.selectedEvent?.id !== s.selectedEclipseId) {
          const resolved = this.resolveEventById(s.selectedEclipseId);
          if (resolved) {
            this.selectedEvent = resolved;
            this.isFloatingCardOpen = true;
            this.renderFloatingCard(resolved);
            cardRenderedForSelection = true;
            if (s.viewMode === 'ground') {
              this.renderer.groundView.setLockTarget(resolved.kind === 'solar' ? 'sun' : 'moon');
              lockSyncedForSelection = true;
            } else if (s.viewMode === 'moon') {
              this.renderer.moonSurfaceView.setLockTarget('earth');
              lockSyncedForSelection = true;
            }
          }
        }
        this.syncSelectedHighlightInLists();
      }
      if (!lockSyncedForSelection) {
        if (changed.has('groundLockTarget') && s.viewMode === 'ground') {
          this.renderer.groundView.setLockTarget(s.groundLockTarget);
        }
        if (changed.has('moonLockTarget') && s.viewMode === 'moon') {
          this.renderer.moonSurfaceView.setLockTarget(s.moonLockTarget);
        }
      }
      if (
        !cardRenderedForSelection &&
        changed.has('earthObserver') &&
        this.selectedEvent &&
        this.isFloatingCardOpen
      ) {
        this.renderFloatingCard(this.selectedEvent);
      }
      if (
        changed.has('eclipseReplay') ||
        (changed.has('uiHidden') && !s.uiHidden) ||
        (s.eclipseReplay && (changed.has('speedMultiplier') || changed.has('playing')))
      ) {
        this.refreshReplayProgress();
      }
    });
  }

  private resolveEventById(id: string | null): EclipseEventItem | null {
    if (!id) return null;
    let item = CURATED_ECLIPSE_CATALOG.find((x) => x.id === id);
    if (!item) {
      const m = id.match(/^(?:solar|lunar)-(-?\d{1,4})-\d{2}-\d{2}$/);
      if (m) {
        const y = parseInt(m[1], 10);
        if (y >= -1999 && y <= 3000) {
          item = searchEclipsesInYear(y).find((x) => x.id === id);
        }
      }
    }
    return item ?? null;
  }

  private syncSelectedHighlightInLists(): void {
    const activeId = this.selectedEvent?.id ?? null;
    this.el.querySelectorAll<HTMLElement>('.eclipse-item[data-id]').forEach((row) => {
      row.classList.toggle('selected', row.dataset.id === activeId);
    });
  }

  private render(): void {
    const stats = getCuratedCatalogStats();
    const ancientSolarTotal = stats.solarTotalAll - stats.solarTotalModern;
    const ancientSolarAnnular = stats.solarAnnularAll - stats.solarAnnularModern;

    this.el.innerHTML = `
      <div class="panel-header">
        <h2>🌑 日月食天象百科 (${stats.total}场精选)</h2>
        <span class="sub-badge">${termTipHtml('沙罗序列', '沙罗周期')}</span>
      </div>

      <div class="panel-body">
        <div class="tab-bar pro-only">
          <button type="button" class="tab-btn active" data-tab="curated">🏆 精选${stats.total}场 (中国优先)</button>
          <button type="button" class="tab-btn" data-tab="byYear">📅 按年份搜索</button>
          <button type="button" class="tab-btn" data-tab="local">📍 当前地可见</button>
        </div>

        <!-- Tab 1: Curated 200 Catalog -->
        <div id="tab-curated" class="tab-content">
          <div class="filter-bar pro-only">
            <select id="ecl-cat-filter" class="input-control" aria-label="筛选日月食类型">
              <option value="all">全部类型 (共${stats.total}场：近现代日全食${stats.solarTotalModern}+日环食${stats.solarAnnularModern}+月全食${stats.lunarTotalAll}+古籍${stats.ancientCount})</option>
              <option value="solar-total">🌑 日全食 (${stats.solarTotalAll}场，含古籍${ancientSolarTotal}场)</option>
              <option value="solar-annular">💍 日环食 (${stats.solarAnnularAll}场，含古籍${ancientSolarAnnular}场)</option>
              <option value="lunar-total">🌕 月全食 (${stats.lunarTotalAll}场 · 红月亮)</option>
              <option value="solar-partial">📜 古代史料与特殊日食 (${stats.ancientCount}场)</option>
            </select>
            <select id="ecl-sort" class="input-control" aria-label="排序方式">
              <option value="score">🔥 最佳效果 + 中国可见优先</option>
              <option value="timeDesc">⏳ 时间由近及远 (未来→历史)</option>
              <option value="timeAsc">📜 时间由古至今 (历史→未来)</option>
            </select>
          </div>
          <div class="filter-bar">
            <input type="text" id="ecl-query" class="input-control" placeholder="搜索年份/地区/关键词 (如: 2009, 2035, 北京, 漠河, 爱丁顿, 春秋)..." />
            <label class="checkbox-pill pro-only">
              <input type="checkbox" id="ecl-china-only" /> 🇨🇳 仅中国可见
            </label>
          </div>
          <div class="eclipse-list" id="curated-list"></div>
        </div>

        <!-- Tab 2: Search by arbitrary year -->
        <div id="tab-byYear" class="tab-content" style="display:none;">
          <div class="filter-bar">
            <input type="number" id="ecl-search-year" class="input-control" value="2026" min="-1999" max="3000" placeholder="输入年份 (-1999~3000)" />
            <button type="button" class="btn-primary" id="btn-search-year">搜索当年日月食</button>
          </div>
          <div class="eclipse-list" id="year-list"></div>
        </div>

        <!-- Tab 3: Local upcoming solar eclipses -->
        <div id="tab-local" class="tab-content" style="display:none;">
          <div class="filter-bar">
            <span class="sub-note" id="local-obs-label">搜索当前地球观测点未来可见的日食：</span>
            <button type="button" class="btn-primary" id="btn-search-local">刷新计算</button>
          </div>
          <div class="eclipse-list" id="local-list"></div>
        </div>
      </div>
    `;

    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab as 'curated' | 'byYear' | 'local';
        this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        (this.el.querySelector('#tab-curated') as HTMLElement).style.display =
          this.activeTab === 'curated' ? 'block' : 'none';
        (this.el.querySelector('#tab-byYear') as HTMLElement).style.display =
          this.activeTab === 'byYear' ? 'block' : 'none';
        (this.el.querySelector('#tab-local') as HTMLElement).style.display =
          this.activeTab === 'local' ? 'block' : 'none';

        if (this.activeTab === 'byYear') this.renderYearSearchList();
        if (this.activeTab === 'local') this.renderLocalSearchList();
      });
    });

    ['#ecl-cat-filter', '#ecl-sort', '#ecl-china-only'].forEach((sel) => {
      this.el.querySelector(sel)?.addEventListener('change', () => this.renderCuratedList());
    });
    this.el.querySelector('#ecl-query')?.addEventListener('input', () => this.renderCuratedList());

    this.el.querySelector('#btn-search-year')?.addEventListener('click', () =>
      this.renderYearSearchList()
    );
    this.el.querySelector('#ecl-search-year')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.renderYearSearchList();
    });

    this.el.querySelector('#btn-search-local')?.addEventListener('click', () =>
      this.renderLocalSearchList()
    );

    this.renderCuratedList();
  }

  private renderCuratedList(): void {
    const isSimple = this.state.get().uiMode === 'simple';
    const cat = (this.el.querySelector('#ecl-cat-filter') as HTMLSelectElement).value as
      | 'all'
      | EclipseCategory;
    const sortBy = (this.el.querySelector('#ecl-sort') as HTMLSelectElement).value as
      | 'score'
      | 'timeDesc'
      | 'timeAsc';
    const chinaOnly = (this.el.querySelector('#ecl-china-only') as HTMLInputElement).checked;
    const query = (this.el.querySelector('#ecl-query') as HTMLInputElement).value;

    let list: EclipseEventItem[];
    if (cat === 'solar-partial') {
      // Ancient / historical filter
      list = CURATED_ECLIPSE_CATALOG.filter((x) => x.year < 1900 || x.category === 'solar-partial');
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        list = list.filter(
          (x) => x.titleZh.toLowerCase().includes(q) || x.introZh.toLowerCase().includes(q)
        );
      }
    } else {
      list = filterCuratedCatalog({ sortBy, category: cat, chinaOnly, query });
    }

    if (isSimple && !query.trim()) {
      list = list.slice(0, 30);
    }

    const container = this.el.querySelector('#curated-list')!;
    this.populateEventList(container, list);
  }

  private renderYearSearchList(): void {
    const yearInput = this.el.querySelector('#ecl-search-year') as HTMLInputElement;
    const container = this.el.querySelector('#year-list')!;
    const raw = String(yearInput.value ?? '').trim();
    const year = raw === '' ? NaN : Number(raw);
    if (!Number.isInteger(year) || year < -1999 || year > 3000) {
      container.innerHTML = `<div class="empty-msg">请输入 -1999 至 3000 之间的整数天文年份（公元前1年为 0）</div>`;
      showToast({
        message: '⚠️ 请输入 -1999 至 3000 之间的整数年份（天文年 0 代表公元前1年）',
        type: 'warn',
      });
      return;
    }
    try {
      const items = searchEclipsesInYear(year);
      this.populateEventList(container, items);
    } catch (err) {
      console.error('[moonsun] 年份日月食搜索异常:', err);
      container.innerHTML = `<div class="inline-error-msg" role="alert">⚠️ 搜索 ${year} 年日月食时发生计算异常，请稍后重试或切换其他年份</div>`;
      showToast({
        message: `⚠️ 搜索 ${year} 年日月食时发生计算异常`,
        type: 'warn',
      });
    }
  }

  private renderLocalSearchList(): void {
    const s = this.state.get();
    const label = this.el.querySelector('#local-obs-label')!;
    label.textContent = `${s.earthObserver.name} (${s.earthObserver.lat.toFixed(1)}°, ${s.earthObserver.lon.toFixed(1)}°) 自当前时间起未来可见日食：`;

    const locals = searchUpcomingLocalSolarEclipses(
      s.timeUtc,
      s.earthObserver.lat,
      s.earthObserver.lon,
      6
    );
    const container = this.el.querySelector('#local-list')!;
    if (locals.length === 0) {
      container.innerHTML = `<div class="empty-msg">未搜到近期本地可见日食</div>`;
      return;
    }

    container.innerHTML = locals
      .map((loc, idx) => {
        const bjStr = formatDateTime(loc.peakUtc, 'Asia/Shanghai', true);
        const beginStr = formatDateTime(loc.partialBeginUtc, 'Asia/Shanghai', false);
        const endStr = formatDateTime(loc.partialEndUtc, 'Asia/Shanghai', false);
        const horizonNote =
          loc.peakAltitudeDeg <= 0
            ? (loc.partialBeginAltitudeDeg ?? 0) > 0
              ? ' (带食日落)'
              : ' (带食日出)'
            : '';
        return `
          <div class="eclipse-item" data-local-idx="${idx}">
            <div class="ecl-item-top">
              <span class="ecl-badge solar-${escapeHtml(loc.kind)}">${escapeHtml(loc.typeLabelZh)}</span>
              <span class="ecl-title">本地最大食分 ${(loc.obscuration * 100).toFixed(1)}% · 太阳高度 ${loc.peakAltitudeDeg.toFixed(1)}°${horizonNote}</span>
            </div>
            <div class="ecl-meta">
              食甚(北京): ${escapeHtml(bjStr)} | 初亏: ${escapeHtml(beginStr.slice(11, 16))} ~ 复圆: ${escapeHtml(endStr.slice(11, 16))}
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll<HTMLElement>('[data-local-idx]').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.localIdx!, 10);
        const loc = locals[idx];
        if (!loc) return;
        this.state.pushUndoSnapshot('跳转本地日食');
        this.state.update({
          timeUtc: loc.peakUtc,
          playing: false,
          isRealtimeSync: false,
          viewMode: 'ground',
          activeEclipsePeakUtc: loc.peakUtc,
          activeEclipseKind: 'solar',
          selectedEclipseId: null,
          groundLockTarget: 'sun',
          eclipseReplay: null,
        });
        this.renderer.groundView.setLockTarget('sun');
        this.onEventSelectedCallback?.();
        showToast({
          message: `已跳转到本地${loc.typeLabelZh}食甚时刻`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
      });
    });
  }

  private populateEventList(container: Element, items: EclipseEventItem[]): void {
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-msg">没有匹配的日月食记录</div>`;
      return;
    }

    container.innerHTML = items
      .map((item) => {
        const chinaBadge =
          item.chinaVisibility === 'central'
            ? `<span class="china-tag central">🇨🇳 ${escapeHtml(item.chinaVisibilityLabelZh)}</span>`
            : item.chinaVisibility === 'partial'
              ? `<span class="china-tag partial">🇨🇳 ${escapeHtml(item.chinaVisibilityLabelZh)}</span>`
              : '';
        return `
          <div class="eclipse-item ${this.selectedEvent?.id === item.id ? 'selected' : ''}" data-id="${escapeHtml(item.id)}">
            <div class="ecl-item-top">
              <span class="ecl-badge ${escapeHtml(item.category)}">${escapeHtml(item.typeLabelZh)}</span>
              <span class="ecl-title">${escapeHtml(item.titleZh)}</span>
              <span class="ecl-score">★ ${item.score.toFixed(1)}</span>
            </div>
            <div class="ecl-meta">
              <span>🕒 ${escapeHtml(item.dateStrBeijing)}</span>
              <span>⏱ ${escapeHtml(item.durationLabelZh)}</span>
              ${chinaBadge}
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll<HTMLElement>('.eclipse-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id!;
        const found = items.find((x) => x.id === id);
        if (found) {
          this.selectEclipseEvent(found, 'ground');
          container.querySelectorAll('.eclipse-item').forEach((r) =>
            r.classList.toggle('selected', r === el)
          );
        }
      });
    });
  }

  private computeContacts(item: EclipseEventItem): {
    contacts: EclipseContactPoint[];
    siteLabel: string;
    timezone: string;
    contactSite: EclipseContactSite | null;
  } {
    const s = this.state.get();
    const contacts: EclipseContactPoint[] = [];

    if (item.kind === 'solar') {
      // Try current observer first; if no local eclipse, fall back to item's featured site
      const fallbackName =
        item.featuredSiteName ?? `${describeRegionZh(item.peakLat, item.peakLon)}极盛点`;
      const tryCoords = [
        {
          lat: s.earthObserver.lat,
          lon: s.earthObserver.lon,
          name: s.earthObserver.name,
          timezone: s.earthObserver.timezone,
          isFallbackSite: false,
        },
        {
          lat: item.peakLat,
          lon: item.peakLon,
          name: fallbackName,
          timezone: inferTimezone(item.peakLat, item.peakLon),
          isFallbackSite: true,
        },
      ];
      for (const c of tryCoords) {
        try {
          const loc = Astronomy.SearchLocalSolarEclipse(
            makeAstroTime(item.peakUtcMs - 36 * 3600 * 1000),
            new Astronomy.Observer(c.lat, c.lon, 0)
          );
          if (
            loc &&
            Math.abs(loc.peak.time.date.getTime() - item.peakUtcMs) < 24 * 3600 * 1000 &&
            (loc.peak.altitude > -1 ||
              Math.max(
                loc.partial_begin.altitude,
                loc.peak.altitude,
                loc.partial_end.altitude
              ) > 0)
          ) {
            contacts.push({
              code: 'U1',
              labelZh: '初亏',
              utcMs: loc.partial_begin.time.date.getTime(),
            });
            if (loc.total_begin) {
              contacts.push({
                code: 'U2',
                labelZh: loc.kind === Astronomy.EclipseKind.Annular ? '环食始' : '食既',
                utcMs: loc.total_begin.time.date.getTime(),
                isKey: true,
              });
            }
            contacts.push({
              code: 'Max',
              labelZh: '食甚',
              utcMs: loc.peak.time.date.getTime(),
              isKey: true,
            });
            if (loc.total_end) {
              contacts.push({
                code: 'U3',
                labelZh: loc.kind === Astronomy.EclipseKind.Annular ? '环食终' : '生光',
                utcMs: loc.total_end.time.date.getTime(),
                isKey: true,
              });
            }
            contacts.push({
              code: 'U4',
              labelZh: '复圆',
              utcMs: loc.partial_end.time.date.getTime(),
            });
            return {
              contacts,
              siteLabel: c.name,
              timezone: c.timezone,
              contactSite: {
                name: c.name,
                lat: c.lat,
                lon: c.lon,
                isFallbackSite: c.isFallbackSite,
              },
            };
          }
        } catch {
          // continue
        }
      }
      // Fallback synthetic window
      contacts.push(
        { code: 'U1', labelZh: '初亏', utcMs: item.peakUtcMs - 70 * 60 * 1000 },
        { code: 'Max', labelZh: '食甚', utcMs: item.peakUtcMs, isKey: true },
        { code: 'U4', labelZh: '复圆', utcMs: item.peakUtcMs + 70 * 60 * 1000 }
      );
      return {
        contacts,
        siteLabel: '全球极盛点',
        timezone: inferTimezone(item.peakLat, item.peakLon),
        contactSite: {
          name: fallbackName,
          lat: item.peakLat,
          lon: item.peakLon,
          isFallbackSite: true,
        },
      };
    } else {
      // Lunar eclipse global contacts
      try {
        const le = Astronomy.SearchLunarEclipse(
          makeAstroTime(item.peakUtcMs - 36 * 3600 * 1000)
        );
        if (le && Math.abs(le.peak.date.getTime() - item.peakUtcMs) < 24 * 3600 * 1000) {
          const p = le.peak.date.getTime();
          if (le.sd_penum > 0) {
            contacts.push({
              code: 'P1',
              labelZh: '半影食始',
              utcMs: p - le.sd_penum * 60 * 1000,
            });
          }
          if (le.sd_partial > 0) {
            contacts.push({
              code: 'U1',
              labelZh: '初亏',
              utcMs: p - le.sd_partial * 60 * 1000,
            });
          }
          if (le.sd_total > 0) {
            contacts.push({
              code: 'U2',
              labelZh: '食既',
              utcMs: p - le.sd_total * 60 * 1000,
              isKey: true,
            });
          }
          contacts.push({
            code: 'Max',
            labelZh: '食甚',
            utcMs: p,
            isKey: true,
          });
          if (le.sd_total > 0) {
            contacts.push({
              code: 'U3',
              labelZh: '生光',
              utcMs: p + le.sd_total * 60 * 1000,
              isKey: true,
            });
          }
          if (le.sd_partial > 0) {
            contacts.push({
              code: 'U4',
              labelZh: '复圆',
              utcMs: p + le.sd_partial * 60 * 1000,
            });
          }
          if (le.sd_penum > 0) {
            contacts.push({
              code: 'P4',
              labelZh: '半影食终',
              utcMs: p + le.sd_penum * 60 * 1000,
            });
          }
          return {
            contacts,
            siteLabel: '全球统一接触时刻',
            timezone: s.earthObserver.timezone,
            contactSite: null,
          };
        }
      } catch {
        // ignore
      }
      contacts.push(
        { code: 'U1', labelZh: '初亏', utcMs: item.peakUtcMs - 95 * 60 * 1000 },
        { code: 'Max', labelZh: '食甚', utcMs: item.peakUtcMs, isKey: true },
        { code: 'U4', labelZh: '复圆', utcMs: item.peakUtcMs + 95 * 60 * 1000 }
      );
      return {
        contacts,
        siteLabel: '全球接触时刻',
        timezone: s.earthObserver.timezone,
        contactSite: null,
      };
    }
  }

  public selectEclipseEvent(
    item: EclipseEventItem,
    targetView: 'ground' | 'space' | 'moon' = 'ground'
  ): void {
    this.state.pushUndoSnapshot('选择天象');
    this.selectedEvent = item;
    this.isFloatingCardOpen = true;

    let effectivePeakUtc = item.peakUtcMs;
    if (item.kind === 'solar') {
      try {
        const obs = new Astronomy.Observer(item.peakLat, item.peakLon, 0);
        const tStart = makeAstroTime(item.peakUtcMs - 36 * 3600 * 1000);
        const loc = Astronomy.SearchLocalSolarEclipse(tStart, obs);
        if (
          loc &&
          Math.abs(loc.peak.time.date.getTime() - item.peakUtcMs) < 24 * 3600 * 1000 &&
          loc.peak.altitude > 0
        ) {
          effectivePeakUtc = loc.peak.time.date.getTime();
        }
      } catch {
        // fallback to global peakUtcMs
      }
    }

    const siteName =
      item.featuredSiteName ?? `${describeRegionZh(item.peakLat, item.peakLon)}观测点`;
    this.state.setEarthLocation({
      name: siteName,
      lat: item.peakLat,
      lon: item.peakLon,
    });

    this.state.update({
      timeUtc: effectivePeakUtc,
      playing: false,
      isRealtimeSync: false,
      viewMode: targetView,
      activeEclipsePeakUtc: item.peakUtcMs,
      activeEclipseKind: item.kind,
      selectedEclipseId: item.id,
      eclipseReplay: null,
      spaceCameraPreset: item.kind === 'solar' ? 'sunMoonLine' : 'moon',
      groundLockTarget:
        targetView === 'ground'
          ? item.kind === 'solar'
            ? 'sun'
            : 'moon'
          : this.state.get().groundLockTarget,
      moonLockTarget:
        targetView === 'moon' ? 'earth' : this.state.get().moonLockTarget,
    });

    if (targetView === 'ground') {
      this.renderer.groundView.setLockTarget(item.kind === 'solar' ? 'sun' : 'moon');
    } else if (targetView === 'moon') {
      const curMoon = this.state.get().moonObserver;
      // If observer was on the lunar far side or extreme pole where Earth is below/near horizon, switch to near side
      if (Math.abs(curMoon.lon) > 80 || Math.abs(curMoon.lat) > 80) {
        this.state.setMoonLocation(DEFAULT_MOON_SITES[0]);
      }
      this.renderer.moonSurfaceView.setLockTarget('earth');
    }

    this.renderFloatingCard(item);
    this.onEventSelectedCallback?.();
    showToast({
      message: `已跳转至：${item.titleZh}`,
      actionLabel: '↩ 返回上一状态',
      onAction: () => {
        this.state.undoLastJump();
      },
    });
  }

  /**
   * Restore eclipse context and floating card from a shared URL without overwriting
   * explicit URL parameters (time, observer location, or view mode).
   */
  public restoreEclipseFromUrl(
    item: EclipseEventItem,
    opts: {
      hasTime: boolean;
      hasLocation: boolean;
      hasMoonLocation?: boolean;
      hasView: boolean;
    }
  ): void {
    this.selectedEvent = item;
    this.isFloatingCardOpen = true;

    let effectivePeakUtc = item.peakUtcMs;
    if (!opts.hasTime && item.kind === 'solar') {
      try {
        const obs = new Astronomy.Observer(item.peakLat, item.peakLon, 0);
        const tStart = makeAstroTime(item.peakUtcMs - 36 * 3600 * 1000);
        const loc = Astronomy.SearchLocalSolarEclipse(tStart, obs);
        if (
          loc &&
          Math.abs(loc.peak.time.date.getTime() - item.peakUtcMs) < 24 * 3600 * 1000 &&
          loc.peak.altitude > 0
        ) {
          effectivePeakUtc = loc.peak.time.date.getTime();
        }
      } catch {
        // fallback to global peakUtcMs
      }
    }

    if (!opts.hasLocation) {
      const siteName =
        item.featuredSiteName ?? `${describeRegionZh(item.peakLat, item.peakLon)}观测点`;
      this.state.setEarthLocation({
        name: siteName,
        lat: item.peakLat,
        lon: item.peakLon,
      });
    }

    const s = this.state.get();
    const targetView = opts.hasView ? s.viewMode : 'ground';

    this.state.update({
      timeUtc: opts.hasTime ? s.timeUtc : effectivePeakUtc,
      playing: false,
      isRealtimeSync: false,
      viewMode: targetView,
      activeEclipsePeakUtc: item.peakUtcMs,
      activeEclipseKind: item.kind,
      selectedEclipseId: item.id,
      eclipseReplay: null,
      spaceCameraPreset: item.kind === 'solar' ? 'sunMoonLine' : 'moon',
      groundLockTarget:
        targetView === 'ground'
          ? item.kind === 'solar'
            ? 'sun'
            : 'moon'
          : s.groundLockTarget,
      moonLockTarget: targetView === 'moon' ? 'earth' : s.moonLockTarget,
    });

    if (targetView === 'ground') {
      this.renderer.groundView.setLockTarget(item.kind === 'solar' ? 'sun' : 'moon');
    } else if (targetView === 'moon') {
      if (!opts.hasMoonLocation) {
        const curMoon = this.state.get().moonObserver;
        if (Math.abs(curMoon.lon) > 80 || Math.abs(curMoon.lat) > 80) {
          this.state.setMoonLocation(DEFAULT_MOON_SITES[0]);
        }
      }
      this.renderer.moonSurfaceView.setLockTarget('earth');
    }

    this.renderFloatingCard(item);
  }

  public closeFloatingCard(): void {
    this.isFloatingCardOpen = false;
    this.floatingCardEl.style.display = 'none';
    this.state.update({ eclipseReplay: null });
  }

  private renderFloatingCard(item: EclipseEventItem): void {
    this.floatingCardEl.style.display = 'block';
    const latStr =
      item.peakLat >= 0 ? `${item.peakLat.toFixed(2)}°N` : `${(-item.peakLat).toFixed(2)}°S`;
    const lonStr =
      item.peakLon >= 0 ? `${item.peakLon.toFixed(2)}°E` : `${(-item.peakLon).toFixed(2)}°W`;

    const { contacts, siteLabel, timezone: contactTz, contactSite } = this.computeContacts(item);
    this.currentContacts = contacts;
    this.currentContactSite = contactSite;
    const tzLabel = utcToLocalParts(item.peakUtcMs, contactTz).offsetLabel;

    const contactsHtml = contacts
      .map((c, idx) => {
        const tStr = formatTimeShort(c.utcMs, contactTz);
        return `
          <button type="button" class="ms-contact-pill ${c.isKey ? 'is-key' : ''}" data-cidx="${idx}" title="点击跳转到 ${escapeHtml(c.labelZh)} (${escapeHtml(tStr)})">
            <span class="c-name">${escapeHtml(c.labelZh)} (${escapeHtml(c.code)})</span>
            <span class="c-time">${escapeHtml(tStr)}</span>
          </button>
        `;
      })
      .join('');

    this.floatingCardEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-title-wrap">
          <span class="ecl-badge ${escapeHtml(item.category)}">${escapeHtml(item.typeLabelZh)}</span>
          <strong>${escapeHtml(item.titleZh)}</strong>
        </div>
        <button type="button" class="ms-card-close" id="close-float-card" aria-label="关闭天象详情卡片" title="关闭详情卡片">×</button>
      </div>
      <p class="detail-intro">${escapeHtml(item.introZh)}</p>
      <div class="detail-stats">
        <span>食甚(北京): <b>${escapeHtml(item.dateStrBeijing)}</b></span>
        <span>${item.featuredSiteName ? '代表观测点' : '极盛点'}: <b>${item.featuredSiteName ? escapeHtml(item.featuredSiteName) + ' ' : ''}(${latStr}, ${lonStr})</b></span>
        <span>时长/食分: <b>${escapeHtml(item.durationLabelZh)} (${(item.obscuration * 100).toFixed(1)}%)</b></span>
      </div>

      <div class="ms-contacts-section">
        <div class="ms-contacts-head">
          <span>⏱ 接触时刻（${escapeHtml(siteLabel)} · 当地时间 ${escapeHtml(tzLabel)}，点击直接跳转）：</span>
          <span id="replay-phase-badge" class="replay-phase-badge"></span>
        </div>
        <div class="ms-contacts-bar">${contactsHtml}</div>
        <div class="ms-replay-progress-wrap" id="replay-progress-wrap" style="display:none;">
          <input type="range" id="replay-scrubber" min="0" max="1000" value="500" aria-label="交食回放进度条" />
        </div>
      </div>

      <div class="detail-actions">
        <button type="button" class="btn-chip accent" id="act-ground-ecl">
          🌍 地面看${item.kind === 'solar' ? '日食黑太阳' : '红月亮'}
        </button>
        <button type="button" class="btn-chip" id="act-space-ecl">
          🛰 太空看${item.kind === 'solar' ? '月影扫地球' : '月球入地影'}
        </button>
        <button type="button" class="btn-chip" id="act-moon-ecl">
          🌕 月面看${item.kind === 'lunar' ? '地球遮日红环' : '地相与日影'}
        </button>
        <button type="button" class="btn-chip accent" id="act-replay-ecl">
          ▶ 60秒全过程智能回放
        </button>
      </div>
    `;

    this.floatingCardEl.querySelector('#close-float-card')?.addEventListener('click', () => {
      this.closeFloatingCard();
    });

    this.floatingCardEl.querySelectorAll<HTMLButtonElement>('[data-cidx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.cidx!, 10);
        const pt = this.currentContacts[idx];
        if (pt) {
          if (this.currentContactSite?.isFallbackSite) {
            this.state.setEarthLocation({
              name: this.currentContactSite.name,
              lat: this.currentContactSite.lat,
              lon: this.currentContactSite.lon,
            });
            if (this.state.get().viewMode === 'ground') {
              this.renderer.groundView.setLockTarget(item.kind === 'solar' ? 'sun' : 'moon');
            }
          }
          this.state.update({ playing: false, eclipseReplay: null });
          this.state.setTimeUtc(pt.utcMs, true);
        }
      });
    });

    this.floatingCardEl.querySelector('#act-ground-ecl')?.addEventListener('click', () => {
      this.selectEclipseEvent(item, 'ground');
    });

    this.floatingCardEl.querySelector('#act-space-ecl')?.addEventListener('click', () => {
      this.selectEclipseEvent(item, 'space');
    });

    this.floatingCardEl.querySelector('#act-moon-ecl')?.addEventListener('click', () => {
      this.selectEclipseEvent(item, 'moon');
    });

    this.floatingCardEl.querySelector('#act-replay-ecl')?.addEventListener('click', () => {
      const u1 =
        this.currentContacts.find((c) => c.code === 'U1')?.utcMs ??
        this.currentContacts[0]?.utcMs ??
        item.peakUtcMs - 60 * 60 * 1000;
      const u4 =
        this.currentContacts.find((c) => c.code === 'U4')?.utcMs ??
        this.currentContacts[this.currentContacts.length - 1]?.utcMs ??
        item.peakUtcMs + 60 * 60 * 1000;
      const u2 = this.currentContacts.find((c) => c.code === 'U2')?.utcMs ?? null;
      const u3 = this.currentContacts.find((c) => c.code === 'U3')?.utcMs ?? null;
      const peak =
        this.currentContacts.find((c) => c.code === 'Max')?.utcMs ?? item.peakUtcMs;

      if (this.currentContactSite?.isFallbackSite) {
        this.state.setEarthLocation({
          name: this.currentContactSite.name,
          lat: this.currentContactSite.lat,
          lon: this.currentContactSite.lon,
        });
        if (this.state.get().viewMode === 'ground') {
          this.renderer.groundView.setLockTarget(item.kind === 'solar' ? 'sun' : 'moon');
        }
      }

      const totalSpanSec = Math.max(600, (u4 - u1) / 1000);
      const baseSpeed = Math.round(totalSpanSec / 55);

      this.state.update({
        timeUtc: u1,
        speedMultiplier: baseSpeed,
        playing: true,
        isRealtimeSync: false,
        eclipseReplay: {
          active: true,
          startUtcMs: u1,
          peakUtcMs: peak,
          endUtcMs: u4,
          u2UtcMs: u2,
          u3UtcMs: u3,
        },
      });
      syncEclipseReplayState(this.state);

      const progWrap = this.floatingCardEl.querySelector<HTMLElement>('#replay-progress-wrap');
      if (progWrap) progWrap.style.display = 'block';
    });

    const scrubber = this.floatingCardEl.querySelector<HTMLInputElement>('#replay-scrubber');
    scrubber?.addEventListener('input', () => {
      const rep = this.state.get().eclipseReplay;
      if (!rep) return;
      const frac = parseFloat(scrubber.value) / 1000;
      const targetUtc = rep.startUtcMs + (rep.endUtcMs - rep.startUtcMs) * frac;
      this.state.setTimeUtc(targetUtc, true, true);
      this.refreshReplayProgress();
    });

    if (this.state.get().eclipseReplay) {
      this.refreshReplayProgress();
    }
  }

  /**
   * Pure DOM refresh for the replay progress bar and phase badge (B5 / F1).
   * Replay progression, variable-speed transitions, and auto-stop are handled by
   * SimulationClock / syncEclipseReplayState so hiding UI never blocks replay control.
   */
  public refreshReplayProgress(): void {
    if (!this.isFloatingCardOpen) return;
    const s = this.state.get();
    const rep = s.eclipseReplay;
    const progWrap = this.floatingCardEl.querySelector<HTMLElement>('#replay-progress-wrap');
    const scrubber = this.floatingCardEl.querySelector<HTMLInputElement>('#replay-scrubber');
    const badge = this.floatingCardEl.querySelector<HTMLElement>('#replay-phase-badge');

    if (!rep) {
      if (progWrap) progWrap.style.display = 'none';
      if (badge) badge.textContent = '';
      return;
    }

    if (progWrap) progWrap.style.display = 'block';

    const metrics = computeEclipseReplayMetrics(s.timeUtc, rep);
    if (scrubber) {
      scrubber.value = String(Math.round(metrics.frac * 1000));
    }
    if (badge) {
      badge.textContent = metrics.badgeText;
    }
  }
}
