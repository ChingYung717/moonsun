import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import {
  AU_KM,
  EARTH_RADIUS_EQ_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  astroToThreeVec,
} from '../utils/math';

export interface Vec3Astro {
  x: number;
  y: number;
  z: number;
}

export interface EphemerisSnapshot {
  utcMs: number;
  astroTime: Astronomy.AstroTime;
  /** Geocentric Sun vector in J2000 Ecliptic (ECL), in km */
  sunEclKm: Vec3Astro;
  /** Geocentric Moon vector in J2000 Ecliptic (ECL), in km */
  moonEclKm: Vec3Astro;
  /** Geocentric Sun vector in J2000 Equatorial (EQJ), in AU */
  sunEqjAu: Vec3Astro;
  /** Geocentric Moon vector in J2000 Equatorial (EQJ), in AU */
  moonEqjAu: Vec3Astro;
  /** Sun distance from Earth center in km */
  sunDistanceKm: number;
  /** Moon distance from Earth center in km */
  moonDistanceKm: number;
  /** Sun angular radius from Earth center in radians */
  sunAngularRadiusRad: number;
  /** Moon angular radius from Earth center in radians */
  moonAngularRadiusRad: number;
  /** Three.js unit direction toward Sun in scene (Ecliptic) coords */
  sunDirThree: THREE.Vector3;
  /** Three.js unit direction toward Moon in scene (Ecliptic) coords */
  moonDirThree: THREE.Vector3;
}

const rotEqjToEcl = Astronomy.Rotation_EQJ_ECL();

export function makeAstroTime(utcMs: number): Astronomy.AstroTime {
  return Astronomy.MakeTime(new Date(utcMs));
}

export function computeEphemeris(utcMs: number): EphemerisSnapshot {
  const t = makeAstroTime(utcMs);

  // Geocentric vectors in J2000 Equatorial (AU), with aberration correction for apparent Sun
  const sunVecEqj = Astronomy.GeoVector(Astronomy.Body.Sun, t, true);
  const moonVecEqj = Astronomy.GeoMoon(t);

  // Rotate to J2000 Ecliptic (ECL)
  const sunVecEcl = Astronomy.RotateVector(rotEqjToEcl, sunVecEqj);
  const moonVecEcl = Astronomy.RotateVector(rotEqjToEcl, moonVecEqj);

  const sunEclKm: Vec3Astro = {
    x: sunVecEcl.x * AU_KM,
    y: sunVecEcl.y * AU_KM,
    z: sunVecEcl.z * AU_KM,
  };
  const moonEclKm: Vec3Astro = {
    x: moonVecEcl.x * AU_KM,
    y: moonVecEcl.y * AU_KM,
    z: moonVecEcl.z * AU_KM,
  };

  const sunDistanceKm = Math.hypot(sunEclKm.x, sunEclKm.y, sunEclKm.z);
  const moonDistanceKm = Math.hypot(moonEclKm.x, moonEclKm.y, moonEclKm.z);

  const sunAngularRadiusRad = Math.asin(SUN_RADIUS_KM / sunDistanceKm);
  const moonAngularRadiusRad = Math.asin(MOON_RADIUS_KM / moonDistanceKm);

  const sunDirThree = astroToThreeVec(sunEclKm.x, sunEclKm.y, sunEclKm.z).normalize();
  const moonDirThree = astroToThreeVec(moonEclKm.x, moonEclKm.y, moonEclKm.z).normalize();

  return {
    utcMs,
    astroTime: t,
    sunEclKm,
    moonEclKm,
    sunEqjAu: { x: sunVecEqj.x, y: sunVecEqj.y, z: sunVecEqj.z },
    moonEqjAu: { x: moonVecEqj.x, y: moonVecEqj.y, z: moonVecEqj.z },
    sunDistanceKm,
    moonDistanceKm,
    sunAngularRadiusRad,
    moonAngularRadiusRad,
    sunDirThree,
    moonDirThree,
  };
}

/**
 * Sample Moon geocentric Ecliptic positions (in km) around utcMs for orbit line rendering.
 */
export function sampleMoonOrbitEclKm(
  centerUtcMs: number,
  daysSpan = 27.32166,
  steps = 180
): Vec3Astro[] {
  const halfMs = (daysSpan * 86400 * 1000) / 2;
  const startMs = centerUtcMs - halfMs;
  const stepMs = (daysSpan * 86400 * 1000) / steps;
  const pts: Vec3Astro[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = makeAstroTime(startMs + i * stepMs);
    const mEqj = Astronomy.GeoMoon(t);
    const mEcl = Astronomy.RotateVector(rotEqjToEcl, mEqj);
    pts.push({
      x: mEcl.x * AU_KM,
      y: mEcl.y * AU_KM,
      z: mEcl.z * AU_KM,
    });
  }
  return pts;
}

export { EARTH_RADIUS_EQ_KM, MOON_RADIUS_KM, SUN_RADIUS_KM };
