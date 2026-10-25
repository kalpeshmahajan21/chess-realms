import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AssetScope, findSunDirection } from './assets.ts';
import { PhotoBackdrop } from './PhotoBackdrop.ts';
import type { Realm, RealmContext, RealmLighting } from './types.ts';

/*
 * World scale for photo realms: 1 unit = 10 cm. The board top is at y = 0.
 * The panoramas were shot from ~1.7 m, i.e. 17 units above the photographed ground.
 */
export const PHOTO_CAMERA_HEIGHT = 17;

export function photoFile(name: string, ctx: RealmContext) {
  const big = ctx.qualityName === 'high' && ctx.renderer.capabilities.maxTextureSize >= 8192;
  return `photo/${name}_${big ? '8k' : '4k'}.jpg`;
}

export function rotateY(v: THREE.Vector3, a: number) {
  return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
}

// ---------------------------------------------------------------------------- Football stadium

export async function createStadium(ctx: RealmContext): Promise<Realm> {
  const assets = new AssetScope();
  const group = new THREE.Group();
  group.name = 'Realm:stadium';
  const groundY = -4.6; // stage ≈ 45 cm above the pitch
  const rotation = 1.15; // main covered stand behind the board

  const [env, photo, ball] = await Promise.all([
    assets.hdr('hdri/stadium_01_1k.hdr'),
    assets.texture(photoFile('stadium_01', ctx)),
    assets.model('models/football.glb').catch(() => null),
  ]);

  const backdrop = new PhotoBackdrop(photo, { cameraHeight: PHOTO_CAMERA_HEIGHT, groundY, rotation });
  group.add(backdrop.group);

  // Broadcast-style stage: matte black deck, brushed-steel edge, white trim line.
  const deckMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.85, metalness: 0.05 }));
  const steelMat = assets.track(new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.45, metalness: 0.8 }));
  const trimMat = assets.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  const deckH = -0.33 - groundY;
  const W = 11.6;
  const deck = new THREE.Mesh(assets.track(new RoundedBoxGeometry(W, deckH, W, 4, 0.2)), deckMat);
  deck.position.y = groundY + deckH / 2;
  // Thin brushed-steel band around the top edge and a white line near the grass.
  const bandShape = new THREE.Shape();
  const o = W / 2 + 0.06;
  bandShape.moveTo(-o, -o); bandShape.lineTo(o, -o); bandShape.lineTo(o, o); bandShape.lineTo(-o, o); bandShape.lineTo(-o, -o);
  const hole = new THREE.Path();
  const i = W / 2 - 0.12;
  hole.moveTo(-i, -i); hole.lineTo(-i, i); hole.lineTo(i, i); hole.lineTo(i, -i); hole.lineTo(-i, -i);
  bandShape.holes.push(hole);
  const bandGeo = assets.track(new THREE.ExtrudeGeometry(bandShape, { depth: 0.35, bevelEnabled: false }));
  bandGeo.rotateX(-Math.PI / 2);
  const edge = new THREE.Mesh(bandGeo, steelMat);
  edge.position.y = -0.33 - 0.35;
  const trimGeo = assets.track(new THREE.ExtrudeGeometry(bandShape, { depth: 0.08, bevelEnabled: false }));
  trimGeo.rotateX(-Math.PI / 2);
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.position.y = groundY + 0.6;
  [deck, edge, trim].forEach(m => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });

  if (ball) {
    const box = new THREE.Box3().setFromObject(ball);
    const s = 2.2 / Math.max(box.getSize(new THREE.Vector3()).y, 0.001); // 22 cm ball
    ball.scale.setScalar(s);
    ball.position.set(8.6, groundY - box.min.y * s, 5.8);
    ball.rotation.set(0.3, 1.2, 0.1);
    group.add(ball);
  }

  const sunDir = rotateY(findSunDirection(env), rotation);
  const lighting: RealmLighting = {
    environment: env,
    envIntensity: 1,
    envRotation: rotation,
    sunDir,
    sunColor: 0xffe4c4,
    sunIntensity: 2.4,
    hemiIntensity: 0,
    exposure: 1,
    fog: null,
    bloom: { strength: 0.15, threshold: 8 },
    grade: { saturation: 1.04, contrast: 1.03, tint: 0.02, vignette: 0.22 },
    shadowOpacity: 0.5,
  };
  backdrop.setExposure(lighting.exposure);
  backdrop.setShadowOpacity(lighting.shadowOpacity!);

  // Camera flashes from the stands when a piece is captured.
  const flashes: { sprite: THREE.Sprite; t: number }[] = [];
  const flashTex = assets.track(makeFlashTexture());
  const onImpact = () => {
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const s = new THREE.Sprite(mat);
      const a = rotation + Math.PI * (0.25 + Math.random() * 1.5);
      const r = 260 + Math.random() * 120;
      s.position.set(Math.cos(a) * r, groundY + 25 + Math.random() * 60, -Math.sin(a) * r);
      s.scale.setScalar(6 + Math.random() * 6);
      group.add(s);
      flashes.push({ sprite: s, t: -Math.random() * 0.5 });
    }
  };

  return {
    group,
    lighting,
    boardStand: 'none',
    far: 1600,
    seatPolar: 1.1,
    menuPolar: 1.38,
    onImpact,
    update(dt) {
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.t += dt;
        const k = f.t < 0 ? 0 : Math.max(0, 1 - f.t / 0.18);
        (f.sprite.material as THREE.SpriteMaterial).opacity = k;
        if (f.t > 0.2) {
          group.remove(f.sprite);
          f.sprite.material.dispose();
          flashes.splice(i, 1);
        }
      }
    },
    dispose() {
      flashes.forEach(f => f.sprite.material.dispose());
      backdrop.dispose();
      assets.dispose();
    },
  };
}

function makeFlashTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
