import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AppState,
  buildShareSearchParams,
  escapeHtml,
  parseUrlInitialState,
  shouldExposeDebugHandle,
} from '../src/state/AppState';
import { CURATED_ECLIPSE_CATALOG } from '../src/astro/eclipses/catalog';
import * as eclipseSearch from '../src/astro/eclipses/search';
import { computeEphemeris } from '../src/astro/ephemeris';
import { computeMoonPhase } from '../src/astro/phase';
import { computeEarthObserverSky, computeMoonSurfaceSky } from '../src/astro/observer';
import { EclipsePanel } from '../src/ui/EclipsePanel';
import { InfoHUD } from '../src/ui/InfoHUD';
import { LocationPanel } from '../src/ui/LocationPanel';
import { SpaceView } from '../src/render/views/SpaceView';
import { FrameRunner, SimulationClock } from '../src/time/Clock';

describe('Security & URL State Serialization Regressions (B3 / MS-03 / MS-04 / MS-11)', () => {
  it('escapeHtml escapes all 5 HTML special characters and neutralizes XSS payloads', () => {
    const raw = `<img src=x onerror="window.__xss=1">'&<>`;
    const escaped = escapeHtml(raw);
    expect(escaped).toBe(
      '&lt;img src=x onerror=&quot;window.__xss=1&quot;&gt;&#39;&amp;&lt;&gt;'
    );
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });

  it('shouldExposeDebugHandle strictly requires explicit truthy debug=1/true or audit=1/true in production (MS-04)', () => {
    // Production mode (isDev = false)
    expect(shouldExposeDebugHandle('', false)).toBe(false);
    expect(shouldExposeDebugHandle('?debug=0', false)).toBe(false);
    expect(shouldExposeDebugHandle('?debug=false', false)).toBe(false);
    expect(shouldExposeDebugHandle('?audit=0', false)).toBe(false);
    expect(shouldExposeDebugHandle('?audit=false', false)).toBe(false);
    expect(shouldExposeDebugHandle('?debug=&audit=', false)).toBe(false);
    expect(shouldExposeDebugHandle('?debug=no&audit=off', false)).toBe(false);
    expect(shouldExposeDebugHandle('?debug=1', false)).toBe(true);
    expect(shouldExposeDebugHandle('?debug=true', false)).toBe(true);
    expect(shouldExposeDebugHandle('?audit=1', false)).toBe(true);
    expect(shouldExposeDebugHandle('?audit=TRUE', false)).toBe(true);

    // Development mode (isDev = true)
    expect(shouldExposeDebugHandle('', true)).toBe(true);
    expect(shouldExposeDebugHandle('?debug=0', true)).toBe(false);
    expect(shouldExposeDebugHandle('?debug=false', true)).toBe(false);
  });

  it('parseUrlInitialState rejects out-of-range lat/lon, invalid dates, and unknown enums', () => {
    const state = new AppState();
    const before = state.get();

    const res = parseUrlInitialState(
      state,
      '?t=not-a-date&lat=91&lon=0&mlat=-95&mlon=200&view=hacker&scale=infinite'
    );
    const after = state.get();

    expect(res.hasTime).toBe(false);
    expect(res.hasLocation).toBe(false);
    expect(res.hasMoonLocation).toBe(false);
    expect(res.hasView).toBe(false);
    expect(after.earthObserver.lat).toBe(before.earthObserver.lat);
    expect(after.moonObserver.lat).toBe(before.moonObserver.lat);
    expect(after.viewMode).toBe(before.viewMode);
    expect(after.scaleMode).toBe(before.scaleMode);
  });

  it('parseUrlInitialState and buildShareSearchParams round-trip valid state including moon observer & eclipse id', () => {
    const state = new AppState();
    const res = parseUrlInitialState(
      state,
      '?t=2009-07-22T01:36:00.000Z&lat=31.23&lon=121.47&name=%E4%B8%8A%E6%B5%B7&mlat=43.10&mlon=-58.10&mname=%E5%AB%A6%E5%A8%A5%E4%BA%94%E5%8F%B7&view=moon&scale=realistic&ecl=solar-2009-07-22'
    );
    expect(res.hasTime).toBe(true);
    expect(res.hasLocation).toBe(true);
    expect(res.hasMoonLocation).toBe(true);
    expect(res.hasView).toBe(true);
    expect(res.initialEclipseId).toBe('solar-2009-07-22');

    const s = state.get();
    expect(new Date(s.timeUtc).toISOString()).toBe('2009-07-22T01:36:00.000Z');
    expect(s.earthObserver.name).toBe('上海');
    expect(s.moonObserver.name).toBe('嫦娥五号');
    expect(s.viewMode).toBe('moon');
    expect(s.scaleMode).toBe('realistic');

    const serialized = buildShareSearchParams(s);
    expect(serialized.get('name')).toBe('上海');
    expect(serialized.get('mname')).toBe('嫦娥五号');
    expect(serialized.get('view')).toBe('moon');
    expect(serialized.get('scale')).toBe('realistic');
  });

  it('static scan: no innerHTML template in src/ui/ or src/render/views/ interpolates unescaped observer names, siteLabel, or featuredSiteName (MS-04 / MS-11)', () => {
    const scanDirs = [
      path.resolve(__dirname, '../src/ui'),
      path.resolve(__dirname, '../src/render/views'),
    ];
    for (const dir of scanDirs) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const blocks = content.match(/innerHTML\s*=\s*`[\s\S]*?`;/g) ?? [];
        for (const block of blocks) {
          expect(block).not.toMatch(
            /\$\{\s*(?:this\.)?s(?:tate\.get\(\))?\.(?:earth|moon)Observer\.name\s*\}/
          );
          expect(block).not.toMatch(/\$\{\s*siteLabel\s*\}/);
          expect(block).not.toMatch(/\$\{\s*item\.featuredSiteName\s*\}/);
        }
      }
    }
  });

  it('syncs EclipsePanel floating card & contacts on undo (Backspace), validates extreme year inputs & error feedback (MS-03), and escapes XSS payloads across UI & views (MS-04 / MS-11)', () => {
    class MockEl {
      public innerHTML = '';
      public textContent = '';
      public className = '';
      public value = '';
      public checked = false;
      public style: Record<string, string> = {};
      public dataset: Record<string, string> = {};
      public children: MockEl[] = [];
      public firstElementChild: MockEl | null = null;
      public parent: MockEl | null = null;
      public classList = {
        add: () => {},
        remove: () => {},
        toggle: () => {},
      };
      private listeners = new Map<string, Array<(e?: unknown) => void>>();
      private childrenMap = new Map<string, MockEl>();
      private cidxButtons: MockEl[] = [];

      constructor(id = '') {
        if (id === '#ecl-cat-filter') this.value = 'all';
        if (id === '#ecl-sort') this.value = 'score';
      }

      setAttribute(): void {}
      appendChild(child: MockEl): MockEl {
        child.parent = this;
        this.children.push(child);
        this.firstElementChild = this.children[0] ?? null;
        return child;
      }
      append(...nodes: Array<MockEl | string>): void {
        for (const n of nodes) {
          if (typeof n === 'string') {
            this.textContent += n;
          } else {
            this.appendChild(n);
            this.textContent += n.textContent;
          }
        }
      }
      contains(node: MockEl): boolean {
        return this.children.includes(node);
      }

      addEventListener(type: string, cb: (e?: unknown) => void): void {
        const list = this.listeners.get(type) ?? [];
        list.push(cb);
        this.listeners.set(type, list);
      }

      trigger(type: string, ev?: unknown): void {
        for (const cb of this.listeners.get(type) ?? []) cb(ev);
      }

      querySelector(sel: string): MockEl {
        if (!this.childrenMap.has(sel)) {
          this.childrenMap.set(sel, new MockEl(sel));
        }
        return this.childrenMap.get(sel)!;
      }

      querySelectorAll(sel: string): MockEl[] {
        if (sel === '[data-cidx]') {
          const matches = [...this.innerHTML.matchAll(/data-cidx="(\d+)"/g)];
          this.cidxButtons = matches.map((m) => {
            const btn = new MockEl();
            btn.dataset.cidx = m[1];
            return btn;
          });
          return this.cidxButtons;
        }
        return [];
      }

      remove(): void {
        if (this.parent) {
          this.parent.children = this.parent.children.filter((c) => c !== this);
          this.parent.firstElementChild = this.parent.children[0] ?? null;
          this.parent = null;
        }
      }
    }

    const prevDoc = (globalThis as Record<string, unknown>).document;
    const prevWin = (globalThis as Record<string, unknown>).window;
    const bodyEl = new MockEl('body');
    (globalThis as Record<string, unknown>).document = {
      createElement: () => new MockEl(),
      body: bodyEl,
    };
    (globalThis as Record<string, unknown>).window = {
      innerWidth: 1280,
      innerHeight: 800,
      setTimeout: () => 1,
      clearTimeout: () => {},
    };

    try {
      const state = new AppState();
      let currentGroundLock: 'free' | 'sun' | 'moon' = 'sun';
      let currentMoonLock: 'earth' | 'sun' | 'free' = 'earth';
      const mockRenderer = {
        groundView: {
          get lockTarget() {
            return currentGroundLock;
          },
          setLockTarget: (t: 'free' | 'sun' | 'moon') => {
            currentGroundLock = t;
            state.update({ groundLockTarget: t });
          },
        },
        moonSurfaceView: {
          get lockTarget() {
            return currentMoonLock;
          },
          setLockTarget: (t: 'earth' | 'sun' | 'free') => {
            currentMoonLock = t;
            state.update({ moonLockTarget: t });
          },
        },
        spaceView: { setHudVisible: () => {} },
      } as unknown as ConstructorParameters<typeof EclipsePanel>[1];

      const panel = new EclipsePanel(state, mockRenderer);
      const e2009 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2009-07-22')!;
      const e2018 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'lunar-2018-07-27')!;

      // 1a. Select 2018 lunar eclipse, then 2009 solar eclipse, then undo -> must restore Moon lock target!
      panel.selectEclipseEvent(e2018, 'ground');
      expect(state.get().selectedEclipseId).toBe('lunar-2018-07-27');
      expect(currentGroundLock).toBe('moon');
      expect(panel.floatingCardEl.innerHTML).toContain(e2018.titleZh);

      panel.selectEclipseEvent(e2009, 'ground');
      expect(state.get().selectedEclipseId).toBe('solar-2009-07-22');
      expect(currentGroundLock).toBe('sun');
      expect(panel.floatingCardEl.innerHTML).toContain(e2009.titleZh);

      const undoneToLunar = state.undoLastJump();
      expect(undoneToLunar).toBeTruthy();
      expect(state.get().selectedEclipseId).toBe('lunar-2018-07-27');
      expect(currentGroundLock).toBe('moon');
      expect(state.get().groundLockTarget).toBe('moon');
      expect(panel.floatingCardEl.innerHTML).toContain(e2018.titleZh);
      expect(panel.floatingCardEl.innerHTML).not.toContain(e2009.titleZh);

      // 1b. Select 2009 solar eclipse, then 2018 lunar eclipse, then undo -> must restore Sun lock target!
      panel.selectEclipseEvent(e2009, 'ground');
      expect(currentGroundLock).toBe('sun');
      panel.selectEclipseEvent(e2018, 'ground');
      expect(currentGroundLock).toBe('moon');
      const undoneToSolar = state.undoLastJump();
      expect(undoneToSolar).toBeTruthy();
      expect(state.get().selectedEclipseId).toBe('solar-2009-07-22');
      expect(currentGroundLock).toBe('sun');
      expect(panel.floatingCardEl.innerHTML).toContain(e2009.titleZh);

      // 1c. Year search input: astronomical year 0, -1999, 3000 must succeed
      const panelEl = panel.el as unknown as MockEl;
      const yearInput = panelEl.querySelector('#ecl-search-year');
      const yearBtn = panelEl.querySelector('#btn-search-year');
      const yearList = panelEl.querySelector('#year-list');
      yearInput.value = '0';
      yearBtn.trigger('click');
      expect(yearList.innerHTML).toContain('0000-');
      expect(yearList.innerHTML).toContain('公元前1年');
      expect(yearList.innerHTML).not.toContain('2026-');

      yearInput.value = '-1999';
      yearBtn.trigger('click');
      expect(yearList.innerHTML).toContain('-1999-');

      yearInput.value = '3000';
      yearBtn.trigger('click');
      expect(yearList.innerHTML).toContain('3000-');

      // Invalid/non-integer/out-of-range year inputs must show validation message (MS-03)
      for (const badYear of [
        '',
        '2026.5',
        '3001',
        '-2000',
        '100000',
        '999999',
        'NaN',
        'Infinity',
        '-Infinity',
        'abc',
      ]) {
        yearInput.value = badYear;
        yearBtn.trigger('click');
        expect(yearList.innerHTML).toContain('请输入 -1999 至 3000 之间的整数天文年份');
        expect(yearList.innerHTML).not.toContain('2026-');
      }

      // 1d. Unexpected error in searchEclipsesInYear shows .inline-error-msg without clearing selectedEvent (MS-03)
      const spy = vi.spyOn(eclipseSearch, 'searchEclipsesInYear').mockImplementationOnce(() => {
        throw new Error('simulated ephemeris failure');
      });
      try {
        yearInput.value = '2026';
        yearBtn.trigger('click');
        expect(yearList.innerHTML).toContain('inline-error-msg');
        expect(yearList.innerHTML).toContain('搜索 2026 年日月食时发生计算异常');
        expect(yearList.innerHTML).not.toContain('该年份未检索到显著日食或月食事件');
        // Selected event and floating card remain intact
        expect(state.get().selectedEclipseId).toBe('solar-2009-07-22');
        expect(panel.floatingCardEl.innerHTML).toContain(e2009.titleZh);
      } finally {
        spy.mockRestore();
      }
      // Subsequent valid search recovers cleanly
      yearInput.value = '2026';
      yearBtn.trigger('click');
      expect(yearList.innerHTML).toContain('2026-');
      expect(yearList.innerHTML).not.toContain('inline-error-msg');

      // 1e. Malicious featuredSiteName / titleZh / introZh / observer name are escaped in EclipsePanel, InfoHUD, and LocationPanel (MS-04 / MS-11)
      const xssPayload = `<img src=x onerror="window.__xss=1"><script>alert(1)</script>`;
      const maliciousEvent = {
        ...e2009,
        id: 'solar-2009-07-22-xss',
        titleZh: `日全食 ${xssPayload}`,
        introZh: `简介 ${xssPayload}`,
        featuredSiteName: `武汉 ${xssPayload}`,
        typeLabelZh: `日全食 ${xssPayload}`,
        durationLabelZh: `6分39秒 ${xssPayload}`,
      };
      panel.selectEclipseEvent(maliciousEvent, 'ground');
      expect(panel.floatingCardEl.innerHTML).not.toContain('<img');
      expect(panel.floatingCardEl.innerHTML).not.toContain('<script');
      expect(panel.floatingCardEl.innerHTML).toContain('&lt;img');

      state.setEarthLocation({ name: `地球站 ${xssPayload}`, lat: 30.59, lon: 114.3 });
      state.setMoonLocation({ name: `月面站 ${xssPayload}`, lat: 0.67, lon: 23.47 });

      const hud = new InfoHUD(state);
      const hudEl = hud.el as unknown as MockEl;
      // Expand InfoHUD so detail sections (#hud-sun, #hud-moon, #hud-riseset, #hud-eclipse-status) actually render
      hudEl.querySelector('#hud-compact-bar').trigger('click', { target: {} });
      const tUtc = state.get().timeUtc;
      const eph = computeEphemeris(tUtc);
      const frame = {
        eph,
        phase: computeMoonPhase(tUtc),
        earthSky: computeEarthObserverSky(tUtc, 30.59, 114.3, 0),
        moonSky: computeMoonSurfaceSky(tUtc, 0.67, 23.47, eph.sunEclKm, eph.moonEclKm),
      };
      hud.refreshDisplay(frame as unknown as Parameters<InfoHUD['refreshDisplay']>[0]);
      expect(hudEl.querySelector('#hud-sun').innerHTML).toContain('&lt;img');
      for (const sel of [
        '#hud-compact-summary',
        '#hud-sun',
        '#hud-moon',
        '#hud-riseset',
        '#hud-eclipse-status',
      ]) {
        const html = hudEl.querySelector(sel).innerHTML;
        expect(html.length).toBeGreaterThan(0);
        expect(html).not.toContain('<img');
        expect(html).not.toContain('<script');
      }

      state.update({ viewMode: 'moon' });
      hud.refreshDisplay(frame as unknown as Parameters<InfoHUD['refreshDisplay']>[0]);
      expect(hudEl.querySelector('#hud-compact-summary').innerHTML).not.toContain('<img');
      expect(hudEl.querySelector('#hud-compact-summary').innerHTML).toContain('&lt;img');
      expect(hudEl.querySelector('#hud-eclipse-status').innerHTML).not.toContain('<img');
      expect(hudEl.querySelector('#hud-eclipse-status').innerHTML).toContain('&lt;img');

      const locPanel = new LocationPanel(state);
      const locBadge = (locPanel.el as unknown as MockEl).querySelector('#loc-current-badge');
      expect(locBadge.innerHTML).toBe('');
      expect(locBadge.textContent).toContain(xssPayload);

      // 2. Restore 2024 North American eclipse with Beijing observer preserved in URL
      const e2024 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2024-04-08')!;
      parseUrlInitialState(
        state,
        '?lat=39.90&lon=116.41&name=%E5%8C%97%E4%BA%AC&ecl=solar-2024-04-08'
      );
      panel.restoreEclipseFromUrl(e2024, {
        hasTime: false,
        hasLocation: true,
        hasMoonLocation: false,
        hasView: false,
      });

      expect(state.get().earthObserver.name).toBe('北京');
      // Contacts fallback to North American representative site (Dallas CDT = UTC-5) and must use its local timezone (13:42), not Beijing 02:42
      expect(panel.floatingCardEl.innerHTML).toContain('当地时间 UTC-5');
      expect(panel.floatingCardEl.innerHTML).toContain('13:42');
      expect(panel.floatingCardEl.innerHTML).not.toContain('02:42');

      // Clicking 60s replay must sync observer to the representative site so the eclipse is visible
      const replayBtn = (panel.floatingCardEl as unknown as MockEl).querySelector('#act-replay-ecl');
      replayBtn.trigger('click');
      expect(state.get().earthObserver.lat).toBeCloseTo(e2024.peakLat, 2);
      expect(state.get().earthObserver.lon).toBeCloseTo(e2024.peakLon, 2);
      expect(state.get().eclipseReplay?.active).toBe(true);

      // 2b. F1 Regression: Compare replay variable-speed transitions and auto-stop when UI is visible vs hidden
      const runReplaySimulation = (uiHidden: boolean) => {
        state.update({ uiHidden: false });
        panel.selectEclipseEvent(e2024, 'ground');
        const btn = (panel.floatingCardEl as unknown as MockEl).querySelector('#act-replay-ecl');
        btn.trigger('click');
        state.update({ uiHidden });

        const rep0 = state.get().eclipseReplay!;
        expect(rep0.active).toBe(true);
        expect(rep0.u2UtcMs).toBeTruthy();
        expect(rep0.u3UtcMs).toBeTruthy();

        const clock = new SimulationClock(state);
        let lastUiRefresh = -Infinity;
        let domRefreshCalls = 0;
        const refreshSpy = vi.spyOn(panel, 'refreshReplayProgress');
        const runner = new FrameRunner(state, clock, (now) => {
          const shouldRefreshUi = !state.get().uiHidden && now - lastUiRefresh > 80;
          if (shouldRefreshUi) {
            panel.refreshReplayProgress();
            lastUiRefresh = now;
            domRefreshCalls++;
          }
        });

        try {
          let nowPerf = 10_000;
          runner.runFrame(nowPerf); // baseline frame
          const initialFastSpeed = state.get().speedMultiplier;
          expect(initialFastSpeed).toBeGreaterThan(100);

          // Step into totality slow-motion window [u2 - 90s, u3 + 90s]
          state.setTimeUtc(rep0.u2UtcMs! - 30_000, false, true);
          nowPerf += 50;
          runner.runFrame(nowPerf);
          const totalitySlowSpeed = state.get().speedMultiplier;
          expect(totalitySlowSpeed).toBeLessThan(initialFastSpeed * 0.5);

          // Step out of totality window into post-U3 partial phase
          state.setTimeUtc(rep0.u3UtcMs! + 120_000, false, true);
          nowPerf += 50;
          runner.runFrame(nowPerf);
          const resumedFastSpeed = state.get().speedMultiplier;
          expect(resumedFastSpeed).toBe(initialFastSpeed);

          // Step just before endUtcMs and let frame advance across endUtcMs
          state.setTimeUtc(rep0.endUtcMs - 500, false, true);
          nowPerf += 100;
          runner.runFrame(nowPerf);

          // Must stop immediately even while uiHidden === true
          const finalState = state.get();
          expect(finalState.timeUtc).toBeGreaterThanOrEqual(rep0.endUtcMs);
          expect(finalState.playing).toBe(false);
          expect(finalState.eclipseReplay?.active).toBe(false);

          // Subsequent frames must not advance timeUtc further
          const stoppedUtc = finalState.timeUtc;
          nowPerf += 100;
          runner.runFrame(nowPerf);
          expect(state.get().timeUtc).toBe(stoppedUtc);

          return {
            initialFastSpeed,
            totalitySlowSpeed,
            resumedFastSpeed,
            playing: finalState.playing,
            active: finalState.eclipseReplay?.active,
            domRefreshCalls,
            spyCalls: refreshSpy.mock.calls.length,
          };
        } finally {
          refreshSpy.mockRestore();
        }
      };

      const visibleRun = runReplaySimulation(false);
      const hiddenRun = runReplaySimulation(true);

      expect(hiddenRun.initialFastSpeed).toBe(visibleRun.initialFastSpeed);
      expect(hiddenRun.totalitySlowSpeed).toBe(visibleRun.totalitySlowSpeed);
      expect(hiddenRun.resumedFastSpeed).toBe(visibleRun.resumedFastSpeed);
      expect(hiddenRun.playing).toBe(false);
      expect(hiddenRun.active).toBe(false);
      expect(hiddenRun.domRefreshCalls).toBe(0);
      // Neither FrameRunner nor EclipsePanel state subscriber calls refreshReplayProgress while uiHidden=true
      expect(hiddenRun.spyCalls).toBe(0);

      const badge = (panel.floatingCardEl as unknown as MockEl).querySelector(
        '#replay-phase-badge'
      );
      const scrubber = (panel.floatingCardEl as unknown as MockEl).querySelector(
        '#replay-scrubber'
      );
      // Before unhiding, DOM still reflects the initial state before uiHidden became true
      expect(badge.textContent).toContain('⏩ 偏食阶段快进');
      expect(scrubber.value).toBe('0');

      // Unhiding UI after hidden replay completion immediately syncs completed badge and 100% scrubber
      state.update({ uiHidden: false });
      expect(badge.textContent).toBe('✅ 已复圆结束');
      expect(scrubber.value).toBe('1000');

      // Dragging scrubber back to 50% (totality) after completion reactivates replay and updates badge & speed
      scrubber.value = '500';
      scrubber.trigger('input');
      expect(state.get().eclipseReplay?.active).toBe(true);
      expect(state.get().speedMultiplier).toBe(hiddenRun.totalitySlowSpeed);
      expect(badge.textContent).toContain('🔥 食既~生光自动慢放');

      // 3. SpaceView setHudVisible(false) explicitly hides space markers and removes pick menu
      let pickMenuRemoved = false;
      const fakeSpaceView = Object.create(SpaceView.prototype) as Record<string, unknown> & {
        setHudVisible: (visible: boolean) => void;
      };
      fakeSpaceView.markerLayerEl = { style: { display: 'block' } };
      fakeSpaceView.moonMarkerBtn = { style: { display: 'inline-flex' } };
      fakeSpaceView.sunMarkerBtn = { style: { display: 'inline-flex' } };
      fakeSpaceView.pickMenuEl = {
        remove: () => {
          pickMenuRemoved = true;
        },
      };
      fakeSpaceView.setHudVisible(false);
      expect((fakeSpaceView.markerLayerEl as { style: { display: string } }).style.display).toBe(
        'none'
      );
      expect((fakeSpaceView.moonMarkerBtn as { style: { display: string } }).style.display).toBe(
        'none'
      );
      expect((fakeSpaceView.sunMarkerBtn as { style: { display: string } }).style.display).toBe(
        'none'
      );
      expect(pickMenuRemoved).toBe(true);
      expect(fakeSpaceView.pickMenuEl).toBeNull();
    } finally {
      (globalThis as Record<string, unknown>).document = prevDoc;
      (globalThis as Record<string, unknown>).window = prevWin;
    }
  });
});

