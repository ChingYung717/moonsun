import * as Astronomy from 'astronomy-engine';
import { makeAstroTime } from './ephemeris';

export interface MoonPhaseInfo {
  /** Ecliptic longitude difference (Moon - Sun) in degrees [0, 360) */
  phaseAngleDeg: number;
  /** Illuminated fraction [0, 1] */
  illuminatedFraction: number;
  /** Days since previous exact New Moon (0..29.53) */
  lunarAgeDays: number;
  /** Chinese name of the phase */
  phaseNameZh: string;
  /** Short poetic/traditional alias */
  phaseAliasZh: string;
  /** Previous New Moon UTC ms */
  prevNewMoonUtc: number;
  /** Next New Moon UTC ms */
  nextNewMoonUtc: number;
  /** Nearest Full Moon UTC ms (in current synodic cycle) */
  fullMoonUtc: number;
  /** First Quarter UTC ms (in current synodic cycle) */
  firstQuarterUtc: number;
  /** Third Quarter UTC ms (in current synodic cycle) */
  thirdQuarterUtc: number;
}

export function getPhaseNameZh(phaseAngleDeg: number, ageDays: number): {
  name: string;
  alias: string;
} {
  // Check if very close to principal phases (within ~6 degrees, ~12 hours)
  if (phaseAngleDeg < 6 || phaseAngleDeg > 354) {
    return { name: '新月 (朔)', alias: '朔月 · 日月合朔' };
  }
  if (Math.abs(phaseAngleDeg - 90) < 6) {
    return { name: '上弦月', alias: '上弦 · 半月西照' };
  }
  if (Math.abs(phaseAngleDeg - 180) < 6) {
    return { name: '满月 (望)', alias: '望月 · 日月相望' };
  }
  if (Math.abs(phaseAngleDeg - 270) < 6) {
    return { name: '下弦月', alias: '下弦 · 半月东照' };
  }

  if (phaseAngleDeg < 90) {
    return { name: '蛾眉月', alias: ageDays < 4 ? '新月娥眉' : '夕月如钩' };
  }
  if (phaseAngleDeg < 180) {
    return { name: '盈凸月', alias: '渐盈待望' };
  }
  if (phaseAngleDeg < 270) {
    return { name: '亏凸月', alias: '既望渐亏' };
  }
  return { name: '残月', alias: '晓月将朔' };
}

interface SynodicCycleMilestones {
  prevNewMoonUtc: number;
  nextNewMoonUtc: number;
  firstQuarterUtc: number;
  fullMoonUtc: number;
  thirdQuarterUtc: number;
}

const MAX_CYCLE_CACHE_ENTRIES = 8;
const cycleCache: SynodicCycleMilestones[] = [];
let phaseCacheHits = 0;
let phaseCacheMisses = 0;
let searchMoonPhaseCalls = 0;

export function resetMoonPhaseCache(): void {
  cycleCache.length = 0;
  phaseCacheHits = 0;
  phaseCacheMisses = 0;
  searchMoonPhaseCalls = 0;
}

export function getMoonPhaseCacheStats(): {
  hits: number;
  misses: number;
  searchCalls: number;
  cachedCycles: number;
} {
  return {
    hits: phaseCacheHits,
    misses: phaseCacheMisses,
    searchCalls: searchMoonPhaseCalls,
    cachedCycles: cycleCache.length,
  };
}

