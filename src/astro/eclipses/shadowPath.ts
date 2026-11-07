import {
  EARTH_RADIUS_EQ_KM,
  EARTH_RADIUS_POLAR_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
} from '../../utils/math';
import { computeEarthOrientation } from '../earthOrientation';
import { computeEphemeris } from '../ephemeris';
import { ecefToLatLon, latLonToEcefUnit } from '../frames';

export interface EclipseCenterPathPoint {
  utcMs: number;
  lat: number;
  lon: number;
  /** Path half-width in km on Earth's surface (umbral or antumbral half-width perpendicular to path) */
  halfWidthKm: number;
  /** True if total at this point, false if annular */
  isTotal: boolean;
  /** Northern limit point */
  northLat: number;
  northLon: number;
  /** Southern limit point */
  southLat: number;
  southLon: number;
}

export interface SolarEclipseShadowPath {
  peakUtcMs: number;
  centerLine: EclipseCenterPathPoint[];
}

const pathCache = new Map<number, SolarEclipseShadowPath>();

/**
 * Intersect ray P(t) = O + t * D (with ||D|| = 1) with WGS-84 ellipsoid in ECEF:
 * (x/a)^2 + (y/a)^2 + (z/b)^2 = 1.
 */
function intersectRayEllipsoidEcef(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number }
): { x: number; y: number; z: number; t: number } | null {
  const a = EARTH_RADIUS_EQ_KM;
  const b = EARTH_RADIUS_POLAR_KM;

  const ox = origin.x / a;
  const oy = origin.y / a;
  const oz = origin.z / b;

  const dx = dir.x / a;
  const dy = dir.y / a;
  const dz = dir.z / b;

  const A = dx * dx + dy * dy + dz * dz;
  const B = 2 * (ox * dx + oy * dy + oz * dz);
  const C = ox * ox + oy * oy + oz * oz - 1;

  const disc = B * B - 4 * A * C;
  if (disc < 0) {
    return null;
  }

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-B - sqrtDisc) / (2 * A);
  const t2 = (-B + sqrtDisc) / (2 * A);
  const t = t1 > 0 ? t1 : t2;
  if (t <= 0) return null;

  return {
    x: origin.x + t * dir.x,
    y: origin.y + t * dir.y,
    z: origin.z + t * dir.z,
    t,
  };
}

interface RawCenterHit {
  utcMs: number;
  lat: number;
  lon: number;
  hit: { x: number; y: number; z: number; t: number };
  moonEcef: { x: number; y: number; z: number };
  dirEcef: { x: number; y: number; z: number };
  dSunMoon: number;
  isTotal: boolean;
  coneRadiusKm: number;
}

/**
 * Compute the central eclipse path (umbral / antumbral band) across the Earth's surface
 * around a solar eclipse peak time `peakUtcMs`.
 *
 * Computes northern and southern path limits perpendicular to the shadow's ground velocity vector,
 * accounting for oblique shadow cone projection onto the WGS-84 ellipsoid.
 */
