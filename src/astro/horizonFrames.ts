import * as THREE from 'three';
import { DEG2RAD, threeToAstroVec } from '../utils/math';
import { EarthOrientation } from './earthOrientation';
import { MoonOrientation } from './moonOrientation';
import { Vec3Astro } from './ephemeris';

/**
 * Local horizon frame used by GroundView / MoonSurfaceView (Three.js convention):
 *   +X = East, +Y = Up (zenith), -Z = North   (so azimuth 0 = North, 90 = East)
 * This matches `altAzToHorizVec()`.
 *
 * The functions below build the rotation that maps vectors expressed in scene
 * (J2000 ecliptic, Three.js axes) coordinates into that local horizon frame.
 * Using one exact rotation for positions, body orientation and lighting keeps the
 * Moon's phase, bright-limb tilt, libration and eclipse shading mutually consistent.
 */
function buildHorizonMatrix(
  toBodyFixed: (v: Vec3Astro) => Vec3Astro,
  latDeg: number,
  lonDeg: number
): THREE.Matrix4 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const up = { x: Math.cos(lat) * Math.cos(lon), y: Math.cos(lat) * Math.sin(lon), z: Math.sin(lat) };
  const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
  const north = {
    x: -Math.sin(lat) * Math.cos(lon),
    y: -Math.sin(lat) * Math.sin(lon),
    z: Math.cos(lat),
  };
  const dot = (a: Vec3Astro, b: Vec3Astro) => a.x * b.x + a.y * b.y + a.z * b.z;

  const mapThree = (vThree: THREE.Vector3): THREE.Vector3 => {
    const f = toBodyFixed(threeToAstroVec(vThree));
    return new THREE.Vector3(dot(f, east), dot(f, up), -dot(f, north));
  };

  return new THREE.Matrix4().makeBasis(
    mapThree(new THREE.Vector3(1, 0, 0)),
    mapThree(new THREE.Vector3(0, 1, 0)),
    mapThree(new THREE.Vector3(0, 0, 1))
  );
}

/** Scene (ecliptic) -> Earth observer's local horizon frame (geodetic lat/lon). */
export function sceneToEarthHorizonMatrix(
  earthOri: EarthOrientation,
  latDeg: number,
  lonDeg: number
): THREE.Matrix4 {
  return buildHorizonMatrix((v) => earthOri.eclToEcef(v), latDeg, lonDeg);
}

/** Scene (ecliptic) -> Moon-surface observer's local horizon frame (selenographic lat/lon). */
export function sceneToMoonHorizonMatrix(
  moonOri: MoonOrientation,
  latDeg: number,
  lonDeg: number
): THREE.Matrix4 {
  return buildHorizonMatrix((v) => moonOri.eclToSeleno(v), latDeg, lonDeg);
}
