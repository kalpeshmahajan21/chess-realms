import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AssetScope, findSunDirection } from './assets.ts';
import { box, place, rng, SkyDome, tiled, worldUV } from './kit.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * Palace Courtyard — a Rajput palace (Jaipur / Amer style) built in 3D around the board.
 * Red sandstone arcades with cusped arches on all four sides, a tall main palace front with a white
 * marble onion dome and minarets, rooftop chhatris, and a char-bagh of water channels meeting at the
 * marble platform where the board stands.
 *
 * 1 unit = 10 cm. Board top y = 0, courtyard floor y = -8.
 */
const FLOOR = -8;
const HALF = 115; // courtyard half-width (11.5 m)
const BAY = 26; // arcade bay width
const G_H = 46; // ground-floor storey height
const U_H = 38; // upper storey height
const DEPTH = 24; // gallery depth behind the arches
const PW = 70; // great arch (pishtaq) block width
const PH = 150; // and height

/** Cusped (multifoil) pointed arch opening, as a hole path. Bottom-centre at (cx, 0). */
function archPath(cx: number, w: number, spring: number, rise: number, foils = 7, foilDepth = 0.9): THREE.Path {
  const p = new THREE.Path();
  const N = 64;
  p.moveTo(cx - w / 2, 0);
  for (let i = 0; i <= N; i++) {
    const s = i / N; // 0 → 1 over the whole arch
    const phi = s * Math.PI; // π..0 mapped left → right
    const side = Math.cos(phi); // 1 → -1
    const x = -Math.sign(side) * Math.pow(Math.abs(side), 1.25) * (w / 2);
    const y = spring + rise * Math.pow(Math.sin(phi), 0.85);
    // Pull points in toward the arch centre between the foils.
    const scallop = foilDepth * Math.abs(Math.sin(s * foils * Math.PI));
    const dx = -x;
    const dy = spring - y;
    const len = Math.hypot(dx, dy) || 1;
    p.lineTo(cx + x + (dx / len) * scallop * 0.6, y + (dy / len) * scallop);
  }
  p.lineTo(cx + w / 2, 0);
  p.lineTo(cx - w / 2, 0);
  return p;
}

/** A wall panel `length` wide and `height` tall with a row of cusped arches, extruded `thick`. Built in local XY, facing +Z. */
function arcadeWall(x0: number, x1: number, height: number, thick: number, bay: number, archW: number, spring: number, rise: number, linings?: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(x0, 0);
  shape.lineTo(x1, 0);
  shape.lineTo(x1, height);
  shape.lineTo(x0, height);
  shape.lineTo(x0, 0);
  const n = Math.max(1, Math.floor((x1 - x0) / bay));
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + step * (i + 0.5);
    shape.holes.push(archPath(cx, archW, spring, rise));
    if (linings) {
      // White marble lining framing the cusped opening.
      const ring = new THREE.Shape(archPath(cx, archW + 2.6, spring, rise + 1.6, 7, 0).getPoints());
      ring.holes.push(archPath(cx, archW, spring, rise));
      const lg = new THREE.ExtrudeGeometry(ring, { depth: 0.5, bevelEnabled: false, curveSegments: 1 });
      lg.translate(0, 0, thick / 2);
      linings.push(lg.toNonIndexed());
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -thick / 2);
  return g.toNonIndexed();
}

/** Onion dome profile for LatheGeometry: radius r, height h, sitting on y = 0. */
function onionProfile(r: number, h: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Bulges past the drum, then sweeps in to a point.
    const rad = r * (t < 0.55 ? 1 + 0.18 * Math.sin((t / 0.55) * Math.PI * 0.9) : Math.pow(Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5), 1.4) * 1.12);
    pts.push(new THREE.Vector2(Math.max(rad, 0.001), t * h));
  }
  return pts;
}

