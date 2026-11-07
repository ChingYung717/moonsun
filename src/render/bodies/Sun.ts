import * as THREE from 'three';

function createSolarGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;

  const grad = ctx.createRadialGradient(cx, cy, 24, cx, cy, 256);
  grad.addColorStop(0.0, 'rgba(255, 252, 230, 1.0)');
  grad.addColorStop(0.18, 'rgba(255, 215, 110, 0.85)');
  grad.addColorStop(0.42, 'rgba(255, 130, 30, 0.35)');
  grad.addColorStop(0.72, 'rgba(220, 60, 10, 0.08)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle coronal streamers
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16);
    const g2 = ctx.createLinearGradient(0, 0, 240, 0);
    g2.addColorStop(0, 'rgba(255, 230, 170, 0.18)');
    g2.addColorStop(1, 'rgba(255, 160, 60, 0.0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(20, -6);
    ctx.lineTo(240, -1.5);
    ctx.lineTo(240, 1.5);
    ctx.lineTo(20, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SunBody {
  public readonly group = new THREE.Group();
  public readonly mesh: THREE.Mesh;
  public readonly coronaSprite: THREE.Sprite;
  private mat: THREE.MeshBasicMaterial;

  constructor(sunTexture: THREE.Texture) {
    const geo = new THREE.SphereGeometry(1, 64, 64);
    this.mat = new THREE.MeshBasicMaterial({
      map: sunTexture,
      color: new THREE.Color(0xfff5d6),
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.group.add(this.mesh);

    const glowTex = createSolarGlowTexture();
    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffd27d,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.coronaSprite = new THREE.Sprite(spriteMat);
    this.group.add(this.coronaSprite);
  }

  update(positionThree: THREE.Vector3, radius: number, utcMs: number): void {
    this.group.position.copy(positionThree);
    this.mesh.scale.setScalar(radius);
    this.coronaSprite.scale.setScalar(radius * 5.2);

    // Subtle solar rotation (~25.38 day sidereal period)
    const rotAngle = ((utcMs / (25.38 * 86400 * 1000)) * Math.PI * 2) % (Math.PI * 2);
    this.mesh.rotation.y = rotAngle;
  }
}
