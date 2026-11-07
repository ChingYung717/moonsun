import * as Astronomy from 'astronomy-engine';
import { makeAstroTime } from '../ephemeris';
import { isPointInChina } from '../geo/chinaBoundary';
import { computeSolarEclipsePath } from './shadowPath';

const SYNODIC_MONTH_DAYS = 29.530588853;
const SOLAR_SAROS_136_REF_DAYS = Date.UTC(2009, 6, 22, 2, 35, 0) / 86400000;
const LUNAR_SAROS_129_REF_DAYS = Date.UTC(2018, 6, 27, 20, 21, 0) / 86400000;

/**
 * Compute the exact Van den Bergh / NASA Saros series number for a solar or lunar eclipse
 * using the Diophantine relation 38 * 358 - 61 * 223 = 1 between the Inex (358 lunations)
 * and Saros (223 lunations) cycles.
 */
export function computeSarosSeries(kind: 'solar' | 'lunar', peakUtcMs: number): number {
  const days = peakUtcMs / 86400000;
  const refDays = kind === 'solar' ? SOLAR_SAROS_136_REF_DAYS : LUNAR_SAROS_129_REF_DAYS;
  const refSaros = kind === 'solar' ? 136 : 129;
  const dL = Math.round((days - refDays) / SYNODIC_MONTH_DAYS);
  let ds = (((38 * dL) % 223) + 223) % 223;
  if (ds > 111) ds -= 223;
  return refSaros + ds;
}

interface ProvinceBox {
  name: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  centerLat: number;
  centerLon: number;
}

const CHINA_PROVINCES: ReadonlyArray<ProvinceBox> = [
  { name: '新疆', latMin: 35.5, latMax: 49.2, lonMin: 73.5, lonMax: 96.4, centerLat: 42.5, centerLon: 85.0 },
  { name: '西藏', latMin: 26.8, latMax: 36.5, lonMin: 78.4, lonMax: 99.1, centerLat: 31.2, centerLon: 88.8 },
  { name: '青海', latMin: 31.6, latMax: 39.3, lonMin: 89.4, lonMax: 103.1, centerLat: 35.8, centerLon: 96.5 },
  { name: '甘肃', latMin: 32.6, latMax: 42.8, lonMin: 92.3, lonMax: 108.7, centerLat: 37.8, centerLon: 101.5 },
  { name: '内蒙古', latMin: 37.4, latMax: 53.4, lonMin: 97.2, lonMax: 126.1, centerLat: 44.0, centerLon: 113.5 },
  { name: '黑龙江', latMin: 43.4, latMax: 53.6, lonMin: 121.2, lonMax: 135.1, centerLat: 47.8, centerLon: 128.0 },
  { name: '吉林', latMin: 40.8, latMax: 46.3, lonMin: 121.6, lonMax: 131.3, centerLat: 43.6, centerLon: 126.2 },
  { name: '辽宁', latMin: 38.7, latMax: 43.5, lonMin: 118.8, lonMax: 125.8, centerLat: 41.3, centerLon: 122.6 },
  { name: '宁夏', latMin: 35.2, latMax: 39.4, lonMin: 104.3, lonMax: 107.7, centerLat: 37.5, centerLon: 106.1 },
  { name: '陕西', latMin: 31.7, latMax: 39.6, lonMin: 105.5, lonMax: 111.3, centerLat: 35.6, centerLon: 108.9 },
  { name: '山西', latMin: 34.6, latMax: 40.7, lonMin: 110.2, lonMax: 114.6, centerLat: 37.6, centerLon: 112.5 },
  { name: '河北', latMin: 36.1, latMax: 42.6, lonMin: 113.4, lonMax: 119.8, centerLat: 39.0, centerLon: 116.2 },
  { name: '北京', latMin: 39.4, latMax: 41.1, lonMin: 115.4, lonMax: 117.5, centerLat: 40.0, centerLon: 116.4 },
  { name: '天津', latMin: 38.6, latMax: 40.2, lonMin: 116.7, lonMax: 118.1, centerLat: 39.2, centerLon: 117.3 },
  { name: '山东', latMin: 34.4, latMax: 38.4, lonMin: 114.8, lonMax: 122.7, centerLat: 36.4, centerLon: 118.5 },
  { name: '河南', latMin: 31.4, latMax: 36.4, lonMin: 110.3, lonMax: 116.6, centerLat: 34.0, centerLon: 113.6 },
  { name: '四川', latMin: 26.0, latMax: 34.3, lonMin: 97.3, lonMax: 108.5, centerLat: 30.6, centerLon: 103.0 },
  { name: '重庆', latMin: 28.1, latMax: 32.2, lonMin: 105.3, lonMax: 110.2, centerLat: 29.8, centerLon: 107.6 },
  { name: '湖北', latMin: 29.0, latMax: 33.3, lonMin: 108.3, lonMax: 116.1, centerLat: 31.0, centerLon: 112.4 },
  { name: '安徽', latMin: 29.4, latMax: 34.6, lonMin: 114.9, lonMax: 119.6, centerLat: 31.8, centerLon: 117.2 },
  { name: '江苏', latMin: 30.7, latMax: 35.1, lonMin: 116.3, lonMax: 121.9, centerLat: 32.9, centerLon: 119.5 },
  { name: '上海', latMin: 30.7, latMax: 31.9, lonMin: 120.8, lonMax: 122.2, centerLat: 31.2, centerLon: 121.5 },
  { name: '浙江', latMin: 27.1, latMax: 31.2, lonMin: 118.0, lonMax: 122.9, centerLat: 29.2, centerLon: 120.2 },
  { name: '云南', latMin: 21.1, latMax: 29.2, lonMin: 97.5, lonMax: 106.2, centerLat: 25.0, centerLon: 101.8 },
  { name: '贵州', latMin: 24.6, latMax: 29.2, lonMin: 103.6, lonMax: 109.6, centerLat: 26.8, centerLon: 106.8 },
  { name: '湖南', latMin: 24.6, latMax: 30.1, lonMin: 108.8, lonMax: 114.2, centerLat: 27.6, centerLon: 111.7 },
  { name: '江西', latMin: 24.5, latMax: 30.1, lonMin: 113.5, lonMax: 118.5, centerLat: 27.5, centerLon: 115.8 },
  { name: '福建', latMin: 23.5, latMax: 28.3, lonMin: 115.8, lonMax: 120.7, centerLat: 26.0, centerLon: 118.2 },
  { name: '台湾', latMin: 21.8, latMax: 25.4, lonMin: 120.0, lonMax: 122.1, centerLat: 23.7, centerLon: 121.0 },
  { name: '广西', latMin: 20.9, latMax: 26.4, lonMin: 104.4, lonMax: 112.1, centerLat: 23.8, centerLon: 108.6 },
  { name: '广东', latMin: 20.2, latMax: 25.5, lonMin: 109.6, lonMax: 117.3, centerLat: 23.2, centerLon: 113.5 },
  { name: '海南', latMin: 18.1, latMax: 20.2, lonMin: 108.6, lonMax: 111.1, centerLat: 19.2, centerLon: 109.8 },
];

