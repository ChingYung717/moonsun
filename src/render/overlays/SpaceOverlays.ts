import * as THREE from 'three';
import { AppStateData } from '../../state/AppState';
import { EphemerisSnapshot, sampleMoonOrbitEclKm } from '../../astro/ephemeris';
import { EarthOrientation, latLonToSceneDir } from '../../astro/earthOrientation';
import { latLonToEcefUnit } from '../../astro/frames';
import { SceneScaleParams } from '../scale';
import { DEG2RAD, astroToThreeVec } from '../../utils/math';
import { computeSolarEclipsePath } from '../../astro/eclipses/shadowPath';

export class SpaceOverlays {
  public readonly group = new THREE.Group();
  /** Group attached inside Earth's local ECEF frame so lat/lon paths & grids rotate with Earth */
  public readonly earthLocalGroup = new THREE.Group();

  private moonOrbitLine: THREE.Line;
  private earthOrbitLine: THREE.Line;
  private eclipticGrid: THREE.GridHelper;
  private observerPinGroup: THREE.Group;
  private pinSphere: THREE.Mesh;
  private pinStem: THREE.Line;
  private sunSightLine: THREE.Line;
  private moonSightLine: THREE.Line;
  private latLonGridGroup: THREE.Group;
  private eclipsePathGroup: THREE.Group;
  private shadowConeGroup: THREE.Group;
  private moonUmbraCone: THREE.Mesh;
  private earthUmbraCone: THREE.Mesh;

  private lastMoonOrbitSampleUtc = -Infinity;
  private cachedMoonOrbitKm: { x: number; y: number; z: number }[] = [];
  private currentEclipsePathKey = -1;

