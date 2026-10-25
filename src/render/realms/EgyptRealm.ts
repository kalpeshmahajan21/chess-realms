import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AssetScope, findSunDirection } from './assets.ts';
import { box, Drifters, Flames, glowTexture, place, rng, SkyDome, tiled, worldUV } from './kit.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * Pharaoh Sands — a temple court on the Giza plateau at sunset, built in 3D.
 * The board stands on a sandstone altar between rows of lotus columns carved with hieroglyphs; a pylon gate
 * with gilded obelisks behind; painted sarcophagi and wrapped mummies on stone biers; braziers burning;
 * the three pyramids glowing across the dunes.
 *
 * 1 unit = 10 cm. Board top y = 0, temple floor y = FLOOR, desert y ≈ SAND.
 */
const FLOOR = -8;
const SAND = -12;

/** Carved hieroglyph panel (colour + bump). Columns of glyphs between ruled lines, in raised relief. */
function hieroglyphCanvas(r: () => number, w = 512, h = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  const cols = 5;
  const cw = w / cols;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let ci = 0; ci < cols; ci++) {
    const x0 = ci * cw;
    // Ruled column lines (incised).
    g.fillStyle = '#4a4a4a';
    g.fillRect(x0 + 2, 0, 3, h);
    let y = 16;
    while (y < h - 40) {
      const cx = x0 + cw / 2;
      const s = cw * 0.32;
      const kind = Math.floor(r() * 9);
      g.save();
      g.translate(cx, y + s);
      // Raised relief: dark offset shadow then light glyph.
      for (const [dx, dy, col] of [[2.5, 2.5, '#3c3c3c'], [0, 0, '#d0d0d0']] as const) {
        g.save();
        g.translate(dx, dy);
        g.strokeStyle = col;
        g.fillStyle = col;
        g.lineWidth = 6;
        g.beginPath();
        switch (kind) {
          case 0: // ankh
            g.ellipse(0, -s * 0.55, s * 0.28, s * 0.35, 0, 0, Math.PI * 2);
            g.moveTo(-s * 0.5, -s * 0.1); g.lineTo(s * 0.5, -s * 0.1);
            g.moveTo(0, -s * 0.2); g.lineTo(0, s * 0.9);
            g.stroke();
            break;
          case 1: // eye of Horus
            g.ellipse(0, 0, s * 0.6, s * 0.3, 0, 0, Math.PI * 2);
            g.stroke();
            g.beginPath(); g.arc(0, 0, s * 0.14, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.moveTo(-s * 0.1, s * 0.3); g.lineTo(-s * 0.3, s * 0.85); g.stroke();
            break;
          case 2: // water (zigzag)
            g.moveTo(-s * 0.7, 0);
            for (let k = 0; k <= 6; k++) g.lineTo(-s * 0.7 + (k * s * 1.4) / 6, k % 2 ? -s * 0.15 : s * 0.15);
            g.stroke();
            break;
          case 3: // bird (vulture / ibis silhouette)
            g.moveTo(-s * 0.5, s * 0.6); g.quadraticCurveTo(-s * 0.4, -s * 0.2, s * 0.1, -s * 0.3);
            g.lineTo(s * 0.35, -s * 0.7); g.lineTo(s * 0.55, -s * 0.6); g.lineTo(s * 0.3, -s * 0.2);
            g.quadraticCurveTo(s * 0.4, s * 0.4, -s * 0.1, s * 0.6); g.closePath(); g.fill();
            g.beginPath(); g.moveTo(-s * 0.1, s * 0.6); g.lineTo(-s * 0.1, s * 0.9); g.moveTo(s * 0.1, s * 0.6); g.lineTo(s * 0.15, s * 0.9); g.stroke();
            break;
          case 4: // sun disk
            g.arc(0, 0, s * 0.42, 0, Math.PI * 2); g.stroke();
            g.beginPath(); g.arc(0, 0, s * 0.1, 0, Math.PI * 2); g.fill();
            break;
          case 5: // reed
            g.moveTo(0, s * 0.9); g.lineTo(0, -s * 0.6);
            g.moveTo(0, -s * 0.6); g.quadraticCurveTo(s * 0.5, -s * 0.9, s * 0.2, -s * 0.2); g.stroke();
            break;
          case 6: // cartouche
            g.ellipse(0, 0, s * 0.45, s * 0.85, 0, 0, Math.PI * 2); g.stroke();
            g.beginPath(); g.moveTo(-s * 0.5, s * 0.95); g.lineTo(s * 0.5, s * 0.95); g.stroke();
            g.beginPath(); g.arc(0, -s * 0.35, s * 0.15, 0, Math.PI * 2); g.fill();
            g.fillRect(-s * 0.25, -s * 0.05, s * 0.5, s * 0.12);
            break;
          case 7: // snake
            g.moveTo(-s * 0.6, s * 0.2);
            g.bezierCurveTo(-s * 0.2, -s * 0.5, s * 0.1, s * 0.6, s * 0.6, -s * 0.2);
            g.stroke();
            break;
          default: // feather of Maat
            g.moveTo(0, s * 0.9); g.quadraticCurveTo(s * 0.45, 0, s * 0.1, -s * 0.85);
            g.quadraticCurveTo(-s * 0.2, 0, 0, s * 0.9); g.fill();
        }
        g.restore();
      }
      g.restore();
      y += s * 2 + 18;
    }
  }
  return c;
}

