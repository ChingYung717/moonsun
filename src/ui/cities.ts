export interface CityEntry {
  name: string;
  region: '中国' | '亚洲/大洋洲' | '欧洲/非洲' | '美洲';
  lat: number;
  lon: number;
  timezone: string;
  note?: string;
}

export const CITIES_LIST: CityEntry[] = [
  // 中国主要城市与著名日食观测地
  { name: '北京 (Beijing)', region: '中国', lat: 39.9042, lon: 116.4074, timezone: 'Asia/Shanghai', note: '2035日全食' },
  { name: '上海 (Shanghai)', region: '中国', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai', note: '2009日全食' },
  { name: '武汉 (Wuhan)', region: '中国', lat: 30.5928, lon: 114.3055, timezone: 'Asia/Shanghai', note: '2009日全食食甚区' },
  { name: '杭州 (Hangzhou)', region: '中国', lat: 30.2741, lon: 120.1551, timezone: 'Asia/Shanghai', note: '2009日全食' },
  { name: '成都 (Chengdu)', region: '中国', lat: 30.5728, lon: 104.0668, timezone: 'Asia/Shanghai', note: '2009日全食' },
  { name: '重庆 (Chongqing)', region: '中国', lat: 29.563, lon: 106.5516, timezone: 'Asia/Shanghai', note: '2009全食/2010环食' },
  { name: '广州 (Guangzhou)', region: '中国', lat: 23.1291, lon: 113.2644, timezone: 'Asia/Shanghai', note: '2012日环食' },
  { name: '深圳 (Shenzhen)', region: '中国', lat: 22.5431, lon: 114.0579, timezone: 'Asia/Shanghai' },
  { name: '厦门 (Xiamen)', region: '中国', lat: 24.4798, lon: 118.0894, timezone: 'Asia/Shanghai', note: '2020夏至金边日环食' },
  { name: '南京 (Nanjing)', region: '中国', lat: 32.0603, lon: 118.7969, timezone: 'Asia/Shanghai' },
  { name: '西安 (Xi\'an)', region: '中国', lat: 34.3416, lon: 108.9398, timezone: 'Asia/Shanghai', note: '2008日全食' },
  { name: '昆明 (Kunming)', region: '中国', lat: 25.0389, lon: 102.7183, timezone: 'Asia/Shanghai', note: '1980日全食' },
  { name: '云南大理 (Dali)', region: '中国', lat: 25.6065, lon: 100.2676, timezone: 'Asia/Shanghai', note: '2010千年最长日环食' },
  { name: '甘肃嘉峪关 (Jiayuguan)', region: '中国', lat: 39.7731, lon: 98.2892, timezone: 'Asia/Shanghai', note: '2008日全食' },
  { name: '甘肃临洮 (Lintao)', region: '中国', lat: 35.376, lon: 103.862, timezone: 'Asia/Shanghai', note: '1941抗战日全食' },
  { name: '黑龙江漠河 (Mohe)', region: '中国', lat: 52.972, lon: 122.536, timezone: 'Asia/Shanghai', note: '1997日全食+彗星' },
  { name: '黑龙江伊春 (Yichun)', region: '中国', lat: 47.7275, lon: 128.8407, timezone: 'Asia/Shanghai', note: '2030日环食' },
  { name: '哈尔滨 (Harbin)', region: '中国', lat: 45.8038, lon: 126.535, timezone: 'Asia/Shanghai', note: '2030日环食' },
  { name: '内蒙古海拉尔 (Hailar)', region: '中国', lat: 49.2116, lon: 119.7364, timezone: 'Asia/Shanghai', note: '2030日环食' },
  { name: '山东青岛 (Qingdao)', region: '中国', lat: 36.0671, lon: 120.3826, timezone: 'Asia/Shanghai', note: '2010带食日落环食' },
  { name: '山东曲阜 (Qufu)', region: '中国', lat: 35.596, lon: 116.991, timezone: 'Asia/Shanghai', note: '公元前709年春秋日全食' },
  { name: '新疆乌鲁木齐 (Urumqi)', region: '中国', lat: 43.8256, lon: 87.6168, timezone: 'Asia/Shanghai' },
  { name: '新疆哈密伊吾 (Yiwu)', region: '中国', lat: 43.253, lon: 94.696, timezone: 'Asia/Shanghai', note: '2008日全食' },
  { name: '新疆喀什 (Kashgar)', region: '中国', lat: 39.4704, lon: 75.9898, timezone: 'Asia/Shanghai', note: '1968日全食' },
  { name: '西藏拉萨 (Lhasa)', region: '中国', lat: 29.6525, lon: 91.1721, timezone: 'Asia/Shanghai' },
  { name: '西藏阿里 (Ngari)', region: '中国', lat: 32.501, lon: 80.105, timezone: 'Asia/Shanghai', note: '2020环食/2034全食' },
  { name: '青海冷湖天文基地 (Lenghu)', region: '中国', lat: 38.606, lon: 93.896, timezone: 'Asia/Shanghai' },
  { name: '香港 (Hong Kong)', region: '中国', lat: 22.3193, lon: 114.1694, timezone: 'Asia/Hong_Kong' },
  { name: '台北 (Taipei)', region: '中国', lat: 25.033, lon: 121.5654, timezone: 'Asia/Taipei' },
  { name: '海南三亚 (Sanya)', region: '中国', lat: 18.2528, lon: 109.512, timezone: 'Asia/Shanghai' },

  // 亚洲与大洋洲
  { name: '东京 (Tokyo)', region: '亚洲/大洋洲', lat: 35.6762, lon: 139.6503, timezone: 'Asia/Tokyo' },
  { name: '首尔 (Seoul)', region: '亚洲/大洋洲', lat: 37.5665, lon: 126.978, timezone: 'Asia/Seoul' },
  { name: '新加坡 (Singapore)', region: '亚洲/大洋洲', lat: 1.3521, lon: 103.8198, timezone: 'Asia/Singapore' },
  { name: '曼谷 (Bangkok)', region: '亚洲/大洋洲', lat: 13.7563, lon: 100.5018, timezone: 'Asia/Bangkok' },
  { name: '新德里 (New Delhi)', region: '亚洲/大洋洲', lat: 28.6139, lon: 77.209, timezone: 'Asia/Kolkata' },
  { name: '迪拜 (Dubai)', region: '亚洲/大洋洲', lat: 25.2048, lon: 55.2708, timezone: 'Asia/Dubai' },
  { name: '悉尼 (Sydney)', region: '亚洲/大洋洲', lat: -33.8688, lon: 151.2093, timezone: 'Australia/Sydney', note: '2028日全食' },
  { name: '奥克兰 (Auckland)', region: '亚洲/大洋洲', lat: -36.8485, lon: 174.7633, timezone: 'Pacific/Auckland' },

  // 欧洲与非洲
  { name: '埃及卢克索 (Luxor)', region: '欧洲/非洲', lat: 25.6872, lon: 32.6396, timezone: 'Africa/Cairo', note: '2027超长日全食6分23秒' },
  { name: '冰岛雷克雅未克 (Reykjavik)', region: '欧洲/非洲', lat: 64.1466, lon: -21.9426, timezone: 'Atlantic/Reykjavik', note: '2026日全食' },
  { name: '西班牙马德里 (Madrid)', region: '欧洲/非洲', lat: 40.4168, lon: -3.7038, timezone: 'Europe/Madrid', note: '2026日全食' },
  { name: '伦敦 / 格林尼治 (London)', region: '欧洲/非洲', lat: 51.4769, lon: -0.0005, timezone: 'Europe/London' },
  { name: '巴黎 (Paris)', region: '欧洲/非洲', lat: 48.8566, lon: 2.3522, timezone: 'Europe/Paris' },
  { name: '柏林 (Berlin)', region: '欧洲/非洲', lat: 52.52, lon: 13.405, timezone: 'Europe/Berlin' },
  { name: '莫斯科 (Moscow)', region: '欧洲/非洲', lat: 55.7558, lon: 37.6173, timezone: 'Europe/Moscow' },
  { name: '普林西比岛 (Principe)', region: '欧洲/非洲', lat: 1.61, lon: 7.4, timezone: 'Africa/Sao_Tome', note: '1919爱丁顿日全食' },
  { name: '挪威特罗姆瑟 (Tromso - 北极圈内)', region: '欧洲/非洲', lat: 69.6492, lon: 18.9553, timezone: 'Europe/Oslo', note: '极昼/极夜体验' },

  // 美洲
  { name: '美国达拉斯 (Dallas, TX)', region: '美洲', lat: 32.7767, lon: -96.797, timezone: 'America/Chicago', note: '2024北美日全食' },
  { name: '墨西哥马萨特兰 (Mazatlan)', region: '美洲', lat: 23.2494, lon: -106.4111, timezone: 'America/Mazatlan', note: '2024日全食' },
  { name: '纽约 (New York)', region: '美洲', lat: 40.7128, lon: -74.006, timezone: 'America/New_York' },
  { name: '旧金山 (San Francisco)', region: '美洲', lat: 37.7749, lon: -122.4194, timezone: 'America/Los_Angeles' },
  { name: '夏威夷火奴鲁鲁 (Honolulu)', region: '美洲', lat: 21.3069, lon: -157.8583, timezone: 'Pacific/Honolulu' },
  { name: '智利阿塔卡马天文台 (ALMA)', region: '美洲', lat: -23.029, lon: -67.755, timezone: 'America/Santiago' },
];

export const COMMON_TIMEZONES: { label: string; zone: string }[] = [
  { label: '北京时间 (UTC+8 · Asia/Shanghai)', zone: 'Asia/Shanghai' },
  { label: '世界协调时 (UTC+0 · UTC)', zone: 'UTC' },
  { label: '东京时间 (UTC+9 · Asia/Tokyo)', zone: 'Asia/Tokyo' },
  { label: '曼谷/雅加达 (UTC+7 · Asia/Bangkok)', zone: 'Asia/Bangkok' },
  { label: '印度标准时 (UTC+5:30 · Asia/Kolkata)', zone: 'Asia/Kolkata' },
  { label: '迪拜时间 (UTC+4 · Asia/Dubai)', zone: 'Asia/Dubai' },
  { label: '莫斯科时间 (UTC+3 · Europe/Moscow)', zone: 'Europe/Moscow' },
  { label: '开罗/卢克索 (UTC+2/3 · Africa/Cairo)', zone: 'Africa/Cairo' },
  { label: '欧洲中部时间 (UTC+1/2 · Europe/Paris)', zone: 'Europe/Paris' },
  { label: '伦敦时间 (UTC+0/1 · Europe/London)', zone: 'Europe/London' },
  { label: '美东时间 (UTC-5/-4 · America/New_York)', zone: 'America/New_York' },
  { label: '美中时间/达拉斯 (UTC-6/-5 · America/Chicago)', zone: 'America/Chicago' },
  { label: '美西时间 (UTC-8/-7 · America/Los_Angeles)', zone: 'America/Los_Angeles' },
  { label: '夏威夷时间 (UTC-10 · Pacific/Honolulu)', zone: 'Pacific/Honolulu' },
  { label: '悉尼时间 (UTC+10/11 · Australia/Sydney)', zone: 'Australia/Sydney' },
  { label: '新西兰时间 (UTC+12/13 · Pacific/Auckland)', zone: 'Pacific/Auckland' },
];