  constructor() {
    // 1. Moon orbit line
    const moonOrbitGeo = new THREE.BufferGeometry();
    const moonOrbitMat = new THREE.LineBasicMaterial({
      color: 0x7cb8ff,
      transparent: true,
      opacity: 0.55,
    });
    this.moonOrbitLine = new THREE.Line(moonOrbitGeo, moonOrbitMat);
    this.group.add(this.moonOrbitLine);

    // 2. Earth heliocentric orbit arc (in XZ ecliptic plane passing through origin)
    const earthOrbitGeo = new THREE.BufferGeometry();
    const earthOrbitMat = new THREE.LineBasicMaterial({
      color: 0xffb84d,
      transparent: true,
      opacity: 0.4,
    });
    this.earthOrbitLine = new THREE.Line(earthOrbitGeo, earthOrbitMat);
    this.group.add(this.earthOrbitLine);

    // 3. Ecliptic plane polar grid
    this.eclipticGrid = new THREE.GridHelper(40, 20, 0x3b6998, 0x1d3557);
    (this.eclipticGrid.material as THREE.Material).transparent = true;
    (this.eclipticGrid.material as THREE.Material).opacity = 0.25;
    this.group.add(this.eclipticGrid);

    // 4. Observer marker pin + pulsing ring
    this.observerPinGroup = new THREE.Group();
    this.pinSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3b5c })
    );
    const pinStemGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.14, 0),
    ]);
    this.pinStem = new THREE.Line(
      pinStemGeo,
      new THREE.LineBasicMaterial({ color: 0xff3b5c })
    );
    const ringGeo = new THREE.RingGeometry(0.032, 0.044, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff6b8b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    ringMesh.position.y = 0.005;
    this.observerPinGroup.add(this.pinSphere, this.pinStem, ringMesh);
    this.group.add(this.observerPinGroup);

    // 5. Sight lines from observer to Sun and Moon
    this.sunSightLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0xffcc33,
        dashSize: 0.18,
        gapSize: 0.09,
        transparent: true,
        opacity: 0.75,
      })
    );
    this.moonSightLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0x80d4ff,
        dashSize: 0.15,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.75,
      })
    );
    this.group.add(this.sunSightLine, this.moonSightLine);

    // 6. Lat/Lon Grid on Earth (in Earth local frame)
    this.latLonGridGroup = this.buildLatLonGrid();
    this.earthLocalGroup.add(this.latLonGridGroup);

    // 7. Solar Eclipse Path on Earth (in Earth local frame)
    this.eclipsePathGroup = new THREE.Group();
    this.earthLocalGroup.add(this.eclipsePathGroup);

    // 8. Shadow Cones (Moon umbra cone & Earth umbra cone)
    this.shadowConeGroup = new THREE.Group();
    const coneGeo = new THREE.CylinderGeometry(0.05, 1.0, 1.0, 32, 1, true);
    coneGeo.translate(0, 0.5, 0); // base at y=0, tip at y=1
    coneGeo.rotateX(Math.PI / 2); // point along +Z
    this.moonUmbraCone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0x111522,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.earthUmbraCone = new THREE.Mesh(
      coneGeo.clone(),
      new THREE.MeshBasicMaterial({
        color: 0x992211,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.shadowConeGroup.add(this.moonUmbraCone, this.earthUmbraCone);
    this.group.add(this.shadowConeGroup);
  }

  private buildLatLonGrid(): THREE.Group {
    const g = new THREE.Group();
    const r = 1.003;

    const addLatCircle = (latDeg: number, color: number, opacity: number) => {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 3) {
        const ecef = latLonToEcefUnit(latDeg, lon);
        pts.push(astroToThreeVec(ecef.x * r, ecef.y * r, ecef.z * r));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity })
      );
      g.add(line);
    };

    // Equator
    addLatCircle(0, 0x4ea8de, 0.55);
    // Tropics of Cancer & Capricorn
    addLatCircle(23.439, 0xf4a261, 0.4);
    addLatCircle(-23.439, 0xf4a261, 0.4);
    // Arctic & Antarctic Circles
    addLatCircle(66.56, 0x90e0ef, 0.35);
    addLatCircle(-66.56, 0x90e0ef, 0.35);
    // Other parallels
    for (const lat of [-60, -30, 30, 60]) {
      addLatCircle(lat, 0x457b9d, 0.22);
    }

    // Meridians every 30 deg
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) {
        const ecef = latLonToEcefUnit(lat, lon);
        pts.push(astroToThreeVec(ecef.x * r, ecef.y * r, ecef.z * r));
      }
      const isPrime = lon === 0;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: isPrime ? 0x52b788 : 0x457b9d,
          transparent: true,
          opacity: isPrime ? 0.5 : 0.2,
        })
      );
      g.add(line);
    }

    return g;
  }

  private rebuildSolarEclipsePathOnEarth(peakUtcMs: number | null): void {
    const key = peakUtcMs ? Math.round(peakUtcMs / 60000) : 0;
    if (key === this.currentEclipsePathKey) return;
    this.currentEclipsePathKey = key;

    while (this.eclipsePathGroup.children.length > 0) {
      const child = this.eclipsePathGroup.children[0];
      this.eclipsePathGroup.remove(child);
    }

    if (!peakUtcMs) return;

    const path = computeSolarEclipsePath(peakUtcMs);
    if (path.centerLine.length < 2) return;

    const r = 1.005;
    const centerPts: THREE.Vector3[] = [];
    const northPts: THREE.Vector3[] = [];
    const southPts: THREE.Vector3[] = [];
    const ribbonVertices: number[] = [];

    for (let i = 0; i < path.centerLine.length; i++) {
      const pt = path.centerLine[i];
      const cEcef = latLonToEcefUnit(pt.lat, pt.lon);
      const nEcef = latLonToEcefUnit(pt.northLat, pt.northLon);
      const sEcef = latLonToEcefUnit(pt.southLat, pt.southLon);

      const cVec = astroToThreeVec(cEcef.x * r, cEcef.y * r, cEcef.z * r);
      const nVec = astroToThreeVec(nEcef.x * r, nEcef.y * r, nEcef.z * r);
      const sVec = astroToThreeVec(sEcef.x * r, sEcef.y * r, sEcef.z * r);

      centerPts.push(cVec);
      northPts.push(nVec);
      southPts.push(sVec);

      if (i > 0) {
        const prevN = northPts[i - 1];
        const prevS = southPts[i - 1];
        ribbonVertices.push(
          prevN.x, prevN.y, prevN.z,
          prevS.x, prevS.y, prevS.z,
          nVec.x, nVec.y, nVec.z,
          prevS.x, prevS.y, prevS.z,
          sVec.x, sVec.y, sVec.z,
          nVec.x, nVec.y, nVec.z
        );
      }
    }

    const isTotal = path.centerLine[Math.floor(path.centerLine.length / 2)].isTotal;
    const mainColor = isTotal ? 0xff3b5c : 0xffaa00;

    // Central path line
    const centerLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(centerPts),
      new THREE.LineBasicMaterial({ color: mainColor, linewidth: 2 })
    );
    const northLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(northPts),
      new THREE.LineBasicMaterial({ color: mainColor, transparent: true, opacity: 0.65 })
    );
    const southLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(southPts),
      new THREE.LineBasicMaterial({ color: mainColor, transparent: true, opacity: 0.65 })
    );

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonVertices, 3));
    const ribbonMesh = new THREE.Mesh(
      ribbonGeo,
      new THREE.MeshBasicMaterial({
        color: mainColor,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );

    this.eclipsePathGroup.add(ribbonMesh, centerLine, northLine, southLine);
  }

  update(
    state: AppStateData,
    eph: EphemerisSnapshot,
    earthOri: EarthOrientation,
    scale: SceneScaleParams
  ): void {
    const flags = state.overlays;

    // 1. Moon Orbit Line
    this.moonOrbitLine.visible = flags.moonOrbit;
    if (flags.moonOrbit) {
      if (Math.abs(eph.utcMs - this.lastMoonOrbitSampleUtc) > 6 * 3600 * 1000) {
        this.cachedMoonOrbitKm = sampleMoonOrbitEclKm(eph.utcMs, 27.32166, 180);
        this.lastMoonOrbitSampleUtc = eph.utcMs;
      }
      const pts = this.cachedMoonOrbitKm.map((p) =>
        astroToThreeVec(
          p.x * scale.moonOrbitScaleFactor,
          p.y * scale.moonOrbitScaleFactor,
          p.z * scale.moonOrbitScaleFactor
        )
      );
      this.moonOrbitLine.geometry.setFromPoints(pts);
    }

    // 2. Earth Heliocentric Orbit Arc (passes through Earth at origin, tangent perpendicular to Sun)
    this.earthOrbitLine.visible = flags.earthOrbit;
    if (flags.earthOrbit) {
      const sunPos = scale.sunPositionThree;
      const rSun = sunPos.length();
      const arcPts: THREE.Vector3[] = [];
      const baseAngle = Math.atan2(-sunPos.z, -sunPos.x);
      for (let i = -30; i <= 30; i++) {
        const a = baseAngle + i * 0.4 * DEG2RAD;
        arcPts.push(
          new THREE.Vector3(
            sunPos.x + rSun * Math.cos(a),
            0,
            sunPos.z + rSun * Math.sin(a)
          )
        );
      }
      this.earthOrbitLine.geometry.setFromPoints(arcPts);
    }

    // 3. Ecliptic Plane Grid
    this.eclipticGrid.visible = flags.eclipticPlane;

    // 4. Observer Marker on Earth + Sight Lines
    const obsDir = latLonToSceneDir(
      state.earthObserver.lat,
      state.earthObserver.lon,
      earthOri
    );
    const obsPos = obsDir.clone().multiplyScalar(scale.earthRadius * 1.004);
    this.observerPinGroup.visible = flags.observerMarker;
    if (flags.observerMarker) {
      this.observerPinGroup.position.copy(obsPos);
      this.observerPinGroup.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        obsDir
      );
      // C3: During a solar eclipse, hide the solid center sphere/stem so only the hollow ring shows,
      // avoiding covering up the umbral black spot on Earth!
      const isSolarEclipseNear =
        eph.sunDirThree.dot(eph.moonDirThree) > 0.995;
      this.pinSphere.visible = !isSolarEclipseNear;
      this.pinStem.visible = !isSolarEclipseNear;
    }

    this.sunSightLine.visible = flags.sightLines;
    this.moonSightLine.visible = flags.sightLines;
    if (flags.sightLines) {
      const sunEnd = obsPos
        .clone()
        .add(eph.sunDirThree.clone().multiplyScalar(2.4));
      this.sunSightLine.geometry.setFromPoints([obsPos, sunEnd]);
      this.sunSightLine.computeLineDistances();

      const moonVec = scale.moonPositionThree.clone().sub(obsPos);
      const moonEnd = obsPos
        .clone()
        .add(moonVec.normalize().multiplyScalar(Math.min(2.4, scale.moonPositionThree.length() * 0.6)));
      this.moonSightLine.geometry.setFromPoints([obsPos, moonEnd]);
      this.moonSightLine.computeLineDistances();
    }

    // 5. Lat/Lon Grid
    this.latLonGridGroup.visible = flags.latLonGrid;

    // 6. Solar Eclipse Path on Earth
    this.eclipsePathGroup.visible = flags.eclipsePath;
    if (flags.eclipsePath) {
      // Show path if within ±18 hours of active solar eclipse or if current sun-moon alignment creates an eclipse
      let pathUtc: number | null = null;
      if (
        state.activeEclipseKind === 'solar' &&
        state.activeEclipsePeakUtc !== null &&
        Math.abs(eph.utcMs - state.activeEclipsePeakUtc) < 18 * 3600 * 1000
      ) {
        pathUtc = state.activeEclipsePeakUtc;
      }
      this.rebuildSolarEclipsePathOnEarth(pathUtc);
    }

    // 7. Shadow Cones
    this.shadowConeGroup.visible = flags.shadowCones;
    if (flags.shadowCones) {
      const antiSunDir = eph.sunDirThree.clone().negate();
      const moonDist = scale.moonPositionThree.length();

      // Moon's umbral shadow cone extending anti-sunward
      this.moonUmbraCone.position.copy(scale.moonPositionThree);
      this.moonUmbraCone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        antiSunDir
      );
      this.moonUmbraCone.scale.set(
        scale.moonRadius,
        scale.moonRadius,
        moonDist * 1.05
      );

      // Earth's umbral shadow cone extending anti-sunward
      this.earthUmbraCone.position.set(0, 0, 0);
      this.earthUmbraCone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        antiSunDir
      );
      this.earthUmbraCone.scale.set(
        scale.earthRadius,
        scale.earthRadius,
        moonDist * 1.35
      );
    }
  }
}
