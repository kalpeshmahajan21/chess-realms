import * as THREE from 'three';
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js';

/**
 * A real 360° photograph projected onto a sphere whose lower half is flattened into a ground plane,
 * so the board can stand on the photographed floor.
 *
 * The photo is an already-tonemapped JPG. The renderer applies ACES + exposure to everything at the end,
 * which would darken and flatten the photo a second time. This shader applies the exact inverse of
 * three.js's ACESFilmic curve so the final pixels match the original photograph.
 */
export const INVERSE_ACES = /* glsl */ `
  uniform float uExposure;
  uniform float uBrightness;
  vec3 invRRT(vec3 y) {
    // Solve y = (v^2 + a v - b) / (c v^2 + d v + e) for v >= 0, per channel.
    const float a = 0.0245786, b = 0.000090537, c = 0.983729, d = 0.4329510, e = 0.238081;
    y = clamp(y, 0.0, 0.985);
    vec3 A = y * c - 1.0;
    vec3 B = y * d - a;
    vec3 C = y * e + b;
    vec3 disc = max(B * B - 4.0 * A * C, 0.0);
    return (-B - sqrt(disc)) / (2.0 * A);
  }
  vec3 inverseACES(vec3 L) {
    const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    vec3 v = invRRT(inverse(outM) * L);
    vec3 c = inverse(inM) * v;
    return max(c, 0.0) * 0.6 / uExposure;
  }
`;

export interface PhotoBackdropOptions {
  /** Height of the photographer's camera above the ground, in world units. */
  cameraHeight: number;
  /** Where the photographed ground sits in world space. */
  groundY: number;
  radius?: number;
  /** Rotation of the panorama around Y (radians) to choose what faces the player. */
  rotation?: number;
  brightness?: number;
}

export class PhotoBackdrop {
  readonly group = new THREE.Group();
  readonly skybox: GroundedSkybox;
  private material: THREE.MeshBasicMaterial;
  private shadowCatcher: THREE.Mesh;
  private uniforms = { uExposure: { value: 1 }, uBrightness: { value: 1 } };

  constructor(photo: THREE.Texture, opts: PhotoBackdropOptions) {
    photo.colorSpace = THREE.SRGBColorSpace;
    photo.mapping = THREE.UVMapping;
    photo.anisotropy = 4;
    photo.generateMipmaps = true;
    photo.minFilter = THREE.LinearMipmapLinearFilter;
    const radius = opts.radius ?? 900;
    this.skybox = new GroundedSkybox(photo, opts.cameraHeight, radius, 96);
    this.skybox.position.y = opts.groundY + opts.cameraHeight;
    this.skybox.rotation.y = opts.rotation ?? 0;
    this.skybox.renderOrder = -20;
    this.skybox.frustumCulled = false;
    this.material = this.skybox.material as THREE.MeshBasicMaterial;
    this.material.fog = false;
    this.uniforms.uBrightness.value = opts.brightness ?? 1;
    this.material.onBeforeCompile = shader => {
      shader.uniforms.uExposure = this.uniforms.uExposure;
      shader.uniforms.uBrightness = this.uniforms.uBrightness;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${INVERSE_ACES}`)
        .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = inverseACES(diffuseColor.rgb * uBrightness);');
    };
    this.material.customProgramCacheKey = () => 'photo-backdrop-inverse-aces';

    // Invisible ground that only shows the shadows of the board and props on the photographed floor.
    const catcherGeo = new THREE.CircleGeometry(60, 48);
    catcherGeo.rotateX(-Math.PI / 2);
    this.shadowCatcher = new THREE.Mesh(catcherGeo, new THREE.ShadowMaterial({ opacity: 0.42, color: 0x10100c }));
    this.shadowCatcher.position.y = opts.groundY + 0.01;
    this.shadowCatcher.receiveShadow = true;
    this.group.add(this.skybox, this.shadowCatcher);
  }

  setExposure(exposure: number) {
    this.uniforms.uExposure.value = exposure;
  }

  setShadowOpacity(o: number) {
    (this.shadowCatcher.material as THREE.ShadowMaterial).opacity = o;
  }

  dispose() {
    this.skybox.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.shadowCatcher.geometry.dispose();
    (this.shadowCatcher.material as THREE.Material).dispose();
  }
}
