import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AssetScope, findSunDirection } from './assets.ts';
import { box, Drifters, instances, place, rng, SkyDome, tiled, worldUV } from './kit.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * Kyoto Garden — a temple garden built in 3D around the board.
 * The board sits on a low table on a hinoki veranda in front of a tea house. Around it: a koi pond with a
 * vermilion torii standing in the water, a raked-gravel stone garden, stone lanterns, maples and cherry trees,
 * a bamboo grove, an earthen wall with a tiled cap, a five-storey pagoda and forested hills beyond.
 *
 * 1 unit = 10 cm. Board top y = 0. Veranda deck y = DECK, garden ground y = GROUND.
 */
const DECK = -3.6;
const GROUND = -9;
const WALL = 210; // garden wall half-size
const VERMILION = 0xc23a1f;

/** Curved-profile roof as a 4-sided lathe (a hip roof with upturned eaves). Base at y = 0. */
function hipRoof(halfW: number, height: number, sx = 1, sz = 1): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Concave curve: steep near the ridge, flattening and lifting at the eaves.
    const rad = halfW * (1 - t);
    const y = height * (1 - Math.pow(1 - t, 2.2)) - (t < 0.12 ? (0.12 - t) * height * -0.6 : 0);
    pts.push(new THREE.Vector2(Math.max(rad, 0.001), y));
  }
  pts.unshift(new THREE.Vector2(halfW * 0.98, -height * 0.06));
  const g = new THREE.LatheGeometry(pts, 4, Math.PI / 4).toNonIndexed();
  g.scale(sx * Math.SQRT2, 1, sz * Math.SQRT2);
  g.computeVertexNormals();
  return g;
}

