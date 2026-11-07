import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import {
  DEG2RAD,
  EARTH_RADIUS_EQ_KM,
  EARTH_RADIUS_POLAR_KM,
  astroToThreeVec,
  threeToAstroVec,
} from '../utils/math';
import { Vec3Astro, makeAstroTime } from './ephemeris';
import { astroBasisToThreeMatrix4, ecefToLatLon, latLonToEcefUnit } from './frames';

const rotEqjToEcl = Astronomy.Rotation_EQJ_ECL();
const rotEclToEqj = Astronomy.Rotation_ECL_EQJ();

export interface EarthOrientation {
  /** GAST in hours (0..24) */
  gastHours: number;
  /** GAST in radians */
  gastRad: number;
  /** Matrix4 transforming local Earth mesh (ECEF in Three coords) to Scene (J2000 Ecliptic in Three coords) */
  matrixThree: THREE.Matrix4;
  /** Inverse Matrix4 transforming Scene (Ecliptic Three coords) to local Earth mesh (ECEF Three coords) */
  inverseMatrixThree: THREE.Matrix4;
  /** Convert an ECEF vector (km or unit) to Ecliptic J2000 vector */
  ecefToEcl: (vEcef: Vec3Astro) => Vec3Astro;
  /** Convert an Ecliptic J2000 vector to ECEF vector */
  eclToEcef: (vEcl: Vec3Astro) => Vec3Astro;
}

/**
 * Compute full Earth orientation at utcMs:
 * ECEF --(GAST around Z)--> EQD (True Equator & Equinox of Date) --(Precession/Nutation)--> EQJ --(Obliquity J2000)--> ECL (J2000 Ecliptic).
 */
export function computeEarthOrientation(utcMs: number): EarthOrientation {
  const t = makeAstroTime(utcMs);
  const gastHours = Astronomy.SiderealTime(t); // Greenwich Apparent Sidereal Time in hours [0, 24)
  const gastRad = (gastHours * 15) * DEG2RAD;
  const cosG = Math.cos(gastRad);
  const sinG = Math.sin(gastRad);

  const rotEqdToEqj = Astronomy.Rotation_EQD_EQJ(t);
  const rotEqdToEcl = Astronomy.CombineRotation(rotEqdToEqj, rotEqjToEcl);
  const rotEclToEqd = Astronomy.CombineRotation(rotEclToEqj, Astronomy.Rotation_EQJ_EQD(t));

  const ecefToEcl = (vEcef: Vec3Astro): Vec3Astro => {
    // Rotate ECEF by +gastRad around +Z to get EQD
    const eqd = new Astronomy.Vector(
      cosG * vEcef.x - sinG * vEcef.y,
      sinG * vEcef.x + cosG * vEcef.y,
      vEcef.z,
      t
    );
    const ecl = Astronomy.RotateVector(rotEqdToEcl, eqd);
    return { x: ecl.x, y: ecl.y, z: ecl.z };
  };

  const eclToEcef = (vEcl: Vec3Astro): Vec3Astro => {
    const vecEcl = new Astronomy.Vector(vEcl.x, vEcl.y, vEcl.z, t);
    const eqd = Astronomy.RotateVector(rotEclToEqd, vecEcl);
    // Rotate EQD by -gastRad around +Z to get ECEF
    return {
      x: cosG * eqd.x + sinG * eqd.y,
      y: -sinG * eqd.x + cosG * eqd.y,
      z: eqd.z,
    };
  };

  const exEcl = ecefToEcl({ x: 1, y: 0, z: 0 });
  const eyEcl = ecefToEcl({ x: 0, y: 1, z: 0 });
  const ezEcl = ecefToEcl({ x: 0, y: 0, z: 1 });

  const matrixThree = astroBasisToThreeMatrix4(exEcl, eyEcl, ezEcl);
  const inverseMatrixThree = matrixThree.clone().invert();

  return {
    gastHours,
    gastRad,
    matrixThree,
    inverseMatrixThree,
    ecefToEcl,
    eclToEcef,
  };
}

/**
 * Convert geodetic (lat, lon, elevationMeters) to WGS-84 ECEF position in km.
 */
export function geodeticToEcefKm(latDeg: number, lonDeg: number, elevationMeters = 0): Vec3Astro {
  const a = EARTH_RADIUS_EQ_KM;
  const b = EARTH_RADIUS_POLAR_KM;
  const e2 = 1 - (b * b) / (a * a);
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const altKm = elevationMeters / 1000;
  return {
    x: (N + altKm) * cosLat * Math.cos(lon),
    y: (N + altKm) * cosLat * Math.sin(lon),
    z: (N * (1 - e2) + altKm) * sinLat,
  };
}

/**
 * Convert a scene-space point on the Earth sphere (or direction from Earth center) to geodetic (lat, lon).
 */
export function scenePointToLatLon(
  dirOrPointScene: THREE.Vector3,
  orientation: EarthOrientation
): { lat: number; lon: number } {
  const localThree = dirOrPointScene.clone().applyMatrix4(orientation.inverseMatrixThree).normalize();
  const ecef = threeToAstroVec(localThree);
  return ecefToLatLon(ecef);
}

/**
 * Convert (lat, lon) on a unit sphere to scene-space unit direction vector.
 */
export function latLonToSceneDir(
  latDeg: number,
  lonDeg: number,
  orientation: EarthOrientation
): THREE.Vector3 {
  const ecef = latLonToEcefUnit(latDeg, lonDeg);
  const ecl = orientation.ecefToEcl(ecef);
  return astroToThreeVec(ecl.x, ecl.y, ecl.z).normalize();
}
