import * as Astronomy from 'astronomy-engine';
import { computeEphemeris, makeAstroTime } from '../ephemeris';
import { computeEarthOrientation } from '../earthOrientation';
import { ecefToLatLon } from '../frames';
import { formatAstroDateUtc, formatDateTime, historicalDateLabelZh } from '../../time/tz';
import {
  CHINA_LUNAR_GRID_POINTS,
  doesSegmentIntersectChina,
  isPointInChina,
} from '../geo/chinaBoundary';
import { computeSolarEclipsePath } from './shadowPath';

export type EclipseCategory =
  | 'solar-total'
  | 'solar-annular'
  | 'solar-partial'
  | 'lunar-total'
  | 'lunar-partial'
  | 'lunar-penumbral';

export interface EclipseEventItem {
  id: string;
  kind: 'solar' | 'lunar';
  category: EclipseCategory;
  typeLabelZh: string;
  peakUtcMs: number;
  dateStrUtc: string;
  dateStrBeijing: string;
  year: number;
  /** Peak latitude (for solar: greatest eclipse point; for lunar: sub-lunar point at peak) */
  peakLat: number;
  /** Peak longitude */
  peakLon: number;
  /** Obscuration or eclipse magnitude */
  obscuration: number;
  /** Duration of totality/annularity in seconds (if applicable) or total lunar phase in minutes */
  durationSeconds: number;
  durationLabelZh: string;
  /** Visible in China? 'central' (totality/annularity/total lunar visible in China), 'partial' (partial visible in China), 'none' */
  chinaVisibility: 'central' | 'partial' | 'none';
  chinaVisibilityLabelZh: string;
  /** Geographic region description */
  regionZh: string;
  /** Score (0..100) with high weight for China visibility & duration */
  score: number;
  /** Title in Chinese */
  titleZh: string;
  /** Detailed or auto-generated introduction in Chinese */
  introZh: string;
  /** Is curated in the 200-item catalog? */
  isCurated?: boolean;
  /** Has a hand-written (non-template) introduction */
  hasHandwrittenIntro?: boolean;
  /** Name of the featured observing site (from hand-written notes) */
  featuredSiteName?: string;
}

export interface LocalSolarEclipseDetails {
  kind: 'total' | 'annular' | 'partial';
  typeLabelZh: string;
  obscuration: number;
  partialBeginUtc: number;
  totalBeginUtc: number | null;
  peakUtc: number;
  totalEndUtc: number | null;
  partialEndUtc: number;
  peakAltitudeDeg: number;
  durationTotalSeconds: number;
}

/**
 * Determine geographic region name in Chinese from (lat, lon).
 */
export function describeRegionZh(lat: number, lon: number): string {
  if (lat > 66.5) return '北极地区';
  if (lat < -66.5) return '南极洲及南大洋';

  // China bounding box check
  if (lat >= 18 && lat <= 53.5 && lon >= 73.5 && lon <= 135) {
    if (lat >= 38 && lon >= 115) return '中国东北至华北地区';
    if (lat >= 34 && lon < 105) return '中国西北地区 (新疆/甘肃/青海)';
    if (lat < 34 && lon < 104) return '中国西南及青藏高原';
    if (lat >= 28 && lat <= 34 && lon >= 104) return '中国长江流域及华东地区';
    if (lat < 28 && lon >= 105) return '中国华南及东南沿海';
    return '中国境内';
  }

  if (lat >= 20 && lat <= 50 && lon >= 100 && lon <= 150) return '东亚及西太平洋';
  if (lat >= -10 && lat < 25 && lon >= 90 && lon <= 140) return '东南亚及南海海域';
  if (lat >= 5 && lat <= 38 && lon >= 65 && lon < 95) return '南亚及印度洋北部';
  if (lat >= 12 && lat <= 42 && lon >= 25 && lon < 65) return '中东及西亚地区';
  if (lat >= 35 && lat <= 70 && lon >= 40 && lon <= 140) return '西伯利亚及中亚地区';
  if (lat >= 35 && lat <= 70 && lon >= -10 && lon < 40) return '欧洲地区';
  if (lat >= -35 && lat < 35 && lon >= -18 && lon <= 52) return '非洲大陆';
  if (lat >= 15 && lat <= 70 && lon >= -165 && lon <= -55) return '北美洲';
  if (lat >= -56 && lat < 15 && lon >= -85 && lon <= -32) return '南美洲';
  if (lat >= -45 && lat <= -10 && lon >= 112 && lon <= 180) return '澳大利亚及大洋洲';
  if (lon >= 40 && lon <= 115 && lat < 5) return '印度洋海域';
  if (lon >= -70 && lon <= 10) return '大西洋海域';
  return '太平洋海域';
}

