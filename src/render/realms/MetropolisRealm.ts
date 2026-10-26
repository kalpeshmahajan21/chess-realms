import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AssetScope } from './assets.ts';
import { box, glowTexture, place, rng, tiled, worldUV } from './kit.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * Metropolis Night — a rooftop helipad high above a New York–style city at night.
 * Hundreds of procedurally lit skyscrapers surround the roof (Empire State and Chrysler-style landmarks
 * among them); a helicopter circles with blinking lights and a sweeping searchlight.
 *
 * 1 unit = 10 cm. Board top y = 0, roof deck y = ROOF, street level y = STREET.
 */
const ROOF = -8;
const STREET = ROOF - 1900; // ≈ 190 m tower
const PAD = 120; // roof half-size

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    // Light-polluted horizon: warm sodium glow fading into deep navy.
    vec3 zenith = vec3(0.012, 0.018, 0.05);
    vec3 mid = vec3(0.05, 0.06, 0.13);
    vec3 horizon = vec3(0.32, 0.2, 0.2);
    vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.18, y));
    col = mix(col, zenith, smoothstep(0.18, 0.75, y));
    // A few stars that survive the city glow.
    vec3 q = floor(d * 420.0);
    float s = step(0.9975, h(q)) * smoothstep(0.15, 0.5, y);
    col += vec3(0.9, 0.92, 1.0) * s * (0.5 + 0.5 * sin(uTime * 2.0 + h(q + 1.0) * 30.0));
    // Moon.
    vec3 moonDir = normalize(vec3(-0.45, 0.42, -0.78));
    float m = dot(d, moonDir);
    col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.99975, m) * 3.0;
    col += vec3(0.5, 0.55, 0.7) * pow(max(m, 0.0), 400.0) * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Patch a standard material so instanced boxes get lit / dark office windows in world space. */
