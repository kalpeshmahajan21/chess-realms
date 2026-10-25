import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AssetScope } from './assets.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * Grand Library. Scale: 1 unit = 10 cm. Board top at y = 0 on a walnut library table;
 * the floor is at y = -8 (table ≈ 78 cm). The room is 9 m square and 5.5 m high.
 */
const FLOOR = -8;
const HALF = 45; // half room width
const SHELF_TOP = FLOOR + 40; // bookcases are 4 m tall
const CEILING = FLOOR + 55;
const BAY = 9; // bookcase bay width
const SHELVES = 12;
const SHELF_GAP = 3.15;
const SHELF_DEPTH = 3.6;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BOOK_COLOURS = [0x5b1418, 0x6d1d1d, 0x2c3f2a, 0x1f3326, 0x1d2a44, 0x16213a, 0x4a2f1c, 0x3a2414, 0x231a14, 0x6b4a2a, 0x7d5a2e, 0x1a1a1c, 0x5a3a52, 0x8a6b3e];

/** Box placed at (x,y,z) with size (w,h,d), as a non-indexed geometry ready for merging. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, uvScale = 0.1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  // World-ish UVs so wood grain is continuous and not stretched.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const px = pos.getX(i) + x;
    const py = pos.getY(i) + y;
    const pz = pos.getZ(i) + z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, px * uvScale, pz * uvScale);
    else if (nx > 0.5) uv.setXY(i, pz * uvScale, py * uvScale);
    else uv.setXY(i, px * uvScale, py * uvScale);
  }
  g.translate(x, y, z);
  return g;
}

export async function createLibrary(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:library';
  const r = rng(42);

  const [env, parquet, walnut, darkWood, plaster, leather, wool, chandelier, armchair, clock, bust, encyclopedia, oilLamp, plant, sideTable, vase] = await Promise.all([
    assets.hdr('hdri/old_hall_1k.hdr'),
    assets.pbr('herringbone_parquet', [1, 1]),
    assets.pbr('european_walnut_veneer_04', [1, 1]),
    assets.pbr('dark_wood', [1, 1]),
    assets.pbr('plastered_wall_04', [1, 1]),
    assets.pbr('brown_leather', [1, 1]),
    assets.pbr('poly_wool_herringbone', [1, 1]),
    ...['Chandelier_01', 'ArmChair_01', 'vintage_grandfather_clock_01', 'marble_bust_01', 'book_encyclopedia_set_01', 'vintage_oil_lamp', 'potted_plant_02', 'side_table_tall_01', 'antique_ceramic_vase_01'].map(n =>
      assets.model(`models/${n}.glb`).catch(() => null)
    ),
  ]);

  // ------------------------------------------------------------------ materials
  const setRepeat = (set: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }, rx: number, ry = rx) => {
    for (const t of [set.map, set.normalMap, set.roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
    }
    return set;
  };
  const floorMat = assets.track(new THREE.MeshPhysicalMaterial({ ...setRepeat(parquet, 9), clearcoat: 0.12, clearcoatRoughness: 0.6, specularIntensity: 0.3, color: 0xb8a48c }));
  const caseMat = assets.track(new THREE.MeshStandardMaterial({ ...darkWood, color: 0x8a6a52, normalScale: new THREE.Vector2(0.6, 0.6) }));
  const backMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.85 }));
  const wallMat = assets.track(new THREE.MeshStandardMaterial({ ...setRepeat(plaster, 6, 2), color: 0xd8c3a2 }));
  const ceilMat = assets.track(new THREE.MeshStandardMaterial({ ...darkWood, color: 0x6e5240 }));
  // The walnut scan is raw veneer; the colour multiply stains it like a finished antique table.
  const tableMat = assets.track(new THREE.MeshPhysicalMaterial({ ...setRepeat(walnut, 1.2, 0.8), color: 0x6e4a33, clearcoat: 0.4, clearcoatRoughness: 0.42 }));
  const rugMat = assets.track(new THREE.MeshStandardMaterial({ ...setRepeat(wool, 6, 4), color: 0x7a2a26 }));
  const rugBorderMat = assets.track(new THREE.MeshStandardMaterial({ ...wool, color: 0x2a1c2a }));
  const goldMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xc89b45, metalness: 1, roughness: 0.32 }));

  // ------------------------------------------------------------------ floor, walls, ceiling
  const floor = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(HALF * 2, HALF * 2)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  group.add(floor);

  const upper = mergeGeometries([0, 1, 2, 3].map(i => {
    const g = new THREE.PlaneGeometry(HALF * 2, CEILING - SHELF_TOP);
    g.translate(0, (SHELF_TOP + CEILING) / 2, -HALF + 0.05);
    g.rotateY((i * Math.PI) / 2);
    return g;
  }))!;
  group.add(new THREE.Mesh(assets.track(upper), wallMat));

  // Coffered ceiling: panel + crossing beams.
  const ceilParts: THREE.BufferGeometry[] = [];
  const ceil = new THREE.PlaneGeometry(HALF * 2, HALF * 2).toNonIndexed();
  ceil.rotateX(Math.PI / 2);
  ceil.translate(0, CEILING, 0);
  ceilParts.push(ceil);
  for (let k = -HALF; k <= HALF; k += 15) {
    ceilParts.push(box(HALF * 2, 1.6, 1.2, 0, CEILING - 0.8, k));
    ceilParts.push(box(1.2, 1.6, HALF * 2, k, CEILING - 0.8, 0));
  }
  group.add(new THREE.Mesh(assets.track(mergeGeometries(ceilParts)!), ceilMat));

  // ------------------------------------------------------------------ bookcases (one merged mesh per material)
  const caseParts: THREE.BufferGeometry[] = [];
  const backParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];
  interface BookSlot { x: number; y: number; wall: number; }
  const books: { w: number; h: number; d: number; slot: BookSlot; tilt: number }[] = [];
  const wallLen = HALF * 2;
  const bays = Math.floor(wallLen / BAY);
  const start = -(bays * BAY) / 2;

  for (let wall = 0; wall < 4; wall++) {
    const parts: THREE.BufferGeometry[] = [];
    const z = -HALF + SHELF_DEPTH / 2;
    // plinth and cornice
    parts.push(box(wallLen, 2, SHELF_DEPTH + 0.6, 0, FLOOR + 1, z + 0.3));
    parts.push(box(wallLen, 1.4, SHELF_DEPTH + 1.4, 0, SHELF_TOP + 0.7, z + 0.7));
    parts.push(box(wallLen, 0.5, SHELF_DEPTH + 1.9, 0, SHELF_TOP + 1.6, z + 0.95));
    for (let b = 0; b <= bays; b++) {
      const x = start + b * BAY;
      parts.push(box(0.7, SHELF_TOP - FLOOR, SHELF_DEPTH + 0.3, x, (SHELF_TOP + FLOOR) / 2, z + 0.15));
      // fluted pilaster face
      parts.push(box(0.9, SHELF_TOP - FLOOR - 4, 0.25, x, (SHELF_TOP + FLOOR) / 2, z + SHELF_DEPTH / 2 + 0.3));
    }
    for (let s = 0; s <= SHELVES; s++) {
      const y = FLOOR + 2 + s * SHELF_GAP;
      if (y > SHELF_TOP - 0.5) break;
      parts.push(box(wallLen, 0.28, SHELF_DEPTH, 0, y, z));
      // Fill each bay of this shelf with books.
      if (s < SHELVES && y + SHELF_GAP < SHELF_TOP) {
        for (let b = 0; b < bays; b++) {
          let x = start + b * BAY + 0.55;
          const end = start + (b + 1) * BAY - 0.55;
          while (x < end) {
            const w = 0.22 + r() * 0.32;
            if (x + w > end) break;
            const h = 2.0 + r() * 0.85;
            const gap = r() < 0.06 ? 0.4 + r() * 0.8 : 0.01; // occasional gap
            const tilt = r() < 0.04 ? (r() - 0.5) * 0.35 : 0;
            books.push({ w, h, d: 2.2 + r() * 0.7, slot: { x: x + w / 2, y: y + 0.14 + h / 2, wall }, tilt });
            x += w + gap;
          }
        }
      }
    }
    backParts.push(box(wallLen, SHELF_TOP - FLOOR, 0.2, 0, (SHELF_TOP + FLOOR) / 2, -HALF + 0.1));
    const merged = mergeGeometries(parts)!;
    merged.rotateY((wall * Math.PI) / 2);
    caseParts.push(merged);
    parts.forEach(p => p.dispose());
  }
  backParts.forEach((g, i) => g.rotateY((i * Math.PI) / 2));
  const cases = new THREE.Mesh(assets.track(mergeGeometries(caseParts)!), caseMat);
  cases.receiveShadow = true;
  group.add(cases, new THREE.Mesh(assets.track(mergeGeometries(backParts)!), backMat));

  // Books: one instanced mesh for the leather bindings, one for the gilt bands on the spines.
  const bookGeo = assets.track(new THREE.BoxGeometry(1, 1, 1));
  const bookMat = assets.track(new THREE.MeshStandardMaterial({ normalMap: leather.normalMap, roughnessMap: leather.roughnessMap, roughness: 0.85, normalScale: new THREE.Vector2(0.8, 0.8) }));
  const count = books.length;
  const bookMesh = new THREE.InstancedMesh(bookGeo, bookMat, count);
  const bandGeo = assets.track(new THREE.BoxGeometry(1, 1, 1));
  const bandMesh = new THREE.InstancedMesh(bandGeo, goldMat, count * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  let bands = 0;
  books.forEach((bk, i) => {
    const wallRot = (bk.slot.wall * Math.PI) / 2;
    const depthZ = -HALF + 0.35 + bk.d / 2;
    p.set(bk.slot.x, bk.slot.y, depthZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), wallRot);
    e.set(0, wallRot, bk.tilt);
    q.setFromEuler(e);
    sc.set(bk.w, bk.h, bk.d);
    m.compose(p, q, sc);
    bookMesh.setMatrixAt(i, m);
    col.setHex(BOOK_COLOURS[Math.floor(r() * BOOK_COLOURS.length)]).offsetHSL(0, (r() - 0.5) * 0.1, (r() - 0.5) * 0.06);
    bookMesh.setColorAt(i, col);
    if (r() < 0.55 && bk.tilt === 0) {
      for (const f of [0.22, 0.78]) {
        p.set(bk.slot.x, bk.slot.y - bk.h / 2 + bk.h * f, depthZ + bk.d / 2 + 0.012).applyAxisAngle(new THREE.Vector3(0, 1, 0), wallRot);
        q.setFromEuler(new THREE.Euler(0, wallRot, 0));
        sc.set(bk.w * 0.96, 0.06, 0.02);
        m.compose(p, q, sc);
        bandMesh.setMatrixAt(bands++, m);
      }
    }
  });
  bandMesh.count = bands;
  bookMesh.receiveShadow = true;
  group.add(bookMesh, bandMesh);

  // ------------------------------------------------------------------ rug and library table
  const rugBorder = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(40, 30)), rugBorderMat);
  const rug = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(37, 27)), rugMat);
  [rugBorder, rug].forEach((mesh, i) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = FLOOR + 0.03 + i * 0.01;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  const tableTopY = -0.33;
  const tableParts: THREE.Mesh[] = [];
  const top = new THREE.Mesh(assets.track(new RoundedBoxGeometry(22, 0.9, 16, 3, 0.2)), tableMat);
  top.position.y = tableTopY - 0.45;
  tableParts.push(top);
  const apronY = tableTopY - 1.6;
  for (const [w, d, x, z] of [[20, 0.5, 0, 7.2], [20, 0.5, 0, -7.2], [0.5, 14, 9.7, 0], [0.5, 14, -9.7, 0]] as const) {
    const ap = new THREE.Mesh(assets.track(new THREE.BoxGeometry(w, 1.4, d)), tableMat);
    ap.position.set(x, apronY, z);
    tableParts.push(ap);
  }
  const legProfile = [[0, FLOOR], [0.9, FLOOR], [0.95, FLOOR + 0.4], [0.6, FLOOR + 0.8], [0.55, FLOOR + 2.5], [1.0, FLOOR + 3.6], [0.65, FLOOR + 4.8], [0.55, -3.2], [0.75, -2.6], [0.75, apronY - 0.7], [0, apronY - 0.7]].map(([x, y]) => new THREE.Vector2(x, y));
  const legGeo = assets.track(new THREE.LatheGeometry(legProfile, 24));
  for (const [x, z] of [[9.4, 6.9], [-9.4, 6.9], [9.4, -6.9], [-9.4, -6.9]]) {
    const leg = new THREE.Mesh(legGeo, tableMat);
    leg.position.set(x, 0, z);
    tableParts.push(leg);
  }
  tableParts.forEach(t => {
    t.castShadow = true;
    t.receiveShadow = true;
    group.add(t);
  });

  // ------------------------------------------------------------------ props
  const place = (obj: THREE.Object3D | null, height: number, x: number, y: number, z: number, ry = 0) => {
    if (!obj) return null;
    const o = obj.clone();
    const b = new THREE.Box3().setFromObject(o);
    const s = height / Math.max(b.max.y - b.min.y, 0.001);
    o.scale.setScalar(s);
    o.position.set(x, y - b.min.y * s, z);
    o.rotation.y = ry;
    group.add(o);
    return o;
  };
  place(armchair, 9.6, -17, FLOOR, 4, Math.PI / 2 - 0.35);
  place(armchair, 9.6, 17, FLOOR, 3, -Math.PI / 2 + 0.4);
  place(sideTable, 7.2, -18.5, FLOOR, -6, 0.3);
  place(vase, 3.2, -18.5, FLOOR + 7.2, -6, 0);
  place(clock, 21, 36, FLOOR, -38, -Math.PI / 4);
  place(plant, 13, -37, FLOOR, -37, 0.6);
  place(encyclopedia, 2.6, 8.4, tableTopY, -5.6, -0.25);
  place(oilLamp, 4.6, -9, tableTopY, 6, 0.4);
  // Marble bust on a column in the far corner.
  const pedestal = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(2, 2.3, 12, 32)), tableMat);
  pedestal.position.set(-36, FLOOR + 6, 36 - 70);
  pedestal.castShadow = true;
  group.add(pedestal);
  place(bust, 7, -36, FLOOR + 12, -34, Math.PI / 4);

  const lights: THREE.PointLight[] = [];
  const chand = place(chandelier, 12, 0, CEILING - 15, 0, 0);
  if (chand) {
    const light = new THREE.PointLight(0xffc488, 900, 70, 2);
    light.position.set(0, CEILING - 12, 0);
    lights.push(light);
  }
  if (oilLamp) {
    const lampLight = new THREE.PointLight(0xffb070, 30, 16, 2);
    lampLight.position.set(-9, tableTopY + 3.4, 6);
    lights.push(lampLight);
  }
  // Wall sconces between bays: emissive only (cheap), plus two real lights for warmth on the shelves.
  const sconceMat = assets.track(new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  const sconceGeo = assets.track(new THREE.SphereGeometry(0.45, 12, 8));
  const sconces = new THREE.InstancedMesh(sconceGeo, sconceMat, 16);
  for (let i = 0; i < 16; i++) {
    const wall = i % 4;
    const x = ((Math.floor(i / 4) - 1.5) / 1.5) * 27;
    p.set(x, SHELF_TOP + 6, -HALF + 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), (wall * Math.PI) / 2);
    m.makeTranslation(p.x, p.y, p.z);
    sconces.setMatrixAt(i, m);
  }
  group.add(sconces);
  for (const [x, z] of [[-30, -HALF + 6], [30, HALF - 6]]) {
    const l = new THREE.PointLight(0xffc27a, 260, 45, 2);
    l.position.set(x, SHELF_TOP + 4, z);
    lights.push(l);
  }
  lights.slice(0, Math.max(2, ctx.quality.maxPointLights)).forEach(l => group.add(l));

  // Flickering lamp flame.
  let t = 0;
  const lighting: RealmLighting = {
    environment: env,
    envIntensity: 0.55,
    envRotation: 0,
    sunDir: new THREE.Vector3(-0.45, 1, 0.55).normalize(),
    sunColor: 0xfff1e2,
    sunIntensity: 1.7,
    hemiIntensity: 0.25,
    exposure: 1.05,
    fog: { color: 0x221e1a, density: 0.0035 },
    bloom: { strength: 0.3, threshold: 1.8 },
    grade: { saturation: 0.98, contrast: 1.06, tint: 0.015, vignette: 0.3 },
  };

  return {
    group,
    lighting,
    boardStand: 'none',
    far: 400,
    seatPolar: 1.02,
    menuPolar: 1.18,
    update(dt) {
      t += dt;
      if (lights[1]) lights[1].intensity = 30 + Math.sin(t * 13) * 2 + Math.sin(t * 7.3) * 1.5;
    },
    dispose() {
      assets.dispose();
    },
  };
}