/** Canvas texture of leaf clusters (alpha). kind: maple (red stars) or sakura (pink blossoms). */
function leafTexture(kind: 'maple' | 'sakura' | 'bamboo' | 'pine', r: () => number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  const palettes = {
    maple: ['#a8231a', '#c2341f', '#d0521f', '#8c1c18', '#e0752a', '#b52a1c'],
    sakura: ['#f4c6d2', '#f8d8e2', '#eeb3c5', '#ffe6ee', '#e9a2b8'],
    bamboo: ['#4f7a2e', '#5f8c36', '#3e6626', '#6f9a40'],
    pine: ['#26401f', '#2f4d24', '#1f3519', '#3a5a2a'],
  }[kind];
  const count = kind === 'sakura' ? 70 : kind === 'maple' ? 46 : 60;
  for (let i = 0; i < count; i++) {
    // Keep clusters roughly round so card edges never show.
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 100;
    const x = 128 + Math.cos(a) * d;
    const y = 128 + Math.sin(a) * d;
    g.fillStyle = palettes[Math.floor(r() * palettes.length)];
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    if (kind === 'maple') {
      // Five-lobed leaf.
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2;
        const rad = k % 2 === 0 ? 13 : 5;
        g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      g.closePath();
      g.fill();
    } else if (kind === 'sakura') {
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.ellipse(Math.cos((k / 5) * Math.PI * 2) * 4.5, Math.sin((k / 5) * Math.PI * 2) * 4.5, 4.2, 3, (k / 5) * Math.PI * 2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#d06a86';
      g.beginPath();
      g.arc(0, 0, 1.6, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'bamboo') {
      g.beginPath();
      g.ellipse(0, 0, 22, 3.2, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      for (let k = 0; k < 9; k++) {
        g.fillRect(-1, -14 + k * 3, 1.6, 10);
        g.rotate(0.35);
      }
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Raked-gravel ripple normal map (straight lines). */
function rakeNormal(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    const slope = Math.cos((y / 256) * Math.PI * 2 * 8);
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      img.data[i] = 128;
      img.data[i + 1] = 128 + slope * 90;
      img.data[i + 2] = 230;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

interface TreeSpec { x: number; z: number; h: number; spread: number; kind: 'maple' | 'sakura' | 'pine' }

/** Branching trunk (merged tapered cylinders) + leaf-card positions at the branch tips. */
function growTree(spec: TreeSpec, r: () => number, trunkParts: THREE.BufferGeometry[], cards: { p: THREE.Vector3; ry: number; rx: number; rz: number; s: number }[]) {
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1).toNonIndexed();
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    trunkParts.push(g);
  };
  const base = new THREE.Vector3(spec.x, GROUND, spec.z);
  const lean = new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize();
  const trunkTop = base.clone().addScaledVector(lean, spec.h * (spec.kind === 'pine' ? 0.5 : 0.38));
  const trunkR = spec.h * 0.035;
  seg(base, trunkTop, trunkR, trunkR * 0.75);
  const tips: { p: THREE.Vector3; size: number }[] = [];
  const branches = spec.kind === 'pine' ? 5 : 4 + Math.floor(r() * 3);
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + r() * 0.8;
    const rise = spec.kind === 'pine' ? 0.15 + r() * 0.25 : 0.45 + r() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), rise, Math.sin(a)).normalize();
    const start = trunkTop.clone().addScaledVector(lean, -r() * spec.h * 0.08);
    const end = start.clone().addScaledVector(dir, spec.spread * (0.55 + r() * 0.35));
    seg(start, end, trunkR * 0.6, trunkR * 0.3);
    // Two twigs per branch.
    for (let k = 0; k < 2; k++) {
      const d2 = dir.clone().add(new THREE.Vector3((r() - 0.5) * 0.9, 0.3 + r() * 0.4, (r() - 0.5) * 0.9)).normalize();
      const e2 = end.clone().addScaledVector(d2, spec.spread * (0.25 + r() * 0.25));
      seg(end, e2, trunkR * 0.3, trunkR * 0.15);
      tips.push({ p: e2, size: spec.spread * (0.45 + r() * 0.2) });
    }
    tips.push({ p: end, size: spec.spread * 0.5 });
  }
  tips.push({ p: trunkTop.clone().add(new THREE.Vector3(0, spec.h * 0.25, 0)), size: spec.spread * 0.55 });
  // Leaf cards fill a flattened ellipsoid around each tip (Japanese maples and pines have layered, flat crowns).
  const perTip = spec.kind === 'pine' ? 34 : 24;
  for (const t of tips) {
    for (let i = 0; i < perTip; i++) {
      const u = r() * Math.PI * 2;
      const v = Math.acos(2 * r() - 1);
      const rad = Math.cbrt(r()) * t.size;
      const p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * rad, Math.cos(v) * rad * (spec.kind === 'pine' ? 0.3 : 0.5), Math.sin(v) * Math.sin(u) * rad).add(t.p);
      cards.push({ p, ry: r() * Math.PI * 2, rx: -Math.PI / 2 + (r() - 0.5) * 1.2, rz: (r() - 0.5) * 1.2, s: t.size * (spec.kind === 'pine' ? 0.7 : 0.5) * (1 + r() * 0.7) });
    }
  }
}

export async function createKyoto(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:kyoto';
  const r = rng(808);

  const [env, sky, gravel, hinoki, stoneWall, grass, roofTiles, bamboo, tatami, plaster, cedar, rocks1, rocks2, fern, shrub, teaSet, katanaStand, katana] = await Promise.all([
    assets.hdr('hdri/kloofendal_38d_partly_cloudy_puresky_1k.hdr'),
    assets.texture('photo/kloofendal_38d_partly_cloudy_puresky_4k.jpg'),
    assets.pbr('gravel_floor_03'),
    assets.pbr('hinoki_planks'),
    assets.pbr('japanese_stone_wall'),
    assets.pbr('leafy_grass'),
    assets.pbr('grey_roof_tiles'),
    assets.pbr('bamboo_wall'),
    assets.pbr('tatami_mat'),
    assets.pbr('white_plaster_rough_01'),
    assets.pbr('japanese_cedar_planks'),
    ...['rock_moss_set_01', 'rock_moss_set_02', 'fern_02', 'shrub_02', 'tea_set_01', 'katana_stand_01', 'antique_katana_01'].map(n => assets.model(`models/${n}.glb`).catch(() => null)),
  ]);

  const rotation = -0.4;
  const dome = new SkyDome(sky, 1500, rotation);
  group.add(dome.mesh);

  // ------------------------------------------------------------------ materials
  const deckMat = assets.track(new THREE.MeshPhysicalMaterial({ ...tiled(assets, hinoki, 1), color: 0xd9b48a, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
  const timberMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, cedar, 1), color: 0x5a3a26 }));
  const darkTimber = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, cedar, 1), color: 0x2e1f16 }));
  const roofMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, roofTiles, 1.4), color: 0x6c6e72, roughness: 0.8 }));
  const plasterMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, plaster, 0.8), color: 0xeee6d6 }));
  const stoneMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, stoneWall, 0.8), color: 0x9a968c }));
  const grassMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, grass, 0.6), color: 0x8aa070 }));
  const gravelMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, gravel, 1.6), color: 0xe4e0d6 }));
  const rake = assets.track(rakeNormal());
  rake.repeat.set(1, 6);
  gravelMat.normalMap = rake;
  gravelMat.normalScale = new THREE.Vector2(0.9, 0.9);
  const tatamiMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, tatami, 0.5), color: 0xc9c08a }));
  const vermilion = assets.track(new THREE.MeshStandardMaterial({ color: VERMILION, roughness: 0.55 }));
  const blackLacquer = assets.track(new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.35 }));
  const shojiMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.9, emissive: 0xfff2d8, emissiveIntensity: 0.05 }));
  const bambooMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, bamboo, 1, 3), color: 0xb7c08a }));

  // ------------------------------------------------------------------ ground: moss lawn, gravel garden, pond
  // Raked gravel garden on the right.
  const gravelGeo = new THREE.PlaneGeometry(150, 170).rotateX(-Math.PI / 2);
  const gravelMesh = new THREE.Mesh(assets.track(gravelGeo), gravelMat);
  gravelMesh.position.set(110, GROUND + 0.15, 10);
  gravelMesh.receiveShadow = true;
  group.add(gravelMesh);
  const kerbs: THREE.BufferGeometry[] = [box(150, 1.2, 2, 110, GROUND + 0.5, -75), box(150, 1.2, 2, 110, GROUND + 0.5, 95), box(2, 1.2, 170, 35, GROUND + 0.5, 10)];

  // Koi pond: an irregular outline on the left that wraps under the front of the veranda.
  const pondShape = new THREE.Shape();
  const PC = new THREE.Vector2(-72, -6);
  const pondPts: THREE.Vector2[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rad = 62 + Math.sin(a * 3 + 1) * 10 + Math.sin(a * 5) * 5 + Math.cos(a * 2) * 12;
    pondPts.push(new THREE.Vector2(PC.x + Math.cos(a) * rad * 1.15, PC.y + Math.sin(a) * rad));
  }
  // Shapes live in XY; rotateX(-π/2) maps (x, y) → (x, 0, -y), so feed them -z.
  const flip = (pts: THREE.Vector2[]) => pts.map(p => new THREE.Vector2(p.x, -p.y));
  pondShape.setFromPoints(flip(pondPts));
  const pondGeo = new THREE.ShapeGeometry(pondShape, 4).rotateX(-Math.PI / 2);
  const bed = new THREE.Mesh(assets.track(pondGeo.clone().translate(0, GROUND - 3, 0)), assets.track(new THREE.MeshStandardMaterial({ color: 0x2a2f22, roughness: 1 })));
  group.add(bed);
  const waterMat = assets.track(new THREE.MeshPhysicalMaterial({ color: 0x24443a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.03 }));
  const water = new THREE.Mesh(assets.track(pondGeo.translate(0, GROUND - 0.6, 0)), waterMat);
  group.add(water);
  // Moss lawn everywhere except the pond.
  const lawnShape = new THREE.Shape([new THREE.Vector2(-WALL - 20, -WALL - 20), new THREE.Vector2(WALL + 20, -WALL - 20), new THREE.Vector2(WALL + 20, WALL + 20), new THREE.Vector2(-WALL - 20, WALL + 20)]);
  lawnShape.holes.push(new THREE.Path(flip(pondPts)));
  const ground = new THREE.Mesh(assets.track(worldUV(new THREE.ShapeGeometry(lawnShape, 2).rotateX(-Math.PI / 2).translate(0, GROUND, 0))), grassMat);
  ground.receiveShadow = true;
  group.add(ground);
  // Edge stones around the pond.
  const edgeStones = pondPts.map((p, i) => ({ p: new THREE.Vector3(p.x, GROUND - 0.4, p.y), ry: i * 1.7, s: new THREE.Vector3(2.2 + r() * 2, 1.2 + r() * 1, 2 + r() * 1.6) }));
  group.add(instances(assets.track(new THREE.DodecahedronGeometry(1, 1)), stoneMat, edgeStones));

  // Koi.
  const koiGeo = assets.track(new THREE.SphereGeometry(1, 12, 8).scale(0.55, 0.32, 2.2));
  const koiMat = assets.track(new THREE.MeshStandardMaterial({ roughness: 0.4 }));
  const KOI = 14;
  const koi = new THREE.InstancedMesh(koiGeo, koiMat, KOI);
  const koiCols = [0xff6a1a, 0xf5f0e6, 0xe8452a, 0xffa62a, 0xf8f4ea, 0x20201e];
  const koiState = Array.from({ length: KOI }, (_, i) => {
    koi.setColorAt(i, new THREE.Color(koiCols[i % koiCols.length]));
    return { a: r() * Math.PI * 2, rad: 15 + r() * 38, sp: (0.08 + r() * 0.12) * (r() < 0.5 ? 1 : -1), y: GROUND - 1.4 - r() * 1.2, ph: r() * 10 };
  });
  group.add(koi);

  // ------------------------------------------------------------------ veranda (engawa) + tea house
  const deckParts: THREE.BufferGeometry[] = [];
  const timberParts: THREE.BufferGeometry[] = [];
  const darkParts: THREE.BufferGeometry[] = [];
  const roofParts: THREE.BufferGeometry[] = [];
  const shojiParts: THREE.BufferGeometry[] = [];
  const plasterParts: THREE.BufferGeometry[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];
  const vermParts: THREE.BufferGeometry[] = [];

  // Deck: 36 x 30 around the board, joined to the tea house floor behind.
  deckParts.push(box(38, 1.2, 34, 0, DECK - 0.6, 0));
  deckParts.push(box(64, 1.2, 46, 0, DECK - 0.6, -40));
  for (const [x, z] of [[-18, 16], [18, 16], [-18, -16], [18, -16], [-31, -62], [31, -62], [-31, -18], [31, -18]] as const) {
    timberParts.push(box(1.4, DECK - GROUND, 1.4, x, (DECK + GROUND) / 2 - 0.6, z));
  }
  // Step stone (kutsunugi-ishi) in front of the veranda.
  stoneParts.push(box(9, 2.4, 5, 0, GROUND + 1.2, 20));

  // Tea house: posts, tatami floor, shoji walls on three sides, open front, hip roof.
  const TH = { x0: -30, x1: 30, z0: -62, z1: -18, h: 30 };
  const tat = new THREE.Mesh(assets.track(worldUV(new THREE.PlaneGeometry(56, 40).rotateX(-Math.PI / 2).translate(0, DECK + 0.05, -40))), tatamiMat);
  tat.receiveShadow = true;
  group.add(tat);
  for (const x of [TH.x0, -10, 10, TH.x1]) for (const z of [TH.z0, TH.z1]) timberParts.push(box(1.6, TH.h, 1.6, x, DECK + TH.h / 2, z));
  for (const z of [-40]) for (const x of [TH.x0, TH.x1]) timberParts.push(box(1.6, TH.h, 1.6, x, DECK + TH.h / 2, z));
  // Head beams.
  timberParts.push(box(TH.x1 - TH.x0 + 2, 2, 1.8, 0, DECK + TH.h - 1, TH.z1));
  timberParts.push(box(TH.x1 - TH.x0 + 2, 2, 1.8, 0, DECK + TH.h - 1, TH.z0));
  for (const x of [TH.x0, TH.x1]) timberParts.push(box(1.8, 2, TH.z1 - TH.z0, x, DECK + TH.h - 1, (TH.z0 + TH.z1) / 2));
  // Shoji: paper panels with a dark lattice.
  const shoji = (x0: number, x1: number, z0: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const h = TH.h - 6;
    const panel = new THREE.PlaneGeometry(len, h).toNonIndexed();
    panel.rotateY(-ang);
    panel.translate((x0 + x1) / 2, DECK + 2 + h / 2, (z0 + z1) / 2);
    shojiParts.push(panel);
    const back = panel.clone();
    back.rotateY(0);
    for (let k = 0; k <= Math.round(len / 3); k++) {
      const t = k / Math.round(len / 3);
      const lx = x0 + (x1 - x0) * t;
      const lz = z0 + (z1 - z0) * t;
      const bar = box(0.35, h, 0.5, 0, 0, 0);
      bar.rotateY(-ang);
      bar.translate(lx, DECK + 2 + h / 2, lz);
      darkParts.push(bar);
    }
    for (let k = 0; k <= 8; k++) {
      const y = DECK + 2 + (h / 8) * k;
      const bar = box(len, 0.35, 0.5, 0, 0, 0);
      bar.rotateY(-ang);
      bar.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      darkParts.push(bar);
    }
    back.dispose();
  };
  shoji(TH.x0, TH.x1, TH.z0 + 0.3, TH.z0 + 0.3);
  shoji(TH.x0 + 0.3, TH.x0 + 0.3, TH.z0, -40);
  shoji(TH.x1 - 0.3, TH.x1 - 0.3, TH.z0, -40);
  // Transom (ranma) plaster band above the shoji.
  plasterParts.push(box(TH.x1 - TH.x0, 3.6, 0.8, 0, DECK + TH.h - 3.8, TH.z0 + 0.4));
  // Roof: deep eaves, curved hip roof, ridge cap.
  const roof = hipRoof(1, 17, 46, 37);
  roof.translate(0, DECK + TH.h, -40);
  roofParts.push(roof);
  darkParts.push(box(30, 2.4, 2.4, 0, DECK + TH.h + 16.5, -40));
  // Eave underside (dark rafters).
  darkParts.push(box(92, 0.6, 74, 0, DECK + TH.h - 0.2, -40));

  // Low lacquered table (chabudai) for the board.
  const tableTop = new THREE.Mesh(assets.track(new RoundedBoxGeometry(13.4, 0.8, 13.4, 3, 0.25)), blackLacquer);
  tableTop.position.y = -0.33 - 0.4;
  const legGeo = assets.track(new THREE.BoxGeometry(1, -1.13 - DECK, 1));
  group.add(tableTop);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, blackLacquer);
    leg.position.set(sx * 5.6, (DECK - 1.13) / 2, sz * 5.6);
    leg.castShadow = true;
    group.add(leg);
  }
  tableTop.castShadow = tableTop.receiveShadow = true;
  // Zabuton cushions for the two players.
  const cushionMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x3a2a5a, roughness: 0.95 }));
  for (const z of [11, -11]) {
    const c = new THREE.Mesh(assets.track(new RoundedBoxGeometry(7, 1.2, 7, 3, 0.5)), cushionMat);
    c.position.set(0, DECK + 0.6, z);
    c.castShadow = c.receiveShadow = true;
    group.add(c);
  }

  // ------------------------------------------------------------------ torii in the pond
  const torii = (x: number, z: number, ry: number, s: number) => {
    const parts: THREE.BufferGeometry[] = [];
    const H = 52 * s;
    for (const sx of [-1, 1]) parts.push(new THREE.CylinderGeometry(1.5 * s, 1.9 * s, H, 16).toNonIndexed().translate(sx * 14 * s, GROUND + H / 2, 0));
    parts.push(box(34 * s, 2.4 * s, 2 * s, 0, GROUND + H * 0.78, 0)); // nuki
    // Kasagi: curved top beam (extruded upward-sweeping shape).
    const kas = new THREE.Shape();
    const L = 23 * s;
    kas.moveTo(-L, 1.6 * s);
    kas.quadraticCurveTo(0, -1.2 * s, L, 1.6 * s);
    kas.lineTo(L + 1 * s, 4.6 * s);
    kas.quadraticCurveTo(0, 1.6 * s, -L - 1 * s, 4.6 * s);
    kas.lineTo(-L, 1.6 * s);
    const kg = new THREE.ExtrudeGeometry(kas, { depth: 3 * s, bevelEnabled: false, curveSegments: 16 }).toNonIndexed();
    kg.translate(0, GROUND + H - 1 * s, -1.5 * s);
    parts.push(kg);
    parts.push(box(31 * s, 2 * s, 2.6 * s, 0, GROUND + H - 2.5 * s, 0)); // shimaki
    parts.push(box(2 * s, H * 0.2, 1.6 * s, 0, GROUND + H * 0.88, 0)); // gakuzuka
    const geo = mergeGeometries(parts.map(p => { for (const k of Object.keys(p.attributes)) if (!['position', 'normal'].includes(k)) p.deleteAttribute(k); return p; }))!;
    geo.rotateY(ry);
    geo.translate(x, 0, z);
    vermParts.push(geo);
    // Black caps on the kasagi.
    const cap = box(48 * s, 0.8 * s, 3.4 * s, 0, GROUND + H + 3.6 * s, 0);
    cap.rotateY(ry);
    cap.translate(x, 0, z);
    darkParts.push(cap);
  };
  torii(-108, -38, 0.6, 1);

  // ------------------------------------------------------------------ stone lanterns (tōrō)
  const lanternPos: THREE.Vector3[] = [];
  const toro = (x: number, z: number, s: number) => {
    const y0 = GROUND;
    const lathe = (pts: number[][], seg = 6) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a * s, b * s)), seg).toNonIndexed();
    stoneParts.push(lathe([[0, 0], [4, 0], [4, 1.5], [2.8, 2.2], [0, 2.2]]).translate(x, y0, z));
    stoneParts.push(new THREE.CylinderGeometry(1.1 * s, 1.3 * s, 9 * s, 12).toNonIndexed().translate(x, y0 + 6.7 * s, z));
    stoneParts.push(lathe([[0, 0], [3.2, 0], [2.6, 1.6], [0, 1.6]]).translate(x, y0 + 11.2 * s, z));
    // Fire box with openings (four posts).
    for (const a of [0, 1, 2, 3]) {
      const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
      stoneParts.push(box(0.9 * s, 4 * s, 0.9 * s, x + Math.cos(ang) * 1.9 * s, y0 + 14.8 * s, z + Math.sin(ang) * 1.9 * s));
    }
    stoneParts.push(lathe([[0, 0], [5.2, 0], [5.4, 0.6], [3, 2.2], [1, 3.2], [0, 3.2]]).translate(x, y0 + 16.8 * s, z));
    stoneParts.push(new THREE.SphereGeometry(1.1 * s, 10, 8).toNonIndexed().translate(x, y0 + 20.6 * s, z));
    lanternPos.push(new THREE.Vector3(x, y0 + 14.6 * s, z));
  };
  toro(-26, 26, 0.9);
  toro(42, -22, 1);
  toro(-30, -78, 0.85);
  toro(-120, 52, 1.1);

  // Stone garden: carefully placed rocks in the gravel.
  if (rocks1 || rocks2) {
    const set: [THREE.Object3D | null, number, number, number, number][] = [
      [rocks1, 9, 90, -20, 0.4], [rocks2, 6, 130, 30, 2.1], [rocks1, 5, 70, 55, 4], [rocks2, 11, 150, -50, 1.2], [rocks1, 4, 105, 70, 5.2],
    ];
    for (const [m, h, x, z, ry] of set) place(group, m, h, x, GROUND, z, ry);
    // Rocks around the pond edge.
    for (let i = 0; i < 6; i++) {
      const p = pondPts[(i * 8 + 3) % pondPts.length];
      place(group, i % 2 ? rocks1 : rocks2, 4 + r() * 4, p.x, GROUND - 0.5, p.y, r() * 6);
    }
  }
  for (let i = 0; i < 7; i++) {
    const p = pondPts[(i * 7) % pondPts.length];
    place(group, i % 2 ? fern : shrub, 5 + r() * 4, p.x * 1.08 - 6, GROUND, p.y * 1.08, r() * 6);
  }
  // Tea set beside the board; sword stand inside the tea house.
  place(group, teaSet, 1.3, 9.6, DECK, 4, -0.4);
  if (katanaStand) {
    place(group, katanaStand, 4, 18, DECK, -56, 0.1);
    place(group, katana, 1.4, 18, DECK + 4, -56, 0.1);
  }

  // ------------------------------------------------------------------ trees
  const trunkParts: THREE.BufferGeometry[] = [];
  const mapleCards: Parameters<typeof growTree>[3] = [];
  const sakuraCards: Parameters<typeof growTree>[3] = [];
  const pineCards: Parameters<typeof growTree>[3] = [];
  const trees: TreeSpec[] = [
    { x: -40, z: -78, h: 70, spread: 30, kind: 'maple' },
    { x: -130, z: -60, h: 80, spread: 34, kind: 'sakura' },
    { x: -150, z: 30, h: 75, spread: 32, kind: 'maple' },
    { x: -60, z: 70, h: 65, spread: 28, kind: 'sakura' },
    { x: 60, z: -100, h: 95, spread: 30, kind: 'pine' },
    { x: 170, z: -120, h: 85, spread: 34, kind: 'sakura' },
    { x: 60, z: 120, h: 70, spread: 30, kind: 'maple' },
    { x: -170, z: -150, h: 90, spread: 30, kind: 'pine' },
    { x: 150, z: 140, h: 80, spread: 32, kind: 'sakura' },
  ];
  for (const t of trees) growTree(t, r, trunkParts, t.kind === 'maple' ? mapleCards : t.kind === 'sakura' ? sakuraCards : pineCards);
  const barkMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x3a2c24, roughness: 0.95 }));
  const trunkMesh = new THREE.Mesh(assets.track(mergeGeometries(trunkParts.map(g => { g.deleteAttribute('uv'); return g; }))!), barkMat);
  trunkMesh.castShadow = true;
  group.add(trunkMesh);
  trunkParts.forEach(g => g.dispose());
  const cardGeo = assets.track(new THREE.PlaneGeometry(1, 1));
  const leafMat = (kind: 'maple' | 'sakura' | 'pine') =>
    assets.track(new THREE.MeshStandardMaterial({ map: assets.track(leafTexture(kind, r)), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }));
  for (const [cards, kind] of [[mapleCards, 'maple'], [sakuraCards, 'sakura'], [pineCards, 'pine']] as const) {
    group.add(instances(cardGeo, leafMat(kind), cards.map(c => ({ p: c.p, ry: c.ry, rx: c.rx, rz: c.rz, s: c.s }))));
  }

  // Bamboo grove along the back-left wall.
  const culmGeo = assets.track(new THREE.CylinderGeometry(0.55, 0.65, 1, 8, 1).translate(0, 0.5, 0));
  const culms: { p: THREE.Vector3; s: THREE.Vector3; rx: number; rz: number }[] = [];
  const bambooLeaves: { p: THREE.Vector3; ry: number; rx: number; rz: number; s: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const x = -WALL + 10 + r() * 140;
    const z = -WALL + 8 + r() * 26;
    const h = 90 + r() * 60;
    const rx = (r() - 0.5) * 0.08;
    const rz = (r() - 0.5) * 0.08;
    culms.push({ p: new THREE.Vector3(x, GROUND, z), s: new THREE.Vector3(1, h, 1), rx, rz });
    for (let k = 0; k < 6; k++) bambooLeaves.push({ p: new THREE.Vector3(x + (r() - 0.5) * 16, GROUND + h * (0.6 + r() * 0.4), z + (r() - 0.5) * 16), ry: r() * 6, rx: (r() - 0.5) * 2, rz: (r() - 0.5) * 2, s: 14 + r() * 8 });
  }
  group.add(instances(culmGeo, bambooMat, culms));
  group.add(instances(cardGeo, assets.track(new THREE.MeshStandardMaterial({ map: assets.track(leafTexture('bamboo', r)), alphaTest: 0.45, side: THREE.DoubleSide })), bambooLeaves, false));

  // ------------------------------------------------------------------ garden wall (tsuiji-bei) with tiled cap
  for (let w = 0; w < 4; w++) {
    const wallG = box(WALL * 2, 26, 4, 0, GROUND + 13, -WALL);
    wallG.rotateY((w * Math.PI) / 2);
    plasterParts.push(wallG);
    const base = box(WALL * 2, 4, 5, 0, GROUND + 2, -WALL);
    base.rotateY((w * Math.PI) / 2);
    stoneParts.push(base);
    // Tiled cap: a long gabled roof.
    const capShape = new THREE.Shape();
    capShape.moveTo(-6, 0);
    capShape.quadraticCurveTo(-3, 2.2, 0, 4.6);
    capShape.quadraticCurveTo(3, 2.2, 6, 0);
    capShape.lineTo(-6, 0);
    const cap = new THREE.ExtrudeGeometry(capShape, { depth: WALL * 2 + 12, bevelEnabled: false, curveSegments: 6 }).toNonIndexed();
    cap.translate(0, 0, -(WALL + 6)); // centre the length on the origin
    cap.rotateY(Math.PI / 2); // run along X
    cap.translate(0, GROUND + 26, -WALL);
    cap.rotateY((w * Math.PI) / 2);
    roofParts.push(cap);
  }

  // ------------------------------------------------------------------ five-storey pagoda beyond the wall
  {
    const px = 120;
    const pz = -330;
    let y = GROUND;
    let w = 26;
    stoneParts.push(box(40, 6, 40, px, y + 3, pz));
    y += 6;
    for (let tier = 0; tier < 5; tier++) {
      const hgt = tier === 0 ? 26 : 18;
      timberParts.push(box(w, hgt, w, px, y + hgt / 2, pz));
      shojiParts.push(box(w * 0.5, hgt * 0.6, w + 0.4, px, y + hgt * 0.45, pz));
      darkParts.push(box(w + 3, 1.4, w + 3, px, y + hgt, pz));
      const rf = hipRoof(1, 11, w * 0.95 + 14, w * 0.95 + 14);
      rf.translate(px, y + hgt, pz);
      roofParts.push(rf);
      y += hgt + 4;
      w *= 0.86;
    }
    // Sōrin spire.
    darkParts.push(new THREE.CylinderGeometry(0.6, 1.2, 50, 8).toNonIndexed().translate(px, y + 25, pz));
    for (let k = 0; k < 9; k++) darkParts.push(new THREE.CylinderGeometry(2.2, 2.2, 0.8, 12).toNonIndexed().translate(px, y + 10 + k * 3.6, pz));
  }
  // A temple gate roof peeking over the left wall.
  {
    const gx = -150;
    const gz = -260;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) vermParts.push(box(3, 50, 3, gx + sx * 24, GROUND + 25, gz + sz * 12));
    plasterParts.push(box(50, 14, 26, gx, GROUND + 56, gz));
    const rf = hipRoof(1, 18, 44, 28);
    rf.translate(gx, GROUND + 63, gz);
    roofParts.push(rf);
  }

  // Forested hills (Higashiyama) ringing the garden: a distant ridge line with a bumpy tree-covered crest.
  {
    const SEG = 360;
    const pos: number[] = [];
    const col: number[] = [];
    const ridge = (a: number) =>
      110 + Math.sin(a * 3 + 0.7) * 60 + Math.sin(a * 7 + 2) * 28 + Math.sin(a * 17) * 9 + Math.sin(a * 41) * 4 + Math.sin(a * 97) * 2;
    const layers: [number, number, number][] = [[850, 0.8, 0x2a4430], [1150, 1.2, 0x34503a], [1550, 1.7, 0x4e665c]];
    for (const [rad, hs, c] of layers) {
      const cc = new THREE.Color(c);
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2;
        const a1 = ((i + 1) / SEG) * Math.PI * 2;
        const h0 = ridge(a0 * hs + rad) * hs;
        const h1 = ridge(a1 * hs + rad) * hs;
        const p = (a: number, y: number) => [Math.cos(a) * rad, y, Math.sin(a) * rad];
        const quad = [p(a0, GROUND - 5), p(a1, GROUND - 5), p(a1, GROUND + h1), p(a0, GROUND - 5), p(a1, GROUND + h1), p(a0, GROUND + h0)];
        for (const v of quad) {
          pos.push(...v);
          const shade = 0.75 + 0.25 * Math.min(1, Math.max(0, (v[1] - GROUND) / 150));
          col.push(cc.r * shade, cc.g * shade, cc.b * shade);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const hillMat = assets.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    group.add(new THREE.Mesh(assets.track(g), hillMat));
    // Wooded land between the garden wall and the hills.
    const land = new THREE.Mesh(assets.track(new THREE.CircleGeometry(1700, 64).rotateX(-Math.PI / 2).translate(0, GROUND - 2, 0)), assets.track(new THREE.MeshStandardMaterial({ color: 0x2f4630, roughness: 1 })));
    group.add(land);
  }

  // ------------------------------------------------------------------ merge
  const addMerged = (parts: THREE.BufferGeometry[], mat: THREE.Material, cast = true) => {
    const geos = parts.map(g => {
      const n = g.index ? g.toNonIndexed() : g;
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      if (!n.attributes.normal) n.computeVertexNormals();
      for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
      return worldUV(n);
    });
    if (!geos.length) return;
    const merged = mergeGeometries(geos);
    parts.forEach(g => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(assets.track(merged), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addMerged([...deckParts], deckMat);
  addMerged(timberParts, timberMat);
  addMerged(darkParts, darkTimber);
  addMerged(roofParts, roofMat);
  addMerged(shojiParts, shojiMat, false);
  addMerged(plasterParts, plasterMat);
  addMerged([...stoneParts, ...kerbs], stoneMat);
  addMerged(vermParts, vermilion);

  // Lantern glow.
  const glowMat = assets.track(new THREE.MeshBasicMaterial({ color: 0xffc27a }));
  group.add(instances(assets.track(new THREE.SphereGeometry(0.9, 10, 8)), glowMat, lanternPos.map(p => ({ p })), false));
  const lights = lanternPos.slice(0, Math.min(2, ctx.quality.maxPointLights)).map(p => {
    const l = new THREE.PointLight(0xffb060, 25, 22, 2);
    l.position.copy(p);
    group.add(l);
    return l;
  });

  // Falling cherry petals.
  const petalTex = assets.track(leafTexture('sakura', rng(3)));
  const petals = new Drifters(assets, Math.round(220 * ctx.quality.particles), new THREE.Vector3(90, 50, 90), new THREE.Vector3(0, 12, 0), {
    color: 0xffdbe6, size: 0.9, tex: petalTex, wind: new THREE.Vector3(2.2, 0, 0.8), fall: 1.6, opacity: 0.95,
  });
  group.add(petals.points);

  const sunDir = findSunDirection(env).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  const lighting: RealmLighting = {
    environment: env,
    envIntensity: 0.85,
    envRotation: rotation,
    sunDir,
    sunColor: 0xfff1de,
    sunIntensity: 2.6,
    hemiIntensity: 0.2,
    exposure: 1,
    fog: { color: 0xbccad2, density: 0.0007 },
    bloom: { strength: 0.12, threshold: 6 },
    grade: { saturation: 1.05, contrast: 1.04, tint: 0.015, vignette: 0.22 },
  };
  dome.setExposure(lighting.exposure);

  const km = new THREE.Matrix4();
  const kq = new THREE.Quaternion();
  const ks = new THREE.Vector3(1, 1, 1);
  const kp = new THREE.Vector3();
  const ke = new THREE.Euler();
  return {
    group,
    lighting,
    boardStand: 'none',
    far: 3200,
    seatPolar: 1.06,
    menuPolar: 1.3,
    update(dt, time) {
      koiState.forEach((k, i) => {
        k.a += k.sp * dt;
        const wig = Math.sin(time * 3 + k.ph) * 0.15;
        kp.set(PC.x + Math.cos(k.a) * k.rad * 1.1, k.y, PC.y + Math.sin(k.a) * k.rad * 0.85);
        ke.set(0, -k.a + (k.sp > 0 ? 0 : Math.PI) + wig, 0);
        kq.setFromEuler(ke);
        km.compose(kp, kq, ks);
        koi.setMatrixAt(i, km);
      });
      koi.instanceMatrix.needsUpdate = true;
      petals.update(dt, time);
      lights.forEach((l, i) => (l.intensity = 25 + Math.sin(time * 7 + i) * 2));
    },
    dispose() {
      dome.dispose();
      assets.dispose();
    },
  };
}
