import * as Astronomy from 'astronomy-engine';
import { Solar } from 'lunar-javascript';
import { CURATED_ECLIPSE_NOTES } from '../src/astro/eclipses/intros.zh';
import {
  buildLunarEclipseItem,
  buildSolarEclipseItem,
  computeCentralDurationSeconds,
} from '../src/astro/eclipses/search';
import { makeAstroTime } from '../src/astro/ephemeris';
import { GREGORIAN_REFORM_MS, julianCalendarToMs, utcToLocalParts } from '../src/time/tz';

export interface FactCheckDiscrepancy {
  key: string;
  field: string;
  claimed: string;
  computed: string;
  detail: string;
}

export function runFactCheck(): FactCheckDiscrepancy[] {
  const discrepancies: FactCheckDiscrepancy[] = [];

  for (const [key, note] of Object.entries(CURATED_ECLIPSE_NOTES)) {
    const m = /^(solar|lunar)-(-?\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) {
      discrepancies.push({
        key,
        field: 'key',
        claimed: key,
        computed: 'invalid format',
        detail: 'Key must match (solar|lunar)-YYYY-MM-DD',
      });
      continue;
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

    const start = makeAstroTime(targetMs - 5 * 86400 * 1000);
    const rawSolar = kind === 'solar' ? Astronomy.SearchGlobalSolarEclipse(start) : null;
    const rawLunar = kind === 'lunar' ? Astronomy.SearchLunarEclipse(start) : null;
    const item =
      kind === 'solar'
        ? buildSolarEclipseItem(rawSolar!)
        : buildLunarEclipseItem(rawLunar!);

    if (Math.abs(item.peakUtcMs - targetMs) > 2 * 86400 * 1000) {
      discrepancies.push({
        key,
        field: 'date',
        claimed: key,
        computed: item.id,
        detail: `Nearest ${kind} eclipse is >2 days away`,
      });
      continue;
    }

    const fullText = `${note.titleZh ?? ''} ${note.introZh}`;
    const bjt = utcToLocalParts(item.peakUtcMs, 'Asia/Shanghai');

    // 1. Check Lunar Calendar / Solar Term claims (for years >= 1900 where lunar-javascript is exact)
    if (bjt.year >= 1900 && bjt.year <= 2100) {
      const solar = Solar.fromYmd(bjt.year, bjt.month, bjt.day);
      const lunar = solar.getLunar();
      const lunarMonthDay = `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
      const jieQi = lunar.getJieQi();

      if (fullText.includes('除夕')) {
        const nextDay = Solar.fromYmd(bjt.year, bjt.month, bjt.day).next(1).getLunar();
        const isChuxi = nextDay.getMonth() === 1 && nextDay.getDay() === 1;
        if (!isChuxi) {
          discrepancies.push({
            key,
            field: 'lunar-festival',
            claimed: '除夕',
            computed: `农历${lunarMonthDay}`,
            detail: `${bjt.year}-${bjt.month}-${bjt.day} (BJT) is 农历${lunarMonthDay}, NOT 除夕`,
          });
        }
      }
      if (fullText.includes('春节') || fullText.includes('正月初一')) {
        const isChunjie = lunar.getMonth() === 1 && lunar.getDay() === 1;
        if (!isChunjie) {
          discrepancies.push({
            key,
            field: 'lunar-festival',
            claimed: '春节/正月初一',
            computed: `农历${lunarMonthDay}`,
            detail: `${bjt.year}-${bjt.month}-${bjt.day} (BJT) is 农历${lunarMonthDay}, NOT 正月初一`,
          });
        }
      }
      if (fullText.includes('元宵') || fullText.includes('正月十五')) {
        const isYuanxiao = lunar.getMonth() === 1 && lunar.getDay() === 15;
        if (!isYuanxiao) {
          discrepancies.push({
            key,
            field: 'lunar-festival',
            claimed: '元宵/正月十五',
            computed: `农历${lunarMonthDay}`,
            detail: `${bjt.year}-${bjt.month}-${bjt.day} (BJT) is 农历${lunarMonthDay}, NOT 正月十五`,
          });
        }
      }
      if (fullText.includes('夏至')) {
        // Check if same day or ±1 day is 夏至
        const prevJq = Solar.fromYmd(bjt.year, bjt.month, bjt.day).next(-1).getLunar().getJieQi();
        const nextJq = Solar.fromYmd(bjt.year, bjt.month, bjt.day).next(1).getLunar().getJieQi();
        if (jieQi !== '夏至' && prevJq !== '夏至' && nextJq !== '夏至') {
          discrepancies.push({
            key,
            field: 'solar-term',
            claimed: '夏至',
            computed: jieQi || '非节气日',
            detail: `${bjt.year}-${bjt.month}-${bjt.day} is not 夏至`,
          });
        }
      }
      if (fullText.includes('春分')) {
        const prevJq = Solar.fromYmd(bjt.year, bjt.month, bjt.day).next(-1).getLunar().getJieQi();
        const nextJq = Solar.fromYmd(bjt.year, bjt.month, bjt.day).next(1).getLunar().getJieQi();
        if (jieQi !== '春分' && prevJq !== '春分' && nextJq !== '春分') {
          discrepancies.push({
            key,
            field: 'solar-term',
            claimed: '春分',
            computed: jieQi || '非节气日',
            detail: `${bjt.year}-${bjt.month}-${bjt.day} is not 春分`,
          });
        }
      }
    }

    // 2. Check explicit peak Beijing time claims like "食甚19时33分" or "食甚发生于北京时间19时19分" or "食甚00时52分"
    const peakTimeMatch = /食甚(?:发生于|恰逢)?(?:北京时间)?(\d{1,2})时(\d{1,2})分/.exec(fullText);
    if (peakTimeMatch) {
      const claimedH = parseInt(peakTimeMatch[1], 10);
      const claimedM = parseInt(peakTimeMatch[2], 10);
      const claimedMinutes = claimedH * 60 + claimedM;
      const actualMinutes = bjt.hour * 60 + bjt.minute;
      let diff = Math.abs(claimedMinutes - actualMinutes);
      if (diff > 720) diff = 1440 - diff;
      if (diff > 3) {
        discrepancies.push({
          key,
          field: 'peak-time-bjt',
          claimed: `${String(claimedH).padStart(2, '0')}:${String(claimedM).padStart(2, '0')}`,
          computed: `${String(bjt.hour).padStart(2, '0')}:${String(bjt.minute).padStart(2, '0')}`,
          detail: `Peak BJT differs by ${diff} minutes`,
        });
      }
    }

    // 3. Check explicit solar duration claims like "(7分08秒)" or "(21世纪最长 · 6分39秒)" or "长达6分23秒"
    if (kind === 'solar') {
      const durMatches = [...fullText.matchAll(/(\d{1,2})分(\d{1,2})秒/g)];
      if (durMatches.length > 0 && rawSolar) {
        const globalMaxSec = computeCentralDurationSeconds(
          item.peakUtcMs,
          rawSolar.latitude ?? item.peakLat,
          rawSolar.longitude ?? item.peakLon
        );
        const siteSec =
          note.featuredLat !== undefined && note.featuredLon !== undefined
            ? computeCentralDurationSeconds(item.peakUtcMs, note.featuredLat, note.featuredLon)
            : globalMaxSec;

        for (const dm of durMatches) {
          const claimedSec = parseInt(dm[1], 10) * 60 + parseInt(dm[2], 10);
          const diffGlobal = Math.abs(claimedSec - globalMaxSec);
          const diffSite = Math.abs(claimedSec - siteSec);
          if (Math.min(diffGlobal, diffSite) > 15) {
            discrepancies.push({
              key,
              field: 'solar-duration',
              claimed: `${dm[1]}分${dm[2]}秒 (${claimedSec}s)`,
              computed: `global=${globalMaxSec}s, site=${siteSec}s`,
              detail: `Claimed duration differs by >15s from both global peak and featured site`,
            });
          }
        }
      }
    }

    // 4. Check explicit lunar totality duration claims like "全食106分钟" or "全食持续达100分钟" or "长达82分钟"
    if (kind === 'lunar' && rawLunar) {
      const computedMin = Math.round(rawLunar.sd_total * 2);
      const minMatch = /全食(?:阶段)?(?:持续)?(?:长达|达)?\s*(\d{2,3})\s*分钟/.exec(fullText);
      if (minMatch) {
        const claimedMin = parseInt(minMatch[1], 10);
        if (Math.abs(claimedMin - computedMin) > 3) {
          discrepancies.push({
            key,
            field: 'lunar-duration',
            claimed: `${claimedMin}分钟`,
            computed: `${computedMin}分钟`,
            detail: `Lunar totality duration differs by ${Math.abs(claimedMin - computedMin)} min`,
          });
        }
      }
    }

    // 5. Check featured site visibility for post-1600 central solar eclipses
    if (
      kind === 'solar' &&
      item.year >= 1600 &&
      (item.category === 'solar-total' || item.category === 'solar-annular') &&
      note.featuredLat !== undefined &&
      note.featuredLon !== undefined
    ) {
      const loc = Astronomy.SearchLocalSolarEclipse(
        makeAstroTime(item.peakUtcMs - 86400 * 1000),
        new Astronomy.Observer(note.featuredLat, note.featuredLon, 0)
      );
      const isCentral =
        loc &&
        Math.abs(loc.peak.time.date.getTime() - item.peakUtcMs) < 36 * 3600 * 1000 &&
        loc.peak.altitude > 0 &&
        (loc.kind === Astronomy.EclipseKind.Total || loc.kind === Astronomy.EclipseKind.Annular);
      if (!isCentral) {
        discrepancies.push({
          key,
          field: 'featured-site-central',
          claimed: `${note.featuredSiteName} (${note.featuredLat}, ${note.featuredLon}) in central path`,
          computed: loc ? `kind=${loc.kind}, alt=${loc.peak.altitude.toFixed(1)}°` : 'no local eclipse',
          detail: `Featured site is NOT inside the central (total/annular) path`,
        });
      }
    }

    // 6. Check featured site Moon altitude for lunar eclipses
    if (
      kind === 'lunar' &&
      note.featuredLat !== undefined &&
      note.featuredLon !== undefined &&
      rawLunar
    ) {
      const obs = new Astronomy.Observer(note.featuredLat, note.featuredLon, 0);
      const checkOffsetsMin = [-rawLunar.sd_partial, -rawLunar.sd_total, 0, rawLunar.sd_total, rawLunar.sd_partial];
      let maxAlt = -90;
      for (const offMin of checkOffsetsMin) {
        const t = makeAstroTime(item.peakUtcMs + offMin * 60 * 1000);
        const eq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
        const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
        if (hor.altitude > maxAlt) maxAlt = hor.altitude;
      }
      if (maxAlt <= 0) {
        discrepancies.push({
          key,
          field: 'featured-site-lunar-alt',
          claimed: `${note.featuredSiteName} (${note.featuredLat}, ${note.featuredLon}) visible`,
          computed: `maxAlt=${maxAlt.toFixed(1)}°`,
          detail: `Moon never rises above horizon during umbral eclipse at featured site`,
        });
      }
    }
  }

  return discrepancies;
}

if (process.argv[1]?.endsWith('fact-check-intros.ts')) {
  const issues = runFactCheck();
  if (issues.length === 0) {
    console.log(
      `✅ Fact check passed: ${Object.keys(CURATED_ECLIPSE_NOTES).length} curated notes verified with 0 discrepancies.`
    );
  } else {
    console.error(`❌ Fact check found ${issues.length} discrepancies:`);
    for (const iss of issues) {
      console.error(`  [${iss.key}] (${iss.field}): claimed="${iss.claimed}" vs computed="${iss.computed}" — ${iss.detail}`);
    }
    process.exit(1);
  }
}
