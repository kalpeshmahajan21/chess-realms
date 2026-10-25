import * as THREE from 'three';
import { AssetScope } from './assets.ts';
import { INVERSE_ACES } from './PhotoBackdrop.ts';

/*
 * Shared building blocks for the modelled realms (palace, garden, rooftop, desert, café).
 * World scale everywhere: 1 unit = 10 cm, board top at y = 0.
 */

export function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export type PbrSet = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };

/** Clone a PBR set with its own repeat (textures share the image, so this is cheap). */
export function tiled(scope: AssetScope, set: PbrSet, rx: number, ry = rx): PbrSet {
  const out = {} as PbrSet;
  for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
    const t = scope.track(set[k].clone());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    out[k] = t;
  }
  return out;
}

/** Box at (x,y,z) with world-space UVs (texel density = uvScale per unit) so tiling stays continuous across merged parts. */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, uvScale = 0.1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  worldUV(g, x, y, z, uvScale);
  g.translate(x, y, z);
  return g;
}

/** Triplanar-ish world UVs for any geometry already positioned at offset (x,y,z). */
export function worldUV(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, uvScale = 0.1) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const px = pos.getX(i) + x;
    const py = pos.getY(i) + y;
    const pz = pos.getZ(i) + z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, px * uvScale, pz * uvScale);
    else if (nx >= nz) uv.setXY(i, pz * uvScale, py * uvScale);
    else uv.setXY(i, px * uvScale, py * uvScale);
  }
  uv.needsUpdate = true;
  return g;
}

/** Scale a loaded model to a target height and drop it on the given floor height. Returns the clone. */
export function place(parent: THREE.Object3D, obj: THREE.Object3D | null, height: number, x: number, y: number, z: number, ry = 0, opts: { shadow?: boolean } = {}) {
  if (!obj) return null;
  const o = obj.clone();
  const b = new THREE.Box3().setFromObject(o);
  const s = height / Math.max(b.max.y - b.min.y, 0.001);
  o.scale.setScalar(s);
  o.position.set(x, y - b.min.y * s, z);
  o.rotation.y = ry;
  if (opts.shadow === false) o.traverse(c => { (c as THREE.Mesh).castShadow = false; });
  parent.add(o);
  return o;
}

/** Scale so the model's widest horizontal extent equals `width`. */
export function placeByWidth(parent: THREE.Object3D, obj: THREE.Object3D | null, width: number, x: number, y: number, z: number, ry = 0) {
  if (!obj) return null;
  const b = new THREE.Box3().setFromObject(obj);
  const size = b.getSize(new THREE.Vector3());
  return place(parent, obj, (size.y * width) / Math.max(size.x, size.z, 0.001), x, y, z, ry);
}

/**
 * Sky sphere from a tonemapped "pure sky" panorama. The lower half of those photos is empty,
 * so realms always cover the horizon with their own ground and buildings.
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private uniforms = { uExposure: { value: 1 }, uBrightness: { value: 1 } };
  constructor(photo: THREE.Texture, radius: number, rotation = 0, brightness = 1) {
    photo.colorSpace = THREE.SRGBColorSpace;
    photo.anisotropy = 4;
    const geo = new THREE.SphereGeometry(radius, 64, 32);
    const mat = new THREE.MeshBasicMaterial({ map: photo, side: THREE.BackSide, fog: false, depthWrite: false });
    this.uniforms.uBrightness.value = brightness;
    mat.onBeforeCompile = shader => {
      shader.uniforms.uExposure = this.uniforms.uExposure;
      shader.uniforms.uBrightness = this.uniforms.uBrightness;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${INVERSE_ACES}`)
        .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = inverseACES(diffuseColor.rgb * uBrightness);');
    };
    mat.customProgramCacheKey = () => 'sky-dome-inverse-aces';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.y = rotation;
    this.mesh.renderOrder = -20;
    this.mesh.frustumCulled = false;
  }
  setExposure(e: number) {
    this.uniforms.uExposure.value = e;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Soft radial glow (lamps, flames, windows at distance). */
export function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.3, mid);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Animated flame: two crossed additive quads with a procedural flicker shader, plus a warm point light.
 * Cheap enough for a dozen torches.
 */
