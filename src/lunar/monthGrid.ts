import { Lunar, LunarMonth } from 'lunar-javascript';
import * as Astronomy from 'astronomy-engine';
import { localPartsToUtc } from '../time/tz';
import { makeAstroTime } from '../astro/ephemeris';

export interface LunarCalendarDayCell {
  lunarDay: number;
  lunarDayNameZh: string;
  gregorianMonth: number;
  gregorianDay: number;
  utcMsEvening: number; // 20:00 Beijing Time on that day
  /** Moon phase angle (0..360) at 20:00 Beijing Time */
  phaseAngleDeg: number;
  /** Illuminated fraction (0..1) */
  illuminatedFraction: number;
  /** Badge text (e.g. 节气, 节日, 朔, 望) */
  badgeZh: string | null;
  isTodaySelected: boolean;
}

export interface LunarMonthGridData {
  lunarYear: number;
  lunarMonth: number;
  isLeapMonth: boolean;
  monthTitleZh: string;
  dayCount: number;
  days: LunarCalendarDayCell[];
}

export function buildLunarMonthGrid(
  lunarYear: number,
  rawLunarMonth: number,
  selectedLunarDay: number
): LunarMonthGridData | null {
  try {
    if (lunarYear < 1901 || lunarYear > 2099) return null;
    const lm = LunarMonth.fromYm(lunarYear, rawLunarMonth);
    if (!lm) return null;
    const dayCount = lm.getDayCount();
    const days: LunarCalendarDayCell[] = [];

    for (let d = 1; d <= dayCount; d++) {
      const l = Lunar.fromYmd(lunarYear, rawLunarMonth, d);
      const s = l.getSolar();
      const utcMsEvening = localPartsToUtc(
        s.getYear(),
        s.getMonth(),
        s.getDay(),
        20,
        0,
        0,
        'Asia/Shanghai'
      );
      const t = makeAstroTime(utcMsEvening);
      const phaseAngleDeg = Astronomy.MoonPhase(t);
      const illum = Astronomy.Illumination(Astronomy.Body.Moon, t);

      const jq = l.getJieQi();
      const fests = l.getFestivals();
      let badgeZh: string | null = null;
      if (fests && fests.length > 0) {
        badgeZh = fests[0].slice(0, 3);
      } else if (jq) {
        badgeZh = jq;
      } else if (d === 1) {
        badgeZh = '朔';
      } else if (d === 15) {
        badgeZh = '十五';
      }

      days.push({
        lunarDay: d,
        lunarDayNameZh: l.getDayInChinese(),
        gregorianMonth: s.getMonth(),
        gregorianDay: s.getDay(),
        utcMsEvening,
        phaseAngleDeg,
        illuminatedFraction: illum.phase_fraction,
        badgeZh,
        isTodaySelected: d === selectedLunarDay,
      });
    }

    const firstLunar = Lunar.fromYmd(lunarYear, rawLunarMonth, 1);
    const monthTitleZh = `${firstLunar.getYearInGanZhi()}年 (${firstLunar.getYearShengXiao()}) ${firstLunar.getMonthInChinese()}月 (${dayCount === 30 ? '大' : '小'}月)`;

    return {
      lunarYear,
      lunarMonth: Math.abs(rawLunarMonth),
      isLeapMonth: rawLunarMonth < 0,
      monthTitleZh,
      dayCount,
      days,
    };
  } catch {
    return null;
  }
}
