import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BoardStyle, BoardTheme } from '../config/arenaThemes.ts';

export const SQUARE = 1;
export const FRAME_OUTER = 9.6;
const FRAME_INNER = 8.16;
const FRAME_TOP = 0.045;

export function squareCenter(sq: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set((sq % 8) - 3.5, 0, 3.5 - Math.floor(sq / 8));
}

export function squareFromPoint(x: number, z: number): number | null {
  const file = Math.floor(x + 4);
  const rank = Math.floor(4 - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return rank * 8 + file;
}

// ---------------------------------------------------------------------------- texture painting

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}

function paintWood(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, vein: string, vertical: boolean, r: () => number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  // Broad colour bands
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = shade(base, (r() - 0.5) * 0.08) + '55';
    const t = r() * (vertical ? w : h);
    if (vertical) ctx.fillRect(x + t, y, 4 + r() * w * 0.25, h);
    else ctx.fillRect(x, y + t, w, 4 + r() * h * 0.25);
  }
  // Fine grain lines with gentle waves
  const lines = Math.floor((vertical ? w : h) / 3.2);
  const phase = r() * 10;
  for (let i = 0; i < lines; i++) {
    const off = (i / lines) * (vertical ? w : h) + (r() - 0.5) * 2;
    ctx.strokeStyle = vein;
    ctx.globalAlpha = 0.08 + r() * 0.22;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath();
    const len = vertical ? h : w;
    for (let s = 0; s <= len; s += 6) {
      const wave = Math.sin(s * 0.02 + phase + i * 0.15) * 2.4 + Math.sin(s * 0.07 + i) * 0.8;
      const px = vertical ? x + off + wave : x + s;
      const py = vertical ? y + s : y + off + wave;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function paintMarble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, vein: string, r: () => number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 10; i++) {
    const cx = x + r() * w;
    const cy = y + r() * h;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * (0.2 + r() * 0.5));
    g.addColorStop(0, shade(base, (r() - 0.5) * 0.12) + '66');
    g.addColorStop(1, base + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  const veins = 3 + Math.floor(r() * 3);
  for (let v = 0; v < veins; v++) {
    let px = x + r() * w;
    let py = y - 4;
    let dir = (r() - 0.5) * 1.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    while (py < y + h + 4 && px > x - 20 && px < x + w + 20) {
      dir += (r() - 0.5) * 0.5;
      px += Math.sin(dir) * 5;
      py += Math.cos(dir) * 5;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = vein;
    ctx.globalAlpha = 0.15 + r() * 0.35;
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function paintStone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, vein: string, r: () => number) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 40; i++) {
    ctx.fillStyle = r() > 0.5 ? shade(base, 0.08 * r()) : shade(base, -0.1 * r());
    ctx.globalAlpha = 0.35;
    const s = 0.8 + r() * 2.2;
    ctx.fillRect(x + r() * w, y + r() * h, s, s);
  }
  for (let i = 0; i < 6; i++) {
    const cx = x + r() * w;
    const cy = y + r() * h;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * (0.1 + r() * 0.3));
    g.addColorStop(0, vein + '40');
    g.addColorStop(1, vein + '00');
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
}

function paintSlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, r: () => number) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = shade(base, (r() - 0.5) * 0.06);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y + r() * h, w, 1 + r() * 3);
  }
  for (let i = 0; i < (w * h) / 60; i++) {
    ctx.fillStyle = shade(base, (r() - 0.5) * 0.12);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x + r() * w, y + r() * h, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function paintGlass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, shade(base, 0.04));
  g.addColorStop(1, shade(base, -0.04));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function paintSquare(ctx: CanvasRenderingContext2D, style: BoardStyle, x: number, y: number, w: number, h: number, base: string, vein: string, alt: boolean, r: () => number) {
  switch (style) {
    case 'wood': return paintWood(ctx, x, y, w, h, base, vein, alt, r);
    case 'marble': return paintMarble(ctx, x, y, w, h, base, vein, r);
    case 'stone': return paintStone(ctx, x, y, w, h, base, vein, r);
    case 'slate': return paintSlate(ctx, x, y, w, h, base, r);
    case 'glass': return paintGlass(ctx, x, y, w, h, base);
  }
}

