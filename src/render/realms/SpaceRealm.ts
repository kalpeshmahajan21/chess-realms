import * as THREE from 'three';
import { AssetScope } from './assets.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * Deep space above Earth. All imagery is NASA public domain:
 *  - Milky Way: NASA/Goddard SVS "Deep Star Maps 2020" (milkyway layer)
 *  - Earth: NASA Blue Marble (Dec 2004), Blue Marble clouds, Black Marble city lights 2012
 *  - Moon: NASA SVS CGI Moon Kit (LRO)
 */

const SUN_DIR = new THREE.Vector3(0.75, 0.32, -0.58).normalize();

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uCloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vec3 n = normalize(vNormalW);
    float ndl = dot(n, uSunDir);
    float day = smoothstep(-0.12, 0.25, ndl);
    vec3 dayCol = texture2D(uDay, vUv).rgb;
    vec3 nightCol = texture2D(uNight, vUv).rgb;
    float cloud = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r;
    // Lambert-lit surface with clouds on top.
    vec3 lit = mix(dayCol, vec3(1.0), cloud * 0.9) * max(ndl, 0.0) * 1.6;
    // City lights glow on the night side, dimmed under clouds.
    vec3 cities = pow(nightCol, vec3(1.6)) * vec3(1.0, 0.75, 0.45) * 2.2 * (1.0 - cloud);
    vec3 col = mix(cities, lit, day);
    // Ocean glint.
    vec3 h = normalize(uSunDir + vViewDirW);
    float water = smoothstep(0.08, 0.02, length(dayCol - vec3(0.02, 0.05, 0.13)));
    col += vec3(1.0, 0.92, 0.8) * pow(max(dot(n, h), 0.0), 120.0) * water * (1.0 - cloud) * day * 1.5;
    // Atmosphere: blue rim on the lit limb, warm terminator.
    float rim = pow(1.0 - max(dot(n, vViewDirW), 0.0), 3.0);
    float limbLight = smoothstep(-0.25, 0.4, ndl);
    col += vec3(0.32, 0.55, 1.0) * rim * limbLight * 1.4;
    col += vec3(1.0, 0.45, 0.2) * rim * smoothstep(0.2, 0.0, abs(ndl)) * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vec3 n = normalize(vNormalW);
    float view = dot(n, vViewDirW);
    float rim = pow(clamp(1.0 - abs(view), 0.0, 1.0), 4.0);
    float lit = smoothstep(-0.35, 0.5, dot(n, uSunDir));
    gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * lit * 1.8, rim * lit);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uScale;
  uniform float uTime;
  void main() {
    vColor = aColor * (0.85 + 0.15 * sin(uTime * 2.0 + position.x * 13.0));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale;
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 6.0);
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const SUN_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;
    float core = smoothstep(0.12, 0.08, d);
    float glow = exp(-d * 5.0) * 1.2 + exp(-d * 14.0) * 2.0;
    float rays = pow(max(0.0, 1.0 - abs(p.y) * 60.0), 3.0) + pow(max(0.0, 1.0 - abs(p.x) * 60.0), 3.0);
    vec3 col = vec3(1.0, 0.96, 0.88) * (core * 30.0 + glow * 4.0) + vec3(1.0, 0.85, 0.6) * rays * (1.0 - d) * 2.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export async function createSpace(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:space';

  const [milky, day, night, clouds, moonTex] = await Promise.all([
    assets.texture('space/milkyway_4k.jpg'),
    assets.texture(ctx.qualityName === 'low' ? 'space/earth_day_2k.jpg' : 'space/earth_day_4k.jpg'),
    assets.texture('space/earth_night_2k.jpg'),
    assets.texture('space/earth_clouds_2k.jpg', { srgb: false }),
    assets.texture('space/moon_1k.jpg'),
  ]);

  // ------------------------------------------------------------------ sky: Milky Way + crisp stars
  milky.mapping = THREE.EquirectangularReflectionMapping;
  const skyMat = assets.track(new THREE.MeshBasicMaterial({ map: milky, side: THREE.BackSide, depthWrite: false, fog: false, color: 0x8a8a8a }));
  const sky = new THREE.Mesh(assets.track(new THREE.SphereGeometry(1400, 64, 32)), skyMat);
  sky.rotation.set(0.5, 1.2, 0.35); // tilt the galactic band across the view
  sky.renderOrder = -20;
  group.add(sky);

  const starCount = Math.round(9000 * Math.max(0.4, ctx.quality.particles));
  const sp = new Float32Array(starCount * 3);
  const ss = new Float32Array(starCount);
  const scol = new Float32Array(starCount * 3);
  const c = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1200);
    sp.set([v.x, v.y, v.z], i * 3);
    const mag = Math.pow(Math.random(), 9); // a few bright stars, many faint ones
    ss[i] = 1.2 + mag * 6;
    const temp = Math.random();
    c.setHSL(temp < 0.2 ? 0.08 : temp < 0.75 ? 0.6 : 0.62, temp < 0.2 ? 0.5 : 0.2, 0.75 + mag * 0.25);
    scol.set([c.r * (0.5 + mag * 2), c.g * (0.5 + mag * 2), c.b * (0.5 + mag * 2)], i * 3);
  }
  const starGeo = assets.track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(scol, 3));
  const starMat = assets.track(new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uScale: { value: Math.min(window.devicePixelRatio || 1, 2) }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  group.add(stars);

  // ------------------------------------------------------------------ Earth
  const earthGroup = new THREE.Group();
  earthGroup.position.set(-30, -170, -260);
  const earthR = 150;
  const earthUniforms = {
    uDay: { value: day },
    uNight: { value: night },
    uClouds: { value: clouds },
    uSunDir: { value: SUN_DIR.clone() },
    uCloudShift: { value: 0 },
  };
  const earth = new THREE.Mesh(
    assets.track(new THREE.SphereGeometry(earthR, 128, 64)),
    assets.track(new THREE.ShaderMaterial({ vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG, uniforms: earthUniforms }))
  );
  earth.rotation.set(0.35, -1.9, 0.1);
  const halo = new THREE.Mesh(
    assets.track(new THREE.SphereGeometry(earthR * 1.035, 96, 48)),
    assets.track(new THREE.ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: { uSunDir: earthUniforms.uSunDir },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    }))
  );
  earthGroup.add(earth, halo);
  group.add(earthGroup);

  // ------------------------------------------------------------------ Moon
  moonTex.anisotropy = 8;
  const moon = new THREE.Mesh(
    assets.track(new THREE.SphereGeometry(16, 64, 32)),
    assets.track(new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1, metalness: 0 }))
  );
  moon.position.set(170, 55, -330);
  group.add(moon);

  // ------------------------------------------------------------------ Saturn (procedural banding, far away)
  const bandCanvas = document.createElement('canvas');
  bandCanvas.width = 4;
  bandCanvas.height = 256;
  const bctx = bandCanvas.getContext('2d')!;
  for (let y = 0; y < 256; y++) {
    const t = y / 256;
    const v = 0.78 + Math.sin(t * 40) * 0.05 + Math.sin(t * 97) * 0.03;
    bctx.fillStyle = `rgb(${Math.round(225 * v)},${Math.round(196 * v)},${Math.round(140 * v)})`;
    bctx.fillRect(0, y, 4, 1);
  }
  const bandTex = assets.track(new THREE.CanvasTexture(bandCanvas));
  bandTex.colorSpace = THREE.SRGBColorSpace;
  const saturn = new THREE.Group();
  const saturnBody = new THREE.Mesh(assets.track(new THREE.SphereGeometry(22, 64, 32)), assets.track(new THREE.MeshStandardMaterial({ map: bandTex, roughness: 1 })));
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = 512;
  ringCanvas.height = 4;
  const rctx = ringCanvas.getContext('2d')!;
  for (let x = 0; x < 512; x++) {
    const t = x / 512;
    const gap = t > 0.62 && t < 0.66 ? 0.05 : 1; // Cassini division
    const a = (0.35 + 0.5 * Math.abs(Math.sin(t * 60)) * 0.6 + Math.random() * 0.15) * gap * (t < 0.05 ? t / 0.05 : 1);
    rctx.fillStyle = `rgba(${200 + Math.random() * 30},${180 + Math.random() * 20},${140 + Math.random() * 20},${a})`;
    rctx.fillRect(x, 0, 1, 4);
  }
  const ringTex = assets.track(new THREE.CanvasTexture(ringCanvas));
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const ringGeo = assets.track(new THREE.RingGeometry(28, 50, 128, 1));
  // Remap UVs so the texture runs radially.
  const rp = ringGeo.attributes.position as THREE.BufferAttribute;
  const ruv = ringGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const rr = Math.hypot(rp.getX(i), rp.getY(i));
    ruv.setXY(i, (rr - 28) / 22, 0.5);
  }
  const ring = new THREE.Mesh(ringGeo, assets.track(new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 })));
  ring.rotation.x = -Math.PI / 2 + 0.45;
  saturn.add(saturnBody, ring);
  saturn.position.set(-420, 140, -700);
  saturn.rotation.z = 0.35;
  group.add(saturn);

  // ------------------------------------------------------------------ Sun with glare
  const sun = new THREE.Mesh(
    assets.track(new THREE.PlaneGeometry(220, 220)),
    assets.track(new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} ',
      fragmentShader: SUN_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
  );
  sun.position.copy(SUN_DIR).multiplyScalar(1100);
  group.add(sun);

  // ------------------------------------------------------------------ floating platform under the board
  const platMat = assets.track(new THREE.MeshPhysicalMaterial({ color: 0x0d0f14, metalness: 0.9, roughness: 0.25, clearcoat: 1 }));
  const plat = new THREE.Mesh(assets.track(new THREE.CylinderGeometry(7.6, 6.2, 0.9, 96)), platMat);
  plat.position.y = -0.33 - 0.45;
  plat.castShadow = true;
  plat.receiveShadow = true;
  const glowRing = new THREE.Mesh(
    assets.track(new THREE.TorusGeometry(7.0, 0.07, 12, 160)),
    assets.track(new THREE.MeshBasicMaterial({ color: 0x8fc7ff, toneMapped: false }))
  );
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = -1.25;
  const under = new THREE.Mesh(
    assets.track(new THREE.CircleGeometry(6.2, 64)),
    assets.track(new THREE.MeshBasicMaterial({ color: 0x3d6dff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
  );
  under.rotation.x = Math.PI / 2;
  under.position.y = -1.24;
  const platform = new THREE.Group();
  platform.add(plat, glowRing, under);
  group.add(platform);

  // Environment for reflections: black space, the Sun, and Earth's blue glow from below.
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020306);
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.9).multiplyScalar(60) }));
  envSun.position.copy(SUN_DIR).multiplyScalar(400);
  const envEarth = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.25, 0.55).multiplyScalar(1.4) }));
  envEarth.position.set(-30, -520, -300);
  envScene.add(envSun, envEarth);
  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  const envRT = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();
  envScene.traverse(o => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh) {
      mm.geometry.dispose();
      (mm.material as THREE.Material).dispose();
    }
  });

  const lighting: RealmLighting = {
    environment: envRT.texture,
    prefiltered: true,
    envIntensity: 1,
    envRotation: 0,
    // Key light from the front-right keeps pieces readable; the visible Sun stays behind as a rim.
    sunDir: new THREE.Vector3(0.55, 0.62, 0.56).normalize(),
    sunColor: 0xfff5ea,
    sunIntensity: 3.2,
    hemiIntensity: 0.3,
    rim: { dir: SUN_DIR.clone(), color: 0xfff2e0, intensity: 2.6 },
    exposure: 1,
    fog: null,
    bloom: { strength: 0.55, threshold: 1.1 },
    grade: { saturation: 1.05, contrast: 1.08, tint: -0.02, vignette: 0.35 },
  };

  let time = 0;
  return {
    group,
    lighting,
    boardStand: 'none',
    far: 2000,
    seatPolar: 1.0,
    menuPolar: 1.22,
    update(dt) {
      time += dt;
      earth.rotation.y += dt * 0.006;
      earthUniforms.uCloudShift.value = (earthUniforms.uCloudShift.value + dt * 0.0015) % 1;
      moon.rotation.y += dt * 0.01;
      saturn.rotation.y += dt * 0.004;
      sky.rotation.y += dt * 0.0025; // slow drift through space
      stars.rotation.y += dt * 0.0025;
      starMat.uniforms.uTime.value = time;
      platform.position.y = Math.sin(time * 0.6) * 0.04;
      (under.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(time * 1.4) * 0.06;
    },
    dispose() {
      envRT.dispose();
      assets.dispose();
    },
  };
}
