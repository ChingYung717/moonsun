import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AppState,
  buildShareSearchParams,
  escapeHtml,
  parseUrlInitialState,
} from '../src/state/AppState';
import { CURATED_ECLIPSE_CATALOG } from '../src/astro/eclipses/catalog';
import { EclipsePanel } from '../src/ui/EclipsePanel';
import { SpaceView } from '../src/render/views/SpaceView';

describe('Security & URL State Serialization Regressions (B3)', () => {
  it('escapeHtml escapes all 5 HTML special characters and neutralizes XSS payloads', () => {
    const raw = `<img src=x onerror="window.__xss=1">'&<>`;
    const escaped = escapeHtml(raw);
    expect(escaped).toBe(
      '&lt;img src=x onerror=&quot;window.__xss=1&quot;&gt;&#39;&amp;&lt;&gt;'
    );
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
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

  it('static scan: no innerHTML template in src/ interpolates unescaped observer names or siteLabel', () => {
    const uiDir = path.resolve(__dirname, '../src/ui');
    const files = fs.readdirSync(uiDir).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(uiDir, file), 'utf8');
      const blocks = content.match(/innerHTML\s*=\s*`[\s\S]*?`;/g) ?? [];
      for (const block of blocks) {
        expect(block).not.toMatch(/\$\{\s*(?:this\.)?s(?:tate\.get\(\))?\.(?:earth|moon)Observer\.name\s*\}/);
        expect(block).not.toMatch(/\$\{\s*siteLabel\s*\}/);
      }
    }
  });

  it('syncs EclipsePanel floating card & contacts on undo (Backspace) and syncs fallback observer & timezone on replay', () => {
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
        this.children.push(child);
        this.firstElementChild = this.children[0] ?? null;
        return child;
      }
      append(...nodes: MockEl[]): void {
        for (const n of nodes) this.appendChild(n);
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

      remove(): void {}
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
      const mockRenderer = {
        groundView: { setLockTarget: () => {} },
        moonSurfaceView: { setLockTarget: () => {} },
        spaceView: { setHudVisible: () => {} },
      } as unknown as ConstructorParameters<typeof EclipsePanel>[1];

      const panel = new EclipsePanel(state, mockRenderer);
      const e2009 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2009-07-22')!;
      const e2018 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'lunar-2018-07-27')!;

      // 1. Select 2009 solar eclipse, then 2018 lunar eclipse, then undo
      panel.selectEclipseEvent(e2009, 'ground');
      expect(state.get().selectedEclipseId).toBe('solar-2009-07-22');
      expect(panel.floatingCardEl.innerHTML).toContain(e2009.titleZh);

      panel.selectEclipseEvent(e2018, 'ground');
      expect(state.get().selectedEclipseId).toBe('lunar-2018-07-27');
      expect(panel.floatingCardEl.innerHTML).toContain(e2018.titleZh);

      const undone = state.undoLastJump();
      expect(undone).toBeTruthy();
      expect(state.get().selectedEclipseId).toBe('solar-2009-07-22');
      // Card and contact buttons must be synced back to 2009 solar eclipse!
      expect(panel.floatingCardEl.innerHTML).toContain(e2009.titleZh);
      expect(panel.floatingCardEl.innerHTML).not.toContain(e2018.titleZh);

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