export interface ChinaCityProbe {
  name: string;
  province: string;
  lat: number;
  lon: number;
}

export const CHINA_MAJOR_CITIES: ReadonlyArray<ChinaCityProbe> = [
  { name: '北京', province: '北京', lat: 39.90, lon: 116.40 },
  { name: '天津', province: '天津', lat: 39.13, lon: 117.20 },
  { name: '上海', province: '上海', lat: 31.23, lon: 121.47 },
  { name: '重庆', province: '重庆', lat: 29.56, lon: 106.55 },
  { name: '武汉', province: '湖北', lat: 30.59, lon: 114.30 },
  { name: '成都', province: '四川', lat: 30.67, lon: 104.07 },
  { name: '宜宾', province: '四川', lat: 28.75, lon: 104.64 },
  { name: '杭州', province: '浙江', lat: 30.27, lon: 120.15 },
  { name: '舟山', province: '浙江', lat: 29.99, lon: 122.21 },
  { name: '南京', province: '江苏', lat: 32.06, lon: 118.80 },
  { name: '苏州', province: '江苏', lat: 31.30, lon: 120.59 },
  { name: '合肥', province: '安徽', lat: 31.82, lon: 117.23 },
  { name: '广州', province: '广东', lat: 23.13, lon: 113.26 },
  { name: '深圳', province: '广东', lat: 22.54, lon: 114.06 },
  { name: '汕头', province: '广东', lat: 23.35, lon: 116.68 },
  { name: '厦门', province: '福建', lat: 24.48, lon: 118.09 },
  { name: '福州', province: '福建', lat: 26.08, lon: 119.30 },
  { name: '台北', province: '台湾', lat: 25.03, lon: 121.56 },
  { name: '嘉义', province: '台湾', lat: 23.48, lon: 120.45 },
  { name: '昆明', province: '云南', lat: 25.04, lon: 102.71 },
  { name: '大理', province: '云南', lat: 25.60, lon: 100.26 },
  { name: '瑞丽', province: '云南', lat: 24.01, lon: 97.85 },
  { name: '贵阳', province: '贵州', lat: 26.58, lon: 106.71 },
  { name: '南宁', province: '广西', lat: 22.82, lon: 108.32 },
  { name: '桂林', province: '广西', lat: 25.27, lon: 110.29 },
  { name: '海口', province: '海南', lat: 20.04, lon: 110.35 },
  { name: '三亚', province: '海南', lat: 18.25, lon: 109.51 },
  { name: '三沙永兴岛', province: '海南', lat: 16.83, lon: 112.33 },
  { name: '长沙', province: '湖南', lat: 28.23, lon: 112.94 },
  { name: '南昌', province: '江西', lat: 28.68, lon: 115.86 },
  { name: '赣州', province: '江西', lat: 25.83, lon: 114.93 },
  { name: '西安', province: '陕西', lat: 34.26, lon: 108.95 },
  { name: '郑州', province: '河南', lat: 34.75, lon: 113.62 },
  { name: '洛阳', province: '河南', lat: 34.62, lon: 112.45 },
  { name: '济南', province: '山东', lat: 36.65, lon: 117.12 },
  { name: '青岛', province: '山东', lat: 36.07, lon: 120.38 },
  { name: '曲阜', province: '山东', lat: 35.60, lon: 116.99 },
  { name: '太原', province: '山西', lat: 37.87, lon: 112.55 },
  { name: '大同', province: '山西', lat: 40.08, lon: 113.30 },
  { name: '石家庄', province: '河北', lat: 38.04, lon: 114.51 },
  { name: '承德', province: '河北', lat: 40.95, lon: 117.96 },
  { name: '兰州', province: '甘肃', lat: 36.06, lon: 103.83 },
  { name: '临洮', province: '甘肃', lat: 35.38, lon: 103.86 },
  { name: '嘉峪关', province: '甘肃', lat: 39.77, lon: 98.29 },
  { name: '敦煌', province: '甘肃', lat: 40.14, lon: 94.66 },
  { name: '银川', province: '宁夏', lat: 38.49, lon: 106.23 },
  { name: '西宁', province: '青海', lat: 36.62, lon: 101.78 },
  { name: '格尔木', province: '青海', lat: 36.40, lon: 94.90 },
  { name: '乌鲁木齐', province: '新疆', lat: 43.82, lon: 87.62 },
  { name: '阿勒泰', province: '新疆', lat: 47.84, lon: 88.14 },
  { name: '哈密', province: '新疆', lat: 42.82, lon: 93.51 },
  { name: '伊犁昭苏', province: '新疆', lat: 43.15, lon: 81.13 },
  { name: '喀什', province: '新疆', lat: 39.47, lon: 75.99 },
  { name: '和田', province: '新疆', lat: 37.11, lon: 79.92 },
  { name: '拉萨', province: '西藏', lat: 29.65, lon: 91.13 },
  { name: '日喀则', province: '西藏', lat: 29.27, lon: 88.88 },
  { name: '阿里', province: '西藏', lat: 32.50, lon: 80.11 },
  { name: '林芝', province: '西藏', lat: 29.64, lon: 94.36 },
  { name: '呼和浩特', province: '内蒙古', lat: 40.84, lon: 111.75 },
  { name: '海拉尔', province: '内蒙古', lat: 49.21, lon: 119.76 },
  { name: '二连浩特', province: '内蒙古', lat: 43.65, lon: 111.98 },
  { name: '沈阳', province: '辽宁', lat: 41.80, lon: 123.43 },
  { name: '大连', province: '辽宁', lat: 38.91, lon: 121.61 },
  { name: '丹东', province: '辽宁', lat: 40.13, lon: 124.39 },
  { name: '长春', province: '吉林', lat: 43.82, lon: 125.32 },
  { name: '哈尔滨', province: '黑龙江', lat: 45.75, lon: 126.64 },
  { name: '伊春', province: '黑龙江', lat: 47.73, lon: 128.84 },
  { name: '佳木斯', province: '黑龙江', lat: 46.80, lon: 130.32 },
  { name: '漠河', province: '黑龙江', lat: 52.97, lon: 122.53 },
  { name: '抚远', province: '黑龙江', lat: 48.36, lon: 134.29 },
];

