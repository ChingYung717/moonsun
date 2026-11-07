import { Solar, Lunar, LunarYear } from 'lunar-javascript';
import { utcToLocalParts, localPartsToUtc } from '../time/tz';
import { computeMoonPhase, MoonPhaseInfo } from '../astro/phase';

export interface LunarDetailInfo {
  /** Beijing time components used for official Chinese lunar calendar calculation */
  beijingYear: number;
  beijingMonth: number;
  beijingDay: number;
  /** Lunar numeric values */
  lunarYear: number;
  lunarMonth: number; // negative if leap month in lunar-javascript
  lunarDay: number;
  isLeapMonth: boolean;
  /** Formatted strings */
  lunarYearGanZhi: string; // e.g. 丙午
  lunarMonthGanZhi: string;
  lunarDayGanZhi: string;
  lunarTimeGanZhi: string;
  zodiacAnimal: string; // e.g. 马
  lunarMonthNameZh: string; // e.g. 九月 or 闰六月
  lunarDayNameZh: string; // e.g. 十六
  fullLunarLabelZh: string; // e.g. 丙午(马)年 九月十六
  /** Solar terms (节气) */
  currentJieQi: string | null;
  prevJieQiName: string;
  prevJieQiTimeStr: string;
  nextJieQiName: string;
  nextJieQiTimeStr: string;
  nextJieQiUtcMs: number;
  /** Festivals */
  festivalsZh: string[];
  /** Moon phase & 十五的月亮十六圆 analysis */
  phase: MoonPhaseInfo;
  /** UTC ms of Lunar Day 15 at 20:00 Beijing Time (prime evening moon-viewing hour) */
  lunarDay15NoonUtcMs: number;
  fullMoonLunarDayNumber: number;
  fullMoonLunarDayNameZh: string;
  fullMoonSummaryZh: string;
}

function safeSolarFromBeijingParts(
  utcMs: number,
  bj = utcToLocalParts(utcMs, 'Asia/Shanghai')
): ReturnType<typeof Solar.fromYmdHms> {
  try {
    return Solar.fromYmdHms(bj.year, bj.month, bj.day, bj.hour, bj.minute, bj.second);
  } catch {
    // Fallback to Julian Day conversion when proleptic Gregorian dates fall inside the 1582-10-05..14 reform gap
    return Solar.fromJulianDay((utcMs + 8 * 3600000) / 86400000 + 2440587.5);
  }
}