/**
 * Check if a solar eclipse at (peakLat, peakLon, peakUtcMs) is visible in China.
 * Also checks local solar eclipse at key Chinese coordinates (Beijing, Wuhan, Urumqi, Kunming, Harbin, Taipei)
 * so eclipses whose central path crosses China (even if greatest eclipse is in the Pacific or Russia)
 * are accurately recognized as 'central' in China!
 */
export function evaluateChinaVisibility(
  kind: 'solar' | 'lunar',
  category: EclipseCategory,
  peakUtcMs: number,
  peakLat: number,
  peakLon: number,
  semiDurationTotalMin = 35,
  semiDurationPartialMin = 105
): 'central' | 'partial' | 'none' {
  if (kind === 'lunar') {
    const totalOffsetsMin =
      category === 'lunar-total'
        ? [
            -Math.max(10, semiDurationTotalMin),
            -Math.max(5, semiDurationTotalMin * 0.5),
            0,
            Math.max(5, semiDurationTotalMin * 0.5),
            Math.max(10, semiDurationTotalMin),
          ]
        : [];
    const partialOffsetsMin = [
      -Math.max(30, semiDurationPartialMin),
      -Math.max(15, semiDurationPartialMin * 0.6),
      0,
      Math.max(15, semiDurationPartialMin * 0.6),
      Math.max(30, semiDurationPartialMin),
    ];

    if (category === 'lunar-total') {
      for (const offMin of totalOffsetsMin) {
        const t = makeAstroTime(peakUtcMs + offMin * 60 * 1000);
        for (const pt of CHINA_LUNAR_GRID_POINTS) {
          const obs = new Astronomy.Observer(pt.lat, pt.lon, 0);
          const eq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
          const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
          if (hor.altitude > 1.0) {
            return 'central';
          }
        }
      }
    }

    for (const offMin of partialOffsetsMin) {
      const t = makeAstroTime(peakUtcMs + offMin * 60 * 1000);
      for (const pt of CHINA_LUNAR_GRID_POINTS) {
        const obs = new Astronomy.Observer(pt.lat, pt.lon, 0);
        const eq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
        const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
        if (hor.altitude > 0.0) {
          return 'partial';
        }
      }
    }

    return 'none';
  } else {
    // 1. Direct China polygon check for peak point
    if (
      (category === 'solar-total' || category === 'solar-annular') &&
      isPointInChina(peakLat, peakLon)
    ) {
      return 'central';
    }

    // 2. Trace central shadow path (centerLine + north/south limits) against China boundary polygon
    if (
      (category === 'solar-total' || category === 'solar-annular') &&
      peakLat >= -20 &&
      peakLat <= 82 &&
      peakLon >= 10 &&
      peakLon <= 180
    ) {
      const path = computeSolarEclipsePath(peakUtcMs);
      const pts = path.centerLine;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.lon < 65 || p.lon > 142 || p.lat < 2 || p.lat > 58) continue;
        const hitChina =
          isPointInChina(p.lat, p.lon) ||
          isPointInChina(p.northLat, p.northLon) ||
          isPointInChina(p.southLat, p.southLon) ||
          (i > 0 &&
            doesSegmentIntersectChina(pts[i - 1].lat, pts[i - 1].lon, p.lat, p.lon, 6));
        if (hitChina) {
          const t = makeAstroTime(p.utcMs);
          const obs = new Astronomy.Observer(p.lat, p.lon, 0);
          const eq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
          const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
          if (hor.altitude > 0.5) {
            return 'central';
          }
        }
      }
    }

    // 3. Probe China boundary/interior points for partial (or narrow grazing central) visibility
    if (peakLat >= -25 && peakLat <= 85 && peakLon >= 10 && peakLon <= 178) {
      const tStart = makeAstroTime(peakUtcMs - 2 * 86400 * 1000);
      let sawPartialInChina = false;
      for (const pt of CHINA_LUNAR_GRID_POINTS) {
        try {
          const loc = Astronomy.SearchLocalSolarEclipse(
            tStart,
            new Astronomy.Observer(pt.lat, pt.lon, 0)
          );
          if (
            loc &&
            Math.abs(loc.peak.time.date.getTime() - peakUtcMs) < 36 * 3600 * 1000 &&
            loc.peak.altitude > 0.5
          ) {
            if (
              loc.kind === Astronomy.EclipseKind.Total ||
              loc.kind === Astronomy.EclipseKind.Annular
            ) {
              return 'central';
            }
            if (loc.obscuration > 0.015) {
              sawPartialInChina = true;
            }
          }
        } catch {
          // ignore
        }
      }
      if (sawPartialInChina) return 'partial';
    }
    return 'none';
  }
}

