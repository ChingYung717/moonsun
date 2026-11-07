import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Astronomy from 'astronomy-engine';
import {
  EclipseEventItem,
  buildLunarEclipseItem,
  buildSolarEclipseItem,
} from '../src/astro/eclipses/search';
import { CURATED_ECLIPSE_NOTES, CuratedEclipseNote } from '../src/astro/eclipses/intros.zh';
import {
  computeSarosSeries,
  summarizeSolarPathGeography,
} from '../src/astro/eclipses/pathGeography';
import { isPointInChina } from '../src/astro/geo/chinaBoundary';
import { makeAstroTime } from '../src/astro/ephemeris';
import { GREGORIAN_REFORM_MS, julianCalendarToMs } from '../src/time/tz';

const QUOTAS = {
  ancient: 15,      // year < 1900 historical & ancient records
  solarTotal: 90,   // modern (1900..2095) solar-total
  solarAnnular: 35, // modern (1900..2095) solar-annular
  lunarTotal: 60,   // modern (1900..2095) lunar-total
} as const;

interface NoteTarget {
  key: string;
  kind: 'solar' | 'lunar';
  targetMs: number;
  note: CuratedEclipseNote;
}

/**
 * Parse note keys `<kind>-<YYYY>-<MM>-<DD>` (year may be negative, astronomical numbering).
 * Dates before the 1582 Gregorian reform are interpreted in the Julian calendar.
 */
function parseNoteTargets(): NoteTarget[] {
  const targets: NoteTarget[] = [];
  for (const [key, note] of Object.entries(CURATED_ECLIPSE_NOTES)) {
    const m = /^(solar|lunar)-(-?\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) {
      throw new Error(`Bad curated note key: ${key}`);
    }
    const kind = m[1] as 'solar' | 'lunar';
    const y = parseInt(m[2], 10);
    const mo = parseInt(m[3], 10);
    const d = parseInt(m[4], 10);
    const gregMs = (() => {
      const dt = new Date(0);
      dt.setUTCFullYear(y, mo - 1, d);
      dt.setUTCHours(12, 0, 0, 0);
      return dt.getTime();
    })();
    const targetMs =
      gregMs < GREGORIAN_REFORM_MS ? julianCalendarToMs(y, mo, d) + 12 * 3600 * 1000 : gregMs;
    targets.push({ key, kind, targetMs, note });
  }
  return targets;
}

