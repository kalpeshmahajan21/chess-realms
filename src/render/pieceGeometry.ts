import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PieceType } from '../engine/chess.ts';
import type { PieceSetId } from '../types.ts';
import {
  buildWarriorPawn, buildWarriorRook, buildWarriorKnight, buildWarriorBishop, buildWarriorQueen, buildWarriorKing,
} from '../graphics/pieceBuilder.ts';

/**
 * Procedural tournament Staunton set. Units: one board square = 1.0.
 * Every piece is returned as ONE merged geometry (one draw call), cached per type and detail level.
 * For the Warrior set the geometry has two groups: [0] body, [1] gold trim.
 */

type P = THREE.Path;

/** Common stepped foot: flat bottom, rounded edge, bead and scotia. Leaves the pen at (stemR, topY). */
function foot(path: P, R: number, stemR: number, topY: number) {
  path.moveTo(0, 0);
  path.lineTo(R, 0);
  path.lineTo(R, 0.03);
  path.quadraticCurveTo(R + 0.004, 0.058, R - 0.028, 0.064);
  path.lineTo(R * 0.86, 0.07);
  path.quadraticCurveTo(R * 0.93, 0.095, R * 0.84, 0.118); // torus bead
  path.lineTo(R * 0.8, 0.122);
  path.quadraticCurveTo(R * 0.66, 0.13, R * 0.64, 0.15); // scotia
  path.bezierCurveTo(R * 0.62, 0.165, stemR * 1.25, topY - 0.02, stemR, topY);
}

/** A collar: thin disc then bead, used between stem and head. */
function collar(path: P, y: number, r: number, neckR: number) {
  const cur = path.currentPoint.clone();
  path.lineTo(cur.x, y);
  path.quadraticCurveTo(r + 0.012, y + 0.004, r, y + 0.018);
  path.quadraticCurveTo(r + 0.01, y + 0.03, r * 0.82, y + 0.04);
  path.quadraticCurveTo(r * 0.98, y + 0.05, r * 0.9, y + 0.064);
  path.lineTo(neckR, y + 0.072);
}

function lathe(path: P, segments: number, divisions = 6, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const pts = path.getPoints(divisions).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
  // Remove consecutive duplicates (they create degenerate, black-shading triangles).
  const clean = pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-8);
  return new THREE.LatheGeometry(clean, segments, phiStart, phiLength);
}

function prepare(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2));
  }
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  if (geo !== g) g.dispose();
  return geo;
}

function merge(parts: THREE.BufferGeometry[], groups = false): THREE.BufferGeometry {
  const prepared = parts.map(prepare);
  const merged = mergeGeometries(prepared, groups)!;
  prepared.forEach(p => p.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Reverse triangle winding and normals (for end caps of partial lathes). */
function flip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.attributes.position.array as Float32Array;
  const nor = geo.attributes.normal.array as Float32Array;
  for (let i = 0; i < pos.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const a = pos[i + 3 + k];
      pos[i + 3 + k] = pos[i + 6 + k];
      pos[i + 6 + k] = a;
      const b = nor[i + 3 + k];
      nor[i + 3 + k] = nor[i + 6 + k];
      nor[i + 6 + k] = b;
    }
  }
  for (let i = 0; i < nor.length; i++) nor[i] = -nor[i];
  return geo;
}

/** Partial lathe of a closed polygon with both end faces capped. */
function cappedArc(poly: [number, number][], seg: number, phiStart: number, phiLength: number): THREE.BufferGeometry[] {
  const pts = poly.map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry([...pts, pts[0]], seg, phiStart, phiLength);
  const shape = new THREE.Shape(pts);
  const capA = new THREE.ShapeGeometry(shape);
  capA.rotateY(phiStart - Math.PI / 2);
  const capB = flip(new THREE.ShapeGeometry(shape));
  capB.rotateY(phiStart + phiLength - Math.PI / 2);
  return [body, capA, capB];
}

// ----------------------------------------------------------------------------- Staunton

function stauntonPawn(seg: number) {
  const p = new THREE.Path();
  foot(p, 0.27, 0.12, 0.2);
  p.bezierCurveTo(0.1, 0.27, 0.078, 0.35, 0.082, 0.4);
  collar(p, 0.4, 0.15, 0.07);
  // Head: sphere joined at the neck
  const r = 0.118;
  const cy = 0.472 + Math.sqrt(r * r - 0.07 * 0.07);
  const a0 = -Math.acos(0.07 / r);
  p.absarc(0, cy, r, a0, Math.PI / 2, false);
  return merge([lathe(p, seg, 8)]);
}

