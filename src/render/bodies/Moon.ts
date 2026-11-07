import * as THREE from 'three';
import { MOON_FRAGMENT_SHADER, MOON_VERTEX_SHADER } from '../shaders/moon.glsl';
import { PlanetaryTextures } from '../textures';
import { EphemerisSnapshot } from '../../astro/ephemeris';
import { MoonOrientation } from '../../astro/moonOrientation';
import { astroToThreeVec } from '../../utils/math';

export class MoonBody {
  public readonly group = new THREE.Group();
  public readonly mesh: THREE.Mesh;
  public readonly material: THREE.ShaderMaterial;

  constructor(textures: PlanetaryTextures) {
    const geo = new THREE.SphereGeometry(1, 72, 72);
    this.material = new THREE.ShaderMaterial({
      vertexShader: MOON_VERTEX_SHADER,
      fragmentShader: MOON_FRAGMENT_SHADER,
      uniforms: {
        uMoonTex: { value: textures.moonColor },
        uSunDirThree: { value: new THREE.Vector3(1, 0, 0) },
        uSunPosKmThree: { value: new THREE.Vector3(149597870, 0, 0) },
        uMoonPosKmThree: { value: new THREE.Vector3(384400, 0, 0) },
        uEarthshineIntensity: { value: 0.5 },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.group.add(this.mesh);
  }

  update(
    eph: EphemerisSnapshot,
    moonOri: MoonOrientation,
    positionThree: THREE.Vector3,
    radius: number,
    moonIlluminatedFraction: number
  ): void {
    this.group.position.copy(positionThree);

    // Combine rotation matrix with uniform scale `radius`
    const scaleMat = new THREE.Matrix4().makeScale(radius, radius, radius);
    this.mesh.matrix.copy(moonOri.matrixThree).multiply(scaleMat);
    this.mesh.updateMatrixWorld(true);

    const sunKmThree = astroToThreeVec(
      eph.sunEclKm.x,
      eph.sunEclKm.y,
      eph.sunEclKm.z
    );
    const moonKmThree = astroToThreeVec(
      eph.moonEclKm.x,
      eph.moonEclKm.y,
      eph.moonEclKm.z
    );

    this.material.uniforms.uSunDirThree.value.copy(eph.sunDirThree);
    this.material.uniforms.uSunPosKmThree.value.copy(sunKmThree);
    this.material.uniforms.uMoonPosKmThree.value.copy(moonKmThree);
    this.material.uniforms.uEarthshineIntensity.value = Math.max(
      0,
      1.0 - moonIlluminatedFraction
    );
  }
}