export class Flames {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private lights: { light: THREE.PointLight; base: number; phase: number }[] = [];
  constructor(scope: AssetScope) {
    this.mat = scope.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying float vSeed;
          attribute float aSeed;
          void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec2 vUv; varying float vSeed;
          float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          void main() {
            vec2 p = vUv; float t = uTime * 2.2 + vSeed * 10.0;
            float w = n(vec2(p.x * 4.0, p.y * 3.0 - t * 1.6)) * 0.5 + n(vec2(p.x * 9.0, p.y * 7.0 - t * 3.0)) * 0.25;
            float x = (p.x - 0.5) * 2.0 + (w - 0.37) * 0.9 * p.y;
            float shape = 1.0 - smoothstep(0.0, 1.0, abs(x) / max(0.05, (1.0 - p.y) * 0.85));
            shape *= smoothstep(0.0, 0.12, p.y) * (1.0 - smoothstep(0.55, 1.0, p.y + w * 0.3));
            vec3 col = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.85, 0.45), shape * shape);
            gl_FragColor = vec4(col * shape * 2.4, shape);
          }
        `,
      })
    );
  }
  /** Build instanced flames at the given positions (bottom of the flame) with height h. */
  build(points: THREE.Vector3[], h: number, lightEvery = 1, lightIntensity = 40, lightRange = 30, maxLights = 6) {
    const geo = new THREE.PlaneGeometry(h * 0.55, h);
    geo.translate(0, h / 2, 0);
    const cross = new THREE.PlaneGeometry(h * 0.55, h);
    cross.translate(0, h / 2, 0);
    cross.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const a = geo.toNonIndexed();
    const b = cross.toNonIndexed();
    for (const name of ['position', 'uv'] as const) {
      const arr = new Float32Array(a.attributes[name].array.length + b.attributes[name].array.length);
      arr.set(a.attributes[name].array as Float32Array, 0);
      arr.set(b.attributes[name].array as Float32Array, a.attributes[name].array.length);
      merged.setAttribute(name, new THREE.BufferAttribute(arr, name === 'uv' ? 2 : 3));
    }
    [geo, cross, a, b].forEach(g => g.dispose());
    const mesh = new THREE.InstancedMesh(merged, this.mat, points.length);
    const seeds = new Float32Array(points.length);
    const m = new THREE.Matrix4();
    points.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
      seeds[i] = Math.random();
    });
    merged.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    this.group.add(mesh);
    points.forEach((p, i) => {
      if (i % lightEvery !== 0 || this.lights.length >= maxLights) return;
      const light = new THREE.PointLight(0xff9a48, lightIntensity, lightRange, 2);
      light.position.set(p.x, p.y + h * 0.5, p.z);
      this.group.add(light);
      this.lights.push({ light, base: lightIntensity, phase: Math.random() * 10 });
    });
  }
  update(time: number) {
    this.mat.uniforms.uTime.value = time;
    for (const l of this.lights) {
      const t = time * 9 + l.phase;
      l.light.intensity = l.base * (0.85 + Math.sin(t) * 0.07 + Math.sin(t * 2.7) * 0.06 + Math.sin(t * 6.1) * 0.03);
    }
  }
}

// --------------------------------------------------------------------------- seated people (silhouette style)

export interface Sitter {
  root: THREE.Group;
  head: THREE.Object3D;
  arm: THREE.Object3D;
  torso: THREE.Object3D;
  baseY: number;
  phase: number;
}

const CLOTHES = [0x2b2f38, 0x3a2a24, 0x1f2a24, 0x4a3b2e, 0x2a2233, 0x5a2a24, 0x30343c, 0x1c1c20, 0x6a5440, 0x283648];
const SKIN = [0x8a6450, 0x6e4c3a, 0xa07a62, 0x5a3e30, 0xb08a70];
const HAIR = [0x141010, 0x2a1c14, 0x3a2a1e, 0x5a4a3a, 0x8a8078, 0x1a1412];

/**
 * A softly-lit seated figure made from smooth primitives, facing +Z, seat at y = 0.
 * Proportions are adult (≈1.75 m standing). Deliberately simple: read as people at a glance, never uncanny.
 */
export function makeSitter(scope: AssetScope, r: () => number, opts: { seatHeight?: number } = {}): Sitter {
  const seat = opts.seatHeight ?? 4.6;
  const mats = {
    cloth: scope.track(new THREE.MeshStandardMaterial({ color: CLOTHES[Math.floor(r() * CLOTHES.length)], roughness: 0.92 })),
    trousers: scope.track(new THREE.MeshStandardMaterial({ color: CLOTHES[Math.floor(r() * CLOTHES.length)], roughness: 0.9 })),
    skin: scope.track(new THREE.MeshStandardMaterial({ color: SKIN[Math.floor(r() * SKIN.length)], roughness: 0.7 })),
    hair: scope.track(new THREE.MeshStandardMaterial({ color: HAIR[Math.floor(r() * HAIR.length)], roughness: 0.85 })),
  };
  const root = new THREE.Group();
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const o = new THREE.Mesh(scope.track(g), m);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };
  const sw = 0.9 + r() * 0.2; // build
  // Legs: thighs forward along +Z, shins down to the floor.
  for (const sx of [-1, 1]) {
    const thigh = mesh(new THREE.CapsuleGeometry(0.75 * sw, 3.6, 4, 10), mats.trousers);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(sx * 0.95 * sw, seat + 0.7, 2.0);
    const shin = mesh(new THREE.CapsuleGeometry(0.6 * sw, seat - 0.6, 4, 10), mats.trousers);
    shin.position.set(sx * 0.95 * sw, seat / 2, 4.1);
    const shoe = mesh(new THREE.BoxGeometry(1.0, 0.6, 2.2), mats.hair);
    shoe.position.set(sx * 0.95 * sw, 0.3, 4.6);
    root.add(thigh, shin, shoe);
  }
  // Torso, slightly leaning forward over the table.
  const torso = new THREE.Group();
  torso.position.set(0, seat + 0.7, 0);
  torso.rotation.x = 0.18 + r() * 0.12;
  const chest = mesh(new THREE.CapsuleGeometry(1.55 * sw, 3.2, 6, 14), mats.cloth);
  chest.scale.set(1, 1, 0.72);
  chest.position.y = 2.9;
  torso.add(chest);
  const neck = mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 10), mats.skin);
  neck.position.y = 5.6;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 6.5;
  const skull = mesh(new THREE.SphereGeometry(1.05, 20, 14), mats.skin);
  skull.scale.set(0.9, 1.08, 1);
  head.add(skull);
  const hair = mesh(new THREE.SphereGeometry(1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * (0.5 + r() * 0.12)), mats.hair);
  hair.position.set(0, 0.12, -0.08);
  hair.scale.set(0.95, 1.08, 1.02);
  head.add(hair);
  torso.add(head);
  // Arms reaching to the table; the right arm is posable (moves pieces, lifts a cup).
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 1.85 * sw, 4.6, 0);
    shoulder.rotation.x = -0.75;
    shoulder.rotation.z = sx * 0.12;
    const upper = mesh(new THREE.CapsuleGeometry(0.48, 2.6, 4, 10), mats.cloth);
    upper.position.y = -1.6;
    const elbow = new THREE.Group();
    elbow.position.y = -3.1;
    elbow.rotation.x = -0.9;
    const fore = mesh(new THREE.CapsuleGeometry(0.42, 2.4, 4, 10), mats.cloth);
    fore.position.y = -1.4;
    const hand = mesh(new THREE.SphereGeometry(0.45, 10, 8), mats.skin);
    hand.position.y = -2.9;
    elbow.add(fore, hand);
    shoulder.add(upper, elbow);
    torso.add(shoulder);
    arms.push(shoulder);
  }
  root.add(torso);
  return { root, head, arm: arms[1], torso, baseY: torso.position.y, phase: r() * 100 };
}

/** Idle motion: breathing, glances, an occasional reach. */
export function animateSitter(s: Sitter, time: number) {
  const t = time + s.phase;
  s.head.rotation.y = Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.13) * 0.2;
  s.head.rotation.x = 0.15 + Math.sin(t * 0.21) * 0.08;
  const reach = Math.max(0, Math.sin(t * 0.17) - 0.7) / 0.3; // brief, every ~35 s
  s.arm.rotation.x = -0.75 - reach * 0.55;
  s.torso.position.y = s.baseY + Math.sin(t * 1.4) * 0.03;
}

/** Sand / dust / petal particles drifting through a box around the board. */
export class Drifters {
  readonly points: THREE.Points;
  private vel: Float32Array;
  constructor(scope: AssetScope, count: number, extent: THREE.Vector3, center: THREE.Vector3, opts: { color: number; size: number; tex?: THREE.Texture; wind: THREE.Vector3; fall?: number; opacity?: number }) {
    const pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = center.x + (Math.random() - 0.5) * extent.x;
      pos[i * 3 + 1] = center.y + (Math.random() - 0.5) * extent.y;
      pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * extent.z;
      this.vel[i * 3] = opts.wind.x * (0.6 + Math.random() * 0.8);
      this.vel[i * 3 + 1] = -(opts.fall ?? 0) * (0.6 + Math.random() * 0.8) + opts.wind.y;
      this.vel[i * 3 + 2] = opts.wind.z * (0.6 + Math.random() * 0.8);
    }
    const geo = scope.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = scope.track(
      new THREE.PointsMaterial({ color: opts.color, size: opts.size, map: opts.tex ?? null, transparent: true, opacity: opts.opacity ?? 0.8, depthWrite: false, sizeAttenuation: true })
    );
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.extent = extent;
    this.center = center;
  }
  private extent: THREE.Vector3;
  private center: THREE.Vector3;
  update(dt: number, time: number) {
    const a = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const e = this.extent;
    const c = this.center;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += (this.vel[i] + Math.sin(time * 0.8 + i) * 0.4) * dt;
      arr[i + 1] += this.vel[i + 1] * dt;
      arr[i + 2] += (this.vel[i + 2] + Math.cos(time * 0.6 + i) * 0.4) * dt;
      for (let k = 0; k < 3; k++) {
        const half = (k === 0 ? e.x : k === 1 ? e.y : e.z) / 2;
        const ck = k === 0 ? c.x : k === 1 ? c.y : c.z;
        if (arr[i + k] > ck + half) arr[i + k] -= half * 2;
        else if (arr[i + k] < ck - half) arr[i + k] += half * 2;
      }
    }
    a.needsUpdate = true;
  }
}

/** Instanced copies of one geometry/material at the given transforms. */
export function instances(geo: THREE.BufferGeometry, mat: THREE.Material, transforms: { p: THREE.Vector3; ry?: number; s?: THREE.Vector3 | number; rx?: number; rz?: number }[], shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  transforms.forEach((t, i) => {
    e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    q.setFromEuler(e);
    if (typeof t.s === 'number') s.setScalar(t.s);
    else if (t.s) s.copy(t.s);
    else s.setScalar(1);
    m.compose(t.p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}
