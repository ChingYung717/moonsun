export const MOON_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const MOON_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMoonTex;
uniform vec3 uSunDirThree;
uniform vec3 uSunPosKmThree;
uniform vec3 uMoonPosKmThree;
uniform float uEarthshineIntensity;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

const float PI = 3.141592653589793;
const float R_EARTH_EFF_KM = 6466.0; // 6371 km * 1.015 Danjon atmospheric shadow enlargement
const float R_SUN_KM = 695700.0;
const float R_MOON_KM = 1737.4;

// Compute fraction of Sun disk (radius r1) covered by Earth disk (radius r2) at separation d
float computeEarthShadowOverlap(float rSun, float rEarth, float d, out float umbraDepth) {
  umbraDepth = 0.0;
  if (d >= rSun + rEarth) return 0.0;
  if (d <= rEarth - rSun) {
    // Totally inside Earth's umbra!
    umbraDepth = clamp((rEarth - rSun - d) / max(0.0001, rEarth - rSun), 0.0, 1.0);
    return 1.0;
  }
  float cosA = clamp((rSun * rSun + d * d - rEarth * rEarth) / (2.0 * rSun * d), -1.0, 1.0);
  float cosB = clamp((rEarth * rEarth + d * d - rSun * rSun) / (2.0 * rEarth * d), -1.0, 1.0);
  float alpha = acos(cosA);
  float beta = acos(cosB);
  float s = 0.5 * (rSun + rEarth + d);
  float tri2 = 2.0 * sqrt(max(0.0, s * (s - rSun) * (s - rEarth) * (s - d)));
  float area = rSun * rSun * alpha + rEarth * rEarth * beta - tri2;
  return clamp(area / (PI * rSun * rSun), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDirThree);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 albedo = texture2D(uMoonTex, vUv).rgb;

  // Approximate crater relief perturbation from albedo gradients near terminator
  float dTx = dFdx(albedo.r);
  float dTy = dFdy(albedo.r);
  vec3 perturbedN = normalize(N - vec3(dTx, dTy, 0.0) * 1.6);

  float ndotl = max(0.0, dot(perturbedN, L));
  float ndotv = max(0.05, dot(N, V));

  // Lommel-Seeliger + Lambertian blend for authentic lunar regolith brightness (flat full moon disk + crisp terminator)
  float lommel = ndotl / (ndotl + ndotv * 0.65 + 0.05);
  float directLight = mix(ndotl, lommel * 1.35, 0.65) * smoothstep(-0.02, 0.06, dot(N, L));

  // Real-geometry Lunar Eclipse shadow (Earth blocking the Sun at this lunar surface point!)
  vec3 lunarSurfaceKm = uMoonPosKmThree + N * R_MOON_KM;
  vec3 toSun = uSunPosKmThree - lunarSurfaceKm;
  vec3 toEarth = -lunarSurfaceKm; // Earth center is at (0,0,0)

  float dSun = length(toSun);
  float dEarth = length(toEarth);
  float rSun = asin(R_SUN_KM / dSun);
  float rEarth = asin(R_EARTH_EFF_KM / dEarth);
  float sep = acos(clamp(dot(toSun / dSun, toEarth / dEarth), -1.0, 1.0));

  float umbraDepth = 0.0;
  float occ = computeEarthShadowOverlap(rSun, rEarth, sep, umbraDepth);

  // Direct sunlight attenuated by penumbra
  vec3 sunLit = albedo * directLight * (1.0 - occ);

  // Refracted light through Earth's atmosphere inside the Umbra ("Blood Moon" + Ozone Blue Fringe)
  vec3 umbraLight = vec3(0.0);
  if (occ > 0.98) {
    // Turquoise-blue ozone layer absorption band right at the umbral edge (umbraDepth 0..0.14)
    float ozoneBand = smoothstep(0.0, 0.05, umbraDepth) * (1.0 - smoothstep(0.05, 0.20, umbraDepth));
    vec3 ozoneColor = vec3(0.28, 0.54, 0.72) * ozoneBand * 0.32;

    // Copper-red refracted tropospheric sunlight deeper in the umbra
    // Brighter orange-red near edge, deeper dark crimson near center of umbra
    vec3 edgeCopper = vec3(1.18, 0.36, 0.09);
    vec3 coreCrimson = vec3(0.62, 0.11, 0.03);
    vec3 bloodColor = mix(edgeCopper, coreCrimson, smoothstep(0.08, 0.85, umbraDepth));

    umbraLight = albedo * (bloodColor * 0.85 + ozoneColor) * max(0.25, directLight);
  } else if (occ > 0.65) {
    // Warm amber tint on inner penumbra approaching umbra
    float innerPen = smoothstep(0.65, 0.98, occ);
    sunLit *= mix(vec3(1.0), vec3(0.95, 0.72, 0.55), innerPen * 0.5);
  }

  // Earthshine (地照) on the lunar night side facing Earth
  vec3 dirToEarth = normalize(toEarth);
  float earthFacing = max(0.0, dot(N, dirToEarth));
  vec3 earthshine = albedo * vec3(0.55, 0.68, 0.92) * earthFacing * uEarthshineIntensity * 0.09 * (1.0 - smoothstep(-0.05, 0.15, dot(N, L)));

  // Subtle base ambient so dark side silhouette is visible against stars
  vec3 baseAmbient = albedo * 0.018;

  vec3 finalColor = sunLit + umbraLight + earthshine + baseAmbient;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;
