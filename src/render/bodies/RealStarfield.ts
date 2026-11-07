import * as THREE from 'three';
import { astroToThreeVec, eqjToEcl } from '../../astro/frames';
import { DEG2RAD } from '../../utils/math';

interface GeoJsonStarFeature {
  properties: {
    mag: number;
    bv?: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

interface GeoJsonConstellationLineFeature {
  id: string;
  geometry: {
    type: 'MultiLineString' | 'LineString';
    coordinates: number[][][] | number[][];
  };
}

/**
 * Convert B-V color index (-0.4 to +2.0) to linear RGB [0..1].
 */
export function bvToRgb(bv: number): [number, number, number] {
  const t = Math.max(-0.4, Math.min(2.0, Number.isFinite(bv) ? bv : 0.6));
  if (t < 0.0) {
    // Blue-white O/B stars
    const u = (t + 0.4) / 0.4;
    return [0.64 + 0.24 * u, 0.76 + 0.18 * u, 1.0];
  } else if (t < 0.4) {
    // White A/F stars
    const u = t / 0.4;
    return [0.88 + 0.12 * u, 0.94 + 0.05 * u, 1.0];
  } else if (t < 0.8) {
    // Yellow-white G stars (Sun-like)
    const u = (t - 0.4) / 0.4;
    return [1.0, 0.99 - 0.07 * u, 1.0 - 0.18 * u];
  } else if (t < 1.3) {
    // Orange K stars
    const u = (t - 0.8) / 0.5;
    return [1.0, 0.92 - 0.16 * u, 0.82 - 0.26 * u];
  } else {
    // Red-orange M stars (Betelgeuse, Antares)
    const u = (t - 1.3) / 0.7;
    return [1.0, 0.76 - 0.14 * u, 0.56 - 0.18 * u];
  }
}

/**
 * Convert J2000 (raDeg, decDeg) to a Three.js position at `radius` in our J2000 Ecliptic scene frame.
 */
export function raDecJ2000ToSceneThree(raDeg: number, decDeg: number, radius: number): THREE.Vector3 {
  const ra = raDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  const cosDec = Math.cos(dec);
  const eqj = {
    x: cosDec * Math.cos(ra),
    y: cosDec * Math.sin(ra),
    z: Math.sin(dec),
  };
  const ecl = eqjToEcl(eqj);
  return astroToThreeVec(ecl.x, ecl.y, ecl.z).multiplyScalar(radius);
}

/**
 * Major constellations and asterisms with Chinese labels and J2000 (RA deg, Dec deg) centers.
 */
export const MAJOR_CONSTELLATION_LABELS_ZH: ReadonlyArray<{
  id: string;
  nameZh: string;
  raDeg: number;
  decDeg: number;
}> = [
  { id: 'UMa', nameZh: '大熊座 (北斗七星)', raDeg: 185, decDeg: 55 },
  { id: 'UMi', nameZh: '小熊座 (北极星)', raDeg: 38, decDeg: 87 },
  { id: 'Ori', nameZh: '猎户座', raDeg: 84, decDeg: 3 },
  { id: 'Cas', nameZh: '仙后座', raDeg: 15, decDeg: 60 },
  { id: 'Sco', nameZh: '天蝎座 (心宿二)', raDeg: 252, decDeg: -26 },
  { id: 'Cyg', nameZh: '天鹅座 (天津四)', raDeg: 306, decDeg: 42 },
  { id: 'Lyr', nameZh: '天琴座 (织女)', raDeg: 279, decDeg: 38 },
  { id: 'Aql', nameZh: '天鹰座 (牛郎)', raDeg: 297, decDeg: 9 },
  { id: 'Leo', nameZh: '狮子座', raDeg: 160, decDeg: 16 },
  { id: 'Tau', nameZh: '金牛座 (毕宿五)', raDeg: 68, decDeg: 18 },
  { id: 'Gem', nameZh: '双子座', raDeg: 112, decDeg: 28 },
  { id: 'CMa', nameZh: '大犬座 (天狼星)', raDeg: 101, decDeg: -20 },
  { id: 'Boo', nameZh: '牧夫座 (大角星)', raDeg: 215, decDeg: 25 },
  { id: 'Vir', nameZh: '室女座 (角宿一)', raDeg: 201, decDeg: -6 },
  { id: 'Sgr', nameZh: '人马座', raDeg: 285, decDeg: -28 },
  { id: 'Peg', nameZh: '飞马座', raDeg: 342, decDeg: 20 },
  { id: 'Aur', nameZh: '御夫座 (五车二)', raDeg: 84, decDeg: 42 },
  { id: 'Cru', nameZh: '南十字座', raDeg: 186, decDeg: -60 },
];

/** Top navigation stars immediately available before stars.6.json finishes loading */
const FALLBACK_BRIGHT_STARS: ReadonlyArray<[number, number, number, number]> = [
  // [raDeg, decDeg, mag, bv]
  [101.287, -16.716, -1.46, 0.0], // Sirius
  [95.988, -52.696, -0.74, 0.15], // Canopus
  [213.915, 19.182, -0.05, 1.23], // Arcturus
  [279.235, 38.784, 0.03, 0.0],   // Vega
  [79.172, 45.998, 0.08, 0.8],    // Capella
  [78.634, -8.202, 0.13, -0.03],  // Rigel
  [114.825, 5.225, 0.37, 0.42],   // Procyon
  [88.793, 7.407, 0.42, 1.85],    // Betelgeuse
  [297.696, 8.868, 0.76, 0.22],   // Altair
  [68.98, 16.509, 0.86, 1.54],    // Aldebaran
  [201.298, -11.161, 0.97, -0.23],// Spica
  [247.352, -26.432, 1.06, 1.83], // Antares
  [116.329, 28.026, 1.14, 1.0],   // Pollux
  [310.358, 45.28, 1.25, 0.09],   // Deneb
  [152.093, 11.967, 1.36, -0.11], // Regulus
  // Big Dipper (北斗七星)
  [165.932, 61.751, 1.79, 1.07],  // Dubhe 天枢
  [165.46, 56.382, 2.37, -0.02],  // Merak 天璇
  [178.458, 53.695, 2.44, 0.0],   // Phecda 天玑
  [183.857, 57.033, 3.31, 0.08],  // Megrez 天权
  [193.507, 55.96, 1.77, -0.02],  // Alioth 玉衡
  [200.981, 54.925, 2.23, 0.02],  // Mizar 开阳
  [206.885, 49.313, 1.86, -0.19], // Alkaid 瑶光
  // Polaris (北极星)
  [37.955, 89.264, 1.98, 0.6],
  // Orion's Belt (参宿一、二、三)
  [85.19, -1.943, 1.77, -0.21],   // Alnitak
  [84.053, -1.202, 1.69, -0.18],  // Alnilam
  [83.002, -0.299, 2.23, -0.22],  // Mintaka
  [81.283, 6.35, 1.64, -0.22],    // Bellatrix
  [86.939, -9.67, 2.06, -0.17],   // Saiph
];

let cachedStarsPromise: Promise<GeoJsonStarFeature[]> | null = null;
let cachedLinesPromise: Promise<GeoJsonConstellationLineFeature[]> | null = null;

function loadStarsData(): Promise<GeoJsonStarFeature[]> {
  if (!cachedStarsPromise) {
    cachedStarsPromise = fetch(`${import.meta.env.BASE_URL}data/stars.6.json`)
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then((d) => d.features ?? [])
      .catch(() => []);
  }
  return cachedStarsPromise;
}

function loadConstellationLinesData(): Promise<GeoJsonConstellationLineFeature[]> {
  if (!cachedLinesPromise) {
    cachedLinesPromise = fetch(`${import.meta.env.BASE_URL}data/constellations.lines.json`)
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then((d) => d.features ?? [])
      .catch(() => []);
  }
  return cachedLinesPromise;
}

const STAR_VERT_GLSL = /* glsl */ `
  attribute float aSize;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const STAR_FRAG_GLSL = /* glsl */ `
  varying vec3 vColor;
  uniform float uOpacity;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 3.8);
    gl_FragColor = vec4(vColor, core * uOpacity);
  }
