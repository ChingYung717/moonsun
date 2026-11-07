import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import {
  buildLunarEclipseItem,
  buildSolarEclipseItem,
  computeCentralDurationSeconds,
  searchEclipsesInYear,
} from '../src/astro/eclipses/search';
import { CURATED_ECLIPSE_CATALOG } from '../src/astro/eclipses/catalog';
import { CURATED_ECLIPSE_NOTES } from '../src/astro/eclipses/intros.zh';
import { computeSolarEclipsePath } from '../src/astro/eclipses/shadowPath';
import { computeSarosSeries } from '../src/astro/eclipses/pathGeography';
import { isPointInChina } from '../src/astro/geo/chinaBoundary';
import { runFactCheck } from '../scripts/fact-check-intros';
import { computeEphemeris, makeAstroTime } from '../src/astro/ephemeris';
import { computeEarthOrientation, geodeticToEcefKm } from '../src/astro/earthOrientation';
import { computeMoonOrientation } from '../src/astro/moonOrientation';
import { computeMoonSurfaceSky } from '../src/astro/observer';
import { sceneToEarthHorizonMatrix } from '../src/astro/horizonFrames';
import {
  formatAstroDateUtc,
  historicalDateLabelZh,
  julianCalendarToMs,
  msToJulianCalendar,
} from '../src/time/tz';
import { DEG2RAD, RAD2DEG, astroToThreeVec } from '../src/utils/math';

/** Greatest durations published by NASA (Espenak) for comparison. */
const NASA_DURATIONS: Array<[string, number]> = [
  ['solar-2009-07-22', 6 * 60 + 39],
  ['solar-2010-01-15', 11 * 60 + 8],
  ['solar-2035-09-02', 2 * 60 + 54],
  ['solar-2024-04-08', 4 * 60 + 28],
  ['solar-2027-08-02', 6 * 60 + 23],
];

function horizVecToAltAz(v: THREE.Vector3) {
  const n = v.clone().normalize();
  return {
    alt: Math.asin(n.y) * RAD2DEG,
    az: ((Math.atan2(n.x, -n.z) * RAD2DEG) + 360) % 360,
  };
}