function playfieldTexture(theme: BoardTheme, size: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const r = rng(1234);
  const s = size / 8;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const light = (file + rank) % 2 === 1;
      // Canvas y=0 is the far side (rank 8) so the texture matches world orientation.
      const x = file * s;
      const y = (7 - rank) * s;
      paintSquare(ctx, theme.style, x, y, s, s, light ? theme.light : theme.dark, (light ? theme.lightVein : theme.darkVein) ?? (light ? shade(theme.light, -0.15) : shade(theme.dark, -0.15)), light, r);
    }
  }
  // Fine grooves between squares
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = Math.max(1, size / 1024);
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, size);
    ctx.moveTo(0, i * s);
    ctx.lineTo(size, i * s);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Real scanned material for board squares: albedo + normal images, optionally tinted (e.g. dark marble). */
export interface ScannedSquare {
  diff: HTMLImageElement;
  nor: HTMLImageElement;
  tint?: string; // multiply colour (oil / stain)
  /** CSS filter applied while drawing, e.g. 'contrast(1.8) saturate(1.3)' to turn a raw scan into finished wood. */
  filter?: string;
}

export interface ScannedBoard {
  light: ScannedSquare;
  dark: ScannedSquare;
  frame: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
  frameColor?: number;
}

/**
 * Composite real wood/marble scans into the 8×8 playfield: each square takes a different crop of the scan,
 * so grain and veining never repeat, exactly like an inlaid board. Returns albedo + normal canvases.
 */
function scannedPlayfield(sc: ScannedBoard, size: number): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const albedo = mk();
  const normal = mk();
  const a = albedo.getContext('2d')!;
  const n = normal.getContext('2d')!;
  const r = rng(77);
  const s = size / 8;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = (file + rank) % 2 === 1 ? sc.light : sc.dark;
      const x = file * s;
      const y = (7 - rank) * s;
      const src = sq.diff;
      const crop = Math.min(src.width, src.height) * 0.32;
      const sx = r() * (src.width - crop);
      const sy = r() * (src.height - crop);
      a.filter = sq.filter ?? 'none';
      a.drawImage(src, sx, sy, crop, crop, x, y, s, s);
      a.filter = 'none';
      if (sq.tint) {
        a.save();
        a.globalCompositeOperation = 'multiply';
        a.fillStyle = sq.tint;
        a.fillRect(x, y, s, s);
        a.restore();
      }
      const ns = sq.nor;
      n.drawImage(ns, (sx / src.width) * ns.width, (sy / src.height) * ns.height, (crop / src.width) * ns.width, (crop / src.height) * ns.height, x, y, s, s);
    }
  }
  // Inlay seams: a thin dark groove in albedo, and a matching bevel in the normal map.
  a.fillStyle = 'rgba(0,0,0,0.38)';
  n.fillStyle = 'rgb(128,128,235)';
  const w = Math.max(1.5, size / 900);
  for (let i = 0; i <= 8; i++) {
    a.fillRect(i * s - w / 2, 0, w, size);
    a.fillRect(0, i * s - w / 2, size, w);
  }
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const nor = new THREE.CanvasTexture(normal);
  nor.anisotropy = 8;
  return { map, normal: nor };
}

function frameTexture(theme: BoardTheme): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const r = rng(99);
  paintSquare(ctx, theme.frameStyle, 0, 0, size, size, theme.frame, shade(theme.frame, -0.12), false, r);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.18, 0.18);
  tex.anisotropy = 4;
  return tex;
}

