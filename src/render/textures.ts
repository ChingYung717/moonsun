import * as THREE from 'three';

export interface PlanetaryTextures {
  earthDay: THREE.Texture;
  earthNight: THREE.Texture;
  earthClouds: THREE.Texture;
  earthNormal: THREE.Texture;
  earthSpecular: THREE.Texture;
  moonColor: THREE.Texture;
  sunSurface: THREE.Texture;
  starsMilkyWay: THREE.Texture;
}

function applyFallbackCanvas(
  tex: THREE.Texture,
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w = 512,
  h = 256
): void {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  drawFn(ctx, w, h);
  tex.image = canvas;
  tex.userData.resolution = 'fallback';
  tex.needsUpdate = true;
}

export function loadPlanetaryTextures(
  maxAnisotropy = 8,
  onUpdate?: () => void,
  onProgress?: (loaded: number, total: number) => void
): PlanetaryTextures {
  const loader = new THREE.TextureLoader();
  const isSmallScreen =
    typeof window !== 'undefined' &&
    (window.innerWidth < 760 ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches));
  const navConn = typeof navigator !== 'undefined' ? (navigator as any).connection : undefined;
  const isConstrainedNetwork = Boolean(
    navConn &&
      (navConn.saveData === true ||
        navConn.effectiveType === 'slow-2g' ||
        navConn.effectiveType === '2g' ||
        navConn.effectiveType === '3g')
  );
  const skip4kUpgrade = isSmallScreen || isConstrainedNetwork;

  let totalStages = 0;
  let completedStages = 0;
  const reportProgress = () => {
    completedStages++;
    onProgress?.(completedStages, totalStages);
    onUpdate?.();
  };

  /**
   * True progressive 2K -> 4K texture loader:
   * 1. Immediately paints a 512x256 procedural fallback canvas so the globe is never black on frame 0.
   * 2. Loads the 2K texture first; calls `tex.dispose()` before assigning `tex.image` so Three.js
   *    reallocates `texStorage2D` at 2048x1024 without WebGL `texSubImage2D` dimension errors.
   * 3. On desktop (>700px), upgrades to 4096x2048 in the background, again calling `tex.dispose()`
   *    before replacing `tex.image` so WebGL reallocates `texStorage2D` at 4096x2048.
   */
  const loadProgressive = (
    lowUrl: string,
    highUrl: string | null,
    isSRGB: boolean,
    fallbackDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  ): THREE.Texture => {
    const tex = new THREE.Texture();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = maxAnisotropy;
    if (isSRGB) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }

    applyFallbackCanvas(tex, fallbackDraw);

    totalStages++;
    let hasHighResLoaded = false;

    loader.load(
      lowUrl,
      (loaded2k) => {
        if (!hasHighResLoaded) {
          tex.dispose();
          tex.image = loaded2k.image;
          tex.userData.resolution = '2k';
          tex.needsUpdate = true;
        }
        reportProgress();

        if (highUrl && !skip4kUpgrade) {
          loader.load(
            highUrl,
            (loaded4k) => {
              hasHighResLoaded = true;
              tex.dispose();
              tex.image = loaded4k.image;
              tex.userData.resolution = '4k';
              tex.needsUpdate = true;
              onUpdate?.();
            },
            undefined,
            () => {
              // Keep 2K texture if 4K fails
            }
          );
        }
      },
      undefined,
      () => {
        if (highUrl) {
          loader.load(
            highUrl,
            (loaded4k) => {
              hasHighResLoaded = true;
              tex.dispose();
              tex.image = loaded4k.image;
              tex.userData.resolution = '4k';
              tex.needsUpdate = true;
              reportProgress();
            },
            undefined,
            () => reportProgress()
          );
        } else {
          reportProgress();
        }
      }
    );

    return tex;
  };

  const base = import.meta.env.BASE_URL;
  return {
    earthDay: loadProgressive(
      `${base}textures/earth_day_2k.jpg`,
      `${base}textures/earth_day_4k.jpg`,
      true,
      (ctx, w, h) => {
        ctx.fillStyle = '#0c3166';
        ctx.fillRect(0, 0, w, h);
      }
    ),
    earthNight: loadProgressive(
      `${base}textures/earth_night_2k.jpg`,
      `${base}textures/earth_night_4k.jpg`,
      true,
      (ctx, w, h) => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
      }
    ),
    earthClouds: loadProgressive(
      `${base}textures/earth_clouds_2k.jpg`,
      `${base}textures/earth_clouds_4k.jpg`,
      false,
      (ctx, w, h) => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
      }
    ),
    earthNormal: loadProgressive(
      `${base}textures/earth_normal.jpg`,
      null,
      false,
      (ctx, w, h) => {
        ctx.fillStyle = 'rgb(128,128,255)';
        ctx.fillRect(0, 0, w, h);
      }
    ),
    earthSpecular: loadProgressive(
      `${base}textures/earth_specular.jpg`,
      null,
      false,
      (ctx, w, h) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
    ),
    moonColor: loadProgressive(
      `${base}textures/moon_2k.jpg`,
      `${base}textures/moon_4k.jpg`,
      true,
      (ctx, w, h) => {
        ctx.fillStyle = '#8b8b8e';
        ctx.fillRect(0, 0, w, h);
      }
    ),
    sunSurface: loadProgressive(
      `${base}textures/sun.jpg`,
      null,
      true,
      (ctx, w, h) => {
        ctx.fillStyle = '#ffaa22';
        ctx.fillRect(0, 0, w, h);
      }
    ),
    starsMilkyWay: loadProgressive(
      `${base}textures/stars_milkyway_2k.jpg`,
      `${base}textures/stars_milkyway_4k.jpg`,
      true,
      (ctx, w, h) => {
        ctx.fillStyle = '#02040a';
        ctx.fillRect(0, 0, w, h);
      }
    ),
  };
}
