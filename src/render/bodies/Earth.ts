import * as THREE from 'three';
import { EARTH_FRAGMENT_SHADER, EARTH_VERTEX_SHADER } from '../shaders/earth.glsl';
import { PlanetaryTextures } from '../textures';
import { EarthOrientation } from '../../astro/earthOrientation';
import { EphemerisSnapshot } from '../../astro/ephemeris';
import { astroToThreeVec } from '../../utils/math';

export class EarthBody {
  public readonly group = new THREE.Group();
  public readonly mesh: THREE.Mesh;
  public readonly atmosphereMesh: THREE.Mesh;
  public readonly axisLine: THREE.Line;
  public readonly material: THREE.ShaderMaterial;

  constructor(textures: PlanetaryTextures) {
    const geo = new THREE.SphereGeometry(1, 96, 96);

    this.material = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX_SHADER,
      fragmentShader: EARTH_FRAGMENT_SHADER,
      uniforms: {
        uDayTex: { value: textures.earthDay },
        uNightTex: { value: textures.earthNight },
        uCloudsTex: { value: textures.earthClouds },
        uSpecularTex: { value: textures.earthSpecular },
        uNormalTex: { value: textures.earthNormal },
        uSunDirThree: { value: new THREE.Vector3(1, 0, 0) },
        uSunPosKmThree: { value: new THREE.Vector3(149597870, 0, 0) },
        uMoonPosKmThree: { value: new THREE.Vector3(-384400, 0, 0) },
        uCloudsRotationRad: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.group.add(this.mesh);

    // Subtle outer atmospheric halo shell
    const atmosGeo = new THREE.SphereGeometry(1.022, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDirThree;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          float rim = pow(1.0 - max(0.0, dot(N, V)), 4.0);
          float sunSide = smoothstep(-0.25, 0.35, dot(N, normalize(uSunDirThree)));
          vec3 col = mix(vec3(0.12, 0.28, 0.65), vec3(0.35, 0.68, 1.0), sunSide);
          gl_FragColor = vec4(col, rim * (0.12 + 0.38 * sunSide));
        }
      `,
      uniforms: {
        uSunDirThree: { value: new THREE.Vector3(1, 0, 0) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat);
    this.group.add(this.atmosphereMesh);

    // Polar axis line in Earth's local frame (+Y is North Pole, -Y is South Pole)
    const axisPts = [new THREE.Vector3(0, -1.45, 0), new THREE.Vector3(0, 1.45, 0)];
    const axisGeo = new THREE.BufferGeometry().setFromPoints(axisPts);
    const axisMat = new THREE.LineBasicMaterial({
      color: 0x5cc8ff,
      transparent: true,
      opacity: 0.55,
    });
    this.axisLine = new THREE.Line(axisGeo, axisMat);
    this.mesh.add(this.axisLine);
  }

  update(eph: EphemerisSnapshot, orientation: EarthOrientation): void {
    this.mesh.matrix.copy(orientation.matrixThree);
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

    // Very slow relative cloud drift
    const cloudDrift = ((eph.utcMs / (12 * 86400 * 1000)) * Math.PI * 2) % (Math.PI * 2);
    this.material.uniforms.uCloudsRotationRad.value = cloudDrift;

    (this.atmosphereMesh.material as THREE.ShaderMaterial).uniforms.uSunDirThree.value.copy(
      eph.sunDirThree
    );
  }
}
