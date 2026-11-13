import * as THREE from 'three';

export interface ProceduralTextureSet {
  stoneAlbedo: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  wombAlbedo: THREE.CanvasTexture;
  wombBump: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  shadowDisc: THREE.CanvasTexture;
  dispose: () => void;
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Rain-Slicked Ancestral Stone Masonry (Albedo + Bump)
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 512;
  stoneCanvas.height = 512;
  const sctx = stoneCanvas.getContext('2d')!;
  sctx.fillStyle = '#1b1815';
  sctx.fillRect(0, 0, 512, 512);

  const stoneBumpCanvas = document.createElement('canvas');
  stoneBumpCanvas.width = 512;
  stoneBumpCanvas.height = 512;
  const sbctx = stoneBumpCanvas.getContext('2d')!;
  sbctx.fillStyle = '#808080';
  sbctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const sz = 2 + Math.random() * 4;
    const v = 18 + Math.random() * 32;
    sctx.fillStyle = `rgb(${v},${Math.floor(v * 0.94)},${Math.floor(v * 0.86)})`;
    sctx.fillRect(x, y, sz, sz);

    const b = 90 + Math.random() * 75;
    sbctx.fillStyle = `rgb(${b},${b},${b})`;
    sbctx.fillRect(x, y, sz, sz);
  }

  // Mossy damp stains
  for (let i = 0; i < 45; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 10 + Math.random() * 35;
    sctx.fillStyle = 'rgba(18, 28, 16, 0.22)';
    sctx.beginPath();
    sctx.arc(x, y, r, 0, Math.PI * 2);
    sctx.fill();
  }

  // Ashlar block joints
  sctx.strokeStyle = '#090706';
  sctx.lineWidth = 4;
  sbctx.strokeStyle = '#1a1a1a';
  sbctx.lineWidth = 5;
  for (let y = 0; y < 512; y += 64) {
    sctx.beginPath();
    sctx.moveTo(0, y);
    sctx.lineTo(512, y);
    sctx.stroke();

    sbctx.beginPath();
    sbctx.moveTo(0, y);
    sbctx.lineTo(512, y);
    sbctx.stroke();

    const offset = y % 128 === 0 ? 0 : 64;
    for (let x = offset; x < 512; x += 128) {
      sctx.beginPath();
      sctx.moveTo(x, y);
      sctx.lineTo(x, y + 64);
      sctx.stroke();

      sbctx.beginPath();
      sbctx.moveTo(x, y);
      sbctx.lineTo(x, y + 64);
      sbctx.stroke();
    }
  }

  // 2. Crimson Organic Womb Texture (Albedo + Bump)
  const wombCanvas = document.createElement('canvas');
  wombCanvas.width = 512;
  wombCanvas.height = 512;
  const wctx = wombCanvas.getContext('2d')!;
  wctx.fillStyle = '#2d0405';
  wctx.fillRect(0, 0, 512, 512);

  const wombBumpCanvas = document.createElement('canvas');
  wombBumpCanvas.width = 512;
  wombBumpCanvas.height = 512;
  const wbctx = wombBumpCanvas.getContext('2d')!;
  wbctx.fillStyle = '#606060';
  wbctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rad = 5 + Math.random() * 22;
    const r = 42 + Math.random() * 82;
    wctx.fillStyle = `rgba(${r}, 6, 10, 0.34)`;
    wctx.beginPath();
    wctx.arc(x, y, rad, 0, Math.PI * 2);
    wctx.fill();

    const b = 110 + Math.random() * 120;
    wbctx.fillStyle = `rgba(${b},${b},${b}, 0.35)`;
    wbctx.beginPath();
    wbctx.arc(x, y, rad * 0.85, 0, Math.PI * 2);
    wbctx.fill();
  }

  // Veins across womb surface
  wctx.strokeStyle = 'rgba(130, 12, 16, 0.45)';
  wctx.lineWidth = 3;
  wbctx.strokeStyle = 'rgba(210, 210, 210, 0.5)';
  wbctx.lineWidth = 4;
  for (let v = 0; v < 28; v++) {
    let vx = Math.random() * 512;
    let vy = Math.random() * 512;
    wctx.beginPath();
    wctx.moveTo(vx, vy);
    wbctx.beginPath();
    wbctx.moveTo(vx, vy);
    for (let s = 0; s < 6; s++) {
      vx += (Math.random() - 0.5) * 90;
      vy += (Math.random() - 0.5) * 90;
      wctx.lineTo(vx, vy);
      wbctx.lineTo(vx, vy);
    }
    wctx.stroke();
    wbctx.stroke();
  }

  // 3. Carved Teak Wood Gate Texture
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const tctx = woodCanvas.getContext('2d')!;
  tctx.fillStyle = '#331c0e';
  tctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    tctx.fillStyle = x % 64 === 0 ? 'rgba(20,10,4,0.28)' : 'rgba(70,40,18,0.16)';
    tctx.fillRect(x, 0, 32, 256);
    tctx.strokeStyle = '#160b04';
    tctx.lineWidth = 2;
    tctx.beginPath();
    tctx.moveTo(x, 0);
    tctx.lineTo(x, 256);
    tctx.stroke();
  }
  for (let i = 0; i < 600; i++) {
    tctx.fillStyle = 'rgba(18, 9, 4, 0.25)';
    tctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 18 + Math.random() * 24);
  }

  // 4. Radial Contact Shadow Disc
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shctx = shadowCanvas.getContext('2d')!;
  const grad = shctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.32)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shctx.fillStyle = grad;
  shctx.fillRect(0, 0, 128, 128);

  const stoneAlbedo = configureTexture(stoneCanvas, true, 4, 4, maxAnisotropy);
  const stoneBump = configureTexture(stoneBumpCanvas, false, 4, 4, maxAnisotropy);
  const wombAlbedo = configureTexture(wombCanvas, true, 6, 6, maxAnisotropy);
  const wombBump = configureTexture(wombBumpCanvas, false, 6, 6, maxAnisotropy);
  const woodAlbedo = configureTexture(woodCanvas, true, 1, 1, maxAnisotropy);
  const shadowDisc = new THREE.CanvasTexture(shadowCanvas);

  return {
    stoneAlbedo,
    stoneBump,
    wombAlbedo,
    wombBump,
    woodAlbedo,
    shadowDisc,
    dispose: () => {
      stoneAlbedo.dispose();
      stoneBump.dispose();
      wombAlbedo.dispose();
      wombBump.dispose();
      woodAlbedo.dispose();
      shadowDisc.dispose();
    },
  };
}
