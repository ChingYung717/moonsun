import { describe, expect, it } from 'vitest';
import {
  computeLunarDetail,
  getTraditionalFestivalUtc,
  lunarToUtcMs,
} from '../src/lunar/lunarInfo';
import { buildLunarMonthGrid } from '../src/lunar/monthGrid';

describe('Chinese Lunar Calendar & Moon Phases', () => {
  it('identifies 2026-02-17 as Lunar New Year (丙午马年正月初一)', () => {
    const utc = Date.UTC(2026, 1, 17, 12, 0, 0); // 20:00 Beijing Time
    const info = computeLunarDetail(utc);

    expect(info.lunarYearGanZhi).toBe('丙午');
    expect(info.zodiacAnimal).toBe('马');
    expect(info.lunarMonth).toBe(1);
    expect(info.lunarDay).toBe(1);
    expect(info.isLeapMonth).toBe(false);
    expect(info.festivalsZh).toContain('春节');
  });

  it('identifies 2026-09-25 as Mid-Autumn Festival (八月十五中秋节)', () => {
    const utc = Date.UTC(2026, 8, 25, 12, 0, 0);
    const info = computeLunarDetail(utc);

    expect(info.lunarMonth).toBe(8);
    expect(info.lunarDay).toBe(15);
    expect(info.festivalsZh).toContain('中秋节');
  });

  it('correctly handles 2025 Leap 6th Month (乙巳年闰六月)', () => {
    // 2025-07-25 is 乙巳年闰六月初一
    const utc = lunarToUtcMs(2025, 6, 1, true, 12);
    expect(utc).not.toBeNull();
    const info = computeLunarDetail(utc!);
    expect(info.isLeapMonth).toBe(true);
    expect(info.lunarMonth).toBe(6);
    expect(info.lunarMonthNameZh).toBe('闰六月');
  });

  it('builds a complete lunar month grid with phase angles', () => {
    const grid = buildLunarMonthGrid(2026, 8, 15);
    expect(grid).not.toBeNull();
    expect(grid!.dayCount).toBeGreaterThanOrEqual(29);
    expect(grid!.days[14].lunarDay).toBe(15);
    expect(grid!.days[14].illuminatedFraction).toBeGreaterThan(0.92);
  });

  it('finds traditional festivals for 2026', () => {
    const midAutumnUtc = getTraditionalFestivalUtc(2026, 'midAutumn');
    expect(midAutumnUtc).not.toBeNull();
    const info = computeLunarDetail(midAutumnUtc!);
    expect(info.lunarMonth).toBe(8);
    expect(info.lunarDay).toBe(15);
  });
});
