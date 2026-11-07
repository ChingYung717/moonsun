import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AppState,
  buildShareSearchParams,
  escapeHtml,
  parseUrlInitialState,
} from '../src/state/AppState';

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
});