function computeSynodicCycleMilestones(
  utcMs: number,
  phaseAngleDeg: number,
  trackStats = true
): SynodicCycleMilestones {
  // Search backward ~32 days to find previous New Moon
  const searchBackStart = makeAstroTime(utcMs - 32 * 86400 * 1000);
  if (trackStats) searchMoonPhaseCalls += 1;
  let prevNew = Astronomy.SearchMoonPhase(0, searchBackStart, 35);
  let reusableNextNew: Astronomy.AstroTime | null = null;
  // Sometimes there are two new moons in 35 days; step forward if another one is still <= utcMs
  if (prevNew) {
    if (trackStats) searchMoonPhaseCalls += 1;
    const nextCheck = Astronomy.SearchMoonPhase(
      0,
      makeAstroTime(prevNew.date.getTime() + 5 * 86400 * 1000),
      32
    );
    if (nextCheck && nextCheck.date.getTime() <= utcMs) {
      prevNew = nextCheck;
    } else if (nextCheck) {
      reusableNextNew = nextCheck;
    }
  }

  const prevNewMoonUtc = prevNew
    ? prevNew.date.getTime()
    : utcMs - (phaseAngleDeg / 360) * 29.53059 * 86400000;

  const tAfterPrevNew = makeAstroTime(prevNewMoonUtc + 12 * 3600 * 1000);
  if (trackStats) searchMoonPhaseCalls += 3;
  const fq = Astronomy.SearchMoonPhase(90, tAfterPrevNew, 15);
  const fm = Astronomy.SearchMoonPhase(180, tAfterPrevNew, 22);
  const tq = Astronomy.SearchMoonPhase(270, tAfterPrevNew, 28);
  let nextNew = reusableNextNew;
  if (!nextNew) {
    if (trackStats) searchMoonPhaseCalls += 1;
    nextNew = Astronomy.SearchMoonPhase(0, tAfterPrevNew, 35);
  }

  return {
    prevNewMoonUtc,
    nextNewMoonUtc: nextNew ? nextNew.date.getTime() : prevNewMoonUtc + 29.53059 * 86400000,
    firstQuarterUtc: fq ? fq.date.getTime() : prevNewMoonUtc + 7.38 * 86400000,
    fullMoonUtc: fm ? fm.date.getTime() : prevNewMoonUtc + 14.765 * 86400000,
    thirdQuarterUtc: tq ? tq.date.getTime() : prevNewMoonUtc + 22.15 * 86400000,
  };
}

function getOrComputeSynodicCycleMilestones(
  utcMs: number,
  phaseAngleDeg: number
): SynodicCycleMilestones {
  for (let i = 0; i < cycleCache.length; i++) {
    const entry = cycleCache[i];
    if (utcMs >= entry.prevNewMoonUtc && utcMs < entry.nextNewMoonUtc) {
      phaseCacheHits += 1;
      if (i > 0) {
        cycleCache.splice(i, 1);
        cycleCache.unshift(entry);
      }
      return entry;
    }
  }

  phaseCacheMisses += 1;
  const computed = computeSynodicCycleMilestones(utcMs, phaseAngleDeg, true);
  cycleCache.unshift(computed);
  if (cycleCache.length > MAX_CYCLE_CACHE_ENTRIES) {
    cycleCache.pop();
  }
  return computed;
}

export function computeMoonPhaseUncached(utcMs: number): MoonPhaseInfo {
  const t = makeAstroTime(utcMs);
  const phaseAngleDeg = Astronomy.MoonPhase(t);
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, t);
  const milestones = computeSynodicCycleMilestones(utcMs, phaseAngleDeg, false);
  const lunarAgeDays = Math.max(0, (utcMs - milestones.prevNewMoonUtc) / 86400000);
  const { name, alias } = getPhaseNameZh(phaseAngleDeg, lunarAgeDays);

  return {
    phaseAngleDeg,
    illuminatedFraction: illum.phase_fraction,
    lunarAgeDays,
    phaseNameZh: name,
    phaseAliasZh: alias,
    prevNewMoonUtc: milestones.prevNewMoonUtc,
    nextNewMoonUtc: milestones.nextNewMoonUtc,
    firstQuarterUtc: milestones.firstQuarterUtc,
    fullMoonUtc: milestones.fullMoonUtc,
    thirdQuarterUtc: milestones.thirdQuarterUtc,
  };
}

export function computeMoonPhase(utcMs: number): MoonPhaseInfo {
  const t = makeAstroTime(utcMs);
  const phaseAngleDeg = Astronomy.MoonPhase(t); // 0..360
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, t);

  const milestones = getOrComputeSynodicCycleMilestones(utcMs, phaseAngleDeg);
  const lunarAgeDays = Math.max(0, (utcMs - milestones.prevNewMoonUtc) / 86400000);
  const { name, alias } = getPhaseNameZh(phaseAngleDeg, lunarAgeDays);

  return {
    phaseAngleDeg,
    illuminatedFraction: illum.phase_fraction,
    lunarAgeDays,
    phaseNameZh: name,
    phaseAliasZh: alias,
    prevNewMoonUtc: milestones.prevNewMoonUtc,
    nextNewMoonUtc: milestones.nextNewMoonUtc,
    firstQuarterUtc: milestones.firstQuarterUtc,
    fullMoonUtc: milestones.fullMoonUtc,
    thirdQuarterUtc: milestones.thirdQuarterUtc,
  };
}

