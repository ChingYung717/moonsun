/// <reference types="vite/client" />

declare module 'tz-lookup' {
  export default function tzlookup(lat: number, lon: number): string;
}

declare module 'lunar-javascript' {
  export const Solar: any;
  export const Lunar: any;
  export const LunarYear: any;
  export const LunarMonth: any;
}
