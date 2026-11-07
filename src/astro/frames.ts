import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { DEG2RAD, RAD2DEG, astroToThreeVec, threeToAstroVec } from '../utils/math';
import { Vec3Astro } from './ephemeris';

const rotEqjToEcl = Astronomy.Rotation_EQJ_ECL();
const rotEclToEqj = Astronomy.Rotation_ECL_EQJ();

/**
 * Convert an astronomy-engine RotationMatrix into a Three.js Matrix4 in our scene coordinates.
 * Given v_astro_out = R_astro * v_astro_in,
 * in astronomy-engine: RotateVector(R, v) computes:
 * out.x = R.rot[0][0]*v.x + R.rot[1][0]*v.y + R.rot[2][0]*v.z
 * out.y = R.rot[0][1]*v.x + R.rot[1][1]*v.y + R.rot[2][1]*v.z
 * out.z = R.rot[0][2]*v.x + R.rot[1][2]*v.y + R.rot[2][2]*v.z
 * Notice R.rot[row][col] in astronomy-engine acts as row=input, col=output!
 * Let's always test using RotateVector on the 3 basis vectors so there is zero ambiguity.
 */
export function astroBasisToThreeMatrix4(
  exAstro: Vec3Astro,
  eyAstro: Vec3Astro,
  ezAstro: Vec3Astro
): THREE.Matrix4 {
  // Input local Three basis:
  // e1_three = (1,0,0) -> astro (1,0,0) -> image is exAstro -> in Three: astroToThreeVec(exAstro)
  // e2_three = (0,1,0) -> astro (0,0,1) -> image is ezAstro -> in Three: astroToThreeVec(ezAstro)
  // e3_three = (0,0,1) -> astro (0,-1,0) -> image is -eyAstro -> in Three: -astroToThreeVec(eyAstro)
  const c1 = astroToThreeVec(exAstro.x, exAstro.y, exAstro.z);
  const c2 = astroToThreeVec(ezAstro.x, ezAstro.y, ezAstro.z);
  const c3 = astroToThreeVec(-eyAstro.x, -eyAstro.y, -eyAstro.z);

  const m = new THREE.Matrix4();
  m.makeBasis(c1, c2, c3);
  return m;
}

export function eqjToEcl(v: Vec3Astro, t?: Astronomy.AstroTime): Vec3Astro {
  const vec = new Astronomy.Vector(
    v.x,
    v.y,
    v.z,
    t ?? Astronomy.MakeTime(new Date())
  );
  const r = Astronomy.RotateVector(rotEqjToEcl, vec);
  return { x: r.x, y: r.y, z: r.z };
}

export function eclToEqj(v: Vec3Astro, t?: Astronomy.AstroTime): Vec3Astro {
  const vec = new Astronomy.Vector(
    v.x,
    v.y,
    v.z,
    t ?? Astronomy.MakeTime(new Date())
  );
  const r = Astronomy.RotateVector(rotEclToEqj, vec);
  return { x: r.x, y: r.y, z: r.z };
}

/**
 * Convert Geodetic (latDeg, lonDeg) on a sphere/ellipsoid to unit ECEF vector.
 */
export function latLonToEcefUnit(latDeg: number, lonDeg: number): Vec3Astro {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return {
    x: cosLat * Math.cos(lon),
    y: cosLat * Math.sin(lon),
    z: Math.sin(lat),
  };
}

/**
 * Convert ECEF vector to (latDeg, lonDeg) on a sphere.
 */
export function ecefToLatLon(v: Vec3Astro): { lat: number; lon: number } {
  const r = Math.hypot(v.x, v.y, v.z);
  if (r === 0) return { lat: 0, lon: 0 };
  const lat = Math.asin(Math.max(-1, Math.min(1, v.z / r))) * RAD2DEG;
  const lon = Math.atan2(v.y, v.x) * RAD2DEG;
  return { lat, lon };
}

export { threeToAstroVec, astroToThreeVec };