/** Painted anthropoid coffin: gold body, lapis-striped nemes headdress, a face, a collar and inscription bands. */
function coffinTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const gold = g.createLinearGradient(0, 0, 512, 0);
  gold.addColorStop(0, '#8a5a12');
  gold.addColorStop(0.5, '#e8b84a');
  gold.addColorStop(1, '#8a5a12');
  g.fillStyle = gold;
  g.fillRect(0, 0, 512, 1024);
  // u wraps around the lathe; the front of the coffin is u ≈ 0.25 (x = +, facing +Z after rotation).
  // Headdress stripes (top 26%).
  for (let y = 0; y < 270; y += 22) {
    g.fillStyle = y % 44 ? '#1d3f8f' : '#d8a640';
    g.fillRect(0, y, 512, 11);
  }
  // Face (front).
  g.fillStyle = '#c48a3a';
  g.beginPath();
  g.ellipse(128, 200, 46, 64, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111';
  for (const ex of [108, 148]) {
    g.beginPath();
    g.ellipse(ex, 188, 12, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(ex - 12, 186, 34, 2);
  }
  g.fillStyle = '#6a3a18';
  g.fillRect(122, 236, 12, 6);
  // Collar (wesekh): concentric bands across the chest.
  const bands = ['#1d3f8f', '#c23a2a', '#e8b84a', '#2a8a6a', '#1d3f8f', '#e8b84a'];
  bands.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, 300 + i * 18, 512, 12);
  });
  // Crossed arms with crook and flail: gold bars on the front.
  g.strokeStyle = '#1d3f8f';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(80, 440); g.lineTo(176, 520);
  g.moveTo(176, 440); g.lineTo(80, 520);
  g.stroke();
  // Vertical inscription band down the front and horizontal bands.
  g.fillStyle = '#f2e2b0';
  g.fillRect(114, 560, 28, 440);
  for (let y = 600; y < 1000; y += 90) g.fillRect(0, y, 512, 10);
  g.fillStyle = '#1d3f8f';
  for (let y = 570; y < 990; y += 26) g.fillRect(120, y, 16, 12);
  // Wings of Isis along the sides.
  g.fillStyle = '#2a8a6a';
  for (let k = 0; k < 6; k++) g.fillRect(200, 560 + k * 24, 110, 10);
  return c;
}

/** Linen bandage wrapping for the mummies. */
function bandageCanvas(r: () => number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b7a888';
  g.fillRect(0, 0, 256, 512);
  for (let i = -40; i < 80; i++) {
    const y = i * 10;
    const shade = 150 + Math.floor(r() * 60);
    g.strokeStyle = `rgb(${shade + 20},${shade + 8},${shade - 22})`;
    g.lineWidth = 6 + r() * 4;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y + 60 + r() * 40);
    g.stroke();
    g.strokeStyle = 'rgba(60,45,30,0.35)';
    g.lineWidth = 1.2;
    g.stroke();
  }
  return c;
}

/** Human-shaped lathe profile (coffin / mummy), feet at y = 0, height h. */
function bodyProfile(h: number, girth: number): THREE.Vector2[] {
  const p: [number, number][] = [
    [0, 0], [0.55, 0], [0.62, 0.04], [0.55, 0.1], [0.62, 0.28], [0.8, 0.5], [0.92, 0.66], [1.0, 0.72], [0.94, 0.76],
    [0.62, 0.8], [0.66, 0.84], [0.72, 0.9], [0.66, 0.96], [0.4, 0.995], [0, 1],
  ];
  return p.map(([x, y]) => new THREE.Vector2(Math.max(x * girth, 0.001), y * h));
}

