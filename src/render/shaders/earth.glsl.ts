export const EARTH_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalNormal;

void main() {
  vUv = uv;
  vLocalNormal = normalize(normal);
  // Since Earth mesh is centered at origin with uniform scale, mat3(modelMatrix) is pure rotation
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const EARTH_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uDayTex;
uniform sampler2D uNightTex;
uniform sampler2D uCloudsTex;
uniform sampler2D uSpecularTex;
uniform sampler2D uNormalTex;

uniform vec3 uSunDirThree;
uniform vec3 uSunPosKmThree;
uniform vec3 uMoonPosKmThree;
uniform float uCloudsRotationRad;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalNormal;

const float PI = 3.141592653589793;
const float R_EARTH_EQ_KM = 6378.137;
const float R_EARTH_POLAR_KM = 6356.752;
const float R_SUN_KM = 695700.0;
const float R_MOON_KM = 1737.4;

// Compute fraction of Sun disk (radius r1) covered by Moon disk (radius r2) at angular separation d
float computeSolarObscuration(float r1, float r2, float d, out float isCentral) {
  isCentral = 0.0;
  if (d >= r1 + r2) return 0.0;
  if (d <= abs(r2 - r1)) {
    isCentral = 1.0;
    if (r2 >= r1) return 1.0;
    return (r2 * r2) / (r1 * r1);
  }
  float cosA = clamp((r1 * r1 + d * d - r2 * r2) / (2.0 * r1 * d), -1.0, 1.0);
  float cosB = clamp((r2 * r2 + d * d - r1 * r1) / (2.0 * r2 * d), -1.0, 1.0);
  float alpha = acos(cosA);
  float beta = acos(cosB);
  float s = 0.5 * (r1 + r2 + d);
  float tri2 = 2.0 * sqrt(max(0.0, s * (s - r1) * (s - r2) * (s - d)));
  float area = r1 * r1 * alpha + r2 * r2 * beta - tri2;
  return clamp(area / (PI * r1 * r1), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDirThree);
  vec3 V = normalize(cameraPosition - vWorldPos);

  // Sample textures
  vec3 dayColor = texture2D(uDayTex, vUv).rgb;
  vec3 nightColor = texture2D(uNightTex, vUv).rgb;
  float specMask = texture2D(uSpecularTex, vUv).r;

  // Slightly drifting cloud UV
  vec2 cloudUv = vec2(fract(vUv.x + uCloudsRotationRad / (2.0 * PI)), vUv.y);
  float cloudAmount = texture2D(uCloudsTex, cloudUv).r;

  // Cosine of solar zenith angle
  float ndotl = dot(N, L);

  // Smooth day / twilight / night transition
  float dayFactor = smoothstep(-0.12, 0.16, ndotl);
  float twilightFactor = smoothstep(-0.16, 0.02, ndotl) * (1.0 - smoothstep(0.02, 0.22, ndotl));

  // Real-geometry Solar Eclipse calculation on Earth's surface (in km!)
  // Local Y is Earth's polar axis; account for WGS-84 flattening!
  float latSin = vLocalNormal.y;
  float surfaceRadiusKm = mix(R_EARTH_EQ_KM, R_EARTH_POLAR_KM, latSin * latSin);
  vec3 surfacePosKm = N * surfaceRadiusKm;

  float eclipseOcc = 0.0;
  float isCentralEclipse = 0.0;
  if (ndotl > -0.05) {
    vec3 toSun = uSunPosKmThree - surfacePosKm;
    vec3 toMoon = uMoonPosKmThree - surfacePosKm;
    float dSun = length(toSun);
    float dMoon = length(toMoon);
    float rSun = asin(R_SUN_KM / dSun);
    float rMoon = asin(R_MOON_KM / dMoon);
    float sep = acos(clamp(dot(toSun / dSun, toMoon / dMoon), -1.0, 1.0));
    eclipseOcc = computeSolarObscuration(rSun, rMoon, sep, isCentralEclipse);
  }

  // Diffuse sun lighting
  float diffuse = max(0.0, ndotl);

  // Ocean specular reflection (Blinn-Phong)
  vec3 H = normalize(L + V);
  float spec = pow(max(0.0, dot(N, H)), 42.0) * specMask * 0.45 * dayFactor * (1.0 - cloudAmount);

  // Combine day surface + clouds
  vec3 litDay = dayColor * (0.12 + 0.92 * diffuse) + vec3(spec);
  vec3 cloudColor = vec3(0.96, 0.98, 1.0) * (0.15 + 0.90 * diffuse);
  litDay = mix(litDay, cloudColor, cloudAmount * 0.78);

  // Warm orange-amber twilight glow near terminator
  vec3 twilightTint = vec3(0.95, 0.42, 0.14) * twilightFactor * 0.32 * (0.4 + 0.6 * cloudAmount);
  litDay += twilightTint;

  // Apply Solar Eclipse Umbra / Penumbra darkening on the day side!
  if (eclipseOcc > 0.001) {
    // Strengthened perceptual darkening curve so the broad penumbra region is clearly visible from space (C3)
    float shadowDarken = mix(1.0, 0.03, pow(eclipseOcc, 0.72));
    // Outer penumbra subtle cool-dusky tint + warm orange rim right around the umbral core
    float umbraRim = smoothstep(0.88, 0.995, eclipseOcc) * (1.0 - isCentralEclipse);
    vec3 penumbraAmber = vec3(1.0, 0.48, 0.16) * umbraRim * 0.52;
    litDay = litDay * shadowDarken + penumbraAmber;
    // Deep umbral/antumbral core with thin warm corona-like edge
    if (isCentralEclipse > 0.5) {
      litDay = mix(litDay, vec3(0.012, 0.015, 0.03), 0.88);
    }
  }

  // Night city lights (visible at night and dimly emerging inside total eclipse umbra)
  float nightVisibility = (1.0 - smoothstep(-0.08, 0.08, ndotl)) + isCentralEclipse * dayFactor * 0.65;
  vec3 cityLights = nightColor * vec3(1.0, 0.86, 0.62) * 1.45 * (1.0 - cloudAmount * 0.7) * clamp(nightVisibility, 0.0, 1.0);

  // Ambient night side base (subtle starlight/moonlight so continents remain faintly discernible)
  vec3 nightAmbient = dayColor * vec3(0.035, 0.05, 0.085) * (1.0 - dayFactor);

  // Atmospheric Fresnel rim glow
  float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.2);
  vec3 atmosColor = mix(vec3(0.15, 0.35, 0.75), vec3(0.38, 0.68, 1.0), dayFactor);
  vec3 atmosGlow = atmosColor * fresnel * (0.22 + 0.58 * dayFactor) * (1.0 - eclipseOcc * 0.7);

  vec3 finalColor = litDay * dayFactor + nightAmbient + cityLights + atmosGlow;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;
