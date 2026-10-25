import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AssetScope } from './assets.ts';
import { animateSitter, box, Drifters, glowTexture, makeSitter, place, rng, Sitter, tiled, worldUV } from './kit.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * Spanish Café — an Andalusian café in the evening, built in 3D around the board.
 * Terracotta floor, azulejo tile wainscot, whitewashed walls and dark beams; arched windows with iron rejas
 * looking onto a dusk plaza; a bar with bottles and hanging jamón; Gallinera tables and chairs where
 * patrons sit over coffee and their own chess games. The board stands on a marble bistro table with a
 * steaming café con leche and a croissant beside it.
 *
 * 1 unit = 10 cm. Board top y = 0, floor y = FLOOR.
 */
const FLOOR = -7.6;
const HX = 85; // room half-width (x)
const HZ = 62; // room half-depth (z)
const CEIL = FLOOR + 40;

/** Azulejo tile (cobalt and ochre on white glaze). */
function azulejoCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2ede2';
  g.fillRect(0, 0, 256, 256);
  const blue = '#1f4b9a';
  const ochre = '#d79a2a';
  // Four-fold star-and-cross pattern per 128 px tile.
  for (const [ox, oy] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    g.save();
    g.translate(ox + 64, oy + 64);
    g.fillStyle = blue;
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rad = k % 2 ? 22 : 52;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#f2ede2';
    g.beginPath();
    g.arc(0, 0, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ochre;
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rad = k % 2 ? 6 : 15;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
    // Corner quarter-circles that join into rosettes across tiles.
    g.fillStyle = blue;
    for (const [cx, cy] of [[-64, -64], [64, -64], [-64, 64], [64, 64]]) {
      g.beginPath();
      g.arc(cx, cy, 18, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  // Grout lines and glaze variation.
  g.strokeStyle = 'rgba(120,110,95,0.6)';
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  return c;
}

/** The plaza outside at dusk: sky, whitewashed façades with balconies, warm windows and street lamps. */
function plazaCanvas(r: () => number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#1b2a55');
  sky.addColorStop(0.45, '#4a4f86');
  sky.addColorStop(0.75, '#d9866a');
  sky.addColorStop(1, '#f2b072');
  g.fillStyle = sky;
  g.fillRect(0, 0, 2048, 512);
  let x = 0;
  while (x < 2048) {
    const w = 140 + r() * 180;
    const h = 220 + r() * 200;
    const shade = 150 + Math.floor(r() * 50);
    g.fillStyle = `rgb(${shade + 20},${shade + 6},${shade - 18})`;
    g.fillRect(x, 512 - h, w, h);
    // Roof tiles.
    g.fillStyle = '#7a3a24';
    g.fillRect(x - 4, 512 - h - 10, w + 8, 12);
    // Windows with balconies.
    for (let fy = 512 - h + 30; fy < 470; fy += 62) {
      for (let fx = x + 18; fx < x + w - 30; fx += 46) {
        const lit = r() < 0.55;
        g.fillStyle = lit ? '#ffcf7a' : '#2a2430';
        g.fillRect(fx, fy, 20, 34);
        g.fillStyle = '#1b1612';
        g.fillRect(fx - 4, fy + 34, 28, 3);
        for (let b = 0; b < 6; b++) g.fillRect(fx - 4 + b * 5.5, fy + 26, 1.5, 10);
      }
    }
    x += w + 6;
  }
  // Street lamps glowing.
  for (let i = 0; i < 9; i++) {
    const lx = 110 + i * 230 + r() * 40;
    g.fillStyle = '#181412';
    g.fillRect(lx, 380, 4, 132);
    const glow = g.createRadialGradient(lx + 2, 380, 0, lx + 2, 380, 46);
    glow.addColorStop(0, 'rgba(255,220,150,1)');
    glow.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = glow;
    g.fillRect(lx - 46, 334, 96, 92);
  }
  // Orange trees along the plaza.
  for (let i = 0; i < 14; i++) {
    const tx = r() * 2048;
    g.fillStyle = '#20301c';
    g.beginPath();
    g.arc(tx, 455, 34 + r() * 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e08a2a';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(tx + (r() - 0.5) * 50, 455 + (r() - 0.5) * 40, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Round-arched opening path (bottom at y = 0). */
function arch(cx: number, w: number, spring: number): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(cx - w / 2, 0);
  p.lineTo(cx - w / 2, spring);
  p.absarc(cx, spring, w / 2, Math.PI, 0, true);
  p.lineTo(cx + w / 2, 0);
  p.lineTo(cx - w / 2, 0);
  return p;
}

export async function createCafe(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:cafe';
  const r = rng(1492);

  const [env, terracotta, plaster, darkWood, marble, chair, table, chessSet, croissant, bottles, barrel, chandelier, chalkboard, plant, jug, smallTable] = await Promise.all([
    assets.hdr('hdri/warm_restaurant_night_1k.hdr'),
    assets.pbr('terracotta_floor_tiles'),
    assets.pbr('white_plaster_rough_01'),
    assets.pbr('dark_wood'),
    assets.pbr('marble_01'),
    ...['gallinera_chair', 'gallinera_table', 'chess_set', 'croissant', 'wine_bottles_01', 'wine_barrel_01', 'lantern_chandelier_01', 'standing_chalkboard_01', 'potted_plant_01', 'jug_01', 'round_wooden_table_01'].map(n =>
      assets.model(`models/${n}.glb`).catch(() => null)
    ),
  ]);

  // ------------------------------------------------------------------ materials
  const floorMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, terracotta, 0.7), color: 0xd29a78 }));
  const plasterMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, plaster, 0.6), color: 0xf3ece0 }));
  const beamMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, darkWood, 0.7), color: 0x4a3222 }));
  const azTex = assets.track(new THREE.CanvasTexture(azulejoCanvas()));
  azTex.colorSpace = THREE.SRGBColorSpace;
  azTex.wrapS = azTex.wrapT = THREE.RepeatWrapping;
  azTex.anisotropy = 8;
  azTex.repeat.set(0.75, 0.75);
  const tileMat = assets.track(new THREE.MeshPhysicalMaterial({ map: azTex, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
  const ironMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x1a1816, metalness: 0.8, roughness: 0.5 }));
  const marbleMat = assets.track(new THREE.MeshPhysicalMaterial({ ...tiled(assets, marble, 1), color: 0xf0ece4, clearcoat: 0.6, clearcoatRoughness: 0.12 }));
  const brass = assets.track(new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 }));
  const chrome = assets.track(new THREE.MeshStandardMaterial({ color: 0xdadde2, metalness: 1, roughness: 0.15 }));

  // ------------------------------------------------------------------ room shell
  const floor = new THREE.Mesh(assets.track(worldUV(new THREE.PlaneGeometry(HX * 2, HZ * 2).rotateX(-Math.PI / 2).translate(0, FLOOR, 0))), floorMat);
  floor.receiveShadow = true;
  group.add(floor);

  const plasterParts: THREE.BufferGeometry[] = [];
  const tileParts: THREE.BufferGeometry[] = [];
  const beamParts: THREE.BufferGeometry[] = [];
  const ironParts: THREE.BufferGeometry[] = [];
  const WAIN = 12; // tiled dado height
  const WIN_W = 22;
  const WIN_SPRING = 16;
  const WIN_SILL = 9;

  // Walls: x = ±HX (windows on the left, x = -HX; plain + door on the right), z = ±HZ (bar at -HZ, windows at +HZ).
  type WallSpec = { len: number; rot: number; offset: number; windows: number[] };
  const walls: WallSpec[] = [
    { len: HZ * 2, rot: Math.PI / 2, offset: HX, windows: [-36, 0, 36] }, // left (x = -HX), faces +X
    { len: HX * 2, rot: Math.PI, offset: HZ, windows: [-50, 0, 50] }, // front (z = +HZ), faces -Z
    { len: HZ * 2, rot: -Math.PI / 2, offset: HX, windows: [] }, // right
    { len: HX * 2, rot: 0, offset: HZ, windows: [] }, // back (bar)
  ];
  const windowFrames: { pos: THREE.Vector3; rot: number }[] = [];
  for (const w of walls) {
    const shape = new THREE.Shape();
    shape.moveTo(-w.len / 2, 0);
    shape.lineTo(w.len / 2, 0);
    shape.lineTo(w.len / 2, CEIL - FLOOR);
    shape.lineTo(-w.len / 2, CEIL - FLOOR);
    shape.lineTo(-w.len / 2, 0);
    for (const cx of w.windows) {
      const hole = arch(cx, WIN_W, WIN_SPRING);
      // Lift the window to sill height.
      const pts = hole.getPoints(24).map(p => new THREE.Vector2(p.x, p.y + WIN_SILL));
      shape.holes.push(new THREE.Path(pts));
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 24 }).toNonIndexed();
    geo.translate(0, FLOOR, -w.offset - 3);
    geo.rotateY(w.rot);
    plasterParts.push(geo);
    // Azulejo dado (stops under the windows).
    const dado = box(w.len, WAIN, 0.4, 0, FLOOR + WAIN / 2, -w.offset + 0.2);
    dado.rotateY(w.rot);
    tileParts.push(dado);
    const cap = box(w.len, 0.8, 1, 0, FLOOR + WAIN + 0.4, -w.offset + 0.5);
    cap.rotateY(w.rot);
    beamParts.push(cap);
    for (const cx of w.windows) {
      // Iron reja: vertical bars and two rails in each window.
      const bars: THREE.BufferGeometry[] = [];
      for (let b = -4; b <= 4; b++) bars.push(new THREE.CylinderGeometry(0.22, 0.22, WIN_SPRING + WIN_W / 2 - 1, 6).toNonIndexed().translate(cx + b * 2.3, FLOOR + WIN_SILL + (WIN_SPRING + WIN_W / 2) / 2, -w.offset - 1.4));
      for (const yy of [WIN_SILL + 4, WIN_SILL + WIN_SPRING - 1]) bars.push(box(WIN_W, 0.5, 0.5, cx, FLOOR + yy, -w.offset - 1.4));
      bars.forEach(b => {
        b.rotateY(w.rot);
        ironParts.push(b);
      });
      const sill = box(WIN_W + 3, 1, 4, cx, FLOOR + WIN_SILL - 0.5, -w.offset - 0.5);
      sill.rotateY(w.rot);
      tileParts.push(sill);
      windowFrames.push({ pos: new THREE.Vector3(cx, 0, -w.offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), w.rot), rot: w.rot });
    }
  }
  // Ceiling + beams (vigas) + corbels.
  const ceiling = new THREE.PlaneGeometry(HX * 2, HZ * 2).toNonIndexed();
  ceiling.rotateX(Math.PI / 2);
  ceiling.translate(0, CEIL, 0);
  plasterParts.push(ceiling);
  for (let x = -HX + 10; x < HX; x += 16) beamParts.push(box(3, 3.4, HZ * 2, x, CEIL - 1.7, 0));
  beamParts.push(box(HX * 2, 2, 3, 0, CEIL - 1, -HZ + 1.5), box(HX * 2, 2, 3, 0, CEIL - 1, HZ - 1.5));

  // Outside: the dusk plaza seen through the windows (left and front walls).
  const plazaTex = assets.track(new THREE.CanvasTexture(plazaCanvas(r)));
  plazaTex.colorSpace = THREE.SRGBColorSpace;
  const plazaMat = assets.track(new THREE.MeshBasicMaterial({ map: plazaTex, fog: false }));
  const left = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(520, 130)), plazaMat);
  left.position.set(-HX - 90, FLOOR + 35, 0);
  left.rotation.y = Math.PI / 2;
  const front = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(520, 130)), plazaMat);
  front.position.set(0, FLOOR + 35, HZ + 90);
  front.rotation.y = Math.PI;
  group.add(left, front);
  // Pavement outside the windows.
  const pave = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2)), assets.track(new THREE.MeshStandardMaterial({ color: 0x5a4c44, roughness: 1 })));
  pave.position.y = FLOOR - 0.2;
  group.add(pave);

  // ------------------------------------------------------------------ bar along the back wall
  const barZ = -HZ + 12;
  const counterFront = box(80, 11, 1.4, 0, FLOOR + 5.5, barZ + 5);
  beamParts.push(counterFront);
  for (let x = -38; x <= 38; x += 8) beamParts.push(box(0.8, 9, 1.8, x, FLOOR + 5.5, barZ + 5.6));
  tileParts.push(box(80, 2, 1, 0, FLOOR + 1, barZ + 5.8)); // tiled kick plate
  const counterTop = new THREE.Mesh(assets.track(worldUV(box(82, 1, 12, 0, FLOOR + 11.5, barZ))), marbleMat);
  counterTop.castShadow = counterTop.receiveShadow = true;
  group.add(counterTop);
  // Brass foot rail.
  const rail = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.35, 0.35, 80, 8).rotateZ(Math.PI / 2)), brass);
  rail.position.set(0, FLOOR + 1.6, barZ + 7.6);
  group.add(rail);
  // Back-bar shelves with bottles.
  for (const y of [16, 22, 28]) beamParts.push(box(70, 0.8, 5, 0, FLOOR + y, -HZ + 2.6));
  for (const y of [16, 22, 28]) for (let x = -30; x <= 30; x += 15) place(group, bottles, 5, x + (r() - 0.5) * 4, FLOOR + y + 0.4, -HZ + 3, r() * 6);
  // Espresso machine.
  const espresso = new THREE.Group();
  const em = new THREE.Mesh(assets.track(new THREE.BoxGeometry(14, 7, 6)), chrome);
  em.position.y = 3.5;
  const emTop = new THREE.Mesh(assets.track(new THREE.BoxGeometry(14.4, 0.6, 6.4)), assets.track(new THREE.MeshStandardMaterial({ color: 0x8a1c18, roughness: 0.4 })));
  emTop.position.y = 7.3;
  espresso.add(em, emTop);
  for (const gx of [-4, 0, 4]) {
    const head = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 12)), chrome);
    head.position.set(gx, 2.2, 3.6);
    espresso.add(head);
  }
  espresso.position.set(-18, FLOOR + 12, barZ - 1);
  group.add(espresso);
  // Hanging jamón over the bar.
  const hamMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x5a2416, roughness: 0.6 }));
  const hamGeo = assets.track(new THREE.LatheGeometry([[0, 0], [1.4, 0.6], [2.4, 2.2], [2.6, 4.2], [1.8, 6.4], [0.7, 8], [0.45, 10.5], [0.5, 11], [0, 11.2]].map(([a, b]) => new THREE.Vector2(a, b)), 16));
  hamGeo.scale(0.75, -0.75, 0.6);
  for (let i = 0; i < 6; i++) {
    const h = new THREE.Mesh(hamGeo, hamMat);
    h.position.set(-30 + i * 9 + (r() - 0.5) * 2, CEIL - 6, barZ + 1);
    h.rotation.set((r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15);
    h.castShadow = true;
    group.add(h);
    const string = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.05, 0.05, 6, 3)), ironMat);
    string.position.set(h.position.x, CEIL - 3, h.position.z);
    group.add(string);
  }
  place(group, chalkboard, 15, 52, FLOOR, -HZ + 8, -0.25);
  place(group, barrel, 10, 70, FLOOR, -40, 0.4);
  place(group, barrel, 10, -72, FLOOR, -46, 1.2);
  place(group, plant, 14, -76, FLOOR, 54, 0.5);
  place(group, plant, 14, 76, FLOOR, 52, 2.1);
  for (let i = 0; i < 3; i++) place(group, jug, 3.4, 40 + i * 6, FLOOR + 11.9, barZ - 2, r() * 6);

  // ------------------------------------------------------------------ merge architecture
  const addMerged = (parts: THREE.BufferGeometry[], mat: THREE.Material, cast = true) => {
    const geos = parts.map(g => {
      const n = g.index ? g.toNonIndexed() : g;
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
      return worldUV(n);
    });
    const merged = mergeGeometries(geos);
    parts.forEach(g => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(assets.track(merged), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addMerged(plasterParts, plasterMat, false);
  addMerged(tileParts, tileMat, false);
  addMerged(beamParts, beamMat);
  addMerged(ironParts, ironMat);

  // ------------------------------------------------------------------ our table: marble bistro top on a cast-iron base
  const top = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(9.6, 9.6, 0.8, 64)), marbleMat);
  top.position.y = -0.33 - 0.4;
  const edge = new THREE.Mesh(assets.track(new THREE.TorusGeometry(9.6, 0.25, 8, 64).rotateX(Math.PI / 2)), brass);
  edge.position.y = -0.73;
  const stem = new THREE.Mesh(assets.track(new THREE.LatheGeometry([[0, FLOOR], [5.2, FLOOR], [5.2, FLOOR + 0.5], [1.4, FLOOR + 1.6], [0.7, FLOOR + 3], [0.6, -3], [1.2, -2], [1.6, -1.13], [0, -1.13]].map(([a, b]) => new THREE.Vector2(a, b)), 32)), ironMat);
  for (const m of [top, edge, stem]) {
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  // Two empty Gallinera chairs for the players.
  place(group, chair, 9, 0, FLOOR, 15, Math.PI);
  place(group, chair, 9, 0, FLOOR, -15, 0);

  // Café con leche: saucer, cup with coffee, spoon, steam.
  const cup = new THREE.Group();
  const ceramic = assets.track(new THREE.MeshPhysicalMaterial({ color: 0xf6f3ec, roughness: 0.25, clearcoat: 0.8 }));
  const saucer = new THREE.Mesh(assets.track(new THREE.LatheGeometry([[0, 0], [1.3, 0], [2.2, 0.15], [2.4, 0.35], [2.3, 0.4], [1.4, 0.22], [0, 0.22]].map(([a, b]) => new THREE.Vector2(a, b)), 32)), ceramic);
  const body = new THREE.Mesh(assets.track(new THREE.LatheGeometry([[0, 0.2], [0.9, 0.2], [1.25, 0.6], [1.45, 1.6], [1.5, 2.4], [1.38, 2.4], [1.33, 1.6], [1.15, 0.7], [0, 0.6]].map(([a, b]) => new THREE.Vector2(a, b)), 32)), ceramic);
  const coffee = new THREE.Mesh(assets.track(new THREE.CircleGeometry(1.36, 32).rotateX(-Math.PI / 2)), assets.track(new THREE.MeshPhysicalMaterial({ color: 0x8a5a32, roughness: 0.15, clearcoat: 1 })));
  coffee.position.y = 2.1;
  const handle = new THREE.Mesh(assets.track(new THREE.TorusGeometry(0.55, 0.13, 8, 16, Math.PI * 1.3)), ceramic);
  handle.position.set(1.65, 1.4, 0);
  handle.rotation.z = -Math.PI * 0.65;
  const spoon = new THREE.Mesh(assets.track(new THREE.BoxGeometry(2.6, 0.08, 0.3)), chrome);
  spoon.position.set(0.2, 0.32, 1.6);
  spoon.rotation.y = 0.5;
  cup.add(saucer, body, coffee, handle, spoon);
  cup.traverse(o => { (o as THREE.Mesh).castShadow = true; });
  cup.scale.setScalar(0.62);
  cup.position.set(6.4, -1.13 + 0.4, 4.6);
  group.add(cup);
  place(group, croissant, 0.85, -6.6, -1.13 + 0.4, 4.4, 0.8);
  const steamTex = assets.track(glowTexture('rgba(255,255,255,0.5)', 'rgba(255,255,255,0.12)'));
  const steam = new Drifters(assets, 26, new THREE.Vector3(1, 3.5, 1), new THREE.Vector3(6.4, 2, 4.6), { color: 0xffffff, size: 0.8, tex: steamTex, wind: new THREE.Vector3(0.05, 0.9, 0.02), opacity: 0.16 });
  group.add(steam.points);

  // ------------------------------------------------------------------ other tables with patrons
  const sitters: Sitter[] = [];
  const tables: [number, number, number, boolean][] = [
    // x, z, rotation, chess?
    [-50, -24, 0.2, true],
    [48, -26, -0.3, false],
    [-54, 30, 0.6, false],
    [52, 30, 1.2, true],
    [-18, 46, 0, false],
    [24, -44, 0.9, false],
  ];
  for (const [x, z, ry, chess] of tables) {
    const t = place(group, table ?? smallTable, 7.4, x, FLOOR, z, ry);
    const topY = FLOOR + 7.4;
    if (!t) continue;
    // Two chairs and two people facing each other across the table.
    for (const side of [-1, 1]) {
      const ang = ry + (side > 0 ? 0 : Math.PI);
      const cx = x + Math.sin(ang) * 10;
      const cz = z + Math.cos(ang) * 10;
      place(group, chair, 9, cx, FLOOR, cz, ang + Math.PI);
      const s = makeSitter(assets, r, { seatHeight: 4.6 });
      s.root.position.set(cx, FLOOR, cz);
      // The sitter model faces +Z; turn to face the table centre.
      s.root.rotation.y = Math.atan2(x - cx, z - cz);
      s.root.scale.setScalar(0.92 + r() * 0.12);
      group.add(s.root);
      sitters.push(s);
    }
    if (chess) place(group, chessSet, 1.6, x, topY, z, ry);
    else {
      for (const side of [-1, 1]) {
        const c2 = cup.clone();
        c2.scale.setScalar(0.6);
        c2.position.set(x + Math.sin(ry) * side * 3 + Math.cos(ry) * 2, topY, z + Math.cos(ry) * side * 3);
        group.add(c2);
      }
    }
  }

  // ------------------------------------------------------------------ lamps
  const lampPts: THREE.Vector3[] = [[0, 0], [-50, -24], [48, -26], [-54, 30], [52, 30], [0, -46]].map(([x, z]) => new THREE.Vector3(x, CEIL - 12, z));
  for (const p of lampPts) {
    const l = place(group, chandelier, 7, p.x, p.y, p.z, 0, { shadow: false });
    if (!l) continue;
    const cord = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.08, 0.08, 6, 4)), ironMat);
    cord.position.set(p.x, CEIL - 3, p.z);
    group.add(cord);
  }
  const bulbMat = assets.track(new THREE.MeshBasicMaterial({ color: 0xffd7a0 }));
  const bulbs = new THREE.InstancedMesh(assets.track(new THREE.SphereGeometry(0.9, 12, 8)), bulbMat, lampPts.length);
  lampPts.forEach((p, i) => bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y + 2.5, p.z)));
  group.add(bulbs);
  const lights = lampPts.slice(0, Math.max(2, ctx.quality.maxPointLights)).map((p, i) => {
    const l = new THREE.PointLight(0xffc489, i === 0 ? 260 : 190, 70, 2);
    l.position.set(p.x, p.y + 1, p.z);
    group.add(l);
    return l;
  });

  const lighting: RealmLighting = {
    environment: env,
    envIntensity: 0.55,
    envRotation: 0.8,
    // Key light: the lamp above the board.
    sunDir: new THREE.Vector3(0.25, 1, 0.35).normalize(),
    sunColor: 0xffd6a8,
    sunIntensity: 1.5,
    hemiIntensity: 0.2,
    exposure: 1.05,
    fog: null,
    bloom: { strength: 0.3, threshold: 1.4 },
    grade: { saturation: 1.04, contrast: 1.05, tint: 0.03, vignette: 0.3 },
  };

  return {
    group,
    lighting,
    boardStand: 'none',
    far: 1200,
    seatPolar: 1.04,
    menuPolar: 1.24,
    update(dt, time) {
      sitters.forEach(s => animateSitter(s, time));
      steam.update(dt, time);
      lights.forEach((l, i) => (l.intensity = (i === 0 ? 260 : 190) * (0.97 + Math.sin(time * 3 + i) * 0.03)));
    },
    onImpact() {
      // Patrons glance over at the captured piece.
      sitters.forEach(s => (s.phase += 0.6));
    },
    dispose() {
      assets.dispose();
    },
  };
}