export function computeLunarDetail(utcMs: number): LunarDetailInfo {
  // Official Chinese Lunar Calendar is defined in UTC+8 (Beijing Time)
  const bj = utcToLocalParts(utcMs, 'Asia/Shanghai');
  const solar = safeSolarFromBeijingParts(utcMs, bj);
  const lunar = solar.getLunar();

  const lunarYear = lunar.getYear();
  const rawMonth = lunar.getMonth(); // negative if leap month
  const isLeapMonth = rawMonth < 0;
  const lunarMonth = Math.abs(rawMonth);
  const lunarDay = lunar.getDay();

  const lunarYearGanZhi = lunar.getYearInGanZhi();
  const lunarMonthGanZhi = lunar.getMonthInGanZhi();
  const lunarDayGanZhi = lunar.getDayInGanZhi();
  const lunarTimeGanZhi = lunar.getTimeInGanZhi();
  const zodiacAnimal = lunar.getYearShengXiao();

  const lunarMonthNameZh = `${lunar.getMonthInChinese()}月`;
  const lunarDayNameZh = lunar.getDayInChinese();
  const fullLunarLabelZh = `${lunarYearGanZhi}年(${zodiacAnimal}) ${lunarMonthNameZh}${lunarDayNameZh}`;

  const currentJieQi = lunar.getJieQi() || null;
  const prevJq = lunar.getPrevJieQi(false);
  const nextJq = lunar.getNextJieQi(false);

  const prevJqSolar = prevJq.getSolar();
  const nextJqSolar = nextJq.getSolar();

  const prevJieQiTimeStr = `${prevJqSolar.getYear()}-${String(prevJqSolar.getMonth()).padStart(2, '0')}-${String(prevJqSolar.getDay()).padStart(2, '0')} ${String(prevJqSolar.getHour()).padStart(2, '0')}:${String(prevJqSolar.getMinute()).padStart(2, '0')}`;
  const nextJieQiTimeStr = `${nextJqSolar.getYear()}-${String(nextJqSolar.getMonth()).padStart(2, '0')}-${String(nextJqSolar.getDay()).padStart(2, '0')} ${String(nextJqSolar.getHour()).padStart(2, '0')}:${String(nextJqSolar.getMinute()).padStart(2, '0')}`;
  const nextJieQiUtcMs = localPartsToUtc(
    nextJqSolar.getYear(),
    nextJqSolar.getMonth(),
    nextJqSolar.getDay(),
    nextJqSolar.getHour(),
    nextJqSolar.getMinute(),
    nextJqSolar.getSecond(),
    'Asia/Shanghai'
  );

  const festivalsZh: string[] = [
    ...(lunar.getFestivals() || []),
    ...(solar.getFestivals() || []),
  ];

  const instantPhase = computeMoonPhase(utcMs);

  // Compute Lunar Day 15 of the current lunar month, and anchor the month's syzygy/quarter milestones
  // to the current Chinese lunar month so that on Day 1 (初一) before the exact syzygy instant,
  // the panel's "本朔望月最圆时刻" and quick-jump buttons always refer to the current lunar month.
  let lunarDay15NoonUtcMs = utcMs;
  let monthPhase = instantPhase;
  try {
    const l15 = Lunar.fromYmd(lunarYear, rawMonth, 15);
    const s15 = l15.getSolar();
    lunarDay15NoonUtcMs = localPartsToUtc(
      s15.getYear(),
      s15.getMonth(),
      s15.getDay(),
      20,
      0,
      0,
      'Asia/Shanghai'
    );
    monthPhase = computeMoonPhase(lunarDay15NoonUtcMs);
  } catch {
    // ignore if ancient year outside range
  }

  const phase: MoonPhaseInfo = {
    ...instantPhase,
    prevNewMoonUtc: monthPhase.prevNewMoonUtc,
    nextNewMoonUtc: monthPhase.nextNewMoonUtc,
    firstQuarterUtc: monthPhase.firstQuarterUtc,
    fullMoonUtc: monthPhase.fullMoonUtc,
    thirdQuarterUtc: monthPhase.thirdQuarterUtc,
  };

  const fmBj = utcToLocalParts(phase.fullMoonUtc, 'Asia/Shanghai');
  const fmSolar = safeSolarFromBeijingParts(phase.fullMoonUtc, fmBj);
  const fmLunar = fmSolar.getLunar();
  const fullMoonLunarDayNumber = fmLunar.getDay();
  const fullMoonLunarDayNameZh = fmLunar.getDayInChinese();
  const fmTimeStr = `${fmBj.month}月${fmBj.day}日 ${String(fmBj.hour).padStart(2, '0')}:${String(fmBj.minute).padStart(2, '0')}`;

  let fullMoonSummaryZh = `本朔望月最圆时刻（望）为北京时间 ${fmTimeStr}（农历${fmLunar.getMonthInChinese()}月${fullMoonLunarDayNameZh}）`;
  if (fullMoonLunarDayNumber === 16) {
    fullMoonSummaryZh += ' —— 正应“十五的月亮十六圆”！';
  } else if (fullMoonLunarDayNumber === 17) {
    fullMoonSummaryZh += ' —— 罕见“十五的月亮十七圆”！';
  } else if (fullMoonLunarDayNumber === 15) {
    fullMoonSummaryZh += ' —— 恰逢“十五的月亮十五圆”！';
  } else if (fullMoonLunarDayNumber === 14) {
    fullMoonSummaryZh += ' —— 罕见“十四圆”！';
  }

  return {
    beijingYear: bj.year,
    beijingMonth: bj.month,
    beijingDay: bj.day,
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeapMonth,
    lunarYearGanZhi,
    lunarMonthGanZhi,
    lunarDayGanZhi,
    lunarTimeGanZhi,
    zodiacAnimal,
    lunarMonthNameZh,
    lunarDayNameZh,
    fullLunarLabelZh,
    currentJieQi,
    prevJieQiName: prevJq.getName(),
    prevJieQiTimeStr,
    nextJieQiName: nextJq.getName(),
    nextJieQiTimeStr,
    nextJieQiUtcMs,
    festivalsZh,
    phase,
    lunarDay15NoonUtcMs,
    fullMoonLunarDayNumber,
    fullMoonLunarDayNameZh,
    fullMoonSummaryZh,
  };
}

/**
 * Reverse lookup: convert Chinese Lunar (year, month, day, isLeapMonth) to UTC ms (at 20:00 Beijing time for optimal moon viewing).
 */
export function lunarToUtcMs(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeapMonth = false,
  hourBeijing = 20
): number | null {
  try {
    if (
      !Number.isInteger(lunarYear) ||
      !Number.isInteger(lunarMonth) ||
      !Number.isInteger(lunarDay) ||
      lunarYear < 1901 ||
      lunarYear > 2099 ||
      lunarMonth < 1 ||
      lunarMonth > 12 ||
      lunarDay < 1 ||
      lunarDay > 30
    ) {
      return null;
    }
    const ly = LunarYear.fromYear(lunarYear);
    const leapMonth = ly.getLeapMonth();
    if (isLeapMonth && leapMonth !== lunarMonth) {
      return null;
    }
    const effectiveMonth = isLeapMonth ? -lunarMonth : lunarMonth;
    const lunar = Lunar.fromYmd(lunarYear, effectiveMonth, lunarDay);
    const solar = lunar.getSolar();
    return localPartsToUtc(
      solar.getYear(),
      solar.getMonth(),
      solar.getDay(),
      hourBeijing,
      0,
      0,
      'Asia/Shanghai'
    );
  } catch {
    return null;
  }
}

/**
 * Find the UTC timestamp (at 20:00 Beijing Time) of a traditional Chinese festival in the given lunar year.
 */
export function getTraditionalFestivalUtc(
  lunarYear: number,
  festival: 'spring' | 'lantern' | 'dragonBoat' | 'qixi' | 'midAutumn' | 'chongyang'
): number | null {
  switch (festival) {
    case 'spring':
      return lunarToUtcMs(lunarYear, 1, 1, false, 20);
    case 'lantern':
      return lunarToUtcMs(lunarYear, 1, 15, false, 20);
    case 'dragonBoat':
      return lunarToUtcMs(lunarYear, 5, 5, false, 20);
    case 'qixi':
      return lunarToUtcMs(lunarYear, 7, 7, false, 20);
    case 'midAutumn':
      return lunarToUtcMs(lunarYear, 8, 15, false, 20);
    case 'chongyang':
      return lunarToUtcMs(lunarYear, 9, 9, false, 20);
  }
}