function labelsTexture(color: string): THREE.CanvasTexture {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const unit = size / FRAME_OUTER; // pixels per world unit
  const border = (FRAME_OUTER - 8) / 2;
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(unit * 0.26)}px "SF Pro Display", "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mid = border * 0.5 * unit;
  for (let i = 0; i < 8; i++) {
    const p = (border + i + 0.5) * unit;
    const file = String.fromCharCode(97 + i);
    const rank = String(8 - i);
    // near edge (white side) files, upright for white
    ctx.fillText(file, p, size - mid);
    // left edge ranks
    ctx.fillText(rank, mid, p);
    // far edge and right edge: rotated for the black player
    ctx.save();
    ctx.translate(p, mid);
    ctx.rotate(Math.PI);
    ctx.fillText(file, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(size - mid, p);
    ctx.rotate(Math.PI);
    ctx.fillText(rank, 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------- highlight sprites

function spriteTexture(kind: 'fill' | 'outline' | 'dot' | 'ring' | 'glow'): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  const rr = (x: number, y: number, w: number, h: number, rad: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
  };
  if (kind === 'fill') {
    rr(6, 6, size - 12, size - 12, 14);
    ctx.fill();
  } else if (kind === 'outline') {
    ctx.lineWidth = 8;
    rr(10, 10, size - 20, size - 20, 16);
    ctx.stroke();
  } else if (kind === 'dot') {
    // Two-tone so it reads on light and dark squares alike: dark rim, light core.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(64, 64, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(64, 64, 19, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'ring') {
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(64, 64, 49, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(64, 64, 49, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Layer {
  mesh: THREE.InstancedMesh;
  private mat: THREE.MeshBasicMaterial;
  baseOpacity: number;
  private dummy = new THREE.Object3D();

  constructor(group: THREE.Group, tex: THREE.Texture, color: number, opacity: number, y: number, capacity: number, size = 1, additive = false) {
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.baseOpacity = opacity;
    this.mesh = new THREE.InstancedMesh(geo, this.mat, capacity);
    this.mesh.count = 0;
    this.mesh.position.y = y;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    group.add(this.mesh);
  }

  set(squares: number[], scale = 1) {
    const v = new THREE.Vector3();
    this.mesh.count = Math.min(squares.length, this.mesh.instanceMatrix.count);
    for (let i = 0; i < this.mesh.count; i++) {
      squareCenter(squares[i], v);
      this.dummy.position.set(v.x, 0, v.z);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setColor(color: number) {
    this.mat.color.setHex(color);
  }

  setOpacity(o: number) {
    this.mat.opacity = o;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

export interface BoardHighlights {
  lastMove: { from: number; to: number } | null;
  selected: number | null;
  targets: { sq: number; capture: boolean }[];
  hover: number | null;
  cursor: number | null;
  check: number;
  hint: { from: number; to: number } | null;
  highVisibility: boolean;
}

/**
 * Board model + highlight overlays.
 * Draw calls: playfield 1, frame 2-3, labels 1, overlays only when visible.
 */
export class BoardView {
  readonly group = new THREE.Group();
  private boardGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private labels: THREE.Mesh | null = null;
  private edgeGlow: THREE.Mesh | null = null;
  private disposables: { dispose(): void }[] = [];
  private textures: Record<string, THREE.CanvasTexture>;
  private lastMoveLayer: Layer;
  private selectedLayer: Layer;
  private dotLayer: Layer;
  private ringLayer: Layer;
  private hoverLayer: Layer;
  private cursorLayer: Layer;
  private checkLayer: Layer;
  private hintLayer: Layer;
  private arrow: THREE.Mesh | null = null;
  private time = 0;
  private hl: BoardHighlights | null = null;

  constructor() {
    this.group.name = 'Board';
    this.group.add(this.boardGroup, this.fxGroup);
    this.textures = {
      fill: spriteTexture('fill'),
      outline: spriteTexture('outline'),
      dot: spriteTexture('dot'),
      ring: spriteTexture('ring'),
      glow: spriteTexture('glow'),
    };
    const t = this.textures;
    this.lastMoveLayer = new Layer(this.fxGroup, t.fill, 0xf6c54a, 0.34, 0.003, 2);
    this.hintLayer = new Layer(this.fxGroup, t.fill, 0x34d399, 0.4, 0.004, 2);
    this.selectedLayer = new Layer(this.fxGroup, t.fill, 0x7cc4ff, 0.42, 0.005, 1);
    this.checkLayer = new Layer(this.fxGroup, t.glow, 0xff2d3d, 0.9, 0.006, 1, 1.9, true);
    this.dotLayer = new Layer(this.fxGroup, t.dot, 0xffffff, 0.75, 0.007, 32);
    this.ringLayer = new Layer(this.fxGroup, t.ring, 0xff8a7a, 0.85, 0.007, 16);
    this.hoverLayer = new Layer(this.fxGroup, t.outline, 0xffffff, 0.55, 0.008, 1);
    this.cursorLayer = new Layer(this.fxGroup, t.outline, 0x5ac8fa, 0.95, 0.009, 1);
  }

  build(theme: BoardTheme, textureSize: number, opts: { stand?: 'pedestal' | 'none'; scanned?: ScannedBoard | null } = {}) {
    const stand = opts.stand ?? 'pedestal';
    const scanned = opts.scanned ?? null;
    this.clearBoard();
    const add = <T extends { dispose(): void }>(d: T) => (this.disposables.push(d), d);

    // Playfield: a thin slab whose top face carries the painted squares.
    let topMat: THREE.MeshPhysicalMaterial;
    if (scanned) {
      const pf = scannedPlayfield(scanned, Math.max(2048, textureSize));
      add(pf.map);
      add(pf.normal);
      // Satin lacquer: a broad sheen rather than a pin-point sun glint across the squares.
      topMat = add(new THREE.MeshPhysicalMaterial({ map: pf.map, normalMap: pf.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: Math.max(0.42, theme.roughness), metalness: 0, clearcoat: theme.clearcoat, clearcoatRoughness: 0.34 }));
    } else {
      const pfTex = add(playfieldTexture(theme, textureSize));
      topMat = add(new THREE.MeshPhysicalMaterial({ map: pfTex, roughness: theme.roughness, metalness: 0, clearcoat: theme.clearcoat, clearcoatRoughness: 0.12 }));
    }
    const sideMat = add(new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.frame).multiplyScalar(0.6), roughness: 0.7 }));
    const pfGeo = add(new THREE.BoxGeometry(8, 0.1, 8));
    const playfield = new THREE.Mesh(pfGeo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    playfield.position.y = -0.05;
    playfield.receiveShadow = true;
    this.boardGroup.add(playfield);

    // Frame: rounded square ring, bevelled, slightly proud of the playfield.
    let frameMat: THREE.MeshPhysicalMaterial;
    if (scanned) {
      for (const t of [scanned.frame.map, scanned.frame.normalMap, scanned.frame.roughnessMap]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(0.16, 0.16);
      }
      frameMat = add(new THREE.MeshPhysicalMaterial({ ...scanned.frame, color: scanned.frameColor ?? 0xffffff, clearcoat: theme.clearcoat * 0.6, clearcoatRoughness: 0.18 }));
    } else {
      const frameTex = add(frameTexture(theme));
      frameMat = add(new THREE.MeshPhysicalMaterial({ map: frameTex, roughness: Math.min(0.8, theme.roughness + 0.08), clearcoat: theme.clearcoat * 0.8, clearcoatRoughness: 0.2 }));
    }
    const half = FRAME_OUTER / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half + 0.35, -half);
    shape.lineTo(half - 0.35, -half);
    shape.quadraticCurveTo(half, -half, half, -half + 0.35);
    shape.lineTo(half, half - 0.35);
    shape.quadraticCurveTo(half, half, half - 0.35, half);
    shape.lineTo(-half + 0.35, half);
    shape.quadraticCurveTo(-half, half, -half, half - 0.35);
    shape.lineTo(-half, -half + 0.35);
    shape.quadraticCurveTo(-half, -half, -half + 0.35, -half);
    const hi = FRAME_INNER / 2;
    const hole = new THREE.Path();
    hole.moveTo(-hi, -hi);
    hole.lineTo(-hi, hi);
    hole.lineTo(hi, hi);
    hole.lineTo(hi, -hi);
    hole.lineTo(-hi, -hi);
    shape.holes.push(hole);
    const depth = 0.32;
    const frameGeo = add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 10 }));
    frameGeo.rotateX(-Math.PI / 2);
    frameGeo.translate(0, FRAME_TOP - depth - 0.04, 0);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.boardGroup.add(frame);

    // Inlay trim between playfield and frame.
    const trimMat = add(new THREE.MeshPhysicalMaterial({
      color: theme.trim,
      metalness: theme.trimMetal ? 1 : 0,
      roughness: theme.trimMetal ? 0.28 : 0.5,
      clearcoat: 0.5,
    }));
    const tShape = new THREE.Shape();
    const to = FRAME_INNER / 2;
    const ti = 4.0;
    tShape.moveTo(-to, -to);
    tShape.lineTo(to, -to);
    tShape.lineTo(to, to);
    tShape.lineTo(-to, to);
    tShape.lineTo(-to, -to);
    const tHole = new THREE.Path();
    tHole.moveTo(-ti, -ti);
    tHole.lineTo(-ti, ti);
    tHole.lineTo(ti, ti);
    tHole.lineTo(ti, -ti);
    tHole.lineTo(-ti, -ti);
    tShape.holes.push(tHole);
    const trimGeo = add(new THREE.ExtrudeGeometry(tShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 }));
    trimGeo.rotateX(-Math.PI / 2);
    trimGeo.translate(0, 0.012 - 0.1, 0);
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.receiveShadow = true;
    this.boardGroup.add(trim);

    // Plinth: a darker rounded slab under the frame, then a pedestal down to the floor.
    const plinthMat = add(new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.frame).multiplyScalar(0.45), roughness: 0.55, metalness: 0.1 }));
    const plinthGeo = add(new RoundedBoxGeometry(FRAME_OUTER + 0.3, 0.26, FRAME_OUTER + 0.3, 3, 0.08));
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.42;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    if (stand === 'pedestal') this.boardGroup.add(plinth);

    const pedProfile: THREE.Vector2[] = [];
    const pts: [number, number][] = [[0, -1.25], [3.1, -1.25], [3.1, -1.16], [2.6, -1.1], [2.2, -0.95], [2.0, -0.75], [2.4, -0.6], [3.6, -0.55], [0, -0.55]];
    pts.forEach(([x, y]) => pedProfile.push(new THREE.Vector2(x, y)));
    const pedGeo = add(new THREE.LatheGeometry(pedProfile, 48));
    const pedestal = new THREE.Mesh(pedGeo, plinthMat);
    pedestal.receiveShadow = true;
    if (stand === 'pedestal') this.boardGroup.add(pedestal);

    if (theme.edgeGlow) {
      const glowMat = add(new THREE.MeshBasicMaterial({ color: theme.edgeGlow, toneMapped: false }));
      const glowGeo = add(new THREE.BoxGeometry(FRAME_OUTER + 0.34, 0.035, FRAME_OUTER + 0.34));
      this.edgeGlow = new THREE.Mesh(glowGeo, glowMat);
      this.edgeGlow.position.y = -0.3;
      this.boardGroup.add(this.edgeGlow);
    }

    // Coordinates painted on a transparent overlay so they can be toggled.
    const labTex = add(labelsTexture(theme.label));
    const labMat = add(new THREE.MeshBasicMaterial({ map: labTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    const labGeo = add(new THREE.PlaneGeometry(FRAME_OUTER, FRAME_OUTER));
    labGeo.rotateX(-Math.PI / 2);
    this.labels = new THREE.Mesh(labGeo, labMat);
    this.labels.position.y = FRAME_TOP + 0.002;
    this.labels.renderOrder = 1;
    this.boardGroup.add(this.labels);
  }

  setCoordinatesVisible(v: boolean) {
    if (this.labels) this.labels.visible = v;
  }

  setHighlights(h: BoardHighlights) {
    this.hl = h;
    this.lastMoveLayer.set(h.lastMove ? [h.lastMove.from, h.lastMove.to] : []);
    this.selectedLayer.set(h.selected !== null ? [h.selected] : []);
    const quiet = h.targets.filter(t => !t.capture).map(t => t.sq);
    const caps = h.targets.filter(t => t.capture).map(t => t.sq);
    // High-visibility mode uses bright, larger markers instead of subtle dark ones.
    this.dotLayer.setColor(h.highVisibility ? 0x5cff8a : 0xffffff);
    this.ringLayer.setColor(h.highVisibility ? 0xff453a : 0xff8a7a);
    this.dotLayer.baseOpacity = h.highVisibility ? 1 : 0.75;
    this.ringLayer.baseOpacity = h.highVisibility ? 1 : 0.85;
    this.dotLayer.set(quiet, h.highVisibility ? 1.35 : 1);
    this.ringLayer.set(caps);
    this.hoverLayer.set(h.hover !== null && h.hover !== h.selected ? [h.hover] : []);
    this.cursorLayer.set(h.cursor !== null ? [h.cursor] : []);
    this.checkLayer.set(h.check >= 0 ? [h.check] : []);
    this.hintLayer.set(h.hint ? [h.hint.from, h.hint.to] : []);
    this.setArrow(h.hint);
  }

  private setArrow(hint: { from: number; to: number } | null) {
    if (this.arrow) {
      this.fxGroup.remove(this.arrow);
      this.arrow.geometry.dispose();
      (this.arrow.material as THREE.Material).dispose();
      this.arrow = null;
    }
    if (!hint) return;
    const a = squareCenter(hint.from);
    const b = squareCenter(hint.to);
    const dir = new THREE.Vector2(b.x - a.x, b.z - a.z);
    const len = dir.length();
    const w = 0.13;
    const head = 0.32;
    const s = new THREE.Shape();
    s.moveTo(0, -w / 2);
    s.lineTo(len - head, -w / 2);
    s.lineTo(len - head, -w * 1.6);
    s.lineTo(len, 0);
    s.lineTo(len - head, w * 1.6);
    s.lineTo(len - head, w / 2);
    s.lineTo(0, w / 2);
    const geo = new THREE.ShapeGeometry(s);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.arrow = new THREE.Mesh(geo, mat);
    this.arrow.position.set(a.x, 0.02, a.z);
    this.arrow.rotation.y = -Math.atan2(dir.y, dir.x);
    this.arrow.renderOrder = 3;
    this.fxGroup.add(this.arrow);
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    this.checkLayer.setOpacity(0.55 + Math.sin(t * 5.5) * 0.3);
    this.cursorLayer.setOpacity(0.7 + Math.sin(t * 6) * 0.25);
    this.dotLayer.setOpacity(this.dotLayer.baseOpacity);
    this.ringLayer.setOpacity(this.ringLayer.baseOpacity);
    this.selectedLayer.setOpacity(0.36 + Math.sin(t * 4) * 0.08);
    if (this.arrow) (this.arrow.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 4) * 0.15;
    if (this.edgeGlow) (this.edgeGlow.material as THREE.MeshBasicMaterial).color.offsetHSL(0, 0, 0);
  }

  private clearBoard() {
    this.boardGroup.clear();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this.labels = null;
    this.edgeGlow = null;
  }

  dispose() {
    this.clearBoard();
    [this.lastMoveLayer, this.selectedLayer, this.dotLayer, this.ringLayer, this.hoverLayer, this.cursorLayer, this.checkLayer, this.hintLayer].forEach(l => l.dispose());
    Object.values(this.textures).forEach(t => t.dispose());
    this.setArrow(null);
  }
}
