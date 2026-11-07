import { describe, expect, it } from 'vitest';
import {
  computeEarthObserverSky,
  computeMoonSurfaceSky,
  computeRiseSetTimes,
} from '../src/astro/observer';
import { computeEphemeris } from '../src/astro/ephemeris';
import { utcToLocalParts } from '../src/time/tz';

describe('Observer Sky (Earth & Moon) and Historical Timezones', () => {
  it('places Sun near South (azimuth ~180°) at Beijing local solar noon on Summer Solstice 2026-06-21', () => {
    // Beijing is 116.4074°E -> local solar noon is around 12:14 UTC+8 = 04:14 UTC
    const utc = Date.UTC(2026, 5, 21, 4, 14, 0);
    const sky = computeEarthObserverSky(utc, 39.9042, 116.4074, 50);

    expect(sky.sun.altitudeDeg).toBeGreaterThan(72);
    expect(sky.sun.altitudeDeg).toBeLessThan(75);
    expect(Math.abs(sky.sun.azimuthDeg - 180)).toBeLessThan(3);
  });

  it('computes Beijing sunrise and sunset on 2026-06-21 accurately', () => {
    const utc = Date.UTC(2026, 5, 21, 4, 0, 0);
    const rs = computeRiseSetTimes(utc, 39.9042, 116.4074, 480, 50);
    expect(rs.sunRiseUtc).not.toBeNull();
    expect(rs.sunSetUtc).not.toBeNull();

    const riseBj = utcToLocalParts(rs.sunRiseUtc!, 'Asia/Shanghai');
    const setBj = utcToLocalParts(rs.sunSetUtc!, 'Asia/Shanghai');

    // Beijing summer solstice sunrise ~04:45, sunset ~19:47
    expect(riseBj.hour).toBe(4);
    expect(riseBj.minute).toBeGreaterThanOrEqual(42);
    expect(riseBj.minute).toBeLessThanOrEqual(49);

    expect(setBj.hour).toBe(19);
    expect(setBj.minute).toBeGreaterThanOrEqual(43);
    expect(setBj.minute).toBeLessThanOrEqual(50);
  });

  it('sees a Total Solar Eclipse by Earth from the Moon during the 2018-07-27 Total Lunar Eclipse', () => {
    const peakUtc = Date.UTC(2018, 6, 27, 20, 21, 44);
    const eph = computeEphemeris(peakUtc);
    const moonSky = computeMoonSurfaceSky(peakUtc, 0, 0, eph.sunEclKm, eph.moonEclKm);

    // At selenographic (0,0) (center of near side), Earth is near the zenith!
    expect(moonSky.earthAltitudeDeg).toBeGreaterThan(80);
    // And the Sun is totally eclipsed by the Earth!
    expect(moonSky.solarEclipseByEarth.isTotal).toBe(true);
    expect(moonSky.solarEclipseByEarth.areaFraction).toBe(1.0);
  });

  it('correctly handles China historical Daylight Saving Time in 1988-07-01 (UTC+9)', () => {
    const utc = Date.UTC(1988, 6, 1, 0, 0, 0);
    const parts = utcToLocalParts(utc, 'Asia/Shanghai');
    expect(parts.offsetMinutes).toBe(540); // 9 hours = 540 minutes
    expect(parts.offsetLabel).toBe('UTC+9');
  });
});
