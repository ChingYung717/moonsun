import * as Astronomy from 'astronomy-engine';
import {
  AU_KM,
  DEG2RAD,
  MOON_RADIUS_KM,
  RAD2DEG,
  SUN_RADIUS_KM,
  circleOverlap,
  wrapDeg360,
} from '../utils/math';
import { makeAstroTime } from './ephemeris';
import { computeMoonOrientation } from './moonOrientation';
import { latLonToEcefUnit } from './frames';

export interface SkyBodyHorizontal {
  altitudeDeg: number; // -90..+90 (with atmospheric refraction for Earth observer)
  azimuthDeg: number; // 0=North, 90=East, 180=South, 270=West
  raHours: number;
  decDeg: number;
  distanceKm: number;
  angularRadiusDeg: number;
  parallacticAngleDeg: number; // angle from zenith to celestial north at the body
}

export interface RiseSetTimes {
  sunRiseUtc: number | null;
  sunSetUtc: number | null;
  sunTransitUtc: number | null;
  moonRiseUtc: number | null;
  moonSetUtc: number | null;
  civilDawnUtc: number | null;
  civilDuskUtc: number | null;
}

export interface TrajectoryPoint {
  utcMs: number;
  altitudeDeg: number;
  azimuthDeg: number;
}

export interface EarthObserverSky {
  sun: SkyBodyHorizontal;
  moon: SkyBodyHorizontal;
  /** Topocentric solar eclipse obscuration at observer location */
  solarObscuration: {
    areaFraction: number;
    magnitude: number;
    isTotal: boolean;
    isAnnular: boolean;
    isPartial: boolean;
    angularSeparationDeg: number;
  };
  /** Bright limb position angle of the Moon measured from the Moon's zenith direction (clockwise / eastward) in radians */
  moonZenithBrightLimbRad: number;
}

/**
 * Compute parallactic angle q (angle between celestial pole and zenith at body position).
 */
function computeParallacticAngleRad(latDeg: number, decDeg: number, hourAngleHours: number): number {
  const phi = latDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  const H = hourAngleHours * 15 * DEG2RAD;
  const y = Math.sin(H);
  const x = Math.tan(phi) * Math.cos(dec) - Math.sin(dec) * Math.cos(H);
  return Math.atan2(y, x);
}

/**
 * Compute topocentric horizontal coordinates for Sun and Moon from an Earth observer.
 */
