import * as THREE from 'three';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const AU_KM = 149597870.7;
export const EARTH_RADIUS_EQ_KM = 6378.137;
export const EARTH_RADIUS_POLAR_KM = 6356.7523;
export const EARTH_FLATTENING = (EARTH_RADIUS_EQ_KM - EARTH_RADIUS_POLAR_KM) / EARTH_RADIUS_EQ_KM;
export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS_KM = 695700.0;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function wrapDeg360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function wrapDeg180(deg: number): number {
  const d = wrapDeg360(deg + 180);
  return d - 180;
}

/**
 * Compute fraction of a circle of angular radius r1 overlapped by a circle of angular radius r2
 * separated by angular distance d (all in radians or same linear units).
 * Returns area overlap fraction of circle 1 (0..1), and linear eclipse magnitude.
 */
export function circleOverlap(r1: number, r2: number, d: number): {
  areaFraction: number;
  magnitude: number;
  isTotal: boolean;
  isAnnular: boolean;
  isPartial: boolean;
} {
  if (r1 <= 0) {
    return { areaFraction: 0, magnitude: 0, isTotal: false, isAnnular: false, isPartial: false };
  }
  if (d >= r1 + r2) {
    return { areaFraction: 0, magnitude: 0, isTotal: false, isAnnular: false, isPartial: false };
  }
  const magnitude = (r1 + r2 - d) / (2 * r1);
  if (d <= Math.abs(r2 - r1)) {
    if (r2 >= r1) {
      return {
        areaFraction: 1.0,
        magnitude,
        isTotal: true,
        isAnnular: false,
        isPartial: false,
      };
    } else {
      const areaFraction = (r2 * r2) / (r1 * r1);
      return {
        areaFraction,
        magnitude,
        isTotal: false,
        isAnnular: true,
        isPartial: false,
      };
    }
  }
  const cosAlpha = clamp((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d), -1, 1);
  const cosBeta = clamp((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d), -1, 1);
  const alpha = Math.acos(cosAlpha);
  const beta = Math.acos(cosBeta);
  const s = 0.5 * (r1 + r2 + d);
  const triangleArea2 = 2 * Math.sqrt(Math.max(0, s * (s - r1) * (s - r2) * (s - d)));
  const intersectionArea = r1 * r1 * alpha + r2 * r2 * beta - triangleArea2;
  const area1 = Math.PI * r1 * r1;
  return {
    areaFraction: clamp(intersectionArea / area1, 0, 1),
    magnitude,
    isTotal: false,
    isAnnular: false,
    isPartial: true,
  };
}

/**
 * Convert Astronomical Vector (X, Y, Z in Ecliptic where +X=Vernal Equinox, +Y=90deg Ecliptic Lon, +Z=North Ecliptic Pole)
 * to Three.js scene coordinates where XZ is horizontal plane (+X = Vernal Equinox, +Y = North Ecliptic Pole, -Z = +Y_astro)
 * Note: To preserve right-handedness:
 * Astro: X_a, Y_a, Z_a (Right-handed: X_a x Y_a = Z_a)
 * Three: X_t = X_a, Y_t = Z_a, Z_t = -Y_a
 * Check: X_t x Y_t = (1,0,0) x (0,1,0) = (0,0,1) = Z_t. And in Astro: X_a x Z_a = -Y_a. Right-handed!
 */
export function astroToThreeVec(x: number, y: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(x, z, -y);
}

export function threeToAstroVec(v: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: -v.z, z: v.y };
}
