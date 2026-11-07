import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';

export interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  zone: string;
  offsetMinutes: number;
  offsetLabel: string;
}

export function inferTimezone(lat: number, lon: number): string {
  try {
    return tzlookup(lat, lon);
  } catch {
    const offsetHours = Math.round(lon / 15);
    if (offsetHours === 0) return 'UTC';
    const sign = offsetHours > 0 ? '-' : '+'; // Etc/GMT sign is inverted in POSIX
    return `Etc/GMT${sign}${Math.abs(offsetHours)}`;
  }
}

export function utcToLocalParts(utcMs: number, zone: string): LocalDateTimeParts {
  const dt = DateTime.fromMillis(utcMs, { zone });
  if (!dt.isValid) {
    const fallback = DateTime.fromMillis(utcMs, { zone: 'UTC' });
    return {
      year: fallback.year,
      month: fallback.month,
      day: fallback.day,
      hour: fallback.hour,
      minute: fallback.minute,
      second: Math.floor(fallback.second),
      zone: 'UTC',
      offsetMinutes: 0,
      offsetLabel: 'UTC+0',
    };
  }
  const offMin = dt.offset;
  // Pre-1901 IANA zones use Local Mean Time with fractional minutes (e.g. Shanghai +8:05:43)
  const totalSec = Math.round(Math.abs(offMin) * 60);
  const sign = offMin >= 0 ? '+' : '-';
  const oh = Math.floor(totalSec / 3600);
  const om = Math.floor((totalSec % 3600) / 60);
  const os = totalSec % 60;
  const offsetLabel =
    `UTC${sign}${oh}` +
    (om > 0 || os > 0 ? ':' + String(om).padStart(2, '0') : '') +
    (os > 0 ? ':' + String(os).padStart(2, '0') + ' 地方平时' : '');
  return {
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute,
    second: Math.floor(dt.second),
    zone,
    offsetMinutes: offMin,
    offsetLabel,
  };
}

export function isValidCalendarDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return false;
  }
  if (
    year < -1999 ||
    year > 3000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(0, 0, 0, 0);
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function localPartsToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  zone: string
): number {
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second, millisecond: 0 },
    { zone }
  );
  if (dt.isValid) {
    return dt.toMillis();
  }
  // Fallback for very ancient years if IANA zone fails
  const utcDate = new Date(0);
  utcDate.setUTCFullYear(year, month - 1, day);
  utcDate.setUTCHours(hour, minute, second, 0);
  const refZone = DateTime.fromObject({ year: 1900, month: 1, day: 1 }, { zone });
  const offsetMs = refZone.isValid ? refZone.offset * 60000 : 0;
  return utcDate.getTime() - offsetMs;
}

export function formatYearLabel(year: number): string {
  if (year <= 0) {
    return `公元前 ${1 - year} 年 (天文年 ${year})`;
  }
  return `${year} 年`;
}

export function formatDateTime(utcMs: number, zone: string, includeSeconds = true): string {
  const p = utcToLocalParts(utcMs, zone);
  const yStr = p.year <= 0 ? `BC${1 - p.year}` : String(p.year).padStart(4, '0');
  const mStr = String(p.month).padStart(2, '0');
  const dStr = String(p.day).padStart(2, '0');
  const hStr = String(p.hour).padStart(2, '0');
  const minStr = String(p.minute).padStart(2, '0');
  const sStr = String(p.second).padStart(2, '0');
  return includeSeconds
    ? `${yStr}-${mStr}-${dStr} ${hStr}:${minStr}:${sStr} (${p.offsetLabel})`
    : `${yStr}-${mStr}-${dStr} ${hStr}:${minStr} (${p.offsetLabel})`;
}

export function formatTimeOnly(utcMs: number | null, zone: string): string {
  if (utcMs === null || !Number.isFinite(utcMs)) return '--:--';
  const p = utcToLocalParts(utcMs, zone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`;
}

export function formatTimeShort(
  utcMs: number | null,
  zone: string,
  includeSeconds = false
): string {
  if (utcMs === null || !Number.isFinite(utcMs)) return '--:--';
  const p = utcToLocalParts(utcMs, zone);
  const hm = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return includeSeconds ? `${hm}:${String(p.second).padStart(2, '0')}` : hm;
}

/** "YYYY-MM-DD" (proleptic Gregorian, astronomical year numbering, e.g. "-0708-07-09"). Safe for negative years. */
export function formatAstroDateUtc(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const yStr = y < 0 ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0');
  return `${yStr}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Convert UTC ms to a Julian-calendar date (astronomical year numbering). Meeus, Astronomical Algorithms ch.7. */
export function msToJulianCalendar(utcMs: number): { year: number; month: number; day: number } {
  const jd = utcMs / 86400000 + 2440587.5;
  const Z = Math.floor(jd + 0.5);
  const B = Z + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  return { year, month, day };
}

/** Convert a Julian-calendar date (astronomical year) at 00:00 UTC to UTC ms. */
export function julianCalendarToMs(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day - 1524.5;
  return (jd - 2440587.5) * 86400000;
}

/** Gregorian reform: dates before 1582-10-15 are conventionally cited in the Julian calendar. */
export const GREGORIAN_REFORM_MS = Date.UTC(1582, 9, 15);

/** Human-readable Chinese date label; uses the Julian calendar (marked) before 1582-10-15. */
export function historicalDateLabelZh(utcMs: number): string {
  if (utcMs < GREGORIAN_REFORM_MS) {
    const j = msToJulianCalendar(utcMs);
    const yLabel = j.year <= 0 ? `公元前${1 - j.year}年` : `${j.year}年`;
    return `${yLabel}${j.month}月${j.day}日(儒略历)`;
  }
  return formatAstroDateUtc(utcMs);
}

export function isLowPrecisionYear(year: number): boolean {
  return year < 1600 || year > 2200;
}