/**
 * Compute sub-lunar point (lat, lon) on Earth at `utcMs` (where Moon is at zenith).
 */
export function computeSubLunarLatLon(utcMs: number): { lat: number; lon: number } {
  const t = makeAstroTime(utcMs);
  const moonEqd = Astronomy.Equator(
    Astronomy.Body.Moon,
    t,
    new Astronomy.Observer(0, 0, 0),
    true,
    true
  );
  const gastHours = Astronomy.SiderealTime(t);
  const lat = moonEqd.dec;
  let lon = (moonEqd.ra - gastHours) * 15;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat, lon };
}

/**
 * Real central (total/annular) duration in seconds at the point of greatest eclipse,
 * computed from the local contact times total_begin / total_end of astronomy-engine.
 * (The point of greatest eclipse is within a few seconds of the point of greatest duration.)
 * Returns 0 for partial eclipses or when local contacts cannot be resolved.
 */
export function computeCentralDurationSeconds(
  peakUtcMs: number,
  lat: number,
  lon: number
): number {
  try {
    const obs = new Astronomy.Observer(lat, lon, 0);
    const loc = Astronomy.SearchLocalSolarEclipse(
      makeAstroTime(peakUtcMs - 86400 * 1000),
      obs
    );
    if (
      !loc ||
      Math.abs(loc.peak.time.date.getTime() - peakUtcMs) > 6 * 3600 * 1000 ||
      !loc.total_begin ||
      !loc.total_end
    ) {
      return 0;
    }
    return Math.round(
      (loc.total_end.time.date.getTime() - loc.total_begin.time.date.getTime()) / 1000
    );
  } catch {
    return 0;
  }
}

