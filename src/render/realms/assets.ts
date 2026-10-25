import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Base URL for realm assets (served from /public/realms). */
export const ASSET_ROOT = `${import.meta.env.BASE_URL}realms/`;

const hdrLoader = new HDRLoader();
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

/**
 * Tracks everything a realm loads so it can all be released when the player switches realms.
 */
export class AssetScope {
  private disposables = new Set<{ dispose(): void }>();
  /** Bytes requested (rough indicator for the loading UI). */
  loaded = 0;

  track<T extends { dispose(): void }>(d: T): T {
    this.disposables.add(d);
    return d;
  }

  /** Load an equirect HDR. `clamp` caps extreme highlights (e.g. street lamps) that would cause flares in reflections. */
  async hdr(path: string, clamp?: number): Promise<THREE.DataTexture> {
    const tex = await hdrLoader.loadAsync(ASSET_ROOT + path);
    if (clamp) clampHdr(tex, clamp);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    this.loaded++;
    return this.track(tex);
  }

  async texture(path: string, opts: { srgb?: boolean; repeat?: [number, number]; anisotropy?: number } = {}): Promise<THREE.Texture> {
    const tex = await texLoader.loadAsync(ASSET_ROOT + path);
    tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = opts.anisotropy ?? 8;
    if (opts.repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(...opts.repeat);
    }
    this.loaded++;
    return this.track(tex);
  }

  /** A scanned PBR texture set: albedo (sRGB) + OpenGL normal + roughness. */
  async pbr(name: string, repeat: [number, number] = [1, 1]): Promise<{ map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }> {
    const [map, normalMap, roughnessMap] = await Promise.all([
      this.texture(`tex/${name}/diff.jpg`, { repeat }),
      this.texture(`tex/${name}/nor.jpg`, { srgb: false, repeat }),
      this.texture(`tex/${name}/rough.jpg`, { srgb: false, repeat }),
    ]);
    return { map, normalMap, roughnessMap };
  }

  async image(path: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.decoding = 'async';
    img.src = ASSET_ROOT + path;
    await img.decode();
    this.loaded++;
    return img;
  }

  async model(path: string): Promise<THREE.Group> {
    const gltf: GLTF = await gltfLoader.loadAsync(ASSET_ROOT + path);
    this.loaded++;
    gltf.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      this.track(m.geometry);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mat => {
        this.track(mat);
        for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) this.track(v as THREE.Texture);
      });
    });
    return gltf.scene;
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables.clear();
  }
}

function clampHdr(tex: THREE.DataTexture, max: number) {
  const data = (tex.image as { data: Uint16Array | Float32Array }).data;
  if (tex.type === THREE.HalfFloatType) {
    const cap = THREE.DataUtils.toHalfFloat(max);
    for (let i = 0; i < data.length; i++) {
      if ((i & 3) !== 3 && THREE.DataUtils.fromHalfFloat(data[i]) > max) data[i] = cap;
    }
  } else {
    for (let i = 0; i < data.length; i++) if ((i & 3) !== 3 && data[i] > max) data[i] = max;
  }
  tex.needsUpdate = true;
}

/** Direction (unit vector) of the brightest region of an equirectangular HDR — i.e. the sun. */
export function findSunDirection(tex: THREE.DataTexture): THREE.Vector3 {
  const img = tex.image as { data: ArrayLike<number>; width: number; height: number };
  const { data, width, height } = img;
  const half = tex.type === THREE.HalfFloatType;
  const read = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  let best = -1;
  let bx = 0;
  let by = 0;
  // Coarse scan of the upper hemisphere only.
  for (let y = 0; y < height / 2; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const l = read(i) * 0.2126 + read(i + 1) * 0.7152 + read(i + 2) * 0.0722;
      if (l > best) {
        best = l;
        bx = x;
        by = y;
      }
    }
  }
  const u = (bx + 0.5) / width;
  const v = (by + 0.5) / height;
  const phi = u * Math.PI * 2; // longitude
  const theta = v * Math.PI; // from zenith
  // Inverse of three.js equirectUv(): u = atan2(z, x) / 2π + 0.5, v = asin(y) / π + 0.5.
  const dir = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), -Math.sin(phi) * Math.sin(theta));
  // Real suns low on the horizon still need to light the board from above a little.
  if (dir.y < 0.25) dir.y = 0.25;
  return dir.normalize();
}