describe('Round-1 regressions', () => {
  it('computes real central eclipse durations within ±12 s of NASA values', () => {
    for (const [id, nasaSec] of NASA_DURATIONS) {
      const year = parseInt(id.slice(6, 10), 10);
      const item = searchEclipsesInYear(year).find((x) => x.id === id)!;
      expect(item, id).toBeDefined();
      expect(Math.abs(item.durationSeconds - nasaSec), `${id} got ${item.durationSeconds}s`).toBeLessThanOrEqual(12);
    }
    // Partial-only geometry returns 0, never a made-up number
    expect(computeCentralDurationSeconds(Date.UTC(2009, 6, 22, 2, 35), -60, 0)).toBe(0);
  });

  it('catalog shows the corrected durations (2035 Beijing ≈ 2m5x, not 7m10s)', () => {
    const e2035 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2035-09-02')!;
    expect(e2035.durationSeconds).toBeGreaterThan(160);
    expect(e2035.durationSeconds).toBeLessThan(190);
    const e2010 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2010-01-15')!;
    expect(e2010.durationSeconds).toBeGreaterThan(640);
  });

  it('Earth seen from the Moon is "new" during a total lunar eclipse and "full" at new Moon', () => {
    const tLunar = Date.UTC(2018, 6, 27, 20, 21, 44);
    const e1 = computeEphemeris(tLunar);
    expect(computeMoonSurfaceSky(tLunar, 0, 0, e1.sunEclKm, e1.moonEclKm).earthIlluminatedFraction).toBeLessThan(0.05);

    const tNew = Date.UTC(2009, 6, 22, 2, 35, 0);
    const e2 = computeEphemeris(tNew);
    expect(computeMoonSurfaceSky(tNew, 0, 0, e2.sunEclKm, e2.moonEclKm).earthIlluminatedFraction).toBeGreaterThan(0.95);
  });

  it('includes every hand-written note, including the ancient Chinese records', () => {
    const handwritten = CURATED_ECLIPSE_CATALOG.filter((x) => x.hasHandwrittenIntro);
    expect(handwritten.length).toBe(Object.keys(CURATED_ECLIPSE_NOTES).length);

    const chunqiu = CURATED_ECLIPSE_CATALOG.find((x) => x.titleZh.includes('鲁桓公'));
    expect(chunqiu).toBeDefined();
    expect(chunqiu!.year).toBe(-708);
    expect(chunqiu!.id.startsWith('solar--0708-')).toBe(true);
    // 709 BC July 17 (Julian calendar), as cited in the literature
    const j = msToJulianCalendar(chunqiu!.peakUtcMs);
    expect([j.year, j.month]).toEqual([-708, 7]);
    expect(Math.abs(j.day - 17)).toBeLessThanOrEqual(1);
    expect(CURATED_ECLIPSE_CATALOG.find((x) => x.titleZh.includes('十月之交'))).toBeDefined();
  });

  it('handles negative years and the Julian calendar correctly', () => {
    const d = new Date(0);
    d.setUTCFullYear(-708, 6, 9);
    expect(formatAstroDateUtc(d.getTime())).toBe('-0708-07-09');
    // Gregorian reform: 1582-10-15 (Gregorian) == 1582-10-05 (Julian)
    expect(msToJulianCalendar(Date.UTC(1582, 9, 15))).toEqual({ year: 1582, month: 10, day: 5 });
    const ms = julianCalendarToMs(-708, 7, 17);
    expect(msToJulianCalendar(ms)).toEqual({ year: -708, month: 7, day: 17 });
    expect(historicalDateLabelZh(ms)).toBe('公元前709年7月17日(儒略历)');
    // Year search must not map years 0..99 to 19xx
    expect(searchEclipsesInYear(50).every((x) => x.year === 50)).toBe(true);
  });

  it('horizon matrix places the Sun and Moon where astronomy-engine says (Beijing)', () => {
    const utc = Date.UTC(2026, 9, 25, 9, 0, 0);
    const lat = 39.9042;
    const lon = 116.4074;
    const t = makeAstroTime(utc);
    const obs = new Astronomy.Observer(lat, lon, 0);
    const eph = computeEphemeris(utc);
    const earthOri = computeEarthOrientation(utc);
    const H = sceneToEarthHorizonMatrix(earthOri, lat, lon);

    const sunEq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
    const sunHor = Astronomy.Horizon(t, obs, sunEq.ra, sunEq.dec);
    const sunAA = horizVecToAltAz(eph.sunDirThree.clone().transformDirection(H));
    expect(Math.abs(sunAA.alt - sunHor.altitude)).toBeLessThan(0.05);
    expect(Math.abs(sunAA.az - sunHor.azimuth)).toBeLessThan(0.05);

    // Topocentric Moon: subtract the observer's geocentric position (parallax ~1°)
    const siteEcl = earthOri.ecefToEcl(geodeticToEcefKm(lat, lon, 0));
    const moonTopo = astroToThreeVec(
      eph.moonEclKm.x - siteEcl.x,
      eph.moonEclKm.y - siteEcl.y,
      eph.moonEclKm.z - siteEcl.z
    );
    const moonEq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
    const moonHor = Astronomy.Horizon(t, obs, moonEq.ra, moonEq.dec);
    const moonAA = horizVecToAltAz(moonTopo.transformDirection(H));
    expect(Math.abs(moonAA.alt - moonHor.altitude)).toBeLessThan(0.05);
    expect(Math.abs(moonAA.az - moonHor.azimuth)).toBeLessThan(0.05);
  });

  it('every modern hand-written solar eclipse puts its featured site inside the central path', () => {
    const modern = CURATED_ECLIPSE_CATALOG.filter(
      (x) => x.hasHandwrittenIntro && x.kind === 'solar' && x.year >= 1600 && x.featuredSiteName
    );
    expect(modern.length).toBeGreaterThan(10);
    for (const x of modern) {
      expect(x.introZh.includes('模型说明'), `${x.id} featured site off-path`).toBe(false);
    }
  });

  it('every hand-written lunar eclipse has the Moon above the horizon at its featured site', () => {
    const lunar = CURATED_ECLIPSE_CATALOG.filter((x) => x.hasHandwrittenIntro && x.kind === 'lunar');
    for (const x of lunar) {
      const t = makeAstroTime(x.peakUtcMs);
      const obs = new Astronomy.Observer(x.peakLat, x.peakLon, 0);
      const eq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
      const alt = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal').altitude;
      expect(alt, `${x.id} Moon altitude ${alt.toFixed(1)}° at featured site`).toBeGreaterThan(0);
    }
  });

  it('formats pre-1901 Local Mean Time offsets without fractional minutes', async () => {
    const { utcToLocalParts } = await import('../src/time/tz');
    const p = utcToLocalParts(Date.UTC(1880, 0, 1), 'Asia/Shanghai');
    expect(p.offsetLabel).toMatch(/^UTC\+8:05:4\d 地方平时$/);
  });

  it('ground view Moon shows its near side to the observer', () => {
    const utc = Date.UTC(2026, 9, 25, 14, 0, 0);
    const earthOri = computeEarthOrientation(utc);
    const moonOri = computeMoonOrientation(utc);
    const eph = computeEphemeris(utc);
    const H = sceneToEarthHorizonMatrix(earthOri, 39.9, 116.4);
    const nearSide = new THREE.Vector3(1, 0, 0).transformDirection(moonOri.matrixThree).transformDirection(H);
    const moonToObserver = eph.moonDirThree.clone().negate().transformDirection(H);
    expect(nearSide.dot(moonToObserver)).toBeGreaterThan(Math.cos(12 * DEG2RAD));
  });

  it('fact-check script verifies all hand-written notes with 0 discrepancies (A1)', () => {
    const issues = runFactCheck();
    expect(issues).toEqual([]);
  });

  it('enforces exact 200-item catalog quotas across 4 categories (A2 & A3)', () => {
    expect(CURATED_ECLIPSE_CATALOG.length).toBe(200);
    const ancient = CURATED_ECLIPSE_CATALOG.filter((x) => x.year < 1900);
    const solarTotal = CURATED_ECLIPSE_CATALOG.filter(
      (x) => x.year >= 1900 && x.category === 'solar-total'
    );
    const solarAnnular = CURATED_ECLIPSE_CATALOG.filter(
      (x) => x.year >= 1900 && x.category === 'solar-annular'
    );
    const lunarTotal = CURATED_ECLIPSE_CATALOG.filter(
      (x) => x.year >= 1900 && x.category === 'lunar-total'
    );
    expect(ancient.length).toBe(15);
    expect(solarTotal.length).toBe(90);
    expect(solarAnnular.length).toBe(35);
    expect(lunarTotal.length).toBe(60);
  });

  it('determines China visibility using the Natural Earth China boundary polygon (A4)', () => {
    expect(isPointInChina(39.9, 116.4)).toBe(true); // Beijing
    expect(isPointInChina(25.03, 121.56)).toBe(true); // Taipei
    expect(isPointInChina(27.58, 91.86)).toBe(true); // South Tibet (Tawang)
    expect(isPointInChina(35.1, 79.1)).toBe(true); // Aksai Chin
    expect(isPointInChina(35.68, 139.69)).toBe(false); // Tokyo
    expect(isPointInChina(21.02, 105.83)).toBe(false); // Hanoi

    const s2009 = buildSolarEclipseItem(
      Astronomy.SearchGlobalSolarEclipse(makeAstroTime(Date.UTC(2009, 6, 20)))
    );
    const s2035 = buildSolarEclipseItem(
      Astronomy.SearchGlobalSolarEclipse(makeAstroTime(Date.UTC(2035, 8, 1)))
    );
    const s2024 = buildSolarEclipseItem(
      Astronomy.SearchGlobalSolarEclipse(makeAstroTime(Date.UTC(2024, 3, 6)))
    );
    const s2027 = buildSolarEclipseItem(
      Astronomy.SearchGlobalSolarEclipse(makeAstroTime(Date.UTC(2027, 7, 1)))
    );
    const l2025 = buildLunarEclipseItem(
      Astronomy.SearchLunarEclipse(makeAstroTime(Date.UTC(2025, 8, 5)))
    );
    expect(s2009.chinaVisibility).toBe('central');
    expect(s2035.chinaVisibility).toBe('central');
    expect(s2024.chinaVisibility).toBe('none');
    expect(s2027.chinaVisibility).toBe('partial');
    expect(l2025.chinaVisibility).toBe('central');
  });

  it('computes 2024-04-08 totality path width near Dallas within 190 km ± 20 km (C2)', () => {
    const path = computeSolarEclipsePath(Date.UTC(2024, 3, 8, 18, 18, 0));
    let closest = path.centerLine[0];
    for (const pt of path.centerLine) {
      if (
        Math.hypot(pt.lat - 32.78, pt.lon - -96.8) <
        Math.hypot(closest.lat - 32.78, closest.lon - -96.8)
      ) {
        closest = pt;
      }
    }
    const fullWidthKm = closest.halfWidthKm * 2;
    expect(fullWidthKm).toBeGreaterThanOrEqual(170);
    expect(fullWidthKm).toBeLessThanOrEqual(210);
    // North/South limits must be offset in both latitude and longitude (perpendicular to SW->NE path)
    expect(closest.northLat).toBeGreaterThan(closest.southLat);
    expect(closest.northLon).toBeLessThan(closest.southLon);
  });

  it('computes exact NASA Saros series numbers (A5)', () => {
    expect(computeSarosSeries('solar', Date.UTC(2009, 6, 22, 2, 35))).toBe(136);
    expect(computeSarosSeries('solar', Date.UTC(2024, 3, 8, 18, 18))).toBe(139);
    expect(computeSarosSeries('solar', Date.UTC(2035, 8, 2, 1, 56))).toBe(145);
    expect(computeSarosSeries('lunar', Date.UTC(2018, 6, 27, 20, 21))).toBe(129);
    expect(computeSarosSeries('lunar', Date.UTC(2025, 8, 7, 18, 11))).toBe(128);
  });

  it('supports AppState undo stack for time, earth location, and moon location jumps (B3)', async () => {
    const { AppState, DEFAULT_MOON_SITES } = await import('../src/state/AppState');
    const st = new AppState();
    const initialLat = st.get().earthObserver.lat;
    const initialTime = st.get().timeUtc;

    // Simulate user switching to lunar far side first
    st.setMoonLocation(DEFAULT_MOON_SITES[4]); // 嫦娥四号 (far side)
    expect(st.get().moonObserver.lon).toBeCloseTo(177.59, 1);

    st.pushUndoSnapshot('跳转到拉萨');
    st.setEarthLocation({ name: '拉萨', lat: 29.65, lon: 91.11 });
    st.setMoonLocation(DEFAULT_MOON_SITES[1]); // 静海基地 (near side)
    st.update({ timeUtc: Date.UTC(2009, 6, 22, 1, 30), isRealtimeSync: false });

    expect(st.canUndo()).toBe(true);
    expect(st.get().earthObserver.lat).toBeCloseTo(29.65, 2);
    expect(st.get().moonObserver.name).toContain('静海基地');

    const snap = st.undoLastJump();
    expect(snap?.label).toBe('跳转到拉萨');
    expect(st.get().earthObserver.lat).toBeCloseTo(initialLat, 2);
    expect(st.get().moonObserver.lon).toBeCloseTo(177.59, 1);
    expect(st.get().timeUtc).toBe(initialTime);
    expect(st.canUndo()).toBe(false);
  });

  it('Scenario 2 (2009 Wuhan eclipse) starts ~90s before Wuhan U2 (totality begin)', () => {
    const obs = new Astronomy.Observer(30.59, 114.3, 0);
    const local = Astronomy.SearchLocalSolarEclipse(makeAstroTime(Date.UTC(2009, 6, 21)), obs);
    expect(local.total_begin).toBeDefined();
    const u2Ms = local.total_begin!.time.date.getTime();
    const scenarioStartMs = Date.UTC(2009, 6, 22, 1, 22, 26);
    const leadSeconds = (u2Ms - scenarioStartMs) / 1000;
    expect(leadSeconds).toBeGreaterThanOrEqual(85);
    expect(leadSeconds).toBeLessThanOrEqual(95);
  });

  it('computes 5 naked-eye planets with valid scene & horizon positions (C1)', async () => {
    const { computeNakedEyePlanets } = await import('../src/astro/planets');
    const planets = computeNakedEyePlanets(Date.UTC(2026, 0, 15, 14, 0, 0), 39.9, 116.4);
    expect(planets.length).toBe(5);
    for (const p of planets) {
      expect(p.dirSceneThree.length()).toBeCloseTo(1, 3);
      expect(Number.isFinite(p.altitudeDeg)).toBe(true);
      expect(Number.isFinite(p.azimuthDeg)).toBe(true);
    }
  });

  it('computeDailySunMoonEvents searches strictly forward from current utcMs (never jumps backward)', async () => {
    const { computeDailySunMoonEvents } = await import('../src/astro/observer');
    // Test late night 23:30 BJT (15:30 UTC), when today's sunrise and moonrise have already occurred earlier in the day
    const utcMs = Date.UTC(2026, 9, 25, 15, 30, 0);
    const ev = computeDailySunMoonEvents(utcMs, 39.9042, 116.4074, 480, 0);
    expect(ev.sunriseUtc).not.toBeNull();
    expect(ev.moonriseUtc).not.toBeNull();
    expect(ev.sunriseUtc!).toBeGreaterThan(utcMs);
    expect(ev.moonriseUtc!).toBeGreaterThan(utcMs);
  });

  it('computeLunarDetail on Lunar Day 1 before exact syzygy reports the current lunar month full moon', async () => {
    const { computeLunarDetail } = await import('../src/lunar/lunarInfo');
    // 2009-07-22 09:35 BJT (01:35 UTC): 1 hour before New Moon (10:35 BJT), already Lunar 6th Month Day 1 (六月初一)
    const utcMs = Date.UTC(2009, 6, 22, 1, 35, 0);
    const detail = computeLunarDetail(utcMs);
    expect(detail.lunarMonthNameZh).toBe('六月');
    expect(detail.lunarDayNameZh).toBe('初一');
    expect(detail.fullMoonSummaryZh).toContain('8月6日');
    expect(detail.fullMoonSummaryZh).toContain('农历六月十六');
  });

  it('rejects out-of-range URL lat/lon and clamps setEarthLocation so astronomy-engine never throws', async () => {
    const { AppState, parseUrlInitialState } = await import('../src/state/AppState');
    const { computeEarthObserverSky } = await import('../src/astro/observer');

    const st = new AppState();
    const defaultLat = st.get().earthObserver.lat;
    const optsBad = parseUrlInitialState(st, '?lat=91&lon=0&t=999999-01-01');
    expect(optsBad.hasLocation).toBe(false);
    expect(optsBad.hasTime).toBe(false);
    expect(st.get().earthObserver.lat).toBeCloseTo(defaultLat, 2);

    // Empty strings must not be coerced to 0,0
    const optsEmpty = parseUrlInitialState(st, '?lat=&lon=');
    expect(optsEmpty.hasLocation).toBe(false);

    // Direct call to setEarthLocation with out-of-range values is clamped to [-90, 90] and [-180, 180]
    st.setEarthLocation({ lat: 95, lon: -200 });
    expect(st.get().earthObserver.lat).toBe(90);
    expect(st.get().earthObserver.lon).toBe(-180);
    expect(() =>
      computeEarthObserverSky(
        st.get().timeUtc,
        st.get().earthObserver.lat,
        st.get().earthObserver.lon,
        0
      )
    ).not.toThrow();
  });

  it('preserves explicit URL time, location, and view flags when restoring a shared eclipse link', async () => {
    const { AppState, buildShareSearchParams, parseUrlInitialState, escapeHtml } = await import(
      '../src/state/AppState'
    );
    const st = new AppState();
    st.setEarthLocation({ name: '上海外滩', lat: 31.24, lon: 121.49 });
    st.update({
      timeUtc: Date.UTC(2009, 6, 22, 1, 36, 0),
      viewMode: 'space',
      scaleMode: 'realistic',
      selectedEclipseId: 'solar-2009-07-22',
    });

    const query = '?' + buildShareSearchParams(st.get()).toString();
    const stRestored = new AppState();
    const opts = parseUrlInitialState(stRestored, query);
    expect(opts.initialEclipseId).toBe('solar-2009-07-22');
    expect(opts.hasTime).toBe(true);
    expect(opts.hasLocation).toBe(true);
    expect(opts.hasView).toBe(true);
    expect(stRestored.get().earthObserver.name).toBe('上海外滩');
    expect(stRestored.get().earthObserver.lat).toBeCloseTo(31.24, 2);
    expect(stRestored.get().viewMode).toBe('space');
    expect(stRestored.get().scaleMode).toBe('realistic');
    expect(stRestored.get().timeUtc).toBe(Date.UTC(2009, 6, 22, 1, 36, 0));

    // XSS escaping utility check
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('SimulationClock.resetToNow and stepByMs clear active eclipseReplay', async () => {
    const { AppState } = await import('../src/state/AppState');
    const { SimulationClock } = await import('../src/time/Clock');
    const st = new AppState();
    const clock = new SimulationClock(st);

    st.update({
      eclipseReplay: {
        active: true,
        startUtcMs: 1000,
        peakUtcMs: 2000,
        endUtcMs: 3000,
      },
      playing: true,
      speedMultiplier: 120,
      isRealtimeSync: false,
    });
    expect(st.get().eclipseReplay).not.toBeNull();

    clock.resetToNow();
    expect(st.get().eclipseReplay).toBeNull();
    expect(st.get().isRealtimeSync).toBe(true);
    expect(st.get().speedMultiplier).toBe(1);

    st.update({
      eclipseReplay: {
        active: true,
        startUtcMs: 1000,
        peakUtcMs: 2000,
        endUtcMs: 3000,
      },
    });
    clock.stepByMs(60000);
    expect(st.get().eclipseReplay).toBeNull();
  });

  it('lunarToUtcMs rejects non-existent leap months, small-month day 30, and out-of-range years', async () => {
    const { lunarToUtcMs } = await import('../src/lunar/lunarInfo');
    // 2026 has no leap month at all
    expect(lunarToUtcMs(2026, 8, 15, true)).toBeNull();
    // Regular 2026-08-15 is valid (2026-09-25 20:00 BJT = 12:00 UTC)
    expect(lunarToUtcMs(2026, 8, 15, false)).toBe(Date.UTC(2026, 8, 25, 12, 0, 0));
    // 2025 has a leap 6th month (闰六月), not a leap 8th month
    expect(lunarToUtcMs(2025, 6, 15, true)).not.toBeNull();
    expect(lunarToUtcMs(2025, 8, 15, true)).toBeNull();
    // 2026 lunar 2nd month is a 29-day month (小月), so day 30 must return null
    expect(lunarToUtcMs(2026, 2, 30, false)).toBeNull();
    // Year bounds 1901..2099 enforced in lunarToUtcMs
    expect(lunarToUtcMs(1900, 1, 1, false)).toBeNull();
    expect(lunarToUtcMs(2100, 1, 1, false)).toBeNull();
    expect(lunarToUtcMs(1901, 1, 1, false)).not.toBeNull();
    expect(lunarToUtcMs(2099, 12, 1, false)).not.toBeNull();
    // Non-integers rejected
    expect(lunarToUtcMs(2026.5, 8, 15, false)).toBeNull();
  });

  it('isValidCalendarDateTime strictly rejects invalid Gregorian dates such as 2026-02-31', async () => {
    const { isValidCalendarDateTime } = await import('../src/time/tz');
    expect(isValidCalendarDateTime(2026, 2, 31)).toBe(false);
    expect(isValidCalendarDateTime(2026, 2, 29)).toBe(false);
    expect(isValidCalendarDateTime(2024, 2, 29)).toBe(true);
    expect(isValidCalendarDateTime(2026, 4, 31)).toBe(false);
    expect(isValidCalendarDateTime(2026, 13, 1)).toBe(false);
    expect(isValidCalendarDateTime(2026, 10, 25, 24, 0, 0)).toBe(false);
    expect(isValidCalendarDateTime(-708, 7, 17, 7, 30, 0)).toBe(true);
  });

  it('serializes and restores moonObserver location via buildShareSearchParams and parseUrlInitialState', async () => {
    const { AppState, DEFAULT_MOON_SITES, buildShareSearchParams, parseUrlInitialState } =
      await import('../src/state/AppState');
    const st = new AppState();
    // Chang'e-5 sampling site (43.06°N, -51.92°W)
    const change5 = DEFAULT_MOON_SITES[3];
    st.setMoonLocation(change5);
    st.update({ viewMode: 'moon' });

    const query = '?' + buildShareSearchParams(st.get()).toString();
    const restored = new AppState();
    const opts = parseUrlInitialState(restored, query);
    expect(opts.hasMoonLocation).toBe(true);
    expect(restored.get().viewMode).toBe('moon');
    expect(restored.get().moonObserver.name).toBe(change5.name);
    expect(restored.get().moonObserver.lat).toBeCloseTo(change5.lat, 2);
    expect(restored.get().moonObserver.lon).toBeCloseTo(change5.lon, 2);
  });

  it('Timeline solar term (节气) ticks match exact astronomical JieQi timestamps in LunarPanel', async () => {
    const { TimelineBar } = await import('../src/ui/Timeline');
    const { computeLunarDetail } = await import('../src/lunar/lunarInfo');
    const centerUtc = Date.UTC(2026, 2, 1, 4, 0, 0); // 2026-03-01 12:00 BJT
    const ticks = TimelineBar.prototype.computeTicks(centerUtc, 45);
    const jingzhe = ticks.find((t) => t.kind === 'jieQi' && t.label.includes('惊蛰'));
    expect(jingzhe).toBeDefined();
    const detail = computeLunarDetail(centerUtc);
    expect(detail.nextJieQiName).toBe('惊蛰');
    expect(jingzhe!.utcMs).toBe(detail.nextJieQiUtcMs);
    // 2026 Jingzhe is 2026-03-05 21:59:00 BJT (13:59:00 UTC), not 12:00 BJT
    expect(jingzhe!.utcMs).toBe(Date.UTC(2026, 2, 5, 13, 59, 0));

    // Also verify ±180 day span finds multiple solar and lunar eclipses in 2026
    const halfYearTicks = TimelineBar.prototype.computeTicks(Date.UTC(2026, 5, 15), 180);
    const solarEclTicks = halfYearTicks.filter(
      (t) => t.kind === 'eclipse' && t.eclipseKind === 'solar'
    );
    const lunarEclTicks = halfYearTicks.filter(
      (t) => t.kind === 'eclipse' && t.eclipseKind === 'lunar'
    );
    expect(solarEclTicks.length).toBeGreaterThanOrEqual(2);
    expect(lunarEclTicks.length).toBeGreaterThanOrEqual(2);
  });

  it('detects polar night and polar day when sunRiseUtc is null at high latitudes', async () => {
    const { computeRiseSetTimes, computeEarthObserverSky } = await import('../src/astro/observer');
    // Longyearbyen (78.22°N, 15.65°E, UTC+1 = +60m) on 2026-12-21 (Polar Night)
    const winterUtc = Date.UTC(2026, 11, 21, 11, 0, 0);
    const rsWinter = computeRiseSetTimes(winterUtc, 78.22, 15.65, 60, 0);
    expect(rsWinter.sunRiseUtc).toBeNull();
    const skyWinterNoon = computeEarthObserverSky(winterUtc, 78.22, 15.65, 0);
    expect(skyWinterNoon.sun.altitudeDeg).toBeLessThan(-10);

    // Longyearbyen on 2026-06-21 (Polar Day / Midnight Sun)
    const summerUtc = Date.UTC(2026, 5, 21, 11, 0, 0);
    const rsSummer = computeRiseSetTimes(summerUtc, 78.22, 15.65, 60, 0);
    expect(rsSummer.sunRiseUtc).toBeNull();
    const skySummerNoon = computeEarthObserverSky(summerUtc, 78.22, 15.65, 0);
    expect(skySummerNoon.sun.altitudeDeg).toBeGreaterThan(30);
  });

  it('AppState.setTimeUtc clears eclipseReplay on manual time jumps unless keepReplay is true', async () => {
    const { AppState } = await import('../src/state/AppState');
    const st = new AppState();
    st.update({
      eclipseReplay: {
        active: true,
        startUtcMs: 1000,
        peakUtcMs: 2000,
        endUtcMs: 3000,
      },
    });
    // Scrubbing within replay keeps replay state
    st.setTimeUtc(1500, true, true);
    expect(st.get().eclipseReplay).not.toBeNull();
    // Manual jump exits replay state
    st.setTimeUtc(5000, true);
    expect(st.get().eclipseReplay).toBeNull();
  });

  it('enforces unified time range [-1999, 3000] across AppState, SimulationClock, URL parsing, and TimelineBar (MS-01)', async () => {
    const {
      AppState,
      MIN_VALID_UTC_MS,
      MAX_VALID_UTC_MS,
      parseUrlInitialState,
      utcCalendarDateMs,
    } = await import('../src/state/AppState');
    const { SimulationClock } = await import('../src/time/Clock');
    const { computeMoonPhase } = await import('../src/astro/phase');
    const { computeEarthObserverSky } = await import('../src/astro/observer');
    const { TimelineBar } = await import('../src/ui/Timeline');

    // Verify year 0 uses setUTCFullYear(0) -> -62167219200000, not 1900
    expect(new Date(utcCalendarDateMs(0, 0, 1)).getUTCFullYear()).toBe(0);
    expect(new Date(MIN_VALID_UTC_MS).getUTCFullYear()).toBe(-1999);
    expect(new Date(MAX_VALID_UTC_MS).getUTCFullYear()).toBe(3000);

    const boundaryHits: Array<'min' | 'max'> = [];
    const st = new AppState({ timeUtc: Date.UTC(2026, 0, 1) });
    st.onTimeBoundaryReached((b) => boundaryHits.push(b));

    // 1. Non-finite inputs (NaN / ±Infinity) are rejected and keep previous timeUtc without firing boundary callback
    st.setTimeUtc(Number.NaN);
    expect(st.get().timeUtc).toBe(Date.UTC(2026, 0, 1));
    st.update({ timeUtc: Number.POSITIVE_INFINITY });
    expect(st.get().timeUtc).toBe(Date.UTC(2026, 0, 1));
    st.update({ timeUtc: Number.NEGATIVE_INFINITY });
    expect(st.get().timeUtc).toBe(Date.UTC(2026, 0, 1));
    expect(boundaryHits).toEqual([]);

    // 2. Finite out-of-range inputs clamp to MAX_VALID_UTC_MS / MIN_VALID_UTC_MS, pause playback, exit realtime, and fire once
    st.update({ playing: true, isRealtimeSync: true, speedMultiplier: 2548800 });
    st.setTimeUtc(MAX_VALID_UTC_MS + 86_400_000, false);
    expect(st.get().timeUtc).toBe(MAX_VALID_UTC_MS);
    expect(st.get().playing).toBe(false);
    expect(st.get().isRealtimeSync).toBe(false);
    expect(boundaryHits).toEqual(['max']);

    // Repeated hits at same boundary do not spam callback
    st.setTimeUtc(MAX_VALID_UTC_MS + 999_999, false);
    expect(boundaryHits).toEqual(['max']);

    // Re-entering valid interior resets latch, then hitting MIN_VALID_UTC_MS fires 'min'
    st.setTimeUtc(utcCalendarDateMs(0, 0, 1));
    expect(new Date(st.get().timeUtc).getUTCFullYear()).toBe(0);
    st.update({ timeUtc: MIN_VALID_UTC_MS - 86_400_000, playing: true });
    expect(st.get().timeUtc).toBe(MIN_VALID_UTC_MS);
    expect(st.get().playing).toBe(false);
    expect(boundaryHits).toEqual(['max', 'min']);

    // 3. SimulationClock max speed tick near MAX_VALID_UTC_MS clamps safely and pauses
    const clock = new SimulationClock(st);
    st.update({
      timeUtc: MAX_VALID_UTC_MS - 10_000,
      playing: true,
      isRealtimeSync: false,
      speedMultiplier: 2548800,
    });
    clock.tick(1000);
    clock.tick(1016.6); // 16.6ms frame at 2548800x -> ~42.3M ms > 10_000ms remaining
    expect(st.get().timeUtc).toBe(MAX_VALID_UTC_MS);
    expect(st.get().playing).toBe(false);

    // Ephemeris, MoonPhase, Observer, LunarDetail, and TimelineBar all succeed at exact boundaries MIN_VALID_UTC_MS, year 0, October 1582 Gregorian reform gap, and MAX_VALID_UTC_MS
    const { computeLunarDetail } = await import('../src/lunar/lunarInfo');
    for (const boundMs of [
      MIN_VALID_UTC_MS,
      utcCalendarDateMs(0, 0, 1, 12, 0, 0),
      utcCalendarDateMs(1582, 9, 4, 12, 0, 0),
      utcCalendarDateMs(1582, 9, 10, 12, 0, 0),
      utcCalendarDateMs(1582, 9, 15, 12, 0, 0),
      MAX_VALID_UTC_MS,
    ]) {
      expect(() => computeEphemeris(boundMs)).not.toThrow();
      expect(() => computeMoonPhase(boundMs)).not.toThrow();
      expect(() => computeEarthObserverSky(boundMs, 39.9, 116.4, 0)).not.toThrow();
      expect(() => computeLunarDetail(boundMs)).not.toThrow();
      const ticks = TimelineBar.prototype.computeTicks(boundMs, 180);
      const winStart = Math.max(MIN_VALID_UTC_MS, boundMs - 180 * 86400 * 1000);
      const winEnd = Math.min(MAX_VALID_UTC_MS, boundMs + 180 * 86400 * 1000);
      for (const tick of ticks) {
        expect(tick.utcMs).toBeGreaterThanOrEqual(winStart);
        expect(tick.utcMs).toBeLessThanOrEqual(winEnd);
      }
    }

    // 4. URL parser rejects invalid dates, clamps finite years outside [-1999, 3000] to boundaries, and notifies boundary listeners
    const urlBoundaryHits: Array<'min' | 'max'> = [];
    const stUrl = new AppState({ timeUtc: Date.UTC(2026, 5, 1) });
    stUrl.onTimeBoundaryReached((b) => urlBoundaryHits.push(b));
    expect(parseUrlInitialState(stUrl, '?t=not-a-valid-date').hasTime).toBe(false);
    expect(stUrl.get().timeUtc).toBe(Date.UTC(2026, 5, 1));
    expect(parseUrlInitialState(stUrl, '?t=3005-01-01T00:00:00.000Z').hasTime).toBe(true);
    expect(stUrl.get().timeUtc).toBe(MAX_VALID_UTC_MS);
    expect(urlBoundaryHits).toEqual(['max']);
    expect(parseUrlInitialState(stUrl, '?t=-2005-01-01T00:00:00.000Z').hasTime).toBe(true);
    expect(stUrl.get().timeUtc).toBe(MIN_VALID_UTC_MS);
    expect(urlBoundaryHits).toEqual(['max', 'min']);
    expect(parseUrlInitialState(stUrl, '?t=3000-12-31T12:00:00.000Z').hasTime).toBe(true);
    expect(new Date(stUrl.get().timeUtc).getUTCFullYear()).toBe(3000);
  });

  it('FrameRunner catches unexpected frame errors, pauses without retry spam, and recovers via recoverToNow, clock.resetToNow, or explicit user time jump (MS-01)', async () => {
    const { AppState } = await import('../src/state/AppState');
    const { SimulationClock, FrameRunner } = await import('../src/time/Clock');

    const safeInitialMs = Date.UTC(2026, 3, 15, 12, 0, 0);
    const st = new AppState({
      timeUtc: safeInitialMs,
      playing: true,
      isRealtimeSync: false,
      speedMultiplier: 3600,
    });
    const clock = new SimulationClock(st);
    const errorsCaught: unknown[] = [];
    let shouldThrowNextFrame = false;
    let frameCallbackCount = 0;

    const runner = new FrameRunner(
      st,
      clock,
      () => {
        frameCallbackCount++;
        if (shouldThrowNextFrame) {
          st.setTimeUtc(Date.UTC(2029, 0, 1), false);
          throw new Error('simulated WebGL/ephemeris frame crash');
        }
      },
      (err) => errorsCaught.push(err)
    );

    // Frame 1 succeeds and records lastValidTimeUtc
    const r1 = runner.runFrame(1000);
    expect(r1).toBe(true);
    expect(runner.isPausedOnError()).toBe(false);
    expect(frameCallbackCount).toBe(1);

    // Frame 2 mutates timeUtc then throws an unexpected error
    shouldThrowNextFrame = true;
    const r2 = runner.runFrame(1016);
    expect(r2).toBe(false);
    expect(runner.isPausedOnError()).toBe(true);
    expect(runner.getErrorCount()).toBe(1);
    expect(errorsCaught.length).toBe(1);
    expect(st.get().playing).toBe(false);
    expect(st.get().isRealtimeSync).toBe(false);
    // Restored to last valid frame timestamp
    expect(st.get().timeUtc).toBe(runner.getLastValidTimeUtc());

    // Subsequent frames while paused on error skip execution and do not spam error callback
    const r3 = runner.runFrame(1032);
    expect(r3).toBe(false);
    expect(frameCallbackCount).toBe(2);
    expect(errorsCaught.length).toBe(1);

    // Clicking "回到现在" (recoverToNow) clears error lock and resumes normal frames
    shouldThrowNextFrame = false;
    runner.recoverToNow();
    expect(runner.isPausedOnError()).toBe(false);
    expect(st.get().isRealtimeSync).toBe(true);

    const r4 = runner.runFrame(1048);
    expect(r4).toBe(true);
    expect(frameCallbackCount).toBe(3);

    // Another error followed by an explicit user time jump (e.g. TimePanel / Timeline / EclipsePanel) also clears the error lock
    shouldThrowNextFrame = true;
    expect(runner.runFrame(1064)).toBe(false);
    expect(runner.isPausedOnError()).toBe(true);
    shouldThrowNextFrame = false;
    st.setTimeUtc(Date.UTC(2026, 7, 12, 17, 46, 0), true);
    expect(runner.isPausedOnError()).toBe(false);
    expect(runner.runFrame(1080)).toBe(true);
  });

  it('caches synodic month phase milestones in computeMoonPhase with 100% numerical fidelity across all playback modes (MS-06)', async () => {
    const {
      computeMoonPhase,
      computeMoonPhaseUncached,
      getMoonPhaseCacheStats,
      resetMoonPhaseCache,
    } = await import('../src/astro/phase');

    resetMoonPhaseCache();
    expect(getMoonPhaseCacheStats()).toEqual({
      hits: 0,
      misses: 0,
      searchCalls: 0,
      cachedCycles: 0,
    });

    const expectPhaseMatch = (a: ReturnType<typeof computeMoonPhase>, b: ReturnType<typeof computeMoonPhase>) => {
      expect(a.phaseAngleDeg).toBeCloseTo(b.phaseAngleDeg, 12);
      expect(a.illuminatedFraction).toBeCloseTo(b.illuminatedFraction, 12);
      expect(a.lunarAgeDays).toBe(b.lunarAgeDays);
      expect(a.phaseNameZh).toBe(b.phaseNameZh);
      expect(a.phaseAliasZh).toBe(b.phaseAliasZh);
      expect(a.prevNewMoonUtc).toBe(b.prevNewMoonUtc);
      expect(a.nextNewMoonUtc).toBe(b.nextNewMoonUtc);
      expect(a.firstQuarterUtc).toBe(b.firstQuarterUtc);
      expect(a.fullMoonUtc).toBe(b.fullMoonUtc);
      expect(a.thirdQuarterUtc).toBe(b.thirdQuarterUtc);
    };

    // 1. Normal playback (120 frames advancing 1 second per frame inside 2026-10 synodic month)
    const startUtc = Date.UTC(2026, 9, 20, 0, 0, 0);
    for (let i = 0; i < 120; i++) {
      const t = startUtc + i * 1000;
      const cached = computeMoonPhase(t);
      const uncached = computeMoonPhaseUncached(t);
      expectPhaseMatch(cached, uncached);
    }
    const statsAfterNormal = getMoonPhaseCacheStats();
    expect(statsAfterNormal.misses).toBe(1);
    expect(statsAfterNormal.hits).toBe(119);
    expect(statsAfterNormal.searchCalls).toBe(5);

    // 2. Paused state (repeated calls at the exact same timestamp)
    for (let i = 0; i < 30; i++) {
      expectPhaseMatch(computeMoonPhase(startUtc), computeMoonPhaseUncached(startUtc));
    }
    expect(getMoonPhaseCacheStats().misses).toBe(1);
    expect(getMoonPhaseCacheStats().hits).toBe(149);
    expect(getMoonPhaseCacheStats().searchCalls).toBe(5);

    // 3. Crossing New Moon forward and reverse
    const initialSnap = computeMoonPhase(startUtc);
    const nextNewMoon = initialSnap.nextNewMoonUtc;
    const beforeNewMoon = computeMoonPhase(nextNewMoon - 30_000);
    expectPhaseMatch(beforeNewMoon, computeMoonPhaseUncached(nextNewMoon - 30_000));
    expect(getMoonPhaseCacheStats().misses).toBe(1);

    // Step across nextNewMoonUtc -> triggers(1) cache miss for the new synodic cycle
    const afterNewMoon = computeMoonPhase(nextNewMoon + 30_000);
    expectPhaseMatch(afterNewMoon, computeMoonPhaseUncached(nextNewMoon + 30_000));
    expect(getMoonPhaseCacheStats().misses).toBe(2);
    expect(afterNewMoon.prevNewMoonUtc).toBe(nextNewMoon);

    // Step backward across nextNewMoonUtc into the cached cycle -> hits LRU cycle cache!
    const reverseIntoCachedCycle = computeMoonPhase(nextNewMoon - 10_000);
    expectPhaseMatch(reverseIntoCachedCycle, computeMoonPhaseUncached(nextNewMoon - 10_000));
    expect(getMoonPhaseCacheStats().misses).toBe(2);

    // Step backward across initialSnap.prevNewMoonUtc into an earlier unvisited synodic cycle -> cache miss (misses = 3)
    const prevNewMoon = initialSnap.prevNewMoonUtc;
    const reverseBeforePrevNewMoon = computeMoonPhase(prevNewMoon - 10_000);
    expectPhaseMatch(reverseBeforePrevNewMoon, computeMoonPhaseUncached(prevNewMoon - 10_000));
    expect(getMoonPhaseCacheStats().misses).toBe(3);
    expect(reverseBeforePrevNewMoon.nextNewMoonUtc).toBe(prevNewMoon);

    // 4. Max speed & multi-century jumps match computeMoonPhaseUncached identically
    const centurySamples = [
      Date.UTC(-708, 6, 17, 7, 0, 0),
      Date.UTC(2009, 6, 22, 2, 35, 0),
      Date.UTC(2025, 8, 7, 18, 11, 0),
      Date.UTC(2999, 5, 15, 0, 0, 0),
    ];
    for (const t of centurySamples) {
      expectPhaseMatch(computeMoonPhase(t), computeMoonPhaseUncached(t));
    }
  });
});