export function computeSolarEclipsePath(peakUtcMs: number): SolarEclipseShadowPath {
  const roundedKey = Math.round(peakUtcMs / 60000);
  const cached = pathCache.get(roundedKey);
  if (cached) return cached;

  const spanMinutes = 165; // +/- 2h 45m around peak
  const stepMinutes = 2;
  const rawHits: RawCenterHit[] = [];

  for (let m = -spanMinutes; m <= spanMinutes; m += stepMinutes) {
    const utcMs = peakUtcMs + m * 60 * 1000;
    const eph = computeEphemeris(utcMs);
    const ori = computeEarthOrientation(utcMs);

    const dxEcl = eph.moonEclKm.x - eph.sunEclKm.x;
    const dyEcl = eph.moonEclKm.y - eph.sunEclKm.y;
    const dzEcl = eph.moonEclKm.z - eph.sunEclKm.z;
    const dSunMoon = Math.hypot(dxEcl, dyEcl, dzEcl);
    const dirEcl = {
      x: dxEcl / dSunMoon,
      y: dyEcl / dSunMoon,
      z: dzEcl / dSunMoon,
    };

    const moonEcef = ori.eclToEcef(eph.moonEclKm);
    const dirEcef = ori.eclToEcef(dirEcl);

    const hit = intersectRayEllipsoidEcef(moonEcef, dirEcef);
    if (!hit) continue;

    const { lat, lon } = ecefToLatLon(hit);
    const distMoonToSurfaceKm = hit.t;

    // Umbral cone apex distance from Moon center
    const lUmbraKm = (dSunMoon * MOON_RADIUS_KM) / (SUN_RADIUS_KM - MOON_RADIUS_KM);
    const signedRadiusKm =
      signedUmbraRadiusKm(distMoonToSurfaceKm, lUmbraKm, dSunMoon);
    const isTotal = signedRadiusKm >= 0;
    const coneRadiusKm = Math.min(450, Math.max(4, Math.abs(signedRadiusKm)));

    rawHits.push({
      utcMs,
      lat,
      lon,
      hit,
      moonEcef,
      dirEcef,
      dSunMoon,
      isTotal,
      coneRadiusKm,
    });
  }

  const centerLine: EclipseCenterPathPoint[] = [];
  const a2 = EARTH_RADIUS_EQ_KM * EARTH_RADIUS_EQ_KM;
  const b2 = EARTH_RADIUS_POLAR_KM * EARTH_RADIUS_POLAR_KM;

  for (let i = 0; i < rawHits.length; i++) {
    const cur = rawHits[i];
    const prev = rawHits[Math.max(0, i - 1)];
    const next = rawHits[Math.min(rawHits.length - 1, i + 1)];

    // Forward velocity vector along Earth surface in ECEF
    let vx = next.hit.x - prev.hit.x;
    let vy = next.hit.y - prev.hit.y;
    let vz = next.hit.z - prev.hit.z;
    const vLen = Math.hypot(vx, vy, vz);
    if (vLen > 1e-6) {
      vx /= vLen;
      vy /= vLen;
      vz /= vLen;
    } else {
      // Fallback eastward tangent
      const lonRad = (cur.lon * Math.PI) / 180;
      vx = -Math.sin(lonRad);
      vy = Math.cos(lonRad);
      vz = 0;
    }

    // Outward ellipsoid surface normal at hit
    let nx = cur.hit.x / a2;
    let ny = cur.hit.y / a2;
    let nz = cur.hit.z / b2;
    const nLen = Math.hypot(nx, ny, nz);
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    // Surface tangent vector perpendicular to track: P_surf = normalize(N_surf x V)
    let px = ny * vz - nz * vy;
    let py = nz * vx - nx * vz;
    let pz = nx * vy - ny * vx;
    const pLen = Math.hypot(px, py, pz);
    if (pLen > 1e-6) {
      px /= pLen;
      py /= pLen;
      pz /= pLen;
    }
    // Ensure P_surf points generally northward (positive Z in ECEF)
    if (pz < 0) {
      px = -px;
      py = -py;
      pz = -pz;
    }

    // Oblique stretching factor along P_surf:
    // Moving 1 km along P_surf on the tangent plane changes perpendicular distance to shadow axis dirEcef
    // by sin(angle between P_surf and dirEcef) = sqrt(1 - (P_surf . dirEcef)^2).
    const pDotDir = px * cur.dirEcef.x + py * cur.dirEcef.y + pz * cur.dirEcef.z;
    const sinOblique = Math.max(0.25, Math.sqrt(Math.max(0, 1 - pDotDir * pDotDir)));
    const halfWidthKm = Math.min(500, cur.coneRadiusKm / sinOblique);

    // Project perpendicular to dirEcef to trace cone edge rays onto the ellipsoid
    let ex = px - pDotDir * cur.dirEcef.x;
    let ey = py - pDotDir * cur.dirEcef.y;
    let ez = pz - pDotDir * cur.dirEcef.z;
    const eLen = Math.hypot(ex, ey, ez);
    if (eLen > 1e-6) {
      ex /= eLen;
      ey /= eLen;
      ez /= eLen;
    }

    const northRayOrigin = {
      x: cur.moonEcef.x + ex * cur.coneRadiusKm,
      y: cur.moonEcef.y + ey * cur.coneRadiusKm,
      z: cur.moonEcef.z + ez * cur.coneRadiusKm,
    };
    const southRayOrigin = {
      x: cur.moonEcef.x - ex * cur.coneRadiusKm,
      y: cur.moonEcef.y - ey * cur.coneRadiusKm,
      z: cur.moonEcef.z - ez * cur.coneRadiusKm,
    };

    const northHit = intersectRayEllipsoidEcef(northRayOrigin, cur.dirEcef);
    const southHit = intersectRayEllipsoidEcef(southRayOrigin, cur.dirEcef);

    let northLat: number;
    let northLon: number;
    let southLat: number;
    let southLon: number;

    if (northHit && southHit) {
      const nll = ecefToLatLon(northHit);
      const sll = ecefToLatLon(southHit);
      northLat = nll.lat;
      northLon = nll.lon;
      southLat = sll.lat;
      southLon = sll.lon;
    } else {
      // Grazing fallback near limb: displace along P_surf on surface
      const nEcef = {
        x: cur.hit.x + px * halfWidthKm,
        y: cur.hit.y + py * halfWidthKm,
        z: cur.hit.z + pz * halfWidthKm,
      };
      const sEcef = {
        x: cur.hit.x - px * halfWidthKm,
        y: cur.hit.y - py * halfWidthKm,
        z: cur.hit.z - pz * halfWidthKm,
      };
      const nll = ecefToLatLon(nEcef);
      const sll = ecefToLatLon(sEcef);
      northLat = Math.max(-89.9, Math.min(89.9, nll.lat));
      northLon = nll.lon;
      southLat = Math.max(-89.9, Math.min(89.9, sll.lat));
      southLon = sll.lon;
    }

    // Actual geodesic half-width between north and south limits
    const nUnit = latLonToEcefUnit(northLat, northLon);
    const sUnit = latLonToEcefUnit(southLat, southLon);
    const chordKm = Math.hypot(
      (nUnit.x - sUnit.x) * EARTH_RADIUS_EQ_KM,
      (nUnit.y - sUnit.y) * EARTH_RADIUS_EQ_KM,
      (nUnit.z - sUnit.z) * EARTH_RADIUS_POLAR_KM
    );
    const actualHalfWidthKm = chordKm > 1 ? chordKm * 0.5 : halfWidthKm;

    centerLine.push({
      utcMs: cur.utcMs,
      lat: cur.lat,
      lon: cur.lon,
      halfWidthKm: actualHalfWidthKm,
      isTotal: cur.isTotal,
      northLat,
      northLon,
      southLat,
      southLon,
    });
  }

  const result: SolarEclipseShadowPath = {
    peakUtcMs,
    centerLine,
  };
  pathCache.set(roundedKey, result);
  return result;
}

function signedUmbraRadiusKm(
  distMoonToSurfaceKm: number,
  lUmbraKm: number,
  _dSunMoon: number
): number {
  if (distMoonToSurfaceKm <= lUmbraKm) {
    return MOON_RADIUS_KM * (1 - distMoonToSurfaceKm / lUmbraKm);
  }
  // Antumbral cone diverges beyond apex with semi-angle (R_sun + R_moon) / dSunMoon or (R_sun - R_moon) / dSunMoon
  return -MOON_RADIUS_KM * ((distMoonToSurfaceKm - lUmbraKm) / lUmbraKm);
}
