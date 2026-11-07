import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { DEG2RAD } from '../utils/math';
import { makeAstroTime } from './ephemeris';
import { astroToThreeVec, eqjToEcl } from './frames';

export interface PlanetState {
  id: 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';
  nameZh: string;
  colorHex: string;
  magnitude: number;
  /** Unit direction vector in our 3D J2000 Ecliptic scene frame (from Earth) */
  dirSceneThree: THREE.Vector3;
  /** Local Earth horizon altitude (deg) */
  altitudeDeg: number;
  /** Local Earth horizon azimuth (deg, 0=N, 90=E, 180=S, 270=W) */
  azimuthDeg: number;
  /** Unit direction vector in Earth Horizon frame (+X=East, +Y=Up, -Z=North) */
  horizonDirThree: THREE.Vector3;
}

const PLANET_DEFS: ReadonlyArray<{
  id: PlanetState['id'];
  body: Astronomy.Body;
  nameZh: string;
  colorHex: string;
}> = [
  { id: 'mercury', body: Astronomy.Body.Mercury, nameZh: '水星', colorHex: '#d5d8e2' },
  { id: 'venus', body: Astronomy.Body.Venus, nameZh: '金星', colorHex: '#fff5cc' },
  { id: 'mars', body: Astronomy.Body.Mars, nameZh: '火星', colorHex: '#ff7b54' },
  { id: 'jupiter', body: Astronomy.Body.Jupiter, nameZh: '木星', colorHex: '#ffe3b3' },
  { id: 'saturn', body: Astronomy.Body.Saturn, nameZh: '土星', colorHex: '#f3d58d' },
];

export function computeNakedEyePlanets(
  utcMs: number,
  observerLatDeg: number,
  observerLonDeg: number,
  observerElevationM = 0
): PlanetState[] {
  const t = makeAstroTime(utcMs);
  const obs = new Astronomy.Observer(observerLatDeg, observerLonDeg, observerElevationM);
  const results: PlanetState[] = [];

  for (const def of PLANET_DEFS) {
    // Geocentric J2000 vector for SpaceView
    const geoVec = Astronomy.GeoVector(def.body, t, true);
    const ecl = eqjToEcl({ x: geoVec.x, y: geoVec.y, z: geoVec.z }, t);
    const dirSceneThree = astroToThreeVec(ecl.x, ecl.y, ecl.z).normalize();

    // Topocentric Horizon coordinates for GroundView
    const eqd = Astronomy.Equator(def.body, t, obs, true, true);
    const hor = Astronomy.Horizon(t, obs, eqd.ra, eqd.dec, 'normal');
    const illum = Astronomy.Illumination(def.body, t);

    const altRad = hor.altitude * DEG2RAD;
    const azRad = hor.azimuth * DEG2RAD;
    const cosAlt = Math.cos(altRad);
    const horizonDirThree = new THREE.Vector3(
      cosAlt * Math.sin(azRad),
      Math.sin(altRad),
      -cosAlt * Math.cos(azRad)
    );

    results.push({
      id: def.id,
      nameZh: def.nameZh,
      colorHex: def.colorHex,
      magnitude: illum.mag,
      dirSceneThree,
      altitudeDeg: hor.altitude,
      azimuthDeg: hor.azimuth,
      horizonDirThree,
    });
  }

  return results;
}