export function computeEarthObserverSky(
  utcMs: number,
  latDeg: number,
  lonDeg: number,
  elevationMeters = 0
): EarthObserverSky {
  const t = makeAstroTime(utcMs);
  const obs = new Astronomy.Observer(latDeg, lonDeg, elevationMeters);

  // Topocentric equatorial of date (ofdate=true, aberration=true)
  const sunEq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
  const moonEq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);

  // Topocentric horizontal with normal atmospheric refraction
  const sunHor = Astronomy.Horizon(t, obs, sunEq.ra, sunEq.dec, 'normal');
  const moonHor = Astronomy.Horizon(t, obs, moonEq.ra, moonEq.dec, 'normal');

  // Unrefracted topocentric separation for exact eclipse geometry
  const sunHorGeo = Astronomy.Horizon(t, obs, sunEq.ra, sunEq.dec, undefined);
  const moonHorGeo = Astronomy.Horizon(t, obs, moonEq.ra, moonEq.dec, undefined);

  const sunDistKm = sunEq.dist * AU_KM;
  const moonDistKm = moonEq.dist * AU_KM;

  const sunAngRad = Math.asin(SUN_RADIUS_KM / sunDistKm);
  const moonAngRad = Math.asin(MOON_RADIUS_KM / moonDistKm);

  // Local Sidereal Time in hours
  const gast = Astronomy.SiderealTime(t);
  const lst = gast + lonDeg / 15;

  const sunHA = lst - sunEq.ra;
  const moonHA = lst - moonEq.ra;

  const sunParallacticRad = computeParallacticAngleRad(latDeg, sunEq.dec, sunHA);
  const moonParallacticRad = computeParallacticAngleRad(latDeg, moonEq.dec, moonHA);

  // Position angle of the Sun relative to the Moon in equatorial coordinates (chi, measured eastward from celestial north)
  const alphaS = sunEq.ra * 15 * DEG2RAD;
  const deltaS = sunEq.dec * DEG2RAD;
  const alphaM = moonEq.ra * 15 * DEG2RAD;
  const deltaM = moonEq.dec * DEG2RAD;
  const yChi = Math.cos(deltaS) * Math.sin(alphaS - alphaM);
  const xChi =
    Math.sin(deltaS) * Math.cos(deltaM) -
    Math.cos(deltaS) * Math.sin(deltaM) * Math.cos(alphaS - alphaM);
  const chiRad = Math.atan2(yChi, xChi);

  // Zenith angle of bright limb = chi - parallacticAngle
  const moonZenithBrightLimbRad = chiRad - moonParallacticRad;

  // Angular separation between topocentric Sun and Moon centers
  const alt1 = sunHorGeo.altitude * DEG2RAD;
  const az1 = sunHorGeo.azimuth * DEG2RAD;
  const alt2 = moonHorGeo.altitude * DEG2RAD;
  const az2 = moonHorGeo.azimuth * DEG2RAD;
  const cosSep =
    Math.sin(alt1) * Math.sin(alt2) +
    Math.cos(alt1) * Math.cos(alt2) * Math.cos(az1 - az2);
  const sepRad = Math.acos(Math.max(-1, Math.min(1, cosSep)));

  const overlap = circleOverlap(sunAngRad, moonAngRad, sepRad);

  return {
    sun: {
      altitudeDeg: sunHor.altitude,
      azimuthDeg: sunHor.azimuth,
      raHours: sunEq.ra,
      decDeg: sunEq.dec,
      distanceKm: sunDistKm,
      angularRadiusDeg: sunAngRad * RAD2DEG,
      parallacticAngleDeg: sunParallacticRad * RAD2DEG,
    },
    moon: {
      altitudeDeg: moonHor.altitude,
      azimuthDeg: moonHor.azimuth,
      raHours: moonEq.ra,
      decDeg: moonEq.dec,
      distanceKm: moonDistKm,
      angularRadiusDeg: moonAngRad * RAD2DEG,
      parallacticAngleDeg: moonParallacticRad * RAD2DEG,
    },
    solarObscuration: {
      ...overlap,
      angularSeparationDeg: sepRad * RAD2DEG,
    },
    moonZenithBrightLimbRad,
  };
}

/**
 * Compute daily rise/set/twilight times around the local day of `utcMs` (given timezone offset in minutes).
 */
export function computeRiseSetTimes(
  utcMs: number,
  latDeg: number,
  lonDeg: number,
  tzOffsetMinutes: number,
  elevationMeters = 0
): RiseSetTimes {
  // Start of local day in UTC:
  const localMs = utcMs + tzOffsetMinutes * 60 * 1000;
  const startOfLocalDayMs = Math.floor(localMs / 86400000) * 86400000 - tzOffsetMinutes * 60 * 1000;
  const tStart = makeAstroTime(startOfLocalDayMs);
  const obs = new Astronomy.Observer(latDeg, lonDeg, elevationMeters);

  const safeSearchRiseSet = (body: Astronomy.Body, dir: number): number | null => {
    try {
      const res = Astronomy.SearchRiseSet(body, obs, dir, tStart, 1.0);
      return res ? res.date.getTime() : null;
    } catch {
      return null;
    }
  };

  const safeSearchAltitude = (dir: number, alt: number): number | null => {
    try {
      const res = Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, dir, tStart, 1.0, alt);
      return res ? res.date.getTime() : null;
    } catch {
      return null;
    }
  };

  let sunTransitUtc: number | null = null;
  try {
    const hs = Astronomy.SearchHourAngle(Astronomy.Body.Sun, obs, 0, tStart, +1);
    if (hs && hs.time.date.getTime() - startOfLocalDayMs <= 86400000 * 1.1) {
      sunTransitUtc = hs.time.date.getTime();
    }
  } catch {
    sunTransitUtc = null;
  }

  return {
    sunRiseUtc: safeSearchRiseSet(Astronomy.Body.Sun, +1),
    sunSetUtc: safeSearchRiseSet(Astronomy.Body.Sun, -1),
    sunTransitUtc,
    moonRiseUtc: safeSearchRiseSet(Astronomy.Body.Moon, +1),
    moonSetUtc: safeSearchRiseSet(Astronomy.Body.Moon, -1),
    civilDawnUtc: safeSearchAltitude(+1, -6),
    civilDuskUtc: safeSearchAltitude(-1, -6),
  };
}

/**
 * Search for the NEXT sunrise, sunset, moonrise, and moonset strictly after `utcMs`.
 */
