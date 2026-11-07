import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import {
  computeSubLunarLatLon,
  searchEclipsesInYear,
  searchUpcomingLocalSolarEclipses,
} from '../src/astro/eclipses/search';
import {
  MAX_SHADOW_PATH_CACHE_SIZE,
  clearShadowPathCache,
  computeSolarEclipsePath,
  getShadowPathCacheStats,
} from '../src/astro/eclipses/shadowPath';
import {
  CURATED_ECLIPSE_CATALOG,
  filterCuratedCatalog,
  getCuratedCatalogStats,
} from '../src/astro/eclipses/catalog';
import { computeEphemeris, makeAstroTime } from '../src/astro/ephemeris';
import { computeEarthOrientation } from '../src/astro/earthOrientation';
import { MAX_VALID_UTC_MS } from '../src/state/AppState';
import { RAD2DEG } from '../src/utils/math';

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

  it('recognizes China partial visibility when global peak is in Western Hemisphere (2021-06-10) or south of -25° (2009-01-26)', () => {
    const e2021 = searchEclipsesInYear(2021).find((x) => x.id === 'solar-2021-06-10');
    expect(e2021).toBeDefined();
    expect(e2021!.peakLon).toBeLessThan(0); // Greatest eclipse in northern Canada/Greenland
    expect(e2021!.chinaVisibility).toBe('partial');
    expect(e2021!.chinaVisibilityLabelZh).toBe('中国可见偏食');

    const cat2021 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2021-06-10');
    expect(cat2021).toBeDefined();
    expect(cat2021!.chinaVisibility).toBe('partial');
    expect(cat2021!.chinaVisibilityLabelZh).toBe('中国可见偏食');

    const cat2009Jan = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2009-01-26');
    expect(cat2009Jan).toBeDefined();
    expect(cat2009Jan!.chinaVisibility).toBe('partial');
  });

  it('includes eclipse-at-sunset (带食日落) events in searchUpcomingLocalSolarEclipses (e.g. Beijing 2021-06-10)', () => {
    const beijingLocals = searchUpcomingLocalSolarEclipses(
      Date.UTC(2021, 4, 1),
      39.9042,
      116.4074,
      5
    );
    expect(beijingLocals.length).toBe(5);
    const first = beijingLocals[0];
    // First upcoming visible solar eclipse in Beijing after 2021-05-01 is 2021-06-10 (U1 altitude ~1.56°, peak below horizon)
    expect(new Date(first.peakUtc).toISOString().slice(0, 10)).toBe('2021-06-10');
    expect(first.partialBeginAltitudeDeg).toBeGreaterThan(1.0);
    expect(first.peakAltitudeDeg).toBeLessThan(0);
    expect(first.obscuration).toBeGreaterThan(0.2);
  });

  it('searches astronomical year 0 (1 BC) and boundary years [-1999, 3000], and rejects non-integer or out-of-range years (MS-03)', () => {
    const year0 = searchEclipsesInYear(0);
    expect(year0.length).toBeGreaterThan(0);
    expect(year0.every((x) => x.year === 0)).toBe(true);
    expect(
      year0.some((x) => x.id.startsWith('solar-0000-') || x.id.startsWith('lunar-0000-'))
    ).toBe(true);

    const yearMin = searchEclipsesInYear(-1999);
    expect(yearMin.length).toBeGreaterThan(0);
    expect(yearMin.every((x) => x.year === -1999)).toBe(true);

    const yearMax = searchEclipsesInYear(3000);
    expect(yearMax.length).toBeGreaterThan(0);
    expect(yearMax.every((x) => x.year === 3000)).toBe(true);

    expect(searchEclipsesInYear(2026.5)).toEqual([]);
    expect(searchEclipsesInYear(-2000)).toEqual([]);
    expect(searchEclipsesInYear(3001)).toEqual([]);
    expect(searchEclipsesInYear(100000)).toEqual([]);
    expect(searchEclipsesInYear(999999)).toEqual([]);
    expect(searchEclipsesInYear(Number.NaN)).toEqual([]);
    expect(searchEclipsesInYear(Number.POSITIVE_INFINITY)).toEqual([]);
    expect(searchEclipsesInYear(Number.NEGATIVE_INFINITY)).toEqual([]);

    // searchUpcomingLocalSolarEclipses near MAX_VALID_UTC_MS must not throw
    expect(() =>
      searchUpcomingLocalSolarEclipses(MAX_VALID_UTC_MS - 3600 * 1000, 39.9, 116.4, 3)
    ).not.toThrow();
    expect(searchUpcomingLocalSolarEclipses(MAX_VALID_UTC_MS + 86400000, 39.9, 116.4, 3)).toEqual(
      []
    );
  });

  it('computeSubLunarLatLon places the Moon at >= 89.99° zenith altitude and matches independent ECEF vector projection (MS-02)', () => {
    const sampleUtcList = [
      Date.UTC(2025, 8, 7, 18, 11, 41), // 2025-09-07 total lunar eclipse (southern declination, Indian Ocean)
      Date.UTC(2026, 2, 3, 11, 33, 25), // 2026-03-03 total lunar eclipse (northern declination, Pacific near Date Line)
      Date.UTC(2018, 6, 27, 20, 21, 44), // 2018-07-27 apogee total lunar eclipse
      Date.UTC(2022, 10, 8, 10, 59, 11), // 2022-11-08 total lunar eclipse (crossing near 180° lon)
      Date.UTC(2026, 2, 19, 1, 23, 0), // Moon near RA 0h / vernal equinox crossing
      Date.UTC(2026, 5, 15, 11, 50, 0), // High northern declination (~+28°)
      Date.UTC(2026, 5, 28, 18, 10, 0), // High southern declination (~-28°)
    ];

    for (const utcMs of sampleUtcList) {
      const { lat, lon } = computeSubLunarLatLon(utcMs);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);

      // 1. Topocentric zenith verification: observer at (lat, lon, 0) on spherical/geocentric direction
      const t = makeAstroTime(utcMs);
      const obs = new Astronomy.Observer(lat, lon, 0);
      const eqTopo = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
      const hor = Astronomy.Horizon(t, obs, eqTopo.ra, eqTopo.dec, 'normal');
      expect(hor.altitude).toBeGreaterThanOrEqual(89.99);

      // 2. Cross-check against independent ECEF vector projection from computeEarthOrientation + computeEphemeris
      const eph = computeEphemeris(utcMs);
      const earthOri = computeEarthOrientation(utcMs);
      const moonEcef = earthOri.eclToEcef(eph.moonEclKm);
      const r = Math.hypot(moonEcef.x, moonEcef.y, moonEcef.z);
      const ecefLat = Math.asin(moonEcef.z / r) * RAD2DEG;
      const ecefLon = Math.atan2(moonEcef.y, moonEcef.x) * RAD2DEG;

      expect(Math.abs(lat - ecefLat)).toBeLessThan(0.02);
      const lonDiff = Math.abs((((lon - ecefLon + 540) % 360) - 180));
      expect(lonDiff).toBeLessThan(0.02);
    }
  });

  it('bounds computeSolarEclipsePath cache to MAX_SHADOW_PATH_CACHE_SIZE (64) with LRU eviction (MS-07)', () => {
    clearShadowPathCache();
    expect(getShadowPathCacheStats().size).toBe(0);
    expect(getShadowPathCacheStats().maxSize).toBe(MAX_SHADOW_PATH_CACHE_SIZE);
    expect(MAX_SHADOW_PATH_CACHE_SIZE).toBe(64);

    const basePeakUtc = Date.UTC(2024, 3, 8, 18, 17, 0);
    const firstPath = computeSolarEclipsePath(basePeakUtc);
    expect(getShadowPathCacheStats().size).toBe(1);

    // Same rounded minute hits cache without increasing size
    const sameMinutePath = computeSolarEclipsePath(basePeakUtc + 12_000);
    expect(sameMinutePath).toBe(firstPath);
    expect(getShadowPathCacheStats().size).toBe(1);

    // Insert 63 more distinct minute keys (total 64)
    for (let i = 1; i < MAX_SHADOW_PATH_CACHE_SIZE; i++) {
      computeSolarEclipsePath(basePeakUtc + i * 60_000);
    }
    expect(getShadowPathCacheStats().size).toBe(MAX_SHADOW_PATH_CACHE_SIZE);

    // Touch minute 0 so it becomes most-recently-used; minute 1 is now oldest
    const touchedFirst = computeSolarEclipsePath(basePeakUtc);
    expect(touchedFirst).toBe(firstPath);
    const statsBeforeEvict = getShadowPathCacheStats();
    const key0 = Math.round(basePeakUtc / 60_000);
    const key1 = Math.round((basePeakUtc + 60_000) / 60_000);
    expect(statsBeforeEvict.keys[statsBeforeEvict.keys.length - 1]).toBe(key0);
    expect(statsBeforeEvict.keys[0]).toBe(key1);

    // Insert 65th distinct minute -> evicts key1 while keeping key0
    const key64Utc = basePeakUtc + MAX_SHADOW_PATH_CACHE_SIZE * 60_000;
    computeSolarEclipsePath(key64Utc);
    const statsAfterEvict = getShadowPathCacheStats();
    expect(statsAfterEvict.size).toBe(MAX_SHADOW_PATH_CACHE_SIZE);
    expect(statsAfterEvict.keys).not.toContain(key1);
    expect(statsAfterEvict.keys).toContain(key0);

    // Re-requesting evicted key1 recomputes cleanly and matches deterministic geometry
    const recomputedKey1 = computeSolarEclipsePath(basePeakUtc + 60_000);
    expect(recomputedKey1.centerLine.length).toBeGreaterThan(30);
    expect(getShadowPathCacheStats().size).toBe(MAX_SHADOW_PATH_CACHE_SIZE);
    expect(getShadowPathCacheStats().keys).toContain(key1);
  });

  it('derives getCuratedCatalogStats dynamically from CURATED_ECLIPSE_CATALOG (MS-08)', () => {
    const stats = getCuratedCatalogStats();
    expect(stats.total).toBe(CURATED_ECLIPSE_CATALOG.length);
    expect(stats.solarTotalAll).toBe(
      CURATED_ECLIPSE_CATALOG.filter((x) => x.category === 'solar-total').length
    );
    expect(stats.solarTotalModern).toBe(
      CURATED_ECLIPSE_CATALOG.filter((x) => x.year >= 1900 && x.category === 'solar-total').length
    );
    expect(stats.solarAnnularAll).toBe(
      CURATED_ECLIPSE_CATALOG.filter((x) => x.category === 'solar-annular').length
    );
    expect(stats.solarAnnularModern).toBe(
      CURATED_ECLIPSE_CATALOG.filter((x) => x.year >= 1900 && x.category === 'solar-annular').length
    );
    expect(stats.lunarTotalAll).toBe(
      CURATED_ECLIPSE_CATALOG.filter((x) => x.category === 'lunar-total').length
    );
    expect(stats.ancientCount).toBe(
      CURATED_ECLIPSE_CATALOG.filter((x) => x.year < 1900 || x.category === 'solar-partial').length
    );
    expect(
      stats.solarTotalModern + stats.solarAnnularModern + stats.lunarTotalAll + stats.ancientCount
    ).toBe(stats.total);
  });

  it('matches NASA Five Millennium Catalog of Solar Eclipses (Espenak & Meeus, NASA TP-2006-214141) after TD-to-UT1 ΔT conversion', () => {
    // Source: NASA Five Millennium Catalog of Solar Eclipses (Fred Espenak & Jean Meeus, NASA/TP-2006-214141)
    // Greatest Eclipse is tabulated in Terrestrial Dynamical Time (TD); UT1 = TD - ΔT.
    const nasaCatalogRefs = [
      {
        id: 'solar-2009-07-22',
        year: 2009,
        tdUtcMs: Date.UTC(2009, 6, 22, 2, 36, 25),
        deltaTSeconds: 66,
        latDeg: 24.2,
        lonDeg: 144.1,
        durationSeconds: 399,
      },
      {
        id: 'solar-2024-04-08',
        year: 2024,
        tdUtcMs: Date.UTC(2024, 3, 8, 18, 18, 29),
        deltaTSeconds: 69,
        latDeg: 25.3,
        lonDeg: -104.1,
        durationSeconds: 268,
      },
      {
        id: 'solar-2027-08-02',
        year: 2027,
        tdUtcMs: Date.UTC(2027, 7, 2, 10, 7, 50),
        deltaTSeconds: 70,
        latDeg: 25.5,
        lonDeg: 33.2,
        durationSeconds: 383,
      },
    ];

    for (const ref of nasaCatalogRefs) {
      const item = searchEclipsesInYear(ref.year).find((x) => x.id === ref.id);
      expect(item, ref.id).toBeDefined();
      const expectedUtMs = ref.tdUtcMs - ref.deltaTSeconds * 1000;
      expect(Math.abs(item!.peakUtcMs - expectedUtMs)).toBeLessThan(30 * 1000);
      expect(Math.abs(item!.peakLat - ref.latDeg)).toBeLessThan(0.15);
      expect(Math.abs(item!.peakLon - ref.lonDeg)).toBeLessThan(0.15);
      expect(Math.abs(item!.durationSeconds - ref.durationSeconds)).toBeLessThanOrEqual(12);
    }
  });
});

