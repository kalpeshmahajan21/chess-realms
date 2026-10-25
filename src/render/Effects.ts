import * as THREE from 'three';
import type { LightingTheme } from '../config/arenaThemes.ts';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = smoothstep(1.0, uSoft, d);
    if (a * vAlpha < 0.004) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

/** CPU-simulated point pool. Dead particles have alpha 0 and are skipped by the fragment shader. */
class PointPool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private alive = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(private capacity: number, additive: boolean, soft: number) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number, gravity: number, drag: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
    this.alive = this.capacity; // conservative; recounted in update
  }

  update(dt: number) {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.alpha[i] <= 0) continue;
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.gravity[i] * dt;
      this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.01) {
        this.pos[i3 + 1] = 0.01;
        this.vel[i3 + 1] *= -0.3;
      }
      this.alpha[i] = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.size[i] = this.baseSize[i] * (0.6 + 0.4 * (1 - t));
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }

  setScale(s: number) {
    this.material.uniforms.uScale.value = s;
  }

  clear() {
    this.alpha.fill(0);
    this.alive = 0;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** Instanced rigid debris with bounce + friction (capture shards). */
class DebrisPool {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private p: THREE.Vector3[] = [];
  private v: THREE.Vector3[] = [];
  private r: THREE.Euler[] = [];
  private w: THREE.Vector3[] = [];
  private s: number[] = [];
  private life: number[] = [];
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private active = 0;

  constructor(capacity: number) {
    this.n = capacity;
    const geo = new THREE.IcosahedronGeometry(0.05, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < capacity; i++) {
      this.p.push(new THREE.Vector3());
      this.v.push(new THREE.Vector3());
      this.r.push(new THREE.Euler());
      this.w.push(new THREE.Vector3());
      this.s.push(0);
      this.life.push(99);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.hideAll();
  }

  private hideAll() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(at: THREE.Vector3, color: THREE.Color, count: number, away: THREE.Vector3) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      this.p[i].set(at.x + (Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.5, at.z + (Math.random() - 0.5) * 0.3);
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 2.2;
      this.v[i].set(Math.cos(a) * sp + away.x * 1.5, 1.6 + Math.random() * 2.6, Math.sin(a) * sp + away.z * 1.5);
      this.r[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.w[i].set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      this.s[i] = 0.5 + Math.random() * 1.1;
      this.life[i] = 0;
      const c = color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
      this.mesh.setColorAt(i, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.active = 2.4;
  }

  update(dt: number) {
    if (this.active <= 0) return;
    this.active -= dt;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] > 2.2) continue;
      this.life[i] += dt;
      const p = this.p[i];
      const v = this.v[i];
      v.y -= 9.8 * dt;
      p.addScaledVector(v, dt);
      const floor = 0.03 * this.s[i];
      if (p.y < floor) {
        p.y = floor;
        if (Math.abs(v.y) > 0.4) {
          v.y = -v.y * 0.38;
          v.x *= 0.7;
          v.z *= 0.7;
          this.w[i].multiplyScalar(0.6);
        } else {
          v.y = 0;
          v.x *= Math.exp(-6 * dt);
          v.z *= Math.exp(-6 * dt);
          this.w[i].multiplyScalar(Math.exp(-5 * dt));
        }
      }
      this.r[i].x += this.w[i].x * dt;
      this.r[i].y += this.w[i].y * dt;
      this.r[i].z += this.w[i].z * dt;
      const fade = this.life[i] > 1.6 ? Math.max(0, 1 - (this.life[i] - 1.6) / 0.6) : 1;
      this.dummy.position.copy(p);
      this.dummy.rotation.copy(this.r[i]);
      this.dummy.scale.setScalar(this.s[i] * fade);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.active <= 0) this.hideAll();
  }

  clear() {
    this.life.fill(99);
    this.active = 0;
    this.hideAll();
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const AMBIENT_VERT = /* glsl */ `
  attribute vec3 aVel;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;
  uniform float uSize;
  uniform vec3 uBox;
  varying float vAlpha;
  void main() {
    vec3 p = position + aVel * uTime;
    p.x += sin(uTime * 0.6 + aPhase * 6.0) * 0.35;
    p.z += cos(uTime * 0.5 + aPhase * 4.0) * 0.35;
    // Wrap inside a box centred on the board.
    p = mod(p + uBox, uBox * 2.0) - uBox;
    p.y += uBox.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * uScale / -mv.z;
    vAlpha = 0.55 + 0.45 * sin(uTime * 1.3 + aPhase * 20.0);
    // Fade near the wrap edges so particles never pop.
    vAlpha *= smoothstep(0.0, 1.5, p.y) * smoothstep(uBox.y * 2.0, uBox.y * 2.0 - 1.5, p.y);
    gl_Position = projectionMatrix * mv;
  }
`;

const AMBIENT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(uColor, a * vAlpha * 0.85);
  }
`;

export class Effects {
  readonly group = new THREE.Group();
  private sparks = new PointPool(1400, true, 0.0);
  private dust = new PointPool(500, false, 0.2);
  private debris = new DebrisPool(140);
  private rings: { mesh: THREE.Mesh; t: number; dur: number; max: number }[] = [];
  private ambient: THREE.Points | null = null;
  private ambientTime = 0;
  private tmpV = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  private tmpC = new THREE.Color();
  intensity = 1; // quality multiplier

  constructor() {
    this.group.name = 'Effects';
    this.group.add(this.sparks.points, this.dust.points, this.debris.mesh);
    const ringTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 1, max: 1 });
    }
  }

  setViewportHeight(h: number, pixelRatio: number) {
    const s = h * pixelRatio * 0.5;
    this.sparks.setScale(s);
    this.dust.setScale(s);
    if (this.ambient) (this.ambient.material as THREE.ShaderMaterial).uniforms.uScale.value = s;
  }

  private ring(at: THREE.Vector3, color: number, size: number, dur: number) {
    const r = this.rings.find(x => !x.mesh.visible) ?? this.rings[0];
    r.mesh.position.set(at.x, 0.03, at.z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.mesh.visible = true;
    r.t = 0;
    r.dur = dur;
    r.max = size;
  }

  /** Soft dust puff when a piece lands. */
  landing(at: THREE.Vector3, strength = 1) {
    const n = Math.round(10 * strength * this.intensity);
    this.tmpC.setRGB(0.75, 0.72, 0.66);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      this.tmpP.set(at.x + Math.cos(a) * 0.28, 0.03, at.z + Math.sin(a) * 0.28);
      this.tmpV.set(Math.cos(a) * 0.9, 0.15 + Math.random() * 0.25, Math.sin(a) * 0.9);
      this.dust.emit(this.tmpP, this.tmpV, this.tmpC, 0.16 + Math.random() * 0.1, 0.7 + Math.random() * 0.3, 0.1, 3.5);
    }
  }

  /** Capture impact: debris in the victim's colour, sparks, dust and a shockwave. */
  impact(at: THREE.Vector3, victimColor: THREE.Color, away: THREE.Vector3, accent: number) {
    const q = this.intensity;
    this.debris.burst(at, victimColor, Math.round(22 * Math.max(0.4, q)), away);
    const spark = new THREE.Color(accent);
    for (let i = 0; i < Math.round(60 * q); i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = 1.5 + Math.random() * 3.5;
      this.tmpP.set(at.x, 0.35 + Math.random() * 0.3, at.z);
      this.tmpV.set(Math.cos(a) * sp * (1 - up * 0.5), 1 + up * 3.5, Math.sin(a) * sp * (1 - up * 0.5));
      this.tmpC.copy(spark).offsetHSL(0, 0, Math.random() * 0.2);
      this.sparks.emit(this.tmpP, this.tmpV, this.tmpC, 0.05 + Math.random() * 0.05, 0.45 + Math.random() * 0.5, 5, 1.2);
    }
    this.landing(at, 1.8);
    this.ring(at, accent, 3.2, 0.7);
  }

  /** Short sparkle burst (promotion, selection confirmations). */
  sparkle(at: THREE.Vector3, color: number, count = 40, height = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < Math.round(count * this.intensity); i++) {
      const a = Math.random() * Math.PI * 2;
      this.tmpP.set(at.x + Math.cos(a) * 0.25, Math.random() * height, at.z + Math.sin(a) * 0.25);
      this.tmpV.set(Math.cos(a) * 0.4, 1.2 + Math.random() * 1.8, Math.sin(a) * 0.4);
      this.tmpC.copy(c).offsetHSL(0, 0, Math.random() * 0.25);
      this.sparks.emit(this.tmpP, this.tmpV, this.tmpC, 0.06 + Math.random() * 0.05, 0.8 + Math.random() * 0.6, 0.6, 1.5);
    }
    this.ring(at, color, 2.2, 0.8);
  }

  /** Pulse ring under a king that has just been checked. */
  checkPulse(at: THREE.Vector3) {
    this.ring(at, 0xff3b30, 2.6, 0.9);
  }

  /** Victory fireworks above the board, staggered over ~2 s. */
  fireworks(colors: number[], bursts = 6) {
    for (let b = 0; b < bursts; b++) {
      window.setTimeout(() => {
        const o = new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 2.5, (Math.random() - 0.5) * 7);
        const col = new THREE.Color(colors[b % colors.length]);
        for (let i = 0; i < Math.round(90 * this.intensity); i++) {
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          const sp = 2.2 + Math.random() * 1.6;
          this.tmpV.set(Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 0.6, Math.sin(ph) * Math.sin(th) * sp);
          this.tmpC.copy(col).offsetHSL(0, 0, (Math.random() - 0.3) * 0.25);
          this.sparks.emit(o, this.tmpV, this.tmpC, 0.07 + Math.random() * 0.05, 1.3 + Math.random() * 0.7, 2.2, 1.4);
        }
      }, b * 320);
    }
  }

  setAmbient(cfg: LightingTheme['ambientParticles'], enabled: boolean, quality: number) {
    if (this.ambient) {
      this.group.remove(this.ambient);
      this.ambient.geometry.dispose();
      (this.ambient.material as THREE.Material).dispose();
      this.ambient = null;
    }
    if (!cfg || !enabled) return;
    const n = Math.max(12, Math.round(cfg.count * quality));
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 1] = Math.random() * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 24;
      const m = cfg.motion;
      vel[i * 3] = m === 'drift' ? 0.6 + Math.random() * 0.5 : (Math.random() - 0.5) * 0.15;
      vel[i * 3 + 1] = m === 'fall' ? -(0.25 + Math.random() * 0.3) : m === 'rise' ? 0.2 + Math.random() * 0.3 : (Math.random() - 0.5) * 0.08;
      vel[i * 3 + 2] = m === 'drift' ? (Math.random() - 0.5) * 0.3 : (Math.random() - 0.5) * 0.15;
      phase[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: AMBIENT_VERT,
      fragmentShader: AMBIENT_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 400 },
        uSize: { value: cfg.size * 6 },
        uColor: { value: new THREE.Color(cfg.color) },
        uBox: { value: new THREE.Vector3(12, 4, 12) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ambient = new THREE.Points(g, mat);
    this.ambient.frustumCulled = false;
    this.group.add(this.ambient);
  }

  update(dt: number) {
    this.sparks.update(dt);
    this.dust.update(dt);
    this.debris.update(dt);
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const t = r.t / r.dur;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = 0.3 + (1 - Math.pow(1 - t, 3)) * r.max;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
    }
    if (this.ambient) {
      this.ambientTime += dt;
      (this.ambient.material as THREE.ShaderMaterial).uniforms.uTime.value = this.ambientTime;
    }
  }

  clear() {
    this.sparks.clear();
    this.dust.clear();
    this.debris.clear();
    this.rings.forEach(r => (r.mesh.visible = false));
  }

  dispose() {
    this.sparks.dispose();
    this.dust.dispose();
    this.debris.dispose();
    this.rings.forEach(r => {
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
      (r.mesh.material as THREE.Material).dispose();
    });
    this.setAmbient(null, false, 0);
  }
}