export function computeDailySunMoonEvents(
  utcMs: number,
  latDeg: number,
  lonDeg: number,
  _tzOffsetMinutes?: number,
  elevationMeters = 0
): {
  sunriseUtc: number | null;
  sunsetUtc: number | null;
  moonriseUtc: number | null;
  moonsetUtc: number | null;
} {
  const tNow = makeAstroTime(utcMs);
  const obs = new Astronomy.Observer(latDeg, lonDeg, elevationMeters);
  const safeNext = (body: Astronomy.Body, dir: number): number | null => {
    try {
      const res = Astronomy.SearchRiseSet(body, obs, dir, tNow, 2.0);
      return res ? res.date.getTime() : null;
    } catch {
      return null;
    }
  };
  return {
    sunriseUtc: safeNext(Astronomy.Body.Sun, +1),
    sunsetUtc: safeNext(Astronomy.Body.Sun, -1),
    moonriseUtc: safeNext(Astronomy.Body.Moon, +1),
    moonsetUtc: safeNext(Astronomy.Body.Moon, -1),
  };
}

/**
 * Sample daily horizontal trajectory (every 15 minutes over the local day) for Sun or Moon.
 */
export function sampleDailyTrajectory(
  utcMs: number,
  latDeg: number,
  lonDeg: number,
  tzOffsetMinutes: number,
  body: 'sun' | 'moon',
  steps = 96
): TrajectoryPoint[] {
  const localMs = utcMs + tzOffsetMinutes * 60 * 1000;
  const startOfLocalDayMs = Math.floor(localMs / 86400000) * 86400000 - tzOffsetMinutes * 60 * 1000;
  const stepMs = 86400000 / steps;
  const obs = new Astronomy.Observer(latDeg, lonDeg, 0);
  const astroBody = body === 'sun' ? Astronomy.Body.Sun : Astronomy.Body.Moon;
  const points: TrajectoryPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const ms = startOfLocalDayMs + i * stepMs;
    const t = makeAstroTime(ms);
    const eq = Astronomy.Equator(astroBody, t, obs, true, true);
    const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
    points.push({
      utcMs: ms,
      altitudeDeg: hor.altitude,
      azimuthDeg: hor.azimuth,
    });
  }
  return points;
}

export interface MoonSurfaceSky {
  sunAltitudeDeg: number;
  sunAzimuthDeg: number;
  earthAltitudeDeg: number;
  earthAzimuthDeg: number;
  sunAngularRadiusDeg: number;
  earthAngularRadiusDeg: number;
  /** Fraction of Earth's disk illuminated as seen from the Moon (0..1) */
  earthIlluminatedFraction: number;
  /** Solar eclipse seen from the Moon (= Lunar eclipse on Earth!): fraction of Sun covered by Earth */
  solarEclipseByEarth: {
    areaFraction: number;
    magnitude: number;
    isTotal: boolean;
    isPartial: boolean;
    angularSeparationDeg: number;
  };
  isLunarDay: boolean;
}

/**
 * Compute the sky from a selenographic location (latDeg, lonDeg) on the Moon's surface.
 */