`;

export class RealCelestialSphere {
  public readonly group = new THREE.Group();
  public readonly starPoints: THREE.Points;
  public readonly starMaterial: THREE.ShaderMaterial;
  public readonly constellationGroup = new THREE.Group();
  public readonly constellationLinesMat: THREE.LineBasicMaterial;
  private labelMaterials: THREE.SpriteMaterial[] = [];
  private readonly radius: number;

  constructor(radius = 42000) {
    this.radius = radius;

    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT_GLSL,
      fragmentShader: STAR_FRAG_GLSL,
      uniforms: {
        uOpacity: { value: 0.95 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const fallbackGeo = this.buildStarGeometryFromTuples(FALLBACK_BRIGHT_STARS);
    this.starPoints = new THREE.Points(fallbackGeo, this.starMaterial);
    this.group.add(this.starPoints);

    this.constellationLinesMat = new THREE.LineBasicMaterial({
      color: 0x5c92e8,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.group.add(this.constellationGroup);

    this.buildConstellationLabels();
    this.loadAsyncCatalog();
  }

  private buildStarGeometryFromTuples(
    stars: ReadonlyArray<readonly [number, number, number, number]>
  ): THREE.BufferGeometry {
    const n = stars.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const [raDeg, decDeg, mag, bv] = stars[i];
      const pos = raDecJ2000ToSceneThree(raDeg, decDeg, this.radius);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      const [r, g, b] = bvToRgb(bv);
      // Flux scaling compressed for display dynamic range
      const lum = Math.min(1.0, Math.max(0.22, Math.pow(10, -0.14 * (mag - 0.5))));
      colors[i * 3] = r * lum;
      colors[i * 3 + 1] = g * lum;
      colors[i * 3 + 2] = b * lum;

      // Brighter stars get larger point size
      sizes[i] = Math.max(1.3, Math.min(7.5, (6.5 - mag) * 1.05));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }

  private loadAsyncCatalog(): void {
    loadStarsData().then((features) => {
      if (!features || features.length === 0) return;
      const tuples: Array<[number, number, number, number]> = [];
      for (const f of features) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const mag = Number(f.properties?.mag ?? 5.5);
        const bv = parseFloat(f.properties?.bv ?? '0.5');
        tuples.push([coords[0], coords[1], mag, Number.isFinite(bv) ? bv : 0.5]);
      }
      if (tuples.length > 0) {
        const oldGeo = this.starPoints.geometry;
        this.starPoints.geometry = this.buildStarGeometryFromTuples(tuples);
        oldGeo.dispose();
      }
    });

    loadConstellationLinesData().then((features) => {
      if (!features || features.length === 0) return;
      const segPositions: number[] = [];
      const lineR = this.radius * 0.998;
      for (const f of features) {
        const geom = f.geometry;
        if (!geom) continue;
        const polylines: number[][][] =
          geom.type === 'MultiLineString'
            ? (geom.coordinates as number[][][])
            : [geom.coordinates as number[][]];
        for (const line of polylines) {
          for (let i = 0; i + 1 < line.length; i++) {
            const p1 = raDecJ2000ToSceneThree(line[i][0], line[i][1], lineR);
            const p2 = raDecJ2000ToSceneThree(line[i + 1][0], line[i + 1][1], lineR);
            segPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          }
        }
      }
      if (segPositions.length > 0) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(segPositions, 3));
        const linesMesh = new THREE.LineSegments(lineGeo, this.constellationLinesMat);
        this.constellationGroup.add(linesMesh);
      }
    });
  }

  private buildConstellationLabels(): void {
    const labelScale = this.radius * 0.065;
    for (const item of MAJOR_CONSTELLATION_LABELS_ZH) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = '600 24px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(135, 185, 255, 0.85)';
        ctx.fillText(item.nameZh, 128, 32);
      }
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      this.labelMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      const pos = raDecJ2000ToSceneThree(item.raDeg, item.decDeg, this.radius * 0.995);
      sprite.position.copy(pos);
      sprite.scale.set(labelScale, labelScale * 0.25, 1);
      this.constellationGroup.add(sprite);
    }
  }

  public setOpacity(alpha: number, showConstellations = true): void {
    const clamped = Math.max(0, Math.min(1, alpha));
    this.starPoints.visible = clamped > 0.01;
    this.starMaterial.uniforms.uOpacity.value = clamped;
    this.constellationGroup.visible = showConstellations && clamped > 0.05;
    this.constellationLinesMat.opacity = 0.32 * clamped;
    for (const m of this.labelMaterials) {
      m.opacity = 0.72 * clamped;
    }
  }
}
