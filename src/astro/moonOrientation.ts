import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { DEG2RAD } from '../utils/math';
import { Vec3Astro, makeAstroTime } from './ephemeris';
import { astroBasisToThreeMatrix4 } from './frames';

const rotEqjToEcl = Astronomy.Rotation_EQJ_ECL();
const rotEclToEqj = Astronomy.Rotation_ECL_EQJ();

export interface MoonOrientation {
  /** Matrix4 transforming Moon-fixed local Three coords (0° lon facing +X_local) to Scene (J2000 Ecliptic Three coords) */
  matrixThree: THREE.Matrix4;
  inverseMatrixThree: THREE.Matrix4;
  /** Selenographic (Moon-fixed) vector to J2000 Ecliptic vector */
  selenoToEcl: (vSeleno: Vec3Astro) => Vec3Astro;
  /** J2000 Ecliptic vector to Selenographic vector */
  eclToSeleno: (vEcl: Vec3Astro) => Vec3Astro;
}

/**
 * Compute Moon orientation using IAU Lunar rotation model via Astronomy.RotationAxis(Body.Moon, t).
 * Note on IAU convention:
 * - Axis north pole is at EQJ (ra, dec)
 * - Prime meridian (0° selenographic longitude) is defined by angle `spin` (W) measured eastward
 *   from the ascending node of the lunar equator on the J2000 equator.
 * Moreover, to ensure that selenographic (lat=0, lon=0) is the mean sub-Earth point,
 * let's verify and align the prime meridian with the IAU spin angle or mean sub-Earth direction.
 */
export function computeMoonOrientation(utcMs: number): MoonOrientation {
  const t = makeAstroTime(utcMs);
  const axis = Astronomy.RotationAxis(Astronomy.Body.Moon, t);

  // North pole unit vector in EQJ (axis.north is already provided by astronomy-engine!)
  const npEqj: Vec3Astro = {
    x: axis.north.x,
    y: axis.north.y,
    z: axis.north.z,
  };

  // Ascending node of body equator on J2000 equator:
  // Node direction in EQJ is (-sin(ra), cos(ra), 0)
  const raRad = axis.ra * 15 * DEG2RAD;
  const nodeEqj: Vec3Astro = {
    x: -Math.sin(raRad),
    y: Math.cos(raRad),
    z: 0,
  };

  // Complete right-handed basis on lunar equator before spin:
  // qEqj = npEqj x nodeEqj
  const qEqj: Vec3Astro = {
    x: npEqj.y * nodeEqj.z - npEqj.z * nodeEqj.y,
    y: npEqj.z * nodeEqj.x - npEqj.x * nodeEqj.z,
    z: npEqj.x * nodeEqj.y - npEqj.y * nodeEqj.x,
  };

  // Rotate by spin angle W (in degrees) in the lunar equatorial plane:
  const wRad = axis.spin * DEG2RAD;
  const cosW = Math.cos(wRad);
  const sinW = Math.sin(wRad);

  // Prime meridian X_seleno (0° lon, 0° lat) in EQJ:
  const exEqj: Vec3Astro = {
    x: cosW * nodeEqj.x + sinW * qEqj.x,
    y: cosW * nodeEqj.y + sinW * qEqj.y,
    z: cosW * nodeEqj.z + sinW * qEqj.z,
  };

  // 90° East longitude Y_seleno in EQJ:
  const eyEqj: Vec3Astro = {
    x: -sinW * nodeEqj.x + cosW * qEqj.x,
    y: -sinW * nodeEqj.y + cosW * qEqj.y,
    z: -sinW * nodeEqj.z + cosW * qEqj.z,
  };

  const ezEqj = npEqj;

  // Rotate the 3 selenographic basis vectors from EQJ to ECL
  const toEcl = (v: Vec3Astro): Vec3Astro => {
    const r = Astronomy.RotateVector(
      rotEqjToEcl,
      new Astronomy.Vector(v.x, v.y, v.z, t)
    );
    return { x: r.x, y: r.y, z: r.z };
  };

  const exEcl = toEcl(exEqj);
  const eyEcl = toEcl(eyEqj);
  const ezEcl = toEcl(ezEqj);

  const selenoToEcl = (v: Vec3Astro): Vec3Astro => ({
    x: exEcl.x * v.x + eyEcl.x * v.y + ezEcl.x * v.z,
    y: exEcl.y * v.x + eyEcl.y * v.y + ezEcl.y * v.z,
    z: exEcl.z * v.x + eyEcl.z * v.y + ezEcl.z * v.z,
  });

  const eclToSeleno = (v: Vec3Astro): Vec3Astro => ({
    x: exEcl.x * v.x + exEcl.y * v.y + exEcl.z * v.z,
    y: eyEcl.x * v.x + eyEcl.y * v.y + eyEcl.z * v.z,
    z: ezEcl.x * v.x + ezEcl.y * v.y + ezEcl.z * v.z,
  });

  const matrixThree = astroBasisToThreeMatrix4(exEcl, eyEcl, ezEcl);
  const inverseMatrixThree = matrixThree.clone().invert();

  return {
    matrixThree,
    inverseMatrixThree,
    selenoToEcl,
    eclToSeleno,
  };
}