export function computeMoonSurfaceSky(
  utcMs: number,
  selenoLatDeg: number,
  selenoLonDeg: number,
  sunEclKm: { x: number; y: number; z: number },
  moonEclKm: { x: number; y: number; z: number }
): MoonSurfaceSky {
  const moonOri = computeMoonOrientation(utcMs);

  // Observer local tangent frame in Selenographic coordinates:
  const upSeleno = latLonToEcefUnit(selenoLatDeg, selenoLonDeg);
  const lat = selenoLatDeg * DEG2RAD;
  const lon = selenoLonDeg * DEG2RAD;
  const eastSeleno = {
    x: -Math.sin(lon),
    y: Math.cos(lon),
    z: 0,
  };
  const northSeleno = {
    x: -Math.sin(lat) * Math.cos(lon),
    y: -Math.sin(lat) * Math.sin(lon),
    z: Math.cos(lat),
  };

  // Site position in Ecliptic (relative to Moon center, in km)
  const siteRelMoonEcl = moonOri.selenoToEcl({
    x: upSeleno.x * MOON_RADIUS_KM,
    y: upSeleno.y * MOON_RADIUS_KM,
    z: upSeleno.z * MOON_RADIUS_KM,
  });

  // Site position in Geocentric Ecliptic (km)
  const siteGeoEcl = {
    x: moonEclKm.x + siteRelMoonEcl.x,
    y: moonEclKm.y + siteRelMoonEcl.y,
    z: moonEclKm.z + siteRelMoonEcl.z,
  };

  // Vector from site to Sun in Ecliptic (km)
  const toSunEcl = {
    x: sunEclKm.x - siteGeoEcl.x,
    y: sunEclKm.y - siteGeoEcl.y,
    z: sunEclKm.z - siteGeoEcl.z,
  };
  // Vector from site to Earth center in Ecliptic (km)
  const toEarthEcl = {
    x: -siteGeoEcl.x,
    y: -siteGeoEcl.y,
    z: -siteGeoEcl.z,
  };

  const distSun = Math.hypot(toSunEcl.x, toSunEcl.y, toSunEcl.z);
  const distEarth = Math.hypot(toEarthEcl.x, toEarthEcl.y, toEarthEcl.z);

  const toSunSeleno = moonOri.eclToSeleno({
    x: toSunEcl.x / distSun,
    y: toSunEcl.y / distSun,
    z: toSunEcl.z / distSun,
  });
  const toEarthSeleno = moonOri.eclToSeleno({
    x: toEarthEcl.x / distEarth,
    y: toEarthEcl.y / distEarth,
    z: toEarthEcl.z / distEarth,
  });

  const toHoriz = (vSeleno: { x: number; y: number; z: number }) => {
    const u = vSeleno.x * upSeleno.x + vSeleno.y * upSeleno.y + vSeleno.z * upSeleno.z;
    const e = vSeleno.x * eastSeleno.x + vSeleno.y * eastSeleno.y + vSeleno.z * eastSeleno.z;
    const n = vSeleno.x * northSeleno.x + vSeleno.y * northSeleno.y + vSeleno.z * northSeleno.z;
    const altDeg = Math.asin(Math.max(-1, Math.min(1, u))) * RAD2DEG;
    const azDeg = wrapDeg360(Math.atan2(e, n) * RAD2DEG);
    return { altDeg, azDeg };
  };

  const sunHor = toHoriz(toSunSeleno);
  const earthHor = toHoriz(toEarthSeleno);

  const sunAngRad = Math.asin(SUN_RADIUS_KM / distSun);
  const earthAngRad = Math.asin(6371.0 / distEarth);

  const cosSep =
    (toSunEcl.x * toEarthEcl.x + toSunEcl.y * toEarthEcl.y + toSunEcl.z * toEarthEcl.z) /
    (distSun * distEarth);
  const sepRad = Math.acos(Math.max(-1, Math.min(1, cosSep)));

  const overlap = circleOverlap(sunAngRad, earthAngRad, sepRad);

  // Earth phase seen from the Moon (complementary to the Moon phase seen from Earth):
  // illuminated fraction = (1 + cos θ) / 2, θ = angle at Earth between directions to the Sun and to the site.
  // Full Moon (θ ≈ 180°) -> "new Earth" (≈0); New Moon (θ ≈ 0°) -> "full Earth" (≈1).
  const rSun = Math.hypot(sunEclKm.x, sunEclKm.y, sunEclKm.z);
  const rSite = Math.hypot(siteGeoEcl.x, siteGeoEcl.y, siteGeoEcl.z);
  const cosTheta =
    (sunEclKm.x * siteGeoEcl.x + sunEclKm.y * siteGeoEcl.y + sunEclKm.z * siteGeoEcl.z) /
    (rSun * rSite);
  const earthIlluminatedFraction = 0.5 * (1 + Math.max(-1, Math.min(1, cosTheta)));

  return {
    sunAltitudeDeg: sunHor.altDeg,
    sunAzimuthDeg: sunHor.azDeg,
    earthAltitudeDeg: earthHor.altDeg,
    earthAzimuthDeg: earthHor.azDeg,
    sunAngularRadiusDeg: sunAngRad * RAD2DEG,
    earthAngularRadiusDeg: earthAngRad * RAD2DEG,
    earthIlluminatedFraction,
    solarEclipseByEarth: {
      areaFraction: overlap.areaFraction,
      magnitude: overlap.magnitude,
      isTotal: overlap.isTotal,
      isPartial: overlap.isPartial,
      angularSeparationDeg: sepRad * RAD2DEG,
    },
    isLunarDay: sunHor.altDeg > 0,
  };
}