export async function createPalace(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:palace';
  const r = rng(17);

  const [env, sky, sandWall, paving, mosaic, marble, lantern, pot, vase, elephant, plant] = await Promise.all([
    assets.hdr('hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr'),
    assets.texture('photo/kloofendal_48d_partly_cloudy_puresky_4k.jpg'),
    assets.pbr('red_sandstone_wall'),
    assets.pbr('red_sandstone_pavement'),
    assets.pbr('marble_mosaic_tiles'),
    assets.pbr('marble_01'),
    ...['brass_diya_lantern', 'brass_pot_01', 'brass_vase_03', 'carved_wooden_elephant', 'potted_plant_02'].map(n => assets.model(`models/${n}.glb`).catch(() => null)),
  ]);

  const rotation = 0.6;
  const dome = new SkyDome(sky, 1400, rotation);
  group.add(dome.mesh);

  // ------------------------------------------------------------------ materials
  // World-UV geometry uses 0.1 UV/unit → one texture tile per metre, then the repeat scales it.
  const sandMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, sandWall, 1.1), color: 0xe0967a, roughness: 1 }));
  const sandDark = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, sandWall, 1.1), color: 0x6a3a2c, roughness: 1 }));
  const paveMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, paving, 0.6), color: 0xd9a080 }));
  const marbleMat = assets.track(new THREE.MeshPhysicalMaterial({ ...tiled(assets, marble, 0.4), color: 0xf4efe6, roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.3 }));
  const inlayMat = assets.track(new THREE.MeshPhysicalMaterial({ ...tiled(assets, mosaic, 0.5), color: 0xf2ece2, clearcoat: 0.4, clearcoatRoughness: 0.25 }));
  const goldMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xd4a648, metalness: 1, roughness: 0.28 }));
  const shadeMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x2a1610, roughness: 1 }));

  const sandParts: THREE.BufferGeometry[] = [];
  const darkParts: THREE.BufferGeometry[] = [];
  const marbleParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];
  const shadeParts: THREE.BufferGeometry[] = [];
  const atWall = (g: THREE.BufferGeometry, wall: number, offset: number) => {
    // Local +Z faces the courtyard. Wall 0 is the far (-Z) side, then clockwise.
    g.translate(0, 0, -offset);
    g.rotateY((wall * Math.PI) / 2);
    return g;
  };

  // ------------------------------------------------------------------ courtyard floor + char-bagh
  const floor = new THREE.Mesh(assets.track(worldUV(new THREE.PlaneGeometry(HALF * 2 + DEPTH * 2, HALF * 2 + DEPTH * 2).rotateX(-Math.PI / 2).translate(0, FLOOR, 0))), paveMat);
  floor.receiveShadow = true;
  group.add(floor);

  // Raised marble platform (chabutra) with two steps; the board's table stands on it.
  const PLAT = 19;
  for (const [s, h] of [[PLAT + 3, 0.8], [PLAT, 1.6]] as const) marbleParts.push(box(s * 2, h, s * 2, 0, FLOOR + h / 2, 0));
  const platTop = FLOOR + 1.6;
  const inlay = new THREE.Mesh(assets.track(worldUV(new THREE.PlaneGeometry(PLAT * 2 - 3, PLAT * 2 - 3).rotateX(-Math.PI / 2).translate(0, platTop + 0.02, 0))), inlayMat);
  inlay.receiveShadow = true;
  group.add(inlay);

  // Four water channels running from the platform to the arcades, with marble kerbs and fountain jets.
  const CH_W = 9;
  const waterPlanes: { geo: THREE.PlaneGeometry; x: number; z: number; ry: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const len = HALF - PLAT - 10;
    const mid = PLAT + 3 + len / 2;
    // kerbs
    const kerbL = box(1.2, 1.4, len, -(CH_W / 2 + 0.6), FLOOR + 0.7, -mid);
    const kerbR = box(1.2, 1.4, len, CH_W / 2 + 0.6, FLOOR + 0.7, -mid);
    const end = box(CH_W + 2.4, 1.4, 1.2, 0, FLOOR + 0.7, -(mid + len / 2));
    for (const g of [kerbL, kerbR, end]) {
      g.rotateY((k * Math.PI) / 2);
      marbleParts.push(g);
    }
    const bed = box(CH_W, 0.2, len, 0, FLOOR - 0.1, -mid);
    bed.rotateY((k * Math.PI) / 2);
    shadeParts.push(bed);
    waterPlanes.push({ geo: new THREE.PlaneGeometry(CH_W, len), x: Math.sin((k * Math.PI) / 2) * -mid, z: Math.cos((k * Math.PI) / 2) * -mid, ry: (k * Math.PI) / 2 });
  }
  // Water: glossy surface that mirrors the sky.
  const waterMat = assets.track(new THREE.MeshPhysicalMaterial({ color: 0x0d2a2c, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }));
  waterPlanes.forEach(w => {
    const mesh = new THREE.Mesh(assets.track(w.geo), waterMat);
    mesh.rotation.set(-Math.PI / 2, 0, w.ry);
    mesh.position.set(w.x, FLOOR + 0.9, w.z);
    group.add(mesh);
  });
  // Fountain jets: thin translucent streams along each channel.
  const jetMat = assets.track(new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.22, depthWrite: false }));
  const jetGeo = assets.track(new THREE.CylinderGeometry(0.05, 0.35, 2.4, 8, 1, true).translate(0, 1.2, 0));
  const jets = new THREE.InstancedMesh(jetGeo, jetMat, 24);
  let ji = 0;
  const jm = new THREE.Matrix4();
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j < 6; j++) {
      const d = PLAT + 12 + j * 13;
      const a = (k * Math.PI) / 2;
      jm.makeTranslation(Math.sin(a) * -d, FLOOR + 0.9, Math.cos(a) * -d);
      jets.setMatrixAt(ji++, jm);
    }
  }
  group.add(jets);

  // ------------------------------------------------------------------ arcades on all four sides
  const LEN = HALF * 2 + DEPTH * 2;
  const spanLen = HALF * 2; // arched part
  for (let wall = 0; wall < 4; wall++) {
    const main = wall === 0; // far side gets the tall palace front
    // Ground-floor arcade front (the main side leaves the centre for the great arch).
    const ranges: [number, number][] = main ? [[-spanLen / 2, -PW / 2], [PW / 2, spanLen / 2]] : [[-spanLen / 2, spanLen / 2]];
    for (const [x0, x1] of ranges) {
      const lin: THREE.BufferGeometry[] = [];
      sandParts.push(atWall(arcadeWall(x0, x1, G_H, 3.2, BAY, 17, 22, 16, lin).translate(0, FLOOR, 0), wall, HALF));
      lin.forEach(g => marbleParts.push(atWall(g.translate(0, FLOOR, 0), wall, HALF)));
    }
    // Arch outline in marble: thin inner frame strips at springing and base.
    marbleParts.push(atWall(box(spanLen, 1.6, 4, 0, FLOOR + 0.8, 0), wall, HALF));
    marbleParts.push(atWall(box(spanLen + 4, 1.4, 5, 0, FLOOR + G_H - 0.7, 0), wall, HALF - 0.6));
    // Chhajja (sloped eave) above ground floor, with brackets.
    const eave = box(spanLen + 6, 0.8, 7, 0, 0, 0);
    eave.rotateX(0.28);
    eave.translate(0, FLOOR + G_H + 1.4, 0);
    sandParts.push(atWall(eave, wall, HALF - 3.2));
    // Gallery: back wall with doorways, floor, ceiling and side returns.
    darkParts.push(atWall(box(LEN, G_H, 1, 0, FLOOR + G_H / 2, 0), wall, HALF + DEPTH));
    shadeParts.push(atWall(box(LEN, 0.6, DEPTH, 0, FLOOR + G_H - 0.3, 0), wall, HALF + DEPTH / 2));
    const nDoors = Math.floor(spanLen / (BAY * 2));
    for (let d = 0; d < nDoors; d++) {
      const x = -((nDoors - 1) * BAY * 2) / 2 + d * BAY * 2;
      shadeParts.push(atWall(box(9, 20, 0.4, x, FLOOR + 10, 0), wall, HALF + DEPTH - 0.8));
    }
    // Upper storey: smaller arches over a balustrade.
    const upY = FLOOR + G_H + 2.5;
    for (const [x0, x1] of ranges) {
      const lin: THREE.BufferGeometry[] = [];
      sandParts.push(atWall(arcadeWall(x0, x1, U_H, 2.6, BAY / 2, 8.5, 15, 10, lin).translate(0, upY, 0), wall, HALF + 2));
      lin.forEach(g => marbleParts.push(atWall(g.translate(0, upY, 0), wall, HALF + 2)));
    }
    darkParts.push(atWall(box(LEN, U_H, 1, 0, upY + U_H / 2, 0), wall, HALF + 14));
    shadeParts.push(atWall(box(LEN, 0.6, 12, 0, upY + U_H - 0.3, 0), wall, HALF + 8));
    marbleParts.push(atWall(box(spanLen, 4, 1.4, 0, upY + 2, 0), wall, HALF + 0.6)); // jali balustrade
    // Cornice + kangura crenellations.
    const topY = upY + U_H;
    marbleParts.push(atWall(box(spanLen + 6, 1.2, 6, 0, topY + 0.6, 0), wall, HALF + 1));
    sandParts.push(atWall(box(spanLen + 4, 3, 3, 0, topY + 2.7, 0), wall, HALF + 1));
    for (let x = -spanLen / 2 + 2; x <= spanLen / 2 - 2; x += 4.5) {
      const merlon = box(2.4, 2.6, 2.6, x, topY + 5.5, 0);
      sandParts.push(atWall(merlon, wall, HALF + 1));
    }
    // Roof slab behind the parapet.
    sandParts.push(atWall(box(spanLen + 30, 2, DEPTH + 8, 0, topY - 0.2, 0), wall, HALF + 6 + DEPTH / 2));
    // Jharokha balconies on the side wings: a projecting bay on a stepped corbel with a curved bangaldar roof.
    if (!main) {
      for (const x of [-52, 52]) {
        const jy = upY;
        sandParts.push(atWall(box(16, 2, 7, x, jy - 1, 3.5), wall, HALF));
        sandParts.push(atWall(box(12, 2, 5, x, jy - 3, 2.5), wall, HALF));
        sandParts.push(atWall(box(7, 2, 3, x, jy - 5, 1.5), wall, HALF));
        const lin: THREE.BufferGeometry[] = [];
        const front = arcadeWall(x - 8, x + 8, 18, 1.2, 5.3, 3.4, 8, 3.5, lin);
        sandParts.push(atWall(front.translate(0, jy, 7), wall, HALF));
        lin.forEach(g => marbleParts.push(atWall(g.translate(0, jy, 7), wall, HALF)));
        for (const sx2 of [-1, 1]) sandParts.push(atWall(box(1.2, 18, 7, x + sx2 * 7.4, jy + 9, 3.5), wall, HALF));
        darkParts.push(atWall(box(15, 18, 0.5, x, jy + 9, 0.6), wall, HALF));
        marbleParts.push(atWall(box(17, 1, 8, x, jy + 18.5, 3.5), wall, HALF));
        const roof = new THREE.CylinderGeometry(4.2, 4.2, 18, 24).toNonIndexed();
        roof.rotateZ(Math.PI / 2);
        roof.scale(1, 0.55, 1);
        roof.translate(x, jy + 19, 3.5);
        marbleParts.push(atWall(roof, wall, HALF));
        goldParts.push(atWall(new THREE.CylinderGeometry(0.1, 0.3, 3, 8).toNonIndexed().translate(x, jy + 22.5, 3.5), wall, HALF));
      }
    }
  }
  // Corner piers that close the arcades.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sandParts.push(box(DEPTH + 10, G_H + U_H + 6, DEPTH + 10, sx * (HALF + DEPTH / 2 + 3), FLOOR + (G_H + U_H + 6) / 2, sz * (HALF + DEPTH / 2 + 3)));
  }

  // ------------------------------------------------------------------ main palace front (far side)
  const MAIN_Z = -(HALF + 3);
  // Great arch lining.
  {
    const ring = new THREE.Shape(archPath(0, 38, 60, 37, 9, 0).getPoints());
    ring.holes.push(archPath(0, 34, 60, 34, 9, 1.6));
    marbleParts.push(new THREE.ExtrudeGeometry(ring, { depth: 0.6, bevelEnabled: false, curveSegments: 1 }).toNonIndexed().translate(0, FLOOR, -HALF + 3));
  }
  const baseTop = FLOOR + G_H + U_H + 2.5;
  // Raised central block with a great pishtaq arch.
  const pish = new THREE.Shape();
  pish.moveTo(-PW / 2, 0); pish.lineTo(PW / 2, 0); pish.lineTo(PW / 2, PH); pish.lineTo(-PW / 2, PH); pish.lineTo(-PW / 2, 0);
  pish.holes.push(archPath(0, 34, 60, 34, 9, 1.6));
  const pishGeo = new THREE.ExtrudeGeometry(pish, { depth: 6, bevelEnabled: false, curveSegments: 1 }).toNonIndexed();
  pishGeo.translate(0, FLOOR, -HALF - 3);
  sandParts.push(pishGeo);
  // marble frame around the pishtaq
  marbleParts.push(box(PW + 2, 2, 8, 0, FLOOR + PH, MAIN_Z));
  for (const x of [-PW / 2, PW / 2]) marbleParts.push(box(3, PH, 8, x, FLOOR + PH / 2, MAIN_Z));
  marbleParts.push(box(42, 2, 7.5, 0, FLOOR + 98, MAIN_Z));
  // Alfiz frame, a row of small windows and a crenellated crown on the great arch block.
  marbleParts.push(box(46, 1.6, 7.2, 0, FLOOR + 102, -HALF + 0.4));
  for (const x of [-23, 23]) marbleParts.push(box(1.6, 102, 7.2, x, FLOOR + 51, -HALF + 0.4));
  for (let i = -2; i <= 2; i++) {
    const lin: THREE.BufferGeometry[] = [];
    // Small blind arches (dark-backed) across the upper façade.
    const w = arcadeWall(i * 12 - 5, i * 12 + 5, 16, 0.2, 10, 4.5, 6, 3.5, lin);
    w.dispose();
    lin.forEach(g => marbleParts.push(g.translate(0, FLOOR + 118, -HALF + 3)));
    shadeParts.push(box(4.6, 9.5, 0.3, i * 12, FLOOR + 122.7, -HALF + 3.1));
  }
  for (let x = -PW / 2 + 2; x <= PW / 2 - 2; x += 4.5) sandParts.push(box(2.4, 2.6, 2.6, x, FLOOR + PH + 1.3, -HALF + 1.5));
  // Recess behind the great arch: dark, with a doorway and upper windows.
  darkParts.push(box(40, 100, 1, 0, FLOOR + 50, MAIN_Z - 21.5));
  for (const [x, y, w, h] of [[0, 12, 12, 24], [-10, 50, 6, 12], [10, 50, 6, 12], [0, 70, 8, 14]] as const) shadeParts.push(box(w, h, 0.4, x, FLOOR + y, MAIN_Z - 21.4));
  for (const sx of [-1, 1]) darkParts.push(box(1, 100, 20, sx * 20, FLOOR + 50, MAIN_Z - 12));
  // Block behind the façade that carries the dome.
  sandParts.push(box(PW + 30, PH - 10, 56, 0, FLOOR + (PH - 10) / 2, MAIN_Z - 50));
  shadeParts.push(box(38, 1, 24, 0, FLOOR + 95, MAIN_Z - 10)); // recess ceiling
  // Drum + onion dome + brass finial.
  const domeBase = FLOOR + PH;
  marbleParts.push(new THREE.CylinderGeometry(24, 24, 12, 48, 1).toNonIndexed().translate(0, domeBase + 6, MAIN_Z - 50));
  marbleParts.push(new THREE.LatheGeometry(onionProfile(24, 58), 64).toNonIndexed().translate(0, domeBase + 12, MAIN_Z - 50));
  goldParts.push(new THREE.LatheGeometry([[0, 0], [1.4, 0], [1.6, 1.5], [0.6, 3], [1.4, 5], [0.4, 7], [0.2, 14], [0, 14]].map(([x, y]) => new THREE.Vector2(x, y)), 16).toNonIndexed().translate(0, domeBase + 69, MAIN_Z - 50));
  // Minarets either side of the main block.
  const chhatri = (x: number, y: number, z: number, s: number) => {
    sandParts.push(box(12 * s, 1.2 * s, 12 * s, x, y + 0.6 * s, z));
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) sandParts.push(new THREE.CylinderGeometry(0.6 * s, 0.7 * s, 9 * s, 8).toNonIndexed().translate(x + cx * 4.6 * s, y + 5.7 * s, z + cz * 4.6 * s));
    sandParts.push(box(13 * s, 1.2 * s, 13 * s, x, y + 10.6 * s, z));
    marbleParts.push(new THREE.LatheGeometry(onionProfile(5.6 * s, 10 * s), 32).toNonIndexed().translate(x, y + 11.2 * s, z));
    goldParts.push(new THREE.CylinderGeometry(0.05 * s, 0.4 * s, 4 * s, 8).toNonIndexed().translate(x, y + 23 * s, z));
  };
  for (const sx of [-1, 1]) {
    const x = sx * (PW / 2 + 16);
    const z = MAIN_Z - 12;
    const segs: [number, number, number][] = [[7, 0, 70], [6, 70, 130], [5, 130, 175]];
    for (const [rad, y0, y1] of segs) {
      sandParts.push(new THREE.CylinderGeometry(rad, rad + 0.4, y1 - y0, 12).toNonIndexed().translate(x, FLOOR + (y0 + y1) / 2, z));
      marbleParts.push(new THREE.CylinderGeometry(rad + 2.6, rad + 0.6, 2.4, 12).toNonIndexed().translate(x, FLOOR + y1, z));
    }
    chhatri(x, FLOOR + 176, z, 0.95);
  }
  // Chhatris on the corners of the side arcades.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chhatri(sx * (HALF + 5), baseTop + 6, sz * (HALF + 5), 1.25);
  // A row of small chhatris along the side roofs.
  for (const sx of [-1, 1]) for (const z of [-50, 0, 50]) chhatri(sx * (HALF + 12), baseTop + 5, z, 0.8);

  // ------------------------------------------------------------------ merge + add
  const addMerged = (parts: THREE.BufferGeometry[], mat: THREE.Material, castShadow = false) => {
    const geos = parts.map(g => (g.index ? g.toNonIndexed() : g));
    geos.forEach(g => {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      worldUV(g);
    });
    const merged = mergeGeometries(geos);
    parts.forEach(g => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(assets.track(merged), mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addMerged(sandParts, sandMat);
  addMerged(darkParts, sandDark);
  addMerged(marbleParts, marbleMat, true);
  addMerged(goldParts, goldMat);
  addMerged(shadeParts, shadeMat);

  // ------------------------------------------------------------------ the board's marble table
  const tableMat = assets.track(new THREE.MeshPhysicalMaterial({ ...tiled(assets, marble, 1), color: 0xf1ebe0, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.3 }));
  const top = new THREE.Mesh(assets.track(new RoundedBoxGeometry(13.6, 0.7, 13.6, 3, 0.18)), tableMat);
  top.position.y = -0.33 - 0.35;
  const profile = [
    [0, platTop], [4.4, platTop], [4.4, platTop + 0.5], [3.6, platTop + 0.9], [2.4, platTop + 1.6],
    [1.7, -3.6], [2.2, -2.9], [1.6, -2.4], [2.4, -1.8], [3.6, -1.3], [4.4, -1.03], [0, -1.03],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const column = new THREE.Mesh(assets.track(new THREE.LatheGeometry(profile, 48)), tableMat);
  [top, column].forEach(m => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });

  // ------------------------------------------------------------------ props
  // Stone elephants guarding the platform (the carved wooden elephant, re-skinned in sandstone).
  if (elephant) {
    elephant.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = marbleMat;
    });
    for (const sx of [-1, 1]) place(group, elephant, 10, sx * 26, platTop, -24, sx > 0 ? -Math.PI / 2 - 0.5 : Math.PI / 2 + 0.5);
  }
  for (const x of [-24, 24]) place(group, pot, 4.5, x, platTop, 24, r() * 6);
  // Potted plants along the arcades, vases on the platform corners.
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    for (const s of [-1, 1]) place(group, plant, 12, i * BAY, FLOOR, s * (HALF - 9), r() * 6);
  }
  for (const [x, z] of [[-PLAT + 2, PLAT - 2], [PLAT - 2, PLAT - 2]] as const) place(group, vase, 5, x, platTop, z, r() * 6);
  // Hanging brass lanterns in the arcade arches.
  const lanterns: THREE.Vector3[] = [];
  if (lantern) {
    for (let wall = 0; wall < 4; wall++) {
      for (let i = -3; i <= 3; i += 2) {
        const p = new THREE.Vector3(i * BAY, FLOOR + 30, -(HALF + 3)).applyAxisAngle(new THREE.Vector3(0, 1, 0), (wall * Math.PI) / 2);
        const o = place(group, lantern, 5, p.x, p.y, p.z, r() * 6, { shadow: false });
        if (o) lanterns.push(p);
        // chain
        const chain = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.06, 0.06, G_H - 31, 4)), goldMat);
        chain.position.set(p.x, FLOOR + 30 + 5 + (G_H - 35) / 2, p.z);
        group.add(chain);
      }
    }
  }
  const glowMat = assets.track(new THREE.MeshBasicMaterial({ color: 0xffc070 }));
  const glows = new THREE.InstancedMesh(assets.track(new THREE.SphereGeometry(0.7, 10, 8)), glowMat, lanterns.length);
  lanterns.forEach((p, i) => glows.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y + 2, p.z)));
  group.add(glows);

  // Pigeons circling high over the courtyard.
  const birdGeo = assets.track(new THREE.BufferGeometry());
  birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1.2, 0, 0, 0, 0, 0.5, 0, 0.1, -0.3, 1.2, 0, 0, 0, 0, 0.5, 0, 0.1, -0.3]), 3));
  birdGeo.computeVertexNormals();
  const birdMat = assets.track(new THREE.MeshBasicMaterial({ color: 0x3a3436, side: THREE.DoubleSide }));
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, 9);
  birds.frustumCulled = false;
  group.add(birds);
  const birdPhase = Array.from({ length: 9 }, () => ({ a: r() * Math.PI * 2, rad: 60 + r() * 60, y: 140 + r() * 60, sp: 0.12 + r() * 0.08 }));

  const sunDir = findSunDirection(env).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  const lighting: RealmLighting = {
    environment: env,
    envIntensity: 0.9,
    envRotation: rotation,
    sunDir,
    sunColor: 0xfff0dc,
    sunIntensity: 2.8,
    hemiIntensity: 0.15,
    exposure: 1,
    fog: { color: 0xc9d6e2, density: 0.0007 },
    bloom: { strength: 0.12, threshold: 6 },
    grade: { saturation: 1.04, contrast: 1.04, tint: 0.02, vignette: 0.2 },
  };
  dome.setExposure(lighting.exposure);

  const bm = new THREE.Matrix4();
  const bq = new THREE.Quaternion();
  const bs = new THREE.Vector3(2, 2, 2);
  const bp = new THREE.Vector3();
  const be = new THREE.Euler();
  return {
    group,
    lighting,
    boardStand: 'none',
    far: 3000,
    seatPolar: 1.08,
    menuPolar: 1.32,
    update(dt, time) {
      birdPhase.forEach((b, i) => {
        b.a += b.sp * dt;
        bp.set(Math.cos(b.a) * b.rad, b.y + Math.sin(time * 0.5 + i) * 6, Math.sin(b.a) * b.rad);
        bq.setFromEuler(be.set(Math.sin(time * 9 + i) * 0.5, -b.a, 0));
        bm.compose(bp, bq, bs);
        birds.setMatrixAt(i, bm);
      });
      birds.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      dome.dispose();
      assets.dispose();
    },
  };
}
