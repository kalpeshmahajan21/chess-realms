import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { QualityPreset } from '../config/quality.ts';
import type { LightingTheme } from '../config/arenaThemes.ts';

/** Colour grade + vignette + tension pulse, applied after tone mapping (sRGB space). */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uTint: { value: 0 },
    uVignette: { value: 0.3 },
    uTension: { value: 0 },
    uTime: { value: 0 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation, uContrast, uTint, uVignette, uTension, uTime, uFade;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      // Warm/cool split: warm the highlights, cool the shadows (or the reverse).
      col.r += uTint * (l - 0.35) * 0.35;
      col.b -= uTint * (l - 0.35) * 0.35;
      vec2 d = vUv - 0.5;
      float r = dot(d, d);
      float vig = smoothstep(0.75, 0.1, r * (1.0 + uVignette * 2.2));
      col *= mix(1.0, vig, uVignette * 1.4);
      // Tension: a slow red heartbeat at the screen edges (check / low clock).
      float beat = pow(0.5 + 0.5 * sin(uTime * 5.0), 3.0);
      col = mix(col, vec3(0.75, 0.04, 0.06), uTension * smoothstep(0.08, 0.5, r) * (0.35 + 0.35 * beat));
      // Very light grain to avoid banding in dark gradients.
      col += (hash(vUv * 1024.0 + uTime) - 0.5) * 0.012;
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `,
};

export class PostFX {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass;
  private fxaa: ShaderPass | null = null;
  private renderPass: RenderPass;
  tension = 0;
  fade = 0;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, q: QualityPreset, w: number, h: number) {
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaaSamples });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.4, 0.45, 1.0);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    if (q.msaaSamples === 0) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
    this.setSize(w, h);
  }

  applyTheme(t: LightingTheme) {
    if (this.bloom) {
      this.bloom.strength = t.bloom;
      this.bloom.threshold = 1.0;
    }
    const u = this.grade.uniforms;
    u.uSaturation.value = t.saturation;
    u.uContrast.value = t.contrast;
    u.uTint.value = t.tint;
    u.uVignette.value = t.vignette;
  }

  /** Explicit bloom/grade for realms (photo backdrops need a high bloom threshold so the sky never glows). */
  applyRealm(bloom: { strength: number; threshold: number }, g: { saturation: number; contrast: number; tint: number; vignette: number }) {
    if (this.bloom) {
      this.bloom.strength = bloom.strength;
      this.bloom.threshold = bloom.threshold;
    }
    const u = this.grade.uniforms;
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uTint.value = g.tint;
    u.uVignette.value = g.vignette;
  }

  setCamera(camera: THREE.Camera) {
    this.renderPass.camera = camera;
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    if (this.fxaa) {
      const pr = this.renderer.getPixelRatio();
      this.fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    }
  }

  render(dt: number) {
    const u = this.grade.uniforms;
    u.uTime.value += dt;
    u.uTension.value += (this.tension - u.uTension.value) * Math.min(1, dt * 3);
    u.uFade.value += (this.fade - u.uFade.value) * Math.min(1, dt * 4);
    this.composer.render(dt);
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom?.dispose();
    this.composer.dispose();
  }
}

/** Gradient sky + softboxes rendered into a PMREM environment map for reflections. */
export function buildEnvironment(renderer: THREE.WebGLRenderer, t: LightingTheme): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(10, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(t.envTop) },
      mid: { value: new THREE.Color(t.envHorizon) },
      bot: { value: new THREE.Color(t.envBottom) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `uniform vec3 top, mid, bot; varying vec3 vP;
      void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, pow(y, 0.6)) : mix(mid, bot, pow(-y, 0.5)); gl_FragColor = vec4(c, 1.0);} `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const box = (w: number, h: number, pos: [number, number, number], color: number, intensity: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  // Key softbox above-front, two strip lights at the sides, a faint fill opposite.
  box(5, 3, [t.sunDir[0] * 0.5, 7, t.sunDir[2] * 0.5 + 2], t.envKey, 3.2 * t.envIntensity);
  box(1.2, 6, [-7, 3, 1], t.envKey, 1.6 * t.envIntensity);
  box(1.2, 6, [7, 3, -1], t.envHorizon, 1.4 * t.envIntensity);
  box(4, 2, [0, 2, -8], t.envTop, 1.0 * t.envIntensity);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.traverse(o => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).geometry.dispose();
      ((o as THREE.Mesh).material as THREE.Material).dispose();
    }
  });
  return rt;
}
