import * as THREE from 'three';
import {
  EARTH_RADIUS_EQ_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  lerp,
} from '../utils/math';
import { ScaleMode } from '../state/AppState';
import { EphemerisSnapshot } from '../astro/ephemeris';

export interface SceneScaleParams {
  earthRadius: number;
  moonRadius: number;
  sunRadius: number;
  moonPositionThree: THREE.Vector3;
  sunPositionThree: THREE.Vector3;
  moonOrbitScaleFactor: number;
  blendT: number; // 0 = schematic, 1 = realistic
}

/**
 * In our scene:
 * Earth radius is always 1.0 unit (= 6378.137 km in realistic mode).
 *
 * Schematic Mode (t = 0):
 * - Earth radius = 1.0
 * - Moon radius = 0.36 (slightly enlarged from 0.2727 so craters and lunar eclipse red shading are clearly visible)
 * - Moon distance = ~11.5 units (modulated by true perigee/apogee ratio Around mean 384,400 km)
 * - Sun radius = 4.8 units
 * - Sun distance = 115 units
 *
 * Realistic Mode (t = 1):
 * - Earth radius = 1.0
 * - Moon radius = 1737.4 / 6378.137 = 0.2724
 * - Moon distance = moonDistanceKm / 6378.137 (~60.3 units)
 * - Sun radius = 695700 / 6378.137 = 109.075 units
 * - Sun distance = sunDistanceKm / 6378.137 (~23,455 units)
 */
export class ScaleController {
  private currentBlend = 0; // 0 = schematic, 1 = realistic
  private targetBlend = 0;

  setMode(mode: ScaleMode): void {
    this.targetBlend = mode === 'realistic' ? 1 : 0;
  }

  update(dtSec: number): void {
    const speed = 3.5;
    if (Math.abs(this.currentBlend - this.targetBlend) > 0.0005) {
      this.currentBlend = lerp(
        this.currentBlend,
        this.targetBlend,
        Math.min(1, dtSec * speed)
      );
    } else {
      this.currentBlend = this.targetBlend;
    }
  }

  computeSceneScale(eph: EphemerisSnapshot): SceneScaleParams {
    const t = this.currentBlend;

    const earthRadius = 1.0;
    const moonRadiusSchem = 0.36;
    const moonRadiusReal = MOON_RADIUS_KM / EARTH_RADIUS_EQ_KM;
    const moonRadius = lerp(moonRadiusSchem, moonRadiusReal, t);

    const sunRadiusSchem = 4.6;
    const sunRadiusReal = SUN_RADIUS_KM / EARTH_RADIUS_EQ_KM;
    const sunRadius = lerp(sunRadiusSchem, sunRadiusReal, t);

    // Preserve perigee/apogee distance variation in schematic mode
    const meanMoonKm = 384400;
    const moonDistSchem = 11.5 * (eph.moonDistanceKm / meanMoonKm);
    const moonDistReal = eph.moonDistanceKm / EARTH_RADIUS_EQ_KM;
    const moonDist = lerp(moonDistSchem, moonDistReal, t);

    const meanSunKm = 149597870.7;
    const sunDistSchem = 115.0 * (eph.sunDistanceKm / meanSunKm);
    const sunDistReal = eph.sunDistanceKm / EARTH_RADIUS_EQ_KM;
    const sunDist = lerp(sunDistSchem, sunDistReal, t);

    const moonPositionThree = eph.moonDirThree.clone().multiplyScalar(moonDist);
    const sunPositionThree = eph.sunDirThree.clone().multiplyScalar(sunDist);

    const moonOrbitScaleFactor = moonDist / eph.moonDistanceKm;

    return {
      earthRadius,
      moonRadius,
      sunRadius,
      moonPositionThree,
      sunPositionThree,
      moonOrbitScaleFactor,
      blendT: t,
    };
  }
}