function stauntonRook(seg: number) {
  const p = new THREE.Path();
  foot(p, 0.3, 0.17, 0.2);
  p.bezierCurveTo(0.15, 0.32, 0.15, 0.46, 0.175, 0.56);
  p.lineTo(0.19, 0.6);
  p.quadraticCurveTo(0.235, 0.6, 0.235, 0.625); // flared cornice
  p.lineTo(0.235, 0.645);
  p.lineTo(0.215, 0.655);
  p.lineTo(0.225, 0.665);
  p.lineTo(0.225, 0.72); // wall up to the merlons
  p.lineTo(0.165, 0.72);
  p.lineTo(0.165, 0.69); // inner floor of the turret
  p.lineTo(0, 0.69);
  const parts: THREE.BufferGeometry[] = [lathe(p, seg, 6)];
  // Six merlons with real gaps between them.
  const merlons = 6;
  const gap = 0.28; // fraction of each slot left open
  const slot = (Math.PI * 2) / merlons;
  for (let i = 0; i < merlons; i++) {
    const start = i * slot + slot * gap * 0.5;
    parts.push(...cappedArc([[0.165, 0.72], [0.225, 0.72], [0.225, 0.8], [0.165, 0.8]], Math.max(4, Math.round(seg / merlons)), start, slot * (1 - gap)));
  }
  return merge(parts);
}

function stauntonBishop(seg: number) {
  const p = new THREE.Path();
  foot(p, 0.29, 0.13, 0.2);
  p.bezierCurveTo(0.1, 0.32, 0.075, 0.46, 0.08, 0.53);
  collar(p, 0.53, 0.155, 0.075);
  // Mitre (onion) head
  p.bezierCurveTo(0.155, 0.62, 0.165, 0.73, 0.11, 0.82);
  p.quadraticCurveTo(0.07, 0.88, 0.025, 0.9);
  p.lineTo(0, 0.905);
  const head = lathe(p, seg, 10);
  // A thin collar ring under the mitre reads as the classic carved band without denting the surface.
  const band = new THREE.TorusGeometry(0.118, 0.012, 8, Math.max(24, seg));
  band.rotateX(Math.PI / 2);
  band.translate(0, 0.625, 0);
  const finial = new THREE.SphereGeometry(0.038, 16, 12);
  finial.translate(0, 0.935, 0);
  return merge([head, band, finial]);
}

function stauntonQueen(seg: number) {
  const p = new THREE.Path();
  foot(p, 0.31, 0.135, 0.2);
  p.bezierCurveTo(0.105, 0.36, 0.075, 0.52, 0.08, 0.64);
  collar(p, 0.64, 0.16, 0.08);
  p.bezierCurveTo(0.1, 0.8, 0.16, 0.86, 0.19, 0.93); // flaring bowl
  p.lineTo(0.2, 0.95);
  p.lineTo(0.182, 0.958);
  p.quadraticCurveTo(0.13, 0.95, 0.09, 0.985); // inner crown dome
  p.quadraticCurveTo(0.05, 1.02, 0.03, 1.03);
  p.lineTo(0, 1.035);
  const body = lathe(p, seg, 8);
  // Coronet points around the rim
  const parts: THREE.BufferGeometry[] = [body];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const ball = new THREE.SphereGeometry(0.03, 10, 8);
    ball.translate(Math.sin(a) * 0.188, 0.975, Math.cos(a) * 0.188);
    parts.push(ball);
  }
  const top = new THREE.SphereGeometry(0.05, 18, 14);
  top.translate(0, 1.07, 0);
  parts.push(top);
  return merge(parts);
}

function stauntonKing(seg: number) {
  const p = new THREE.Path();
  foot(p, 0.32, 0.14, 0.2);
  p.bezierCurveTo(0.11, 0.38, 0.08, 0.58, 0.085, 0.72);
  collar(p, 0.72, 0.165, 0.085);
  p.bezierCurveTo(0.1, 0.86, 0.16, 0.93, 0.18, 1.0);
  p.lineTo(0.19, 1.02);
  p.lineTo(0.17, 1.03);
  p.quadraticCurveTo(0.15, 1.08, 0.1, 1.11); // dome cap
  p.quadraticCurveTo(0.06, 1.13, 0.045, 1.135);
  p.lineTo(0.045, 1.155); // cross socket
  p.lineTo(0, 1.155);
  const body = lathe(p, seg, 8);
  const vert = new RoundedBoxGeometry(0.06, 0.2, 0.05, 2, 0.012);
  vert.translate(0, 1.245, 0);
  const horiz = new RoundedBoxGeometry(0.17, 0.055, 0.05, 2, 0.012);
  horiz.translate(0, 1.265, 0);
  return merge([body, vert, horiz]);
}