function applyNote(item: EclipseEventItem, note: CuratedEclipseNote): EclipseEventItem {
  const inChina =
    note.featuredLat !== undefined &&
    note.featuredLon !== undefined &&
    isPointInChina(note.featuredLat, note.featuredLon);
  const chinaVis = inChina ? 'central' : item.chinaVisibility;
  const chinaLabel =
    chinaVis === 'central'
      ? item.kind === 'solar'
        ? '中国可见全/环食'
        : '中国全程/主要阶段可见'
      : item.chinaVisibilityLabelZh;

  // Honesty check for solar eclipses: what does *this program's model* give at the featured site?
  let introZh = note.introZh;
  if (item.kind === 'solar' && note.featuredLat !== undefined && note.featuredLon !== undefined) {
    try {
      const loc = Astronomy.SearchLocalSolarEclipse(
        makeAstroTime(item.peakUtcMs - 86400 * 1000),
        new Astronomy.Observer(note.featuredLat, note.featuredLon, 0)
      );
      const site = note.featuredSiteName ?? '代表观测点';
      if (Math.abs(loc.peak.time.date.getTime() - item.peakUtcMs) < 86400 * 1000) {
        const isCentral =
          loc.kind === Astronomy.EclipseKind.Total || loc.kind === Astronomy.EclipseKind.Annular;
        if (!isCentral && item.category !== 'solar-partial') {
          introZh += `【模型说明】按本程序采用的 ΔT 模型，${site}只见到约 ${(loc.obscuration * 100).toFixed(0)}% 的偏食，中心食带未经过该地；${item.year < 1600 ? '这正是古代日食记录可用来反推地球自转变化（ΔT）的原因，' : ''}请以史料与专业研究为准。`;
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    ...item,
    titleZh: note.titleZh || item.titleZh,
    introZh,
    peakLat: note.featuredLat ?? item.peakLat,
    peakLon: note.featuredLon ?? item.peakLon,
    featuredSiteName: note.featuredSiteName,
    chinaVisibility: chinaVis,
    chinaVisibilityLabelZh: chinaLabel,
    score: Math.min(99.9, Math.round((item.score + (note.bonusScore ?? 8) * 0.5) * 10) / 10),
    isCurated: true,
    hasHandwrittenIntro: true,
  };
}

/**
 * Rich data-driven introduction for curated events without a hand-written essay (A5).
 * Includes crossed countries/regions, Chinese provinces, best Chinese city duration/altitude,
 * and Saros series number + relative!
 */
function buildDataDrivenIntro(
  item: EclipseEventItem,
  allById: ReadonlyMap<string, EclipseEventItem>
): EclipseEventItem {
  const latStr =
    item.peakLat >= 0 ? `${item.peakLat.toFixed(1)}°N` : `${(-item.peakLat).toFixed(1)}°S`;
  const lonStr =
    item.peakLon >= 0 ? `${item.peakLon.toFixed(1)}°E` : `${(-item.peakLon).toFixed(1)}°W`;
  const saros = computeSarosSeries(item.kind, item.peakUtcMs);

  // Find a Saros relative (±1 Saros = ±6585.32 days) in allById
  let sarosRelativeText = `它属于第 ${saros} 号沙罗序列`;
  for (const other of allById.values()) {
    if (other.kind !== item.kind || other.id === item.id) continue;
    const diffDays = Math.abs(other.peakUtcMs - item.peakUtcMs) / 86400000;
    if (Math.abs(diffDays - 6585.32) < 2.0) {
      sarosRelativeText = `它与 ${other.dateStrUtc} 的${other.typeLabelZh}同属第 ${saros} 号沙罗序列（相隔18年11天8小时）`;
      break;
    }
  }

  let peakLat = item.peakLat;
  let peakLon = item.peakLon;
  let featuredSiteName = item.featuredSiteName;
  let introParts: string[] = [];

  if (item.kind === 'solar') {
    const bandName = item.category === 'solar-total' ? '全食带' : '环食带';
    const geo = summarizeSolarPathGeography(item.peakUtcMs);
    if (geo.regionsCrossedZh.length > 0) {
      introParts.push(`${bandName}依次经过${geo.regionsCrossedZh.join('、')}。`);
    } else {
      introParts.push(`本次${item.typeLabelZh}主食带经过${item.regionZh}。`);
    }

    if (geo.chinaProvincesZh.length > 0) {
      let chinaSentence = `在中国境内掠过${geo.chinaProvincesZh.join('、')}`;
      if (geo.bestChinaSite) {
        const min = Math.floor(geo.bestChinaSite.durationSeconds / 60);
        const sec = geo.bestChinaSite.durationSeconds % 60;
        const durText = min > 0 ? `${min}分${String(sec).padStart(2, '0')}秒` : `${sec}秒`;
        chinaSentence += `，其中${geo.bestChinaSite.province}${geo.bestChinaSite.name}${item.category === 'solar-total' ? '全食' : '环食'}持续约 ${durText}、食甚太阳高度角约 ${geo.bestChinaSite.altitudeDeg}°`;
        peakLat = geo.bestChinaSite.lat;
        peakLon = geo.bestChinaSite.lon;
        featuredSiteName = `${geo.bestChinaSite.province}${geo.bestChinaSite.name}`;
      }
      introParts.push(`${chinaSentence}。`);
    } else if (item.chinaVisibility === 'partial') {
      introParts.push(`中心食带未进入中国陆地，但中国部分地区可观测到日偏食。`);
    }

    introParts.push(
      `全球食甚发生于北京时间 ${item.dateStrBeijing}（极盛点 ${latStr}, ${lonStr}，${item.durationLabelZh}）；${sarosRelativeText}。`
    );
  } else {
    // Lunar eclipse data-driven intro
    const visSentence =
      item.chinaVisibility === 'central'
        ? '中国境内可见全食阶段的古铜色“红月亮”（地球大气将太阳红光折射至月面所致）'
        : item.chinaVisibility === 'partial'
          ? '中国部分地区可见带食月出或带食月落'
          : `食甚时月球正对${item.regionZh}（${latStr}, ${lonStr}）天顶，切换到“月面视角”可目睹地球遮住太阳并环绕一圈红色霞光环`;

    introParts.push(
      `本次${item.typeLabelZh}食甚发生于北京时间 ${item.dateStrBeijing}，${item.durationLabelZh}，本影最大遮挡比例 ${(item.obscuration * 100).toFixed(0)}%。${visSentence}；${sarosRelativeText}。`
    );
  }

  return {
    ...item,
    peakLat,
    peakLon,
    featuredSiteName,
    introZh: introParts.join(''),
    isCurated: true,
    hasHandwrittenIntro: false,
  };
}

function selectCategoryWithQuota(
  candidates: EclipseEventItem[],
  quota: number,
  allById: ReadonlyMap<string, EclipseEventItem>
): EclipseEventItem[] {
  const hw = candidates
    .filter((x) => x.hasHandwrittenIntro)
    .sort((a, b) => b.score - a.score || b.peakUtcMs - a.peakUtcMs);
  if (hw.length >= quota) {
    return hw.slice(0, quota);
  }
  const rest = candidates
    .filter((x) => !x.hasHandwrittenIntro)
    .sort((a, b) => b.score - a.score || b.peakUtcMs - a.peakUtcMs)
    .slice(0, quota - hw.length)
    .map((x) => buildDataDrivenIntro(x, allById));
  return [...hw, ...rest];
}

function main() {
  const targets = parseNoteTargets();
  const byId = new Map<string, EclipseEventItem>();
  const matchedKeys = new Set<string>();

  // 1. Explicitly search every curated note (covers ancient events outside the scan range)
  for (const t of targets) {
    const start = makeAstroTime(t.targetMs - 5 * 86400 * 1000);
    const e =
      t.kind === 'solar'
        ? buildSolarEclipseItem(Astronomy.SearchGlobalSolarEclipse(start))
        : buildLunarEclipseItem(Astronomy.SearchLunarEclipse(start));
    if (Math.abs(e.peakUtcMs - t.targetMs) > 2 * 86400 * 1000) {
      throw new Error(
        `Curated note ${t.key} did not match any ${t.kind} eclipse (nearest: ${e.id}, ${e.titleZh})`
      );
    }
    byId.set(e.id, applyNote(e, t.note));
    matchedKeys.add(t.key);
  }

  // 2. Scan 1900–2095 for all solar and lunar eclipses
  const startUtc = Date.UTC(1900, 0, 1);
  const endUtc = Date.UTC(2095, 11, 31);
  let s = Astronomy.SearchGlobalSolarEclipse(makeAstroTime(startUtc));
  while (s && s.peak.date.getTime() < endUtc) {
    const item = buildSolarEclipseItem(s);
    if (!byId.has(item.id)) byId.set(item.id, item);
    s = Astronomy.NextGlobalSolarEclipse(s.peak);
  }
  let l = Astronomy.SearchLunarEclipse(makeAstroTime(startUtc));
  while (l && l.peak.date.getTime() < endUtc) {
    const item = buildLunarEclipseItem(l);
    if (!byId.has(item.id)) byId.set(item.id, item);
    l = Astronomy.NextLunarEclipse(l.peak);
  }

  const all = Array.from(byId.values());

  // 3. Enforce strict category quotas totaling 200 items (A2):
  const ancientPool = all.filter((x) => x.year < 1900);
  const modernSolarTotalPool = all.filter(
    (x) => x.year >= 1900 && x.category === 'solar-total'
  );
  const modernSolarAnnularPool = all.filter(
    (x) => x.year >= 1900 && x.category === 'solar-annular'
  );
  const modernLunarTotalPool = all.filter(
    (x) => x.year >= 1900 && x.category === 'lunar-total'
  );

  const selectedAncient = selectCategoryWithQuota(ancientPool, QUOTAS.ancient, byId);
  const selectedSolarTotal = selectCategoryWithQuota(
    modernSolarTotalPool,
    QUOTAS.solarTotal,
    byId
  );
  const selectedSolarAnnular = selectCategoryWithQuota(
    modernSolarAnnularPool,
    QUOTAS.solarAnnular,
    byId
  );
  const selectedLunarTotal = selectCategoryWithQuota(
    modernLunarTotalPool,
    QUOTAS.lunarTotal,
    byId
  );

  const selected = [
    ...selectedAncient,
    ...selectedSolarTotal,
    ...selectedSolarAnnular,
    ...selectedLunarTotal,
  ].sort((a, b) => b.score - a.score || b.peakUtcMs - a.peakUtcMs);

  const outPath = path.resolve(process.cwd(), 'src/astro/eclipses/catalog.json');
  fs.writeFileSync(outPath, JSON.stringify(selected, null, 2), 'utf-8');

  const hwCount = selected.filter((x) => x.hasHandwrittenIntro).length;
  console.log(
    `Generated ${selected.length} items (${hwCount} hand-written, ${selected.length - hwCount} data-driven)`
  );
  console.log(
    `Quotas: ancient=${selectedAncient.length}/${QUOTAS.ancient}, solar-total=${selectedSolarTotal.length}/${QUOTAS.solarTotal}, solar-annular=${selectedSolarAnnular.length}/${QUOTAS.solarAnnular}, lunar-total=${selectedLunarTotal.length}/${QUOTAS.lunarTotal}`
  );
  console.log('Sample data-driven intro:');
  const sampleAuto = selected.find((x) => !x.hasHandwrittenIntro && x.kind === 'solar');
  if (sampleAuto) {
    console.log(`  [${sampleAuto.id}] ${sampleAuto.titleZh}: ${sampleAuto.introZh}`);
  }
}

main();