interface WorldRegionBox {
  name: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

const WORLD_REGIONS: ReadonlyArray<WorldRegionBox> = [
  { name: '北极地区', latMin: 68, latMax: 90, lonMin: -180, lonMax: 180 },
  { name: '南极洲', latMin: -90, latMax: -66, lonMin: -180, lonMax: 180 },
  { name: '加拿大', latMin: 48, latMax: 68, lonMin: -140, lonMax: -52 },
  { name: '美国', latMin: 25, latMax: 48, lonMin: -125, lonMax: -67 },
  { name: '墨西哥与中美洲', latMin: 8, latMax: 28, lonMin: -117, lonMax: -77 },
  { name: '南美洲', latMin: -56, latMax: 12, lonMin: -82, lonMax: -34 },
  { name: '欧洲', latMin: 36, latMax: 68, lonMin: -10, lonMax: 35 },
  { name: '北非与撒哈拉', latMin: 15, latMax: 36, lonMin: -17, lonMax: 35 },
  { name: '非洲中南部', latMin: -35, latMax: 15, lonMin: -17, lonMax: 51 },
  { name: '中东与阿拉伯半岛', latMin: 12, latMax: 40, lonMin: 35, lonMax: 62 },
  { name: '俄罗斯与西伯利亚', latMin: 50, latMax: 68, lonMin: 35, lonMax: 175 },
  { name: '中亚地区', latMin: 36, latMax: 50, lonMin: 46, lonMax: 80 },
  { name: '南亚与印度次大陆', latMin: 6, latMax: 35, lonMin: 62, lonMax: 92 },
  { name: '中南半岛与东南亚', latMin: -11, latMax: 22, lonMin: 92, lonMax: 140 },
  { name: '朝鲜半岛与日本', latMin: 30, latMax: 46, lonMin: 125, lonMax: 146 },
  { name: '澳大利亚与新西兰', latMin: -47, latMax: -11, lonMin: 113, lonMax: 179 },
  { name: '大西洋', latMin: -55, latMax: 65, lonMin: -65, lonMax: -10 },
  { name: '印度洋', latMin: -55, latMax: 15, lonMin: 40, lonMax: 110 },
  { name: '太平洋', latMin: -55, latMax: 55, lonMin: 140, lonMax: 180 },
  { name: '东太平洋', latMin: -55, latMax: 55, lonMin: -180, lonMax: -85 },
];

export function matchProvinceInChina(lat: number, lon: number): string | null {
  let best: ProvinceBox | null = null;
  let bestDist = Infinity;
  for (const p of CHINA_PROVINCES) {
    if (lat >= p.latMin && lat <= p.latMax && lon >= p.lonMin && lon <= p.lonMax) {
      const d = Math.hypot(lat - p.centerLat, lon - p.centerLon);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  return best ? best.name : null;
}

export function matchWorldRegion(lat: number, lon: number): string {
  if (isPointInChina(lat, lon)) return '中国';
  for (const r of WORLD_REGIONS) {
    if (lat >= r.latMin && lat <= r.latMax && lon >= r.lonMin && lon <= r.lonMax) {
      return r.name;
    }
  }
  return '远洋海域';
}

export interface SolarPathGeographySummary {
  regionsCrossedZh: string[];
  chinaProvincesZh: string[];
  bestChinaSite: {
    name: string;
    province: string;
    lat: number;
    lon: number;
    durationSeconds: number;
    altitudeDeg: number;
  } | null;
}

/**
 * Trace the central solar eclipse path and summarize crossed regions, Chinese provinces,
 * and best Chinese observing city on the central path.
 */
export function summarizeSolarPathGeography(peakUtcMs: number): SolarPathGeographySummary {
  const path = computeSolarEclipsePath(peakUtcMs);
  const regions: string[] = [];
  const provinces: string[] = [];

  const pushUnique = (arr: string[], val: string | null) => {
    if (val && !arr.includes(val)) arr.push(val);
  };

  for (const pt of path.centerLine) {
    const samplePts = [
      [pt.lat, pt.lon],
      [pt.northLat, pt.northLon],
      [pt.southLat, pt.southLon],
    ] as const;

    for (const [lat, lon] of samplePts) {
      if (isPointInChina(lat, lon)) {
        pushUnique(regions, '中国');
        pushUnique(provinces, matchProvinceInChina(lat, lon));
      } else {
        pushUnique(regions, matchWorldRegion(lat, lon));
      }
    }
  }

  let bestChinaSite: SolarPathGeographySummary['bestChinaSite'] = null;
  if (provinces.length > 0) {
    const tStart = makeAstroTime(peakUtcMs - 36 * 3600 * 1000);
    for (const city of CHINA_MAJOR_CITIES) {
      try {
        const loc = Astronomy.SearchLocalSolarEclipse(
          tStart,
          new Astronomy.Observer(city.lat, city.lon, 0)
        );
        if (
          loc &&
          Math.abs(loc.peak.time.date.getTime() - peakUtcMs) < 36 * 3600 * 1000 &&
          loc.peak.altitude > 1 &&
          (loc.kind === Astronomy.EclipseKind.Total || loc.kind === Astronomy.EclipseKind.Annular) &&
          loc.total_begin &&
          loc.total_end
        ) {
          const durSec = Math.round(
            (loc.total_end.time.date.getTime() - loc.total_begin.time.date.getTime()) / 1000
          );
          if (!bestChinaSite || durSec > bestChinaSite.durationSeconds) {
            bestChinaSite = {
              name: city.name,
              province: city.province,
              lat: city.lat,
              lon: city.lon,
              durationSeconds: durSec,
              altitudeDeg: Math.round(loc.peak.altitude),
            };
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return {
    regionsCrossedZh: regions.slice(0, 6),
    chinaProvincesZh: provinces.slice(0, 8),
    bestChinaSite,
  };
}
