import * as THREE from 'three';
import { RealCelestialSphere } from './RealStarfield';

export class Starfield {
  public readonly group = new THREE.Group();
  public readonly skySphere: THREE.Mesh;
  public readonly celestialSphere: RealCelestialSphere;

  constructor(milkyWayTexture: THREE.Texture) {
    // Skybox sphere with Milky Way texture
    const sphereGeo = new THREE.SphereGeometry(48000, 48, 32);
    const sphereMat = new THREE.MeshBasicMaterial({
      map: milkyWayTexture,
      side: THREE.BackSide,
      color: new THREE.Color(0x8899bb),
      depthWrite: false,
    });
    this.skySphere = new THREE.Mesh(sphereGeo, sphereMat);
    // Tilt Milky Way sphere from Equatorial to Ecliptic (~23.439 deg around X axis)
    this.skySphere.rotation.x = (23.43928 * Math.PI) / 180;
    this.group.add(this.skySphere);

    // Real J2000 star catalog (stars.6.json) + constellation lines & Chinese labels
    this.celestialSphere = new RealCelestialSphere(42000);
    this.group.add(this.celestialSphere.group);
  }

  public setShowConstellations(show: boolean): void {
    this.celestialSphere.constellationGroup.visible = show;
  }
}