/** Classic knight: lathe foot plus an extruded, bevelled horse-head silhouette. */
function stauntonKnight(seg: number) {
  const p = new THREE.Path();
  foot(p, 0.3, 0.2, 0.2);
  p.lineTo(0.2, 0.235);
  p.lineTo(0, 0.235);
  const base = lathe(p, seg, 6);

  // Side silhouette, nose pointing +X (rotated to face the opponent later).
  const s = new THREE.Shape();
  s.moveTo(-0.16, 0.2);
  s.bezierCurveTo(-0.22, 0.34, -0.2, 0.5, -0.16, 0.62); // back of the neck
  s.bezierCurveTo(-0.13, 0.71, -0.09, 0.77, -0.06, 0.8); // mane crest
  s.lineTo(-0.045, 0.9); // ear tip
  s.lineTo(-0.005, 0.815);
  s.bezierCurveTo(0.05, 0.81, 0.1, 0.78, 0.15, 0.71); // forehead
  s.bezierCurveTo(0.2, 0.64, 0.245, 0.6, 0.255, 0.555); // nose bridge
  s.quadraticCurveTo(0.262, 0.515, 0.225, 0.505); // muzzle
  s.lineTo(0.19, 0.505);
  s.lineTo(0.2, 0.485); // mouth
  s.quadraticCurveTo(0.17, 0.455, 0.12, 0.47); // chin
  s.bezierCurveTo(0.07, 0.48, 0.04, 0.46, 0.03, 0.42); // jaw to throat
  s.bezierCurveTo(0.06, 0.36, 0.13, 0.3, 0.15, 0.2); // chest
  s.lineTo(-0.16, 0.2);
  const depth = 0.12;
  const head = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 4,
    curveSegments: 18,
  });
  head.translate(0, 0, -depth / 2);
  // Taper the face slightly so the muzzle is narrower than the neck.
  const pos = head.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const k = 1 - Math.max(0, x) * 0.9;
    pos.setZ(i, pos.getZ(i) * k);
  }
  head.computeVertexNormals();
  // Eyes: two small dents read as bumps; tiny spheres sell it from distance.
  const eyeL = new THREE.SphereGeometry(0.018, 8, 6);
  eyeL.translate(0.12, 0.68, 0.07);
  const eyeR = eyeL.clone();
  eyeR.translate(0, 0, -0.14);
  return merge([base, head, eyeL, eyeR]);
}

// ----------------------------------------------------------------------------- Warrior (v1 signature set)

function warrior(type: PieceType): THREE.BufferGeometry {
  const build = { p: buildWarriorPawn, r: buildWarriorRook, n: buildWarriorKnight, b: buildWarriorBishop, q: buildWarriorQueen, k: buildWarriorKing }[type];
  const { bodyGeoms, goldGeoms } = build();
  const body = merge(bodyGeoms);
  const gold = merge(goldGeoms);
  const both = mergeGeometries([body, gold], true)!;
  body.dispose();
  gold.dispose();
  // v1 pieces were modelled ~35% taller than a Staunton set; scale them to share board proportions.
  both.scale(0.74, 0.74, 0.74);
  both.computeBoundingBox();
  both.computeBoundingSphere();
  return both;
}

// ----------------------------------------------------------------------------- cache

const cache = new Map<string, THREE.BufferGeometry>();

export function getPieceGeometry(set: PieceSetId, type: PieceType, segments: number): THREE.BufferGeometry {
  const key = `${set}|${type}|${set === 'warrior' ? 0 : segments}`;
  let g = cache.get(key);
  if (g) return g;
  if (set === 'warrior') {
    g = warrior(type);
  } else {
    const build = { p: stauntonPawn, r: stauntonRook, n: stauntonKnight, b: stauntonBishop, q: stauntonQueen, k: stauntonKing }[type];
    g = build(segments);
  }
  cache.set(key, g);
  return g;
}

/** Approximate height of each piece (used for lift, camera framing and particles). */
export const PIECE_HEIGHT: Record<PieceType, number> = { p: 0.6, r: 0.8, n: 0.9, b: 0.94, q: 1.1, k: 1.3 };
