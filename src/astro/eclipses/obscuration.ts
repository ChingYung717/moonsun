import {
  EARTH_RADIUS_EQ_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  circleOverlap,
} from '../../utils/math';
import { Vec3Astro } from '../ephemeris';

export interface LunarShadowState {
  /** Is any part of the Moon in Earth's umbra or penumbra? */
  inShadow: boolean;
  /** Umbral magnitude (>1 for total, 0..1 for partial, <0 for penumbral) */
  umbralMagnitude: number;
  /** Penumbral magnitude (>0 when in penumbra) */
  penumbralMagnitude: number;
  /** Distance from Moon center to Earth shadow axis in km */
  axisDistanceKm: number;
  /** Earth's umbral cone radius at Moon's distance in km (including 2% Danjon atmospheric enlargement) */
  umbraRadiusKm: number;
  /** Earth's penumbral cone radius at Moon's distance in km */
  penumbraRadiusKm: number;
  /** Shadow axis unit vector (from Earth center away from Sun) in Ecliptic */
  axisUnitEcl: Vec3Astro;
}

/**
 * Compute Earth's shadow cone parameters at the Moon's distance.
 * Uses the standard Danjon 1.01~1.02 enlargement factor for Earth's atmosphere.
 */
export function computeLunarEclipseShadow(
  sunEclKm: Vec3Astro,
  moonEclKm: Vec3Astro
): LunarShadowState {
  const dSun = Math.hypot(sunEclKm.x, sunEclKm.y, sunEclKm.z);
  const dMoon = Math.hypot(moonEclKm.x, moonEclKm.y, moonEclKm.z);

  // Unit vector pointing from Sun to Earth (anti-solar direction)
  const axisUnitEcl: Vec3Astro = {
    x: -sunEclKm.x / dSun,
    y: -sunEclKm.y / dSun,
    z: -sunEclKm.z / dSun,
  };

  // Projection of Moon position along the anti-solar shadow axis
  const projKm =
    moonEclKm.x * axisUnitEcl.x +
    moonEclKm.y * axisUnitEcl.y +
    moonEclKm.z * axisUnitEcl.z;

  if (projKm <= 0) {
    // Moon is on the Sunward side of Earth
    return {
      inShadow: false,
      umbralMagnitude: -10,
      penumbralMagnitude: -10,
      axisDistanceKm: dMoon,
      umbraRadiusKm: 0,
      penumbraRadiusKm: 0,
      axisUnitEcl,
    };
  }

  // Perpendicular distance from Moon center to shadow axis
  const perpX = moonEclKm.x - projKm * axisUnitEcl.x;
  const perpY = moonEclKm.y - projKm * axisUnitEcl.y;
  const perpZ = moonEclKm.z - projKm * axisUnitEcl.z;
  const axisDistanceKm = Math.hypot(perpX, perpY, perpZ);

  // Effective Earth radius including atmospheric shadow enlargement (~1.5%)
  const rEarthEff = EARTH_RADIUS_EQ_KM * 1.015;

  // Umbra and penumbra radii at distance projKm behind Earth
  const umbraRadiusKm = Math.max(
    0,
    rEarthEff - (projKm * (SUN_RADIUS_KM - rEarthEff)) / dSun
  );
  const penumbraRadiusKm =
    rEarthEff + (projKm * (SUN_RADIUS_KM + rEarthEff)) / dSun;

  const umbralMagnitude =
    (umbraRadiusKm + MOON_RADIUS_KM - axisDistanceKm) / (2 * MOON_RADIUS_KM);
  const penumbralMagnitude =
    (penumbraRadiusKm + MOON_RADIUS_KM - axisDistanceKm) / (2 * MOON_RADIUS_KM);

  return {
    inShadow: penumbralMagnitude > 0,
    umbralMagnitude,
    penumbralMagnitude,
    axisDistanceKm,
    umbraRadiusKm,
    penumbraRadiusKm,
    axisUnitEcl,
  };
}

/**
 * Compute solar eclipse obscuration at a 3D point P (in Geocentric Ecliptic km).
 */
export function computeSolarObscurationAtPoint(
  pointEclKm: Vec3Astro,
  sunEclKm: Vec3Astro,
  moonEclKm: Vec3Astro
) {
  const sx = sunEclKm.x - pointEclKm.x;
  const sy = sunEclKm.y - pointEclKm.y;
  const sz = sunEclKm.z - pointEclKm.z;
  const mx = moonEclKm.x - pointEclKm.x;
  const my = moonEclKm.y - pointEclKm.y;
  const mz = moonEclKm.z - pointEclKm.z;

  const ds = Math.hypot(sx, sy, sz);
  const dm = Math.hypot(mx, my, mz);

  const rSun = Math.asin(SUN_RADIUS_KM / ds);
  const rMoon = Math.asin(MOON_RADIUS_KM / dm);
  const cosD = Math.max(-1, Math.min(1, (sx * mx + sy * my + sz * mz) / (ds * dm)));
  const d = Math.acos(cosD);

  return circleOverlap(rSun, rMoon, d);
}
