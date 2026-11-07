import { describe, expect, it } from 'vitest';
import { computeEphemeris } from '../src/astro/ephemeris';
import {
  computeEarthOrientation,
  latLonToSceneDir,
  scenePointToLatLon,
} from '../src/astro/earthOrientation';
import { computeMoonOrientation } from '../src/astro/moonOrientation';

describe('Ephemeris & Orientation Matrices', () => {
  it('computes realistic Sun and Moon distances at 2026-06-21', () => {
    const utc = Date.UTC(2026, 5, 21, 12, 0, 0);
    const eph = computeEphemeris(utc);

    // Sun distance in June (~1.016 AU = ~152M km)
    expect(eph.sunDistanceKm).toBeGreaterThan(151_000_000);
    expect(eph.sunDistanceKm).toBeLessThan(153_000_000);

    // Moon distance (356,000 .. 407,000 km)
    expect(eph.moonDistanceKm).toBeGreaterThan(355_000);
    expect(eph.moonDistanceKm).toBeLessThan(408_000);
  });

  it('round-trips Beijing (lat, lon) through Earth orientation matrix cleanly', () => {
    const utc = Date.UTC(2026, 9, 25, 12, 0, 0);
    const ori = computeEarthOrientation(utc);
    const lat = 39.9042;
    const lon = 116.4074;

    const dirScene = latLonToSceneDir(lat, lon, ori);
    const recovered = scenePointToLatLon(dirScene, ori);

    expect(recovered.lat).toBeCloseTo(lat, 5);
    expect(recovered.lon).toBeCloseTo(lon, 5);
  });

  it('keeps Moon near-side prime meridian (0,0) facing generally toward Earth', () => {
    const utc = Date.UTC(2026, 3, 15, 0, 0, 0);
    const eph = computeEphemeris(utc);
    const moonOri = computeMoonOrientation(utc);

    // Selenographic +X (0 deg lon, 0 deg lat) in Ecliptic
    const primeMeridianEcl = moonOri.selenoToEcl({ x: 1, y: 0, z: 0 });
    // Direction from Moon to Earth in Ecliptic
    const toEarthLen = Math.hypot(eph.moonEclKm.x, eph.moonEclKm.y, eph.moonEclKm.z);
    const toEarthUnit = {
      x: -eph.moonEclKm.x / toEarthLen,
      y: -eph.moonEclKm.y / toEarthLen,
      z: -eph.moonEclKm.z / toEarthLen,
    };

    const dot =
      primeMeridianEcl.x * toEarthUnit.x +
      primeMeridianEcl.y * toEarthUnit.y +
      primeMeridianEcl.z * toEarthUnit.z;
    // Libration is within ~10 degrees, so cos(angle) > 0.97
    expect(dot).toBeGreaterThan(0.97);
  });
});
