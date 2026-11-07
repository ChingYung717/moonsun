import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import {
  searchEclipsesInYear,
  searchUpcomingLocalSolarEclipses,
} from '../src/astro/eclipses/search';
import { computeSolarEclipsePath } from '../src/astro/eclipses/shadowPath';
import { CURATED_ECLIPSE_CATALOG, filterCuratedCatalog } from '../src/astro/eclipses/catalog';
import { makeAstroTime } from '../src/astro/ephemeris';

describe('Solar & Lunar Eclipses + Curated Catalog', () => {
  it('accurately finds 2024-04-08 Total Solar Eclipse near 18:17 UTC in Mexico/North America', () => {
    const items = searchEclipsesInYear(2024);
    const apr8 = items.find((x) => x.id === 'solar-2024-04-08');
    expect(apr8).toBeDefined();
    expect(apr8!.category).toBe('solar-total');

    const expectedUtc = Date.UTC(2024, 3, 8, 18, 17, 0);
    expect(Math.abs(apr8!.peakUtcMs - expectedUtc)).toBeLessThan(3 * 60 * 1000);
    expect(apr8!.peakLat).toBeCloseTo(25.3, 0);
    expect(apr8!.peakLon).toBeCloseTo(-104.1, 0);
  });

  it('accurately finds 2009-07-22 Total Solar Eclipse and recognizes China central visibility', () => {
    const items = searchEclipsesInYear(2009);
    const jul22 = items.find((x) => x.id === 'solar-2009-07-22');
    expect(jul22).toBeDefined();
    expect(jul22!.category).toBe('solar-total');
    expect(jul22!.chinaVisibility).toBe('central');

    // Verify Wuhan local solar eclipse on 2009-07-22 sees totality!
    const wuhanLocal = searchUpcomingLocalSolarEclipses(
      Date.UTC(2009, 6, 20),
      30.59,
      114.3,
      1
    );
    expect(wuhanLocal.length).toBeGreaterThan(0);
    expect(wuhanLocal[0].kind).toBe('total');
    expect(wuhanLocal[0].obscuration).toBeCloseTo(1.0, 3);
  });

  it('identifies 2010-01-15 as Annular Solar Eclipse and 2022-11-08 as Total Lunar Eclipse', () => {
    const e2010 = searchEclipsesInYear(2010).find((x) => x.id === 'solar-2010-01-15');
    expect(e2010?.category).toBe('solar-annular');
    expect(e2010?.chinaVisibility).toBe('central');

    const e2022 = searchEclipsesInYear(2022).find((x) => x.id === 'lunar-2022-11-08');
    expect(e2022?.category).toBe('lunar-total');
    expect(e2022?.chinaVisibility).toBe('central');
  });

  it('computes 2024-04-08 shadow path passing near Dallas, TX (32.8N, -96.8W)', () => {
    const peakUtc = Date.UTC(2024, 3, 8, 18, 17, 16);
    const path = computeSolarEclipsePath(peakUtc);
    expect(path.centerLine.length).toBeGreaterThan(30);

    // Find closest centerline point to Dallas (32.78N, -96.80W)
    let minDegDist = 999;
    for (const pt of path.centerLine) {
      const d = Math.hypot(pt.lat - 32.78, pt.lon - -96.8);
      if (d < minDegDist) minDegDist = d;
    }
    expect(minDegDist).toBeLessThan(1.5);
  });

  it('validates the 200+ Curated Catalog integrity and China-prioritized ranking', () => {
    expect(CURATED_ECLIPSE_CATALOG.length).toBeGreaterThanOrEqual(200);

    for (const item of CURATED_ECLIPSE_CATALOG) {
      expect(item.introZh.length).toBeGreaterThan(20);
      expect(item.titleZh.length).toBeGreaterThan(5);
    }

    const sortedByScore = filterCuratedCatalog({
      sortBy: 'score',
      category: 'all',
      chinaOnly: false,
      query: '',
    });

    // Top 5 should all be visible in China!
    for (let i = 0; i < 5; i++) {
      expect(sortedByScore[i].chinaVisibility).toBe('central');
    }

    // Spot check that astronomy-engine re-finds catalog items within ±1.5 days
    const sampleItems = sortedByScore.slice(0, 12);
    for (const item of sampleItems) {
      const tSearch = makeAstroTime(item.peakUtcMs - 36 * 3600 * 1000);
      if (item.kind === 'solar') {
        const found = Astronomy.SearchGlobalSolarEclipse(tSearch);
        expect(Math.abs(found.peak.date.getTime() - item.peakUtcMs)).toBeLessThan(86400000);
      } else {
        const found = Astronomy.SearchLunarEclipse(tSearch);
        expect(Math.abs(found.peak.date.getTime() - item.peakUtcMs)).toBeLessThan(86400000);
      }
    }
  });

  it('computes real greatest-eclipse coordinates and obscuration for partial solar eclipses (e.g. 2025-03-29)', () => {
    const items2025 = searchEclipsesInYear(2025);
    const mar29 = items2025.find((x) => x.id === 'solar-2025-03-29');
    expect(mar29).toBeDefined();
    expect(mar29!.category).toBe('solar-partial');
    // Must not fall back to fake (0°, 0°) or 50% obscuration
    expect(mar29!.peakLat).toBeGreaterThan(55);
    expect(mar29!.peakLon).toBeLessThan(-60);
    expect(mar29!.regionZh).toBe('北美洲');
    expect(mar29!.obscuration).toBeGreaterThan(0.9);
    expect(mar29!.introZh).not.toContain('非洲大陆');

    // Verify local solar eclipse at the resolved peak coordinates actually observes >90% eclipse above horizon
    const loc = Astronomy.SearchLocalSolarEclipse(
      makeAstroTime(mar29!.peakUtcMs - 24 * 3600 * 1000),
      new Astronomy.Observer(mar29!.peakLat, mar29!.peakLon, 0)
    );
    expect(loc.obscuration).toBeCloseTo(mar29!.obscuration, 2);
    expect(loc.peak.altitude).toBeGreaterThan(0);
  });
});
