import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface BatchStats {
  meshesBefore: number;
  meshesAfter: number;
  dynamic: number;
}

function isBatchable(m: THREE.Mesh): boolean {
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (Array.isArray(m.material)) return false;
  const mat = m.material as THREE.Material & { vertexColors?: boolean };
  if (mat.transparent || (mat as THREE.ShaderMaterial).isShaderMaterial || mat.vertexColors) return false;
  if (m.geometry.morphAttributes && Object.keys(m.geometry.morphAttributes).length) return false;
  return !!m.geometry.attributes.position;
}

function hasFlaggedAncestor(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
    if (p.userData && Object.keys(p.userData).length > 0) return true;
  }
  return false;
}

/**
 * Merge static meshes that share a material into one mesh each.
 * `simulate` advances the scene's own animation; anything whose world transform or visibility
 * changes during the dry run is treated as dynamic and left untouched. Material instances are
 * kept (not deduplicated) so code that animates material colours keeps working.
 */
export function batchStatic(root: THREE.Object3D, simulate: (dt: number) => void): BatchStats {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const before = new Map<THREE.Mesh, { m: Float32Array; v: boolean }>();
  meshes.forEach(m => before.set(m, { m: new Float32Array(m.matrixWorld.elements), v: m.visible }));

  // Dry run with a fake clock (several builders animate from performance.now()).
  const perf = performance as Performance & { now: () => number };
  const realNow = perf.now.bind(perf);
  let fake = realNow();
  perf.now = () => fake;
  try {
    for (let i = 0; i < 24; i++) {
      fake += 47;
      simulate(0.047);
    }
  } finally {
    perf.now = realNow;
  }
  root.updateMatrixWorld(true);

  const dynamic = new Set<THREE.Mesh>();
  for (const m of meshes) {
    const b = before.get(m)!;
    const e = m.matrixWorld.elements;
    let moved = b.v !== m.visible;
    for (let i = 0; i < 16 && !moved; i++) if (Math.abs(e[i] - b.m[i]) > 1e-5) moved = true;
    if (moved) dynamic.add(m);
  }

  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, THREE.Mesh[]>();
  for (const m of meshes) {
    if (dynamic.has(m) || !m.visible || !isBatchable(m) || hasFlaggedAncestor(m, root)) continue;
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(m);
  }

  let removed = 0;
  let added = 0;
  const retired = new Set<THREE.BufferGeometry>();
  groups.forEach(list => {
    if (list.length < 2) return;
    const parts: THREE.BufferGeometry[] = [];
    for (const m of list) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const mtx = new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld);
      g.applyMatrix4(mtx);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      g.clearGroups();
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    if (!merged) return;
    const first = list[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.name = `batched:${(first.material as THREE.Material).name || first.name}`;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    added++;
    for (const m of list) {
      m.parent?.remove(m);
      retired.add(m.geometry);
      removed++;
    }
  });

  // Dispose geometries no longer referenced by any remaining mesh.
  const live = new Set<THREE.BufferGeometry>();
  root.traverse(o => {
    if ((o as THREE.Mesh).isMesh) live.add((o as THREE.Mesh).geometry);
  });
  retired.forEach(g => {
    if (!live.has(g)) g.dispose();
  });

  // Freeze matrices of everything static that remains (saves per-frame matrix updates).
  root.traverse(o => {
    if ((o as THREE.Mesh).isMesh && !dynamic.has(o as THREE.Mesh) && !hasFlaggedAncestor(o, root)) {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    }
  });

  return { meshesBefore: meshes.length, meshesAfter: meshes.length - removed + added, dynamic: dynamic.size };
}
