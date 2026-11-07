import { DEG2RAD } from '../utils/math';

/**
 * Draw an accurate Moon Phase icon on a 2D canvas given `phaseAngleDeg` (0..360, where 0=New, 90=First Quarter, 180=Full, 270=Third Quarter).
 * Handles Northern vs Southern hemisphere orientation and optional Lunar Eclipse Blood Moon tint.
 */
export function drawMoonPhaseDisc(
  canvas: HTMLCanvasElement,
  phaseAngleDeg: number,
  options?: {
    isSouthernHemisphere?: boolean;
    lunarEclipseObscuration?: number; // 0..1+
    tiltRad?: number;
  }
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.43;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy);

  if (options?.tiltRad) {
    ctx.rotate(options.tiltRad);
  } else if (options?.isSouthernHemisphere) {
    ctx.rotate(Math.PI);
  }

  // Dark side base (with subtle earthshine)
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#192233';
  ctx.fill();

  // Compute terminator ellipse horizontal radius
  const phaseRad = ((phaseAngleDeg % 360) + 360) % 360 * DEG2RAD;
  const isWaxing = phaseAngleDeg < 180;
  const cosPhase = Math.cos(phaseRad); // +1 at New, 0 at Quarter, -1 at Full

  // Lit color (or copper-red during total lunar eclipse!)
  let litColor = '#f2f0e6';
  if (options?.lunarEclipseObscuration && options.lunarEclipseObscuration > 0.6) {
    litColor = options.lunarEclipseObscuration >= 1.0 ? '#d94826' : '#e68a4d';
  }

  ctx.fillStyle = litColor;
  ctx.beginPath();

  // Outer illuminated semicircle (right side for waxing, left side for waning in northern hemisphere)
  if (isWaxing) {
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(
      0,
      0,
      Math.abs(cosPhase) * r,
      r,
      0,
      Math.PI / 2,
      -Math.PI / 2,
      cosPhase > 0 // crescent vs gibbous
    );
  } else {
    ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, false);
    ctx.ellipse(
      0,
      0,
      Math.abs(cosPhase) * r,
      r,
      0,
      -Math.PI / 2,
      Math.PI / 2,
      cosPhase > 0
    );
  }
  ctx.closePath();
  ctx.fill();

  // Subtle rim border
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(180, 210, 255, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.restore();
}
