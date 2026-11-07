import catalogData from './catalog.json';
import { EclipseCategory, EclipseEventItem } from './search';

export const CURATED_ECLIPSE_CATALOG: EclipseEventItem[] = catalogData as EclipseEventItem[];

export interface CatalogFilterOptions {
  sortBy: 'score' | 'timeDesc' | 'timeAsc';
  category: 'all' | EclipseCategory;
  chinaOnly: boolean;
  query: string;
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
