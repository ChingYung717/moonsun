export const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;

void main() {
  vWorldDir = normalize(position);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uEclipseObscuration; // 0..1 at observer location
uniform float uIsTotalEclipse;     // 0..1

varying vec3 vWorldDir;

void main() {
  vec3 dir = normalize(vWorldDir);
  float zenithY = max(0.0, dir.y);
  float sunAlt = uSunDir.y;

  // Day / Twilight / Night blend factors from Sun altitude
  float dayFactor = smoothstep(-0.06, 0.18, sunAlt);
  float twilightFactor = smoothstep(-0.22, -0.02, sunAlt) * (1.0 - smoothstep(-0.02, 0.18, sunAlt));

  // Solar eclipse darkening factor (strong nonlinear drop when obscuration > 0.85)
  float eclipseDim = 1.0 - pow(clamp(uEclipseObscuration, 0.0, 1.0), 3.0) * 0.97;
  float effectiveDay = dayFactor * eclipseDim;

  // Zenith & Horizon colors for daytime
  vec3 dayZenith = vec3(0.09, 0.32, 0.76);
  vec3 dayHorizon = vec3(0.48, 0.74, 0.96);
  vec3 skyDay = mix(dayHorizon, dayZenith, pow(zenithY, 0.55));

  // Twilight colors
  float sunAzimuthGlow = pow(max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z)))), 2.5);
  vec3 twilightHorizon = mix(vec3(0.18, 0.24, 0.45), vec3(0.95, 0.42, 0.15), sunAzimuthGlow);
  vec3 twilightZenith = vec3(0.03, 0.06, 0.16);
  vec3 skyTwilight = mix(twilightHorizon, twilightZenith, pow(zenithY, 0.45));

  // Night sky base
  vec3 skyNight = mix(vec3(0.015, 0.022, 0.048), vec3(0.004, 0.007, 0.018), pow(zenithY, 0.5));

  vec3 color = skyNight + skyDay * effectiveDay + skyTwilight * twilightFactor * eclipseDim;

  // Total Solar Eclipse "360-degree Sunset Horizon Ring" + Deep Indigo Zenith
  if (uEclipseObscuration > 0.88 && sunAlt > -0.02) {
    float totalityStrength = smoothstep(0.88, 1.0, uEclipseObscuration);
    float horizonRing = pow(1.0 - zenithY, 4.5) * smoothstep(-0.05, 0.02, dir.y);
    vec3 eclipseHorizonGlow = vec3(0.92, 0.44, 0.16) * horizonRing * 0.65 * totalityStrength;
    vec3 eclipseZenith = vec3(0.015, 0.028, 0.075) * totalityStrength;
    color = mix(color, eclipseZenith + eclipseHorizonGlow, totalityStrength * 0.85);
  }

  // Forward Mie scattering halo around the Sun (attenuated during totality)
  float cosSun = max(0.0, dot(dir, normalize(uSunDir)));
  float mieHalo = pow(cosSun, 16.0) * 0.25 + pow(cosSun, 128.0) * 0.55;
  vec3 sunHaloColor = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.95, 0.85), clamp(sunAlt * 3.0, 0.0, 1.0));
  color += sunHaloColor * mieHalo * effectiveDay * (1.0 - uIsTotalEclipse);

  // Subtle lunar halo at night
  float cosMoon = max(0.0, dot(dir, normalize(uMoonDir)));
  float moonHalo = pow(cosMoon, 32.0) * 0.08 * (1.0 - effectiveDay);
  color += vec3(0.6, 0.72, 0.95) * moonHalo;

  // Below horizon ground fade
  if (dir.y < 0.0) {
    color = mix(color, vec3(0.03, 0.04, 0.06), smoothstep(0.0, -0.15, dir.y));
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