function windowMaterial(base: THREE.MeshStandardMaterial, opts: { litRatio: number; floorH: number; bayW: number }) {
  base.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying float vSeed;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vec4 wpW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWNorm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #else
          vec4 wpW = modelMatrix * vec4(transformed, 1.0);
          vWNorm = normalize(mat3(modelMatrix) * objectNormal);
          vSeed = 0.37;
        #endif
        vWPos = wpW.xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying float vSeed;\nfloat wh(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 n = normalize(vWNorm);
          if (abs(n.y) < 0.5) {
            float u = abs(n.x) > 0.5 ? vWPos.z : vWPos.x;
            vec2 cell = vec2(u / ${opts.bayW.toFixed(1)}, vWPos.y / ${opts.floorH.toFixed(1)});
            vec2 id = floor(cell);
            vec2 f = fract(cell);
            float win = step(0.12, f.x) * step(f.x, 0.88) * step(0.18, f.y) * step(f.y, 0.86);
            float r = wh(id + vSeed * 97.0);
            // Whole floors tend to be lit together (office floors, apartments).
            float floorLit = wh(vec2(id.y, vSeed * 13.0));
            float lit = step(1.0 - ${opts.litRatio.toFixed(2)} * (0.4 + floorLit * 1.2), r);
            vec3 warm = mix(vec3(1.0, 0.62, 0.28), vec3(0.7, 0.82, 1.0), step(0.78, wh(id * 1.7 + vSeed)));
            float bright = 0.6 + 0.8 * wh(id + 3.1);
            totalEmissiveRadiance += warm * win * lit * bright * 0.75;
            // Unlit glass is darker and glossier than the mullions.
            diffuseColor.rgb *= mix(1.0, 0.25, win) * mix(1.0, 0.2, win * lit);
          }
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          vec3 n2 = normalize(vWNorm);
          if (abs(n2.y) < 0.5) {
            float u2 = abs(n2.x) > 0.5 ? vWPos.z : vWPos.x;
            vec2 f2 = fract(vec2(u2 / ${opts.bayW.toFixed(1)}, vWPos.y / ${opts.floorH.toFixed(1)}));
            float w2 = step(0.12, f2.x) * step(f2.x, 0.88) * step(0.18, f2.y) * step(f2.y, 0.86);
            roughnessFactor = mix(roughnessFactor, 0.12, w2);
          }
        }`
      );
  };
  base.customProgramCacheKey = () => `city-windows-${opts.litRatio}-${opts.floorH}-${opts.bayW}`;
  return base;
}

export async function createMetropolis(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:metropolis';
  const r = rng(1919);

  const [env, deckTex, parapetTex, facadeTex, granite, aircon, secLight] = await Promise.all([
    assets.hdr('hdri/rooftop_night_1k.hdr'),
    assets.pbr('anti_slip_concrete'),
    assets.pbr('concrete_wall_008'),
    assets.pbr('rectangular_facade_tiles'),
    assets.pbr('granite_tile'),
    ...['exterior_aircon_unit', 'security_light'].map(n => assets.model(`models/${n}.glb`).catch(() => null)),
  ]);

  // ------------------------------------------------------------------ night sky
  const skyMat = assets.track(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SKY_FRAG,
  }));
  const sky = new THREE.Mesh(assets.track(new THREE.SphereGeometry(9000, 48, 24)), skyMat);
  sky.renderOrder = -20;
  sky.frustumCulled = false;
  group.add(sky);

  // ------------------------------------------------------------------ the city
  const bldMat = assets.track(windowMaterial(new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.5, metalness: 0.55 }), { litRatio: 0.3, floorH: 36, bayW: 13 }));
  const bldMat2 = assets.track(windowMaterial(new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.85, metalness: 0.05 }), { litRatio: 0.34, floorH: 32, bayW: 11 }));
  const unit = assets.track(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  type B = { x: number; z: number; w: number; d: number; h: number; y: number };
  const glass: B[] = [];
  const stone: B[] = [];
  const tops: B[] = [];
  const GRID = 760;
  for (let gx = -9; gx <= 9; gx++) {
    for (let gz = -9; gz <= 9; gz++) {
      const cx = gx * GRID;
      const cz = gz * GRID;
      if (Math.abs(gx) <= 0 && Math.abs(gz) <= 0) continue;
      const dist = Math.hypot(cx, cz);
      // Two to four buildings per block.
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const w = 160 + r() * 260;
        const d = 160 + r() * 260;
        const x = cx + (r() - 0.5) * (GRID - w - 140);
        const z = cz + (r() - 0.5) * (GRID - d - 140);
        // Taller towers closer to "midtown" (around us), shorter blocks farther out.
        const tall = Math.max(0.25, 1 - dist / 9000);
        const h = (500 + Math.pow(r(), 1.6) * 3200) * tall + 300;
        const b = { x, z, w, d, h, y: STREET };
        (r() < 0.55 ? glass : stone).push(b);
        // Setback crown on some towers.
        if (h > 1600 && r() < 0.6) tops.push({ x, z, w: w * 0.62, d: d * 0.62, h: 200 + r() * 400, y: STREET + h });
      }
    }
  }
  // Neighbours very close to our roof, some above and some below us.
  for (const [x, z, w, d, h] of [[-520, -80, 300, 260, 2300], [470, -360, 280, 300, 1550], [-420, 520, 260, 240, 1500], [540, 420, 300, 260, 2700], [40, -720, 340, 260, 2100], [-60, 700, 300, 300, 1700]] as const) {
    glass.push({ x, z, w, d, h, y: STREET });
  }
  const toInstances = (list: B[], mat: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(unit, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d);
      m.setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.receiveShadow = false;
    return mesh;
  };
  group.add(toInstances(glass, bldMat), toInstances(stone, bldMat2), toInstances(tops, bldMat));

  // Landmarks: an Empire State–style stepped tower with mast, and a Chrysler-style crown.
  const landmarkParts: THREE.BufferGeometry[] = [];
  const crownParts: THREE.BufferGeometry[] = [];
  {
    const x = -1700;
    const z = -2600;
    let y = STREET;
    for (const [w, h] of [[560, 900], [460, 1500], [380, 600], [300, 400], [200, 200], [120, 160]] as const) {
      landmarkParts.push(box(w, h, w * 0.75, x, y + h / 2, z));
      y += h;
    }
    crownParts.push(new THREE.CylinderGeometry(14, 30, 420, 8).toNonIndexed().translate(x, y + 210, z));
  }
  {
    const x = 2200;
    const z = -1900;
    let y = STREET;
    for (const [w, h] of [[420, 1500], [330, 1300], [250, 300]] as const) {
      landmarkParts.push(box(w, h, w, x, y + h / 2, z));
      y += h;
    }
    // Stacked sunburst arches → tapering stainless crown + needle.
    for (let i = 0; i < 6; i++) {
      const rad = 140 - i * 22;
      const g = new THREE.SphereGeometry(rad, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
      g.scale(1, 1.2, 1);
      g.translate(x, y + i * 70, z);
      crownParts.push(g);
    }
    crownParts.push(new THREE.CylinderGeometry(2, 18, 520, 8).toNonIndexed().translate(x, y + 600, z));
  }
  const strip = (parts: THREE.BufferGeometry[]) => parts.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; });
  const landmarkMat = assets.track(windowMaterial(new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.7 }), { litRatio: 0.35, floorH: 36, bayW: 14 }));
  group.add(new THREE.Mesh(assets.track(mergeGeometries(strip(landmarkParts))!), landmarkMat));
  const crownMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.25, emissive: 0xfff0d0, emissiveIntensity: 0.35 }));
  group.add(new THREE.Mesh(assets.track(mergeGeometries(strip(crownParts))!), crownMat));
  landmarkParts.forEach(g => g.dispose());
  crownParts.forEach(g => g.dispose());

  // Street grid far below: glowing avenues.
  {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#ffb35a';
    g.fillRect(0, 0, 256, 18);
    g.fillRect(0, 0, 18, 256);
    g.fillStyle = '#fff2d6';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, 4 + Math.random() * 10, 3, 2);
    const t = assets.track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 30);
    t.offset.set(0.35, 0.35);
    const streets = new THREE.Mesh(
      assets.track(new THREE.PlaneGeometry(GRID * 30, GRID * 30).rotateX(-Math.PI / 2)),
      assets.track(new THREE.MeshBasicMaterial({ map: t, color: 0xffffff, fog: true }))
    );
    streets.position.y = STREET + 1;
    group.add(streets);
  }

  // Red aircraft-warning beacons on the tallest roofs.
  const beaconPts: THREE.Vector3[] = [];
  for (const b of [...glass, ...stone]) if (b.h > 2000 && beaconPts.length < 40) beaconPts.push(new THREE.Vector3(b.x, b.y + b.h + 8, b.z));
  const beaconMat = assets.track(new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true }));
  const beacons = new THREE.InstancedMesh(assets.track(new THREE.SphereGeometry(6, 8, 6)), beaconMat, beaconPts.length);
  beaconPts.forEach((p, i) => beacons.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  group.add(beacons);

  // ------------------------------------------------------------------ our tower + rooftop
  const towerMat = assets.track(windowMaterial(new THREE.MeshStandardMaterial({ ...tiled(assets, facadeTex, 0.2), color: 0x3a3936, roughness: 0.7 }), { litRatio: 0.45, floorH: 38, bayW: 14 }));
  const tower = new THREE.Mesh(assets.track(new THREE.BoxGeometry(PAD * 2 + 8, ROOF - 2 - STREET, PAD * 2 + 8).translate(0, (ROOF - 2 + STREET) / 2, 0)), towerMat);
  group.add(tower);
  const deckMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, deckTex, 0.5), color: 0x7a7c80 }));
  const deck = new THREE.Mesh(assets.track(worldUV(new THREE.BoxGeometry(PAD * 2, 2, PAD * 2).toNonIndexed().translate(0, ROOF - 1, 0))), deckMat);
  deck.receiveShadow = true;
  group.add(deck);
  // Helipad markings: yellow ring + white H, and a ring of edge lights.
  const paint = assets.track(new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.7 }));
  const white = assets.track(new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.7 }));
  const ring = new THREE.Mesh(assets.track(new THREE.RingGeometry(78, 84, 96).rotateX(-Math.PI / 2)), paint);
  ring.position.y = ROOF + 0.03;
  ring.receiveShadow = true;
  group.add(ring);
  const hParts = [box(8, 0.1, 64, -22, 0.05, 0), box(8, 0.1, 64, 22, 0.05, 0), box(36, 0.1, 8, 0, 0.05, 0)];
  // The H sits behind the board so it reads from the player's seat.
  const hMesh = new THREE.Mesh(assets.track(mergeGeometries(hParts)!), white);
  hMesh.position.z = -52;
  hMesh.scale.set(0.55, 1, 0.55);
  hMesh.position.y = ROOF;
  hMesh.receiveShadow = true;
  group.add(hMesh);
  hParts.forEach(g => g.dispose());
  const edgeLightMat = assets.track(new THREE.MeshBasicMaterial({ color: 0x7cff9a }));
  const edgeLights = new THREE.InstancedMesh(assets.track(new THREE.SphereGeometry(0.7, 8, 6)), edgeLightMat, 24);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    edgeLights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * 88, ROOF + 0.4, Math.sin(a) * 88));
  }
  group.add(edgeLights);

  // Parapet + glass balustrade.
  const parapetMat = assets.track(new THREE.MeshStandardMaterial({ ...tiled(assets, parapetTex, 0.6), color: 0x8a8884 }));
  const parapetParts: THREE.BufferGeometry[] = [];
  for (let w = 0; w < 4; w++) {
    const g = box(PAD * 2 + 8, 6, 4, 0, ROOF + 3, -PAD - 2);
    g.rotateY((w * Math.PI) / 2);
    parapetParts.push(g);
  }
  const parapet = new THREE.Mesh(assets.track(mergeGeometries(parapetParts)!), parapetMat);
  parapet.receiveShadow = parapet.castShadow = true;
  group.add(parapet);
  parapetParts.forEach(g => g.dispose());
  const glassRail = assets.track(new THREE.MeshPhysicalMaterial({ color: 0x9fb8c8, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.22, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  for (let w = 0; w < 4; w++) {
    const g = new THREE.Mesh(assets.track(new THREE.PlaneGeometry(PAD * 2 + 8, 10)), glassRail);
    g.position.set(0, ROOF + 11, 0);
    g.rotation.y = (w * Math.PI) / 2;
    g.translateZ(-PAD - 2);
    group.add(g);
  }
  const steel = assets.track(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.3 }));
  // Brushed (rougher) steel for the table base so the floodlight doesn't flare off it.
  const brushed = assets.track(new THREE.MeshStandardMaterial({ color: 0x7c828a, metalness: 0.9, roughness: 0.55 }));
  const railParts: THREE.BufferGeometry[] = [];
  for (let w = 0; w < 4; w++) {
    const g = box(PAD * 2 + 8, 0.8, 1.2, 0, ROOF + 16.2, -PAD - 2);
    g.rotateY((w * Math.PI) / 2);
    railParts.push(g);
  }
  group.add(new THREE.Mesh(assets.track(mergeGeometries(railParts)!), steel));
  railParts.forEach(g => g.dispose());

  // Board table: granite top on a brushed-steel pedestal.
  const graniteMat = assets.track(new THREE.MeshPhysicalMaterial({ ...tiled(assets, granite, 1), color: 0x34343a, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
  const top = new THREE.Mesh(assets.track(new RoundedBoxGeometry(13.4, 0.8, 13.4, 3, 0.2)), graniteMat);
  top.position.y = -0.33 - 0.4;
  const stem = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(1.2, 1.2, -1.13 - ROOF, 24).translate(0, (ROOF - 1.13) / 2, 0)), brushed);
  const foot = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(4.5, 5, 0.6, 32).translate(0, ROOF + 0.3, 0)), brushed);
  for (const m of [top, stem, foot]) {
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // NYC wooden water tower on the roof corner.
  const woodMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x5e4634, roughness: 0.9 }));
  const darkSteel = assets.track(new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.7, roughness: 0.6 }));
  const waterTower = (x: number, y: number, z: number, s: number) => {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(10, 10.6, 22, 24, 1)), woodMat);
    tank.position.y = 30;
    const roof = new THREE.Mesh(assets.track(new THREE.ConeGeometry(11.5, 9, 24)), darkSteel);
    roof.position.y = 45.5;
    g.add(tank, roof);
    for (let i = 0; i < 4; i++) {
      const hoop = new THREE.Mesh(assets.track(new THREE.TorusGeometry(10.5, 0.25, 4, 32)), darkSteel);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = 21 + i * 6;
      g.add(hoop);
    }
    for (const [lx, lz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
      const leg = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.6, 0.6, 19, 6)), darkSteel);
      leg.position.set(lx, 9.5, lz);
      g.add(leg);
    }
    const platform = new THREE.Mesh(assets.track(new THREE.BoxGeometry(22, 1, 22)), darkSteel);
    platform.position.y = 19;
    g.add(platform);
    g.traverse(o => { (o as THREE.Mesh).castShadow = true; });
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    group.add(g);
  };
  waterTower(-80, ROOF, -80, 1);
  // A few on lower neighbouring roofs.
  for (const b of glass.concat(stone).filter(b => b.y + b.h < ROOF - 100 && Math.hypot(b.x, b.z) < 2200).slice(0, 8)) waterTower(b.x + b.w * 0.2, b.y + b.h, b.z - b.d * 0.2, 1.6);

  place(group, aircon, 12, 82, ROOF, -70, Math.PI / 2);
  place(group, aircon, 12, 82, ROOF, -40, Math.PI / 2);
  // Floodlights on poles lighting the board.
  const floodPos: THREE.Vector3[] = [];
  for (const [x, z, ry] of [[-60, 70, 2.4], [60, 70, -2.4]] as const) {
    const pole = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.5, 0.7, 34, 8).translate(0, 17, 0)), darkSteel);
    pole.position.set(x, ROOF, z);
    group.add(pole);
    place(group, secLight, 4, x, ROOF + 33, z, ry);
    floodPos.push(new THREE.Vector3(x, ROOF + 35, z));
  }
  // Antenna mast with a blinking beacon.
  const mast = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.4, 1.4, 120, 8).translate(0, 60, 0)), steel);
  mast.position.set(90, ROOF, 90);
  group.add(mast);
  const mastLight = new THREE.Mesh(assets.track(new THREE.SphereGeometry(1.4, 10, 8)), assets.track(new THREE.MeshBasicMaterial({ color: 0xff2020 })));
  mastLight.position.set(90, ROOF + 121, 90);
  group.add(mastLight);

  // Warm uplight from the floodlights, cool fill from the city.
  const flood = new THREE.SpotLight(0xffe6c4, 2600, 220, 0.6, 0.6, 2);
  flood.position.copy(floodPos[0]).lerp(floodPos[1], 0.5).add(new THREE.Vector3(0, 6, 10));
  flood.target.position.set(0, 0, 0);
  group.add(flood, flood.target);

  // ------------------------------------------------------------------ helicopter
  const heli = new THREE.Group();
  {
    const bodyMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x1c2330, metalness: 0.6, roughness: 0.35 }));
    const stripeMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xc23a2a, metalness: 0.4, roughness: 0.4 }));
    const glassM = assets.track(new THREE.MeshStandardMaterial({ color: 0x0a1018, metalness: 0.9, roughness: 0.05 }));
    const body = new THREE.Mesh(assets.track(new THREE.SphereGeometry(1, 24, 16).scale(9, 8, 18)), bodyMat);
    const canopy = new THREE.Mesh(assets.track(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(7.4, 6, 9)), glassM);
    canopy.rotation.x = Math.PI / 2.2;
    canopy.position.set(0, 1.5, 11);
    const stripe = new THREE.Mesh(assets.track(new THREE.SphereGeometry(1, 24, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.12).scale(9.1, 8.1, 18.1)), stripeMat);
    const boom = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(1.2, 2.6, 30, 12).rotateX(Math.PI / 2)), bodyMat);
    boom.position.set(0, 2, -30);
    const fin = new THREE.Mesh(assets.track(new THREE.BoxGeometry(0.8, 11, 6)), bodyMat);
    fin.position.set(0, 7, -44);
    fin.rotation.x = -0.35;
    const tailRotor = new THREE.Group();
    tailRotor.position.set(1.4, 8, -45);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(assets.track(new THREE.BoxGeometry(0.2, 9, 0.9)), darkSteel);
      b.rotation.x = (i * Math.PI) / 2;
      tailRotor.add(b);
    }
    const mastH = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.8, 1.2, 4, 10)), darkSteel);
    mastH.position.y = 9.5;
    const rotor = new THREE.Group();
    rotor.position.y = 11.6;
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(assets.track(new THREE.BoxGeometry(48, 0.3, 2.4).translate(24, 0, 0)), darkSteel);
      b.rotation.y = (i * Math.PI) / 2;
      rotor.add(b);
    }
    // Motion-blur disc so the spinning rotor reads at any frame rate.
    const disc = new THREE.Mesh(assets.track(new THREE.CircleGeometry(48, 48).rotateX(-Math.PI / 2)), assets.track(new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })));
    disc.position.y = 11.6;
    const skids: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.4, 0.4, 30, 6).rotateX(Math.PI / 2)), darkSteel);
      s.position.set(sx * 7, -10, 2);
      skids.push(s);
      for (const z of [-5, 9]) {
        const strut = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(0.3, 0.3, 5, 6)), darkSteel);
        strut.position.set(sx * 6.4, -7.8, z);
        strut.rotation.z = sx * 0.3;
        skids.push(strut);
      }
    }
    heli.add(body, canopy, stripe, boom, fin, tailRotor, mastH, rotor, disc, ...skids);
    heli.userData = { rotor, tailRotor };
    // Navigation lights: red port, green starboard, white strobe.
    const nav = (c: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(assets.track(new THREE.SphereGeometry(0.7, 8, 6)), assets.track(new THREE.MeshBasicMaterial({ color: c })));
      m.position.set(x, y, z);
      heli.add(m);
      return m;
    };
    nav(0xff2020, -9, 0, 2);
    nav(0x20ff40, 9, 0, 2);
    heli.userData.strobe = nav(0xffffff, 0, 10.5, -44);
    heli.userData.belly = nav(0xff3030, 0, -8.4, 0);
  }
  heli.scale.setScalar(0.9);
  group.add(heli);
  // Searchlight: a spot light plus a visible additive light cone.
  const search = new THREE.SpotLight(0xe8f2ff, 12000, 900, 0.09, 0.5, 1.6);
  group.add(search, search.target);
  const beamMat = assets.track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {},
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = vY * vY * vY * edge * 0.07; gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a, a); }',
  }));
  // Cone with apex at the origin pointing down -Y (uv.y = 1 near the lamp).
  const beamGeo = assets.track(new THREE.ConeGeometry(70, 700, 32, 1, true).translate(0, -350, 0));
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  group.add(beam);

  const glowTex = assets.track(glowTexture());
  const flare = new THREE.Sprite(assets.track(new THREE.SpriteMaterial({ map: glowTex, color: 0xdfeaff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  flare.scale.setScalar(18);
  group.add(flare);

  const lighting: RealmLighting = {
    environment: env,
    envIntensity: 0.7,
    envRotation: 0,
    // Moonlight key from the moon's direction; the floodlight spot does the warm work.
    sunDir: new THREE.Vector3(-0.45, 0.62, -0.78).normalize(),
    sunColor: 0xa9b8e0,
    sunIntensity: 0.9,
    hemiIntensity: 0.25,
    exposure: 1.05,
    fog: { color: 0x1a1720, density: 0.00009 },
    bloom: { strength: 0.4, threshold: 1.6 },
    grade: { saturation: 1.05, contrast: 1.08, tint: -0.01, vignette: 0.32 },
    rim: { dir: new THREE.Vector3(0.3, 0.4, -1), color: 0x9fb8ff, intensity: 0.8 },
  };

  const hp = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const look = new THREE.Vector3();
  let blink = 0;
  return {
    group,
    lighting,
    boardStand: 'none',
    far: 20000,
    seatPolar: 1.08,
    menuPolar: 1.34,
    update(dt, time) {
      skyMat.uniforms.uTime.value = time;
      // Helicopter: slow orbit around the tower, banking into the turn.
      const a = time * 0.07;
      const rad = 420;
      hp.set(Math.cos(a) * rad, ROOF + 150 + Math.sin(time * 0.3) * 20, Math.sin(a) * rad);
      heli.position.copy(hp);
      look.set(Math.cos(a + 0.05) * rad, hp.y, Math.sin(a + 0.05) * rad);
      heli.lookAt(look);
      heli.rotateZ(-0.22);
      heli.rotateX(0.08);
      (heli.userData.rotor as THREE.Object3D).rotation.y += dt * 38;
      (heli.userData.tailRotor as THREE.Object3D).rotation.x += dt * 60;
      blink = (time % 1.4) < 0.08 ? 1 : 0;
      (heli.userData.strobe as THREE.Mesh).visible = blink > 0;
      (heli.userData.belly as THREE.Mesh).visible = time % 1 < 0.5;
      // Searchlight sweeps across the roof and the neighbouring towers.
      search.position.copy(hp);
      search.position.y -= 9;
      const sweep = time * 0.35;
      search.target.position.set(Math.sin(sweep) * 60, ROOF, Math.cos(sweep * 0.7) * 50);
      search.target.updateMatrixWorld();
      beam.position.copy(search.position);
      beamDir.copy(search.target.position).sub(search.position).normalize();
      beam.quaternion.setFromUnitVectors(DOWN, beamDir);
      flare.position.copy(search.position);
      // Beacons blink together.
      beaconMat.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 2.6));
      (mastLight.material as THREE.MeshBasicMaterial).color.setHex(time % 2 < 1 ? 0xff2020 : 0x300404);
    },
    dispose() {
      assets.dispose();
    },
  };
}