/** UTC ms of Jan 1 00:00 of an astronomical year (Date.UTC maps years 0..99 to 19xx, so avoid it). */
export function utcYearStartMs(year: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, 0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Score an eclipse (0..100) with high weight for China visibility and spectacle!
 */
export function computeEclipseScore(
  _kind: 'solar' | 'lunar',
  category: EclipseCategory,
  obscuration: number,
  durationSeconds: number,
  chinaVis: 'central' | 'partial' | 'none',
  hasHistoricalBonus = false
): number {
  let base = 20;
  if (category === 'solar-total') {
    base = 46 + Math.min(18, (durationSeconds / 440) * 18);
  } else if (category === 'solar-annular') {
    base = 38 + Math.min(14, (durationSeconds / 660) * 14);
  } else if (category === 'lunar-total') {
    base = 40 + Math.min(16, (durationSeconds / 6400) * 16);
  } else if (category === 'solar-partial' || category === 'lunar-partial') {
    base = 20 + obscuration * 12;
  } else {
    base = 12;
  }

  // High weight for China visibility as requested by user!
  if (chinaVis === 'central') {
    base += 22;
  } else if (chinaVis === 'partial') {
    base += 8;
  }

  if (hasHistoricalBonus) {
    base += 5;
  }

  return Math.min(99.8, Math.round(base * 10) / 10);
}

/**
 * For partial solar eclipses where the lunar shadow axis misses Earth's surface,
 * `Astronomy.SearchGlobalSolarEclipse` leaves `latitude`, `longitude`, and `obscuration` undefined.
 * Compute the genuine greatest-eclipse point on Earth's sunlit limb (closest to the shadow axis)
 * and evaluate the actual maximum obscuration via `Astronomy.SearchLocalSolarEclipse`.
 */
export function resolvePartialSolarEclipsePeak(peakUtcMs: number): {
  lat: number;
  lon: number;
  obscuration: number;
} {
  const eph = computeEphemeris(peakUtcMs);
  const ori = computeEarthOrientation(peakUtcMs);
  const m = ori.eclToEcef(eph.moonEclKm);
  const s = ori.eclToEcef(eph.sunEclKm);

  const dx = m.x - s.x;
  const dy = m.y - s.y;
  const dz = m.z - s.z;
  const dLen = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / dLen;
  const uy = dy / dLen;
  const uz = dz / dLen;

  // Closest point on the Sun->Moon shadow axis to Earth's center (origin)
  const proj = -(m.x * ux + m.y * uy + m.z * uz);
  const cx = m.x + proj * ux;
  const cy = m.y + proj * uy;
  const cz = m.z + proj * uz;
  const cLen = Math.hypot(cx, cy, cz) || 1;
  const nx = cx / cLen;
  const ny = cy / cLen;
  const nz = cz / cLen;

  const sLen = Math.hypot(s.x, s.y, s.z) || 1;
  const sx = s.x / sLen;
  const sy = s.y / sLen;
  const sz = s.z / sLen;

  const tStart = makeAstroTime(peakUtcMs - 36 * 3600 * 1000);
  // Nudge slightly sunward from the geometric terminator so the Sun is above the horizon (>1 deg)
  for (const sunBias of [0.02, 0.0, 0.05, 0.09]) {
    const vx = nx + sx * sunBias;
    const vy = ny + sy * sunBias;
    const vz = nz + sz * sunBias;
    const { lat, lon } = ecefToLatLon({ x: vx, y: vy, z: vz });
    try {
      const loc = Astronomy.SearchLocalSolarEclipse(tStart, new Astronomy.Observer(lat, lon, 0));
      if (
        loc &&
        Math.abs(loc.peak.time.date.getTime() - peakUtcMs) < 24 * 3600 * 1000 &&
        loc.obscuration > 0 &&
        loc.peak.altitude >= 0
      ) {
        return {
          lat: Math.round(lat * 100) / 100,
          lon: Math.round(lon * 100) / 100,
          obscuration: loc.obscuration,
        };
      }
    } catch {
      // try next bias
    }
  }

  const fallback = ecefToLatLon({ x: nx + sx * 0.03, y: ny + sy * 0.03, z: nz + sz * 0.03 });
  return {
    lat: Math.round(fallback.lat * 100) / 100,
    lon: Math.round(fallback.lon * 100) / 100,
    obscuration: 0,
  };
}

/**
 * Build an EclipseEventItem from an Astronomy.GlobalSolarEclipseInfo.
 */
export function buildSolarEclipseItem(e: Astronomy.GlobalSolarEclipseInfo): EclipseEventItem {
  const peakUtcMs = e.peak.date.getTime();
  const year = e.peak.date.getUTCFullYear();
  const dateStrUtc = formatAstroDateUtc(peakUtcMs);
  const dateStrBeijing = formatDateTime(peakUtcMs, 'Asia/Shanghai', false);
  const needsPartialPeak =
    e.latitude === undefined ||
    !Number.isFinite(e.latitude) ||
    e.longitude === undefined ||
    !Number.isFinite(e.longitude) ||
    e.obscuration === undefined ||
    !Number.isFinite(e.obscuration);
  const resolvedPartial = needsPartialPeak ? resolvePartialSolarEclipsePeak(peakUtcMs) : null;
  const peakLat: number =
    e.latitude !== undefined && Number.isFinite(e.latitude) ? e.latitude : resolvedPartial!.lat;
  const peakLon: number =
    e.longitude !== undefined && Number.isFinite(e.longitude) ? e.longitude : resolvedPartial!.lon;
  const obscuration: number =
    e.obscuration !== undefined && Number.isFinite(e.obscuration)
      ? e.obscuration
      : resolvedPartial!.obscuration;

  let category: EclipseCategory = 'solar-partial';
  let typeLabelZh = '日偏食';
  if (e.kind === Astronomy.EclipseKind.Total) {
    category = 'solar-total';
    typeLabelZh = '日全食';
  } else if (e.kind === Astronomy.EclipseKind.Annular) {
    category = 'solar-annular';
    typeLabelZh = '日环食';
  }

  const durationSeconds =
    category === 'solar-partial' ? 0 : computeCentralDurationSeconds(peakUtcMs, peakLat, peakLon);
  const min = Math.floor(durationSeconds / 60);
  const sec = durationSeconds % 60;
  const durationLabelZh =
    durationSeconds > 0
      ? `${category === 'solar-annular' ? '环食' : '全食'}约 ${min}分${String(sec).padStart(2, '0')}秒`
      : `最大食分 ${obscuration.toFixed(2)}`;

  const chinaVisibility = evaluateChinaVisibility('solar', category, peakUtcMs, peakLat, peakLon);
  const chinaVisibilityLabelZh =
    chinaVisibility === 'central'
      ? '中国可见全/环食'
      : chinaVisibility === 'partial'
        ? '中国可见偏食'
        : '中国不可见';

  const regionZh = describeRegionZh(peakLat, peakLon);
  const score = computeEclipseScore('solar', category, obscuration, durationSeconds, chinaVisibility);

  const id = `solar-${dateStrUtc}`;
  const titleZh = `${historicalDateLabelZh(peakUtcMs)} ${regionZh}${typeLabelZh}`;
  const introZh = `本次${typeLabelZh}食甚发生于北京时间 ${dateStrBeijing}，极盛点位于${regionZh} (${peakLat >= 0 ? peakLat.toFixed(1) + '°N' : (-peakLat).toFixed(1) + '°S'}, ${peakLon >= 0 ? peakLon.toFixed(1) + '°E' : (-peakLon).toFixed(1) + '°W'})，太阳被遮挡面积比例约 ${(obscuration * 100).toFixed(1)}%${durationSeconds > 0 ? `，中心食持续约 ${durationLabelZh}` : ''}（${chinaVisibilityLabelZh}）。`;

  return {
    id,
    kind: 'solar',
    category,
    typeLabelZh,
    peakUtcMs,
    dateStrUtc,
    dateStrBeijing,
    year,
    peakLat,
    peakLon,
    obscuration,
    durationSeconds,
    durationLabelZh,
    chinaVisibility,
    chinaVisibilityLabelZh,
    regionZh,
    score,
    titleZh,
    introZh,
  };
}

/**
 * Build an EclipseEventItem from an Astronomy.LunarEclipseInfo.
 */
export function buildLunarEclipseItem(e: Astronomy.LunarEclipseInfo): EclipseEventItem {
  const peakUtcMs = e.peak.date.getTime();
  const year = e.peak.date.getUTCFullYear();
  const dateStrUtc = formatAstroDateUtc(peakUtcMs);
  const dateStrBeijing = formatDateTime(peakUtcMs, 'Asia/Shanghai', false);
  const { lat: peakLat, lon: peakLon } = computeSubLunarLatLon(peakUtcMs);

  let category: EclipseCategory = 'lunar-penumbral';
  let typeLabelZh = '半影月食';
  let durationSeconds = Math.round(e.sd_penum * 2 * 60);
  if (e.kind === Astronomy.EclipseKind.Total) {
    category = 'lunar-total';
    typeLabelZh = '月全食';
    durationSeconds = Math.round(e.sd_total * 2 * 60);
  } else if (e.kind === Astronomy.EclipseKind.Partial) {
    category = 'lunar-partial';
    typeLabelZh = '月偏食';
    durationSeconds = Math.round(e.sd_partial * 2 * 60);
  }

  const totalMinutes = Math.round(durationSeconds / 60);
  const durationLabelZh =
    category === 'lunar-total'
      ? `全食 ${totalMinutes} 分钟`
      : category === 'lunar-partial'
        ? `偏食 ${totalMinutes} 分钟`
        : `半影食 ${totalMinutes} 分钟`;

  const chinaVisibility = evaluateChinaVisibility(
    'lunar',
    category,
    peakUtcMs,
    peakLat,
    peakLon,
    e.sd_total,
    e.sd_partial
  );
  const chinaVisibilityLabelZh =
    chinaVisibility === 'central'
      ? '中国全程/主要阶段可见'
      : chinaVisibility === 'partial'
        ? '中国可见带食月出/月落'
        : '中国不可见';

  const regionZh = describeRegionZh(peakLat, peakLon);
  const obscuration = e.obscuration;
  const score = computeEclipseScore('lunar', category, obscuration, durationSeconds, chinaVisibility);

  const id = `lunar-${dateStrUtc}`;
  const titleZh = `${historicalDateLabelZh(peakUtcMs)} ${typeLabelZh}${category === 'lunar-total' ? ' (红月亮)' : ''}`;
  const introZh = `本次${typeLabelZh}食甚发生于北京时间 ${dateStrBeijing}，${durationLabelZh}，本影遮挡月面比例 ${(obscuration * 100).toFixed(0)}%（${chinaVisibilityLabelZh}）。食甚时月球正对地球 ${peakLat >= 0 ? peakLat.toFixed(1) + '°N' : (-peakLat).toFixed(1) + '°S'}, ${peakLon >= 0 ? peakLon.toFixed(1) + '°E' : (-peakLon).toFixed(1) + '°W'} 上空。`;

  return {
    id,
    kind: 'lunar',
    category,
    typeLabelZh,
    peakUtcMs,
    dateStrUtc,
    dateStrBeijing,
    year,
    peakLat,
    peakLon,
    obscuration,
    durationSeconds,
    durationLabelZh,
    chinaVisibility,
    chinaVisibilityLabelZh,
    regionZh,
    score,
    titleZh,
    introZh,
  };
}

/**
 * Search all solar and lunar eclipses in a given calendar year (or small year span).
 */
export function searchEclipsesInYear(year: number): EclipseEventItem[] {
  const startUtc = utcYearStartMs(year);
  const endUtc = utcYearStartMs(year + 1) + 86400000;
  const items: EclipseEventItem[] = [];

  // Solar eclipses
  let s = Astronomy.SearchGlobalSolarEclipse(makeAstroTime(startUtc));
  while (s && s.peak.date.getTime() < endUtc) {
    if (s.peak.date.getUTCFullYear() === year) {
      items.push(buildSolarEclipseItem(s));
    }
    s = Astronomy.NextGlobalSolarEclipse(s.peak);
  }

  // Lunar eclipses
  let l = Astronomy.SearchLunarEclipse(makeAstroTime(startUtc));
  while (l && l.peak.date.getTime() < endUtc) {
    if (l.peak.date.getUTCFullYear() === year) {
      items.push(buildLunarEclipseItem(l));
    }
    l = Astronomy.NextLunarEclipse(l.peak);
  }

  items.sort((a, b) => a.peakUtcMs - b.peakUtcMs);
  return items;
}

/**
 * Search next N local solar eclipses visible at observer (lat, lon).
 */
export function searchUpcomingLocalSolarEclipses(
  startUtcMs: number,
  lat: number,
  lon: number,
  count = 5
): LocalSolarEclipseDetails[] {
  const obs = new Astronomy.Observer(lat, lon, 0);
  const results: LocalSolarEclipseDetails[] = [];
  let t = makeAstroTime(startUtcMs);

  for (let i = 0; i < count * 3 && results.length < count; i++) {
    try {
      const loc = i === 0 ? Astronomy.SearchLocalSolarEclipse(t, obs) : Astronomy.NextLocalSolarEclipse(t, obs);
      if (!loc) break;
      t = loc.peak.time;

      if (loc.peak.altitude > 0) {
        const kind =
          loc.kind === Astronomy.EclipseKind.Total
            ? 'total'
            : loc.kind === Astronomy.EclipseKind.Annular
              ? 'annular'
              : 'partial';
        const typeLabelZh = kind === 'total' ? '日全食' : kind === 'annular' ? '日环食' : '日偏食';
        const totalBeginUtc = loc.total_begin ? loc.total_begin.time.date.getTime() : null;
        const totalEndUtc = loc.total_end ? loc.total_end.time.date.getTime() : null;
        const durationTotalSeconds =
          totalBeginUtc && totalEndUtc ? Math.round((totalEndUtc - totalBeginUtc) / 1000) : 0;

        results.push({
          kind,
          typeLabelZh,
          obscuration: loc.obscuration,
          partialBeginUtc: loc.partial_begin.time.date.getTime(),
          totalBeginUtc,
          peakUtc: loc.peak.time.date.getTime(),
          totalEndUtc,
          partialEndUtc: loc.partial_end.time.date.getTime(),
          peakAltitudeDeg: loc.peak.altitude,
          durationTotalSeconds,
        });
      }
    } catch {
      break;
    }
  }
  return results;
}