export async function createDesert(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:egypt';
  const r = rng(3100);

  const [env, sky, sand, blocks, oldStone, boulder, vase, goblets, chest] = await Promise.all([
    assets.hdr('hdri/qwantani_sunset_puresky_1k.hdr'),
    assets.texture('photo/qwantani_sunset_puresky_4k.jpg'),
    assets.pbr('sand_02'),
    assets.pbr('sandstone_blocks_08'),
    assets.pbr('old_sandstone_02'),
    ...['namaqualand_boulder_02', 'brass_vase_02', 'brass_goblets', 'treasure_chest'].map(n => assets.model(`models/${n}.glb`).catch(() => null)),
  ]);

  // Put the low sun behind-left of the pyramids from White's seat.
  const rawSun = findSunDirection(env);
  const want = new THREE.Vector3(-0.55, 0, -1);
  const rotation = Math.atan2(want.x, want.z) - Math.atan2(rawSun.x, rawSun.z);
  const dome = new SkyDome(sky, 9000, rotation);
  group.add(dome.mesh);

  // ------------------------------------------------------------------ materials
  const sandMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, sand, 0.5), color: 0xf0c890 }));
  const blockMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, blocks, 0.7), color: 0xe8c8a0 }));
  const stoneMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, oldStone, 0.8), color: 0xe6c79c }));
  const glyphCanvas = hieroglyphCanvas(r);
  const glyphTex = assets.track(new THREE.CanvasTexture(glyphCanvas));
  glyphTex.wrapS = glyphTex.wrapT = THREE.RepeatWrapping;
  glyphTex.anisotropy = 8;
  glyphTex.repeat.set(1, 0.5); // the canvas is twice as tall as wide
  const carvedMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, oldStone, 0.8), color: 0xe9cba0, bumpMap: glyphTex, bumpScale: 2.2 }));
  const goldMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xe0b04a, metalness: 1, roughness: 0.25 }));
  const bronzeMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x6e4a24, metalness: 0.9, roughness: 0.45 }));

  // ------------------------------------------------------------------ dunes
  {
    const SIZE = 16000;
    const SEG = 220;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const d = Math.hypot(x, z);
      let hgt = Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) * 70 + Math.sin(z * 0.0032 + x * 0.0011) * 45 + Math.sin(x * 0.009 + z * 0.006) * 9;
      hgt = Math.max(hgt, -30) + 30;
      // Flat plateau around the temple and under the pyramids.
      const flat = THREE.MathUtils.smoothstep(d, 260, 900);
      pos.setY(i, SAND + hgt * flat * Math.min(1, d / 2500 + 0.4));
    }
    g.computeVertexNormals();
    const dunes = new THREE.Mesh(assets.track(worldUV(g.toNonIndexed(), 0, 0, 0, 0.1)), sandMat);
    dunes.receiveShadow = true;
    group.add(dunes);
  }

  // ------------------------------------------------------------------ temple court
  const blockParts: THREE.BufferGeometry[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];
  const carvedParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];
  // Platform: 3 steps.
  for (const [w, d, h] of [[100, 150, 1.4], [94, 144, 2.8], [88, 138, FLOOR - SAND]] as const) blockParts.push(box(w, h, d, 0, SAND + h / 2, -30));
  // Colonnade: lotus-bud columns, carved shafts.
  const colProfile = [[0, 0], [7, 0], [7, 2], [5.6, 2.6], [4.6, 6], [4.4, 46], [5.2, 48], [6.4, 52], [6.8, 56], [5.4, 60], [3.4, 61], [4.6, 62], [4.6, 65], [0, 65]].map(([x, y]) => new THREE.Vector2(x, y));
  const colPositions: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (let z = -88; z <= 24; z += 22) colPositions.push(new THREE.Vector3(sx * 34, FLOOR, z));
  for (const p of colPositions) {
    const shaft = new THREE.LatheGeometry(colProfile, 20).toNonIndexed();
    shaft.translate(p.x, p.y, p.z);
    carvedParts.push(shaft);
    // Abacus block on top.
    stoneParts.push(box(9, 4, 9, p.x, p.y + 67, p.z));
  }
  // Architraves along each row.
  for (const sx of [-1, 1]) stoneParts.push(box(12, 6, 126, sx * 34, FLOOR + 72, -32));
  // Cross beams over the aisle at the ends.
  stoneParts.push(box(80, 6, 10, 0, FLOOR + 72, 24));
  // Cavetto cornice on the architraves.
  for (const sx of [-1, 1]) goldParts.push(box(0.6, 1.2, 126, sx * 40.4, FLOOR + 74.5, -32));

  // Pylon gate behind the board (two battered towers + gateway).
  const pylon = (x: number, w: number) => {
    const H = 140;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2 - 10, H);
    shape.lineTo(-w / 2 + 10, H);
    shape.lineTo(-w / 2, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 34, bevelEnabled: false }).toNonIndexed();
    g.translate(x, FLOOR, -128 - 17);
    carvedParts.push(g);
    stoneParts.push(box(w - 18, 5, 36, x, FLOOR + H + 2.5, -128));
  };
  pylon(-38, 56);
  pylon(38, 56);
  // Gateway with a winged-sun lintel.
  carvedParts.push(box(22, 92, 30, -15, FLOOR + 46, -128).translate(0, 0, 0));
  carvedParts.push(box(22, 92, 30, 15, FLOOR + 46, -128));
  stoneParts.push(box(36, 14, 32, 0, FLOOR + 99, -128));
  goldParts.push(new THREE.SphereGeometry(3.4, 20, 12).toNonIndexed().translate(0, FLOOR + 99, -111.6));
  for (const sx of [-1, 1]) goldParts.push(box(13, 2.4, 0.6, sx * 9.5, FLOOR + 99.5, -111.8));
  // Doorway shadow.
  const darkMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 }));
  const door = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(8, 90)), darkMat);
  door.position.set(0, FLOOR + 45, -112.9);
  group.add(door);

  // Obelisks with gilded pyramidions.
  for (const sx of [-1, 1]) {
    const x = sx * 22;
    const z = -100;
    blockParts.push(box(12, 4, 12, x, FLOOR + 2, z));
    const shaft = new THREE.CylinderGeometry(3.2 / Math.SQRT2 * 1.4, 5 / Math.SQRT2 * 1.4, 120, 4, 1).toNonIndexed();
    shaft.rotateY(Math.PI / 4);
    shaft.translate(x, FLOOR + 64, z);
    carvedParts.push(shaft);
    const tip = new THREE.ConeGeometry(3.2, 7, 4).toNonIndexed();
    tip.rotateY(Math.PI / 4);
    tip.translate(x, FLOOR + 127.5, z);
    goldParts.push(tip);
  }

  // Altar table for the board: carved block with a cavetto top.
  stoneParts.push(box(12, -1.4 - FLOOR, 12, 0, (FLOOR - 1.4) / 2, 0));
  carvedParts.push(box(10.6, -2.6 - FLOOR, 10.6, 0, (FLOOR - 2.6) / 2, 0));
  stoneParts.push(box(14.4, 1.07, 14.4, 0, -0.865, 0));
  goldParts.push(box(14.6, 0.3, 14.6, 0, -1.45, 0));

  // Biers with mummies and standing coffins.
  const biers = [new THREE.Vector3(-20, FLOOR, -26), new THREE.Vector3(20, FLOOR, -26)];
  for (const b of biers) {
    stoneParts.push(box(9, 5, 22, b.x, FLOOR + 2.5, b.z));
    stoneParts.push(box(10, 0.8, 23, b.x, FLOOR + 5.4, b.z));
  }

  // ------------------------------------------------------------------ merge architecture
  const addMerged = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
    const geos = parts.map(g => {
      const n = g.index ? g.toNonIndexed() : g;
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
      return n;
    });
    const merged = mergeGeometries(geos);
    parts.forEach(g => g.dispose());
    if (!merged) return null;
    const mesh = new THREE.Mesh(assets.track(merged), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  [blockParts, stoneParts].forEach(p => p.forEach(g => worldUV(g.index ? g : g)));
  addMerged(blockParts.map(g => worldUV(g)), blockMat);
  addMerged(stoneParts.map(g => worldUV(g)), stoneMat);
  // Carved surfaces: world UVs at a scale where one glyph column ≈ 60 cm.
  addMerged(carvedParts.map(g => worldUV(g.index ? g.toNonIndexed() : g, 0, 0, 0, 0.033)), carvedMat);
  addMerged(goldParts, goldMat);

  // ------------------------------------------------------------------ coffins & mummies
  const coffinTex = assets.track(new THREE.CanvasTexture(coffinTexture()));
  coffinTex.colorSpace = THREE.SRGBColorSpace;
  coffinTex.anisotropy = 8;
  const coffinMat = assets.track(new THREE.MeshStandardMaterial({ map: coffinTex, metalness: 0.55, roughness: 0.38 }));
  const coffinGeo = assets.track(new THREE.LatheGeometry(bodyProfile(19, 3.6), 40));
  coffinGeo.scale(1, 1, 0.62);
  const bandTex = assets.track(new THREE.CanvasTexture(bandageCanvas(r)));
  bandTex.colorSpace = THREE.SRGBColorSpace;
  bandTex.wrapS = bandTex.wrapT = THREE.RepeatWrapping;
  bandTex.repeat.set(2, 2);
  const mummyMat = assets.track(new THREE.MeshStandardMaterial({ map: bandTex, color: 0xa08c6c, roughness: 0.95, bumpMap: bandTex, bumpScale: 0.6 }));
  const mummyGeo = assets.track(new THREE.LatheGeometry(bodyProfile(17, 2.7), 32));
  mummyGeo.scale(1, 1, 0.7);
  // Standing coffins against the columns, facing the board.
  for (const [x, z] of [[-26, -60], [26, -60], [-26, 8], [26, 8]] as const) {
    const m = new THREE.Mesh(coffinGeo, coffinMat);
    m.position.set(x, FLOOR, z);
    // The painted face is at lathe u = 0.25 (local +X); turn it toward the board.
    m.rotation.y = Math.atan2(z, -x);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  // Mummies lying on the biers.
  for (const b of biers) {
    const m = new THREE.Mesh(mummyGeo, mummyMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(b.x, FLOOR + 5.8 + 1.9, b.z + 8.5);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // ------------------------------------------------------------------ pyramids of Giza
  const pyrMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, blocks, 0.02), color: 0xe2b886, roughness: 1 }));
  const capMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xf2e2c4, roughness: 0.8 }));
  const pyramid = (x: number, z: number, base: number, ry: number, cap: boolean) => {
    const h = base * 0.636;
    const g = new THREE.ConeGeometry(base / Math.SQRT2, h, 4, 8).toNonIndexed();
    g.rotateY(Math.PI / 4 + ry);
    g.translate(x, SAND + h / 2 - 10, z);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(assets.track(worldUV(g, 0, 0, 0, 0.004)), pyrMat);
    group.add(mesh);
    if (cap) {
      const c = new THREE.ConeGeometry((base * 0.08) / Math.SQRT2, h * 0.08, 4).toNonIndexed();
      c.rotateY(Math.PI / 4 + ry);
      c.translate(x, SAND - 10 + h - h * 0.04 + 0.5, z);
      group.add(new THREE.Mesh(assets.track(c), capMat));
    }
  };
  pyramid(-1900, -3600, 2300, 0.1, false); // Khufu
  pyramid(600, -4300, 2150, 0.1, true); // Khafre (keeps its casing cap)
  pyramid(2300, -4900, 1050, 0.1, false); // Menkaure
  for (let i = 0; i < 3; i++) pyramid(3000 + i * 380, -4500 + i * 120, 300, 0.1, false); // queens' pyramids

  // Date palms around a small oasis to the right.
  const palmParts: THREE.BufferGeometry[] = [];
  const frondCards: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[] = [];
  const palms: [number, number, number][] = [[150, 60, 110], [190, 20, 95], [175, -40, 120], [-170, 80, 100], [-200, -10, 115], [230, 110, 90]];
  for (const [x, z, h] of palms) {
    const lean = new THREE.Vector3((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25).normalize();
    let prev = new THREE.Vector3(x, SAND, z);
    for (let k = 0; k < 8; k++) {
      const next = prev.clone().addScaledVector(lean, h / 8);
      next.x += Math.sin(k * 0.5) * 0.6;
      const len = prev.distanceTo(next);
      const cg = new THREE.CylinderGeometry(1.5 - k * 0.06, 1.7 - k * 0.06, len, 8).toNonIndexed();
      cg.translate(0, len / 2, 0);
      cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), next.clone().sub(prev).normalize()));
      cg.translate(prev.x, prev.y, prev.z);
      palmParts.push(cg);
      prev = next;
    }
    for (let f = 0; f < 16; f++) {
      const a = (f / 16) * Math.PI * 2 + r() * 0.3;
      const droop = 0.2 + r() * 0.6;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + droop, a, 0, 'YXZ'));
      frondCards.push({ p: prev.clone(), q, s: new THREE.Vector3(9, 30 + r() * 8, 1) });
    }
  }
  const barkMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 1 }));
  const palmTrunks = new THREE.Mesh(assets.track(mergeGeometries(palmParts.map(g => { g.deleteAttribute('uv'); return g; }))!), barkMat);
  palmTrunks.castShadow = true;
  group.add(palmTrunks);
  palmParts.forEach(g => g.dispose());
  {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#4c6a2a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 256);
    g.lineTo(32, 0);
    g.stroke();
    for (let y = 8; y < 250; y += 7) {
      const len = 30 * Math.sin((y / 256) * Math.PI) + 2;
      g.strokeStyle = y % 14 ? '#5d7c30' : '#47652a';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(32, y);
      g.lineTo(32 - len, y - 10);
      g.moveTo(32, y);
      g.lineTo(32 + len, y - 10);
      g.stroke();
    }
    const t = assets.track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    const frondMat = assets.track(new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
    const frondGeo = assets.track(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, frondCards.length);
    const m = new THREE.Matrix4();
    frondCards.forEach((f, i) => fronds.setMatrixAt(i, m.compose(f.p, f.q, f.s)));
    fronds.castShadow = true;
    group.add(fronds);
  }
  // Oasis pool.
  const pool = new THREE.Mesh(assets.track(new THREE.CircleGeometry(48, 48).rotateX(-Math.PI / 2)), assets.track(new THREE.MeshPhysicalMaterial({ color: 0x1f4a50, roughness: 0.04, clearcoat: 1 })));
  pool.position.set(190, SAND + 0.6, 40);
  group.add(pool);

  // Boulders, treasure, offerings.
  for (const [x, z, h] of [[-120, 40, 14], [-90, -150, 10], [140, -160, 18], [110, 140, 9]] as const) place(group, boulder, h, x, SAND, z, r() * 6);
  place(group, chest, 5, -14, FLOOR, 18, 0.5);
  place(group, vase, 4, 8.5, FLOOR, 8.5, 0.3);
  place(group, vase, 5, -36, FLOOR, -100, 1.2);
  place(group, goblets, 1.6, -8.4, FLOOR, 9, 0.2);

  // ------------------------------------------------------------------ braziers
  const flamePts: THREE.Vector3[] = [];
  for (const [x, z] of [[-24, 20], [24, 20], [-12, -108], [12, -108], [-40, -60], [40, -60]] as const) {
    const stand = new THREE.Mesh(assets.track(new THREE.LatheGeometry([[0, 0], [3, 0], [2.6, 1], [0.8, 2], [0.6, 14], [1.2, 15], [3.4, 17], [3.8, 19], [0, 18.5]].map(([a, b]) => new THREE.Vector2(a, b)), 16)), bronzeMat);
    stand.position.set(x, FLOOR, z);
    stand.castShadow = true;
    group.add(stand);
    flamePts.push(new THREE.Vector3(x, FLOOR + 18.6, z));
  }
  const flames = new Flames(assets);
  flames.build(flamePts, 6, 1, 70, 40, Math.min(4, ctx.quality.maxPointLights));
  group.add(flames.group);
  const embers = new Drifters(assets, Math.round(260 * ctx.quality.particles), new THREE.Vector3(160, 40, 160), new THREE.Vector3(0, 2, -20), {
    color: 0xe7c08a, size: 0.35, wind: new THREE.Vector3(-6, 0.2, 2), opacity: 0.55, tex: assets.track(glowTexture()),
  });
  group.add(embers.points);

  const sunDir = rawSun.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  if (sunDir.y < 0.32) sunDir.setY(0.32).normalize();
  const lighting: RealmLighting = {
    environment: env,
    envIntensity: 0.8,
    envRotation: rotation,
    sunDir,
    sunColor: 0xffb06a,
    sunIntensity: 3.2,
    hemiIntensity: 0.15,
    exposure: 1,
    fog: { color: 0xd8a27a, density: 0.00016 },
    bloom: { strength: 0.2, threshold: 2.5 },
    grade: { saturation: 1.06, contrast: 1.05, tint: 0.035, vignette: 0.26 },
  };
  dome.setExposure(lighting.exposure);

  return {
    group,
    lighting,
    boardStand: 'none',
    far: 18000,
    seatPolar: 1.08,
    menuPolar: 1.33,
    update(dt, time) {
      flames.update(time);
      embers.update(dt, time);
    },
    dispose() {
      dome.dispose();
      assets.dispose();
    },
  };
}
