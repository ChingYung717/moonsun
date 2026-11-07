#!/usr/bin/env zsh
# Download 8K source maps (Solar System Scope, CC BY 4.0) into assets-src/ (not served),
# then derive the served 4K (default, desktop) and 2K (small screens) maps with macOS `sips`.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets-src/textures-8k"
OUT="$ROOT/public/textures"
mkdir -p "$SRC" "$OUT"

typeset -A URLS
URLS=(
  earth_day      "https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg"
  earth_night    "https://www.solarsystemscope.com/textures/download/8k_earth_nightmap.jpg"
  earth_clouds   "https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg"
  moon           "https://www.solarsystemscope.com/textures/download/8k_moon.jpg"
  stars_milkyway "https://www.solarsystemscope.com/textures/download/8k_stars_milky_way.jpg"
)

for name url in ${(kv)URLS}; do
  [ -f "$SRC/${name}_8k.jpg" ] || curl -L --fail -A "Mozilla/5.0" -o "$SRC/${name}_8k.jpg" "$url"
  sips -s format jpeg -s formatOptions 88 -Z 4096 "$SRC/${name}_8k.jpg" --out "$OUT/${name}_4k.jpg" >/dev/null
  sips -s format jpeg -s formatOptions 85 -Z 2048 "$SRC/${name}_8k.jpg" --out "$OUT/${name}_2k.jpg" >/dev/null
done

# 2K-only auxiliary maps and the Sun
[ -f "$OUT/earth_normal.jpg" ]   || curl -L --fail -o "$OUT/earth_normal.jpg"   "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg"
[ -f "$OUT/earth_specular.jpg" ] || curl -L --fail -o "$OUT/earth_specular.jpg" "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg"
[ -f "$OUT/sun.jpg" ]            || curl -L --fail -A "Mozilla/5.0" -o "$OUT/sun.jpg" "https://www.solarsystemscope.com/textures/download/2k_sun.jpg"

ls -lh "$OUT"
