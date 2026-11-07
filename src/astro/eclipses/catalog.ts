import catalogData from './catalog.json';
import { EclipseCategory, EclipseEventItem } from './search';

export const CURATED_ECLIPSE_CATALOG: EclipseEventItem[] = catalogData as EclipseEventItem[];

export interface CatalogFilterOptions {
  sortBy: 'score' | 'timeDesc' | 'timeAsc';
  category: 'all' | EclipseCategory;
  chinaOnly: boolean;
  query: string;
}

export interface CuratedCatalogStats {
  total: number;
  solarTotalAll: number;
  solarTotalModern: number;
  solarAnnularAll: number;
  solarAnnularModern: number;
  lunarTotalAll: number;
  ancientCount: number;
}

export function getCuratedCatalogStats(): CuratedCatalogStats {
  let solarTotalAll = 0;
  let solarTotalModern = 0;
  let solarAnnularAll = 0;
  let solarAnnularModern = 0;
  let lunarTotalAll = 0;
  let ancientCount = 0;

  for (const item of CURATED_ECLIPSE_CATALOG) {
    const isAncient = item.year < 1900 || item.category === 'solar-partial';
    if (isAncient) {
      ancientCount += 1;
    }
    if (item.category === 'solar-total') {
      solarTotalAll += 1;
      if (item.year >= 1900) solarTotalModern += 1;
    } else if (item.category === 'solar-annular') {
      solarAnnularAll += 1;
      if (item.year >= 1900) solarAnnularModern += 1;
    } else if (item.category === 'lunar-total') {
      lunarTotalAll += 1;
    }
  }

  return {
    total: CURATED_ECLIPSE_CATALOG.length,
    solarTotalAll,
    solarTotalModern,
    solarAnnularAll,
    solarAnnularModern,
    lunarTotalAll,
    ancientCount,
  };
}

export function filterCuratedCatalog(opts: CatalogFilterOptions): EclipseEventItem[] {
  const q = opts.query.trim().toLowerCase();
  let list = CURATED_ECLIPSE_CATALOG.filter((item) => {
    if (opts.category !== 'all' && item.category !== opts.category) return false;
    if (opts.chinaOnly && item.chinaVisibility === 'none') return false;
    if (q) {
      const hay = `${item.titleZh} ${item.introZh} ${item.dateStrUtc} ${item.regionZh}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  list = [...list];
  if (opts.sortBy === 'score') {
    list.sort((a, b) => b.score - a.score || b.peakUtcMs - a.peakUtcMs);
  } else if (opts.sortBy === 'timeDesc') {
    list.sort((a, b) => b.peakUtcMs - a.peakUtcMs);
  } else {
    list.sort((a, b) => a.peakUtcMs - b.peakUtcMs);
  }
  return list;
}

