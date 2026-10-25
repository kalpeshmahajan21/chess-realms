import * as THREE from 'three';
import type { Move, Piece, PieceColor, PieceType } from '../engine/chess.ts';
import type { PieceSetId, PlayerProfile } from '../types.ts';
import { Animator, ease } from './anim.ts';
import { getPieceGeometry, PIECE_HEIGHT } from './pieceGeometry.ts';
import { getPieceMaterial, getTrimMaterial, PieceMaterialType } from './pieceMaterials.ts';
import { squareCenter } from './BoardView.ts';
import { TIMING, moveDuration } from '../config/gameConfig.ts';

export interface PieceObject {
  mesh: THREE.Mesh;
  type: PieceType;
  color: PieceColor;
  material: PieceMaterialType;
  /** Square the piece rests on (logical). */
  sq: number;
  /** Extra height from hover/select, animated smoothly. */
  lift: number;
  liftTarget: number;
  dragging: boolean;
  /** True while a scripted animation owns the transform. */
  animating: boolean;
  lean: THREE.Vector2;
}

export interface LandingInfo {
  move: Move;
  capturedObj: PieceObject | null;
  impactPoint: THREE.Vector3;
}

export interface MoveHooks {
  /** Mover is about to hit the captured piece. */
  onImpact?: (info: LandingInfo) => void;
  /** Mover has settled on its square. */
  onLand?: (info: LandingInfo) => void;
  onPromote?: (obj: PieceObject) => void;
}

const knightFacing = (color: PieceColor, file: number) => {
  // Show the horse in profile from the player's seat: face the board centre, turned ~20° toward the opponent.
  // Local model nose points +X; rotation.y = θ maps +X to (cos θ, 0, −sin θ).
  const queenside = file < 4;
  const towardOpponent = color === 'w' ? 0.35 : -0.35; // +θ turns toward −Z (Black's side)
  return queenside ? towardOpponent : Math.PI - towardOpponent;
};

/**
 * Owns piece meshes. Geometry and materials are shared; each piece is one Mesh.
 * The 3D board is always derived from the engine board via sync(); animations only move meshes.
 */
export class PieceView {
  readonly group = new THREE.Group();
  private pieces = new Map<number, PieceObject>();
  private dying = new Set<PieceObject>();
  private set: PieceSetId = 'staunton';
  private segments = 48;
  private transmission = true;
  private profiles: { w: PieceMaterialType; b: PieceMaterialType; duplicate: boolean } = { w: 'marble', b: 'obsidian', duplicate: false };
  private tmp = new THREE.Vector3();

  constructor(private animator: Animator) {
    this.group.name = 'Pieces';
  }

  configure(set: PieceSetId, segments: number, transmission: boolean, p1: PlayerProfile, p2: PlayerProfile): boolean {
    const w = p1.color === 'w' ? p1.material : p2.material;
    const b = p1.color === 'b' ? p1.material : p2.material;
    const next = { w, b, duplicate: w === b };
    const changed =
      set !== this.set || segments !== this.segments || transmission !== this.transmission ||
      next.w !== this.profiles.w || next.b !== this.profiles.b;
    this.set = set;
    this.segments = segments;
    this.transmission = transmission;
    this.profiles = next;
    return changed;
  }

  private materialFor(color: PieceColor): THREE.Material | THREE.Material[] {
    const type = color === 'w' ? this.profiles.w : this.profiles.b;
    const body = getPieceMaterial(type, color, this.profiles.duplicate, this.transmission);
    return this.set === 'warrior' ? [body, getTrimMaterial()] : body;
  }

  private create(piece: Piece, sq: number): PieceObject {
    const geo = getPieceGeometry(this.set, piece.type, this.segments);
    const mesh = new THREE.Mesh(geo, this.materialFor(piece.color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `piece_${piece.color}${piece.type}`;
    const obj: PieceObject = {
      mesh,
      type: piece.type,
      color: piece.color,
      material: piece.color === 'w' ? this.profiles.w : this.profiles.b,
      sq,
      lift: 0,
      liftTarget: 0,
      dragging: false,
      animating: false,
      lean: new THREE.Vector2(),
    };
    this.place(obj, sq);
    this.group.add(mesh);
    return obj;
  }

  private restRotation(obj: PieceObject, sq: number) {
    const file = sq % 8;
    if (obj.type === 'n') obj.mesh.rotation.set(0, knightFacing(obj.color, file), 0);
    else if (this.set === 'warrior') obj.mesh.rotation.set(0, obj.color === 'w' ? 0 : Math.PI, 0);
    else obj.mesh.rotation.set(0, (sq * 1.7) % (Math.PI * 2), 0); // vary the bishop slit / crown points a little
  }

  private place(obj: PieceObject, sq: number) {
    squareCenter(sq, this.tmp);
    obj.mesh.position.set(this.tmp.x, 0, this.tmp.z);
    obj.mesh.scale.setScalar(1);
    obj.sq = sq;
    this.restRotation(obj, sq);
  }

  private remove(obj: PieceObject) {
    this.group.remove(obj.mesh);
    // Captured pieces may carry a cloned, fading material.
    if ((obj.mesh.userData as { ownMaterial?: boolean }).ownMaterial) {
      const m = obj.mesh.material;
      (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
    }
  }

  get(sq: number): PieceObject | undefined {
    return this.pieces.get(sq);
  }

  all(): IterableIterator<PieceObject> {
    return this.pieces.values();
  }

  /**
   * Make meshes match `board`. Reuses meshes already on the right square; rebuilds all if
   * `rebuild` (material/set changed). With `intro`, pieces drop in rank by rank.
   */
  sync(board: (Piece | null)[], opts: { rebuild?: boolean; intro?: boolean; reducedMotion?: boolean } = {}): Promise<void> {
    this.dying.forEach(d => this.remove(d));
    this.dying.clear();
    const next = new Map<number, PieceObject>();
    const leftovers: PieceObject[] = [];
    this.pieces.forEach((obj, sq) => {
      const p = board[sq];
      if (!opts.rebuild && p && p.type === obj.type && p.color === obj.color) {
        this.place(obj, sq);
        obj.lift = obj.liftTarget = 0;
        obj.dragging = false;
        obj.animating = false;
        next.set(sq, obj);
      } else leftovers.push(obj);
    });
    leftovers.forEach(o => this.remove(o));
    const created: PieceObject[] = [];
    board.forEach((p, sq) => {
      if (p && !next.has(sq)) {
        const obj = this.create(p, sq);
        next.set(sq, obj);
        created.push(obj);
      }
    });
    this.pieces = next;

    if (!opts.intro || opts.reducedMotion) return Promise.resolve();
    // Intro: every piece drops from above with a soft settle, staggered by rank from the centre out.
    const all = [...this.pieces.values()];
    return Promise.all(
      all.map(obj => {
        const rank = Math.floor(obj.sq / 8);
        const file = obj.sq % 8;
        const delay = (obj.color === 'w' ? rank : 7 - rank) * 0.09 + Math.abs(file - 3.5) * 0.035 + (obj.color === 'b' ? 0.18 : 0);
        obj.animating = true;
        obj.mesh.position.y = 2.2;
        obj.mesh.scale.setScalar(0.001);
        return this.animator.tween(0.55, t => {
          obj.mesh.position.y = THREE.MathUtils.lerp(2.2, 0, ease.outCubic(t));
          obj.mesh.scale.setScalar(Math.max(0.001, ease.outBack(Math.min(1, t / 0.85), 1.2)));
          if (t >= 1) {
            obj.mesh.scale.setScalar(1);
            obj.animating = false;
          }
        }, delay);
      })
    ).then(() => undefined);
  }

  /** Hover/selection lift (smoothed in update). */
  setLift(sq: number | null, amount: number) {
    this.pieces.forEach((o, s) => {
      if (!o.dragging) o.liftTarget = s === sq ? amount : 0;
    });
  }

  // ------------------------------------------------------------------ drag
  beginDrag(sq: number) {
    const o = this.pieces.get(sq);
    if (!o) return;
    o.dragging = true;
  }

  dragTo(sq: number, point: THREE.Vector3, dt: number) {
    const o = this.pieces.get(sq);
    if (!o || !o.dragging) return;
    const p = o.mesh.position;
    const prevX = p.x;
    const prevZ = p.z;
    // Critically damped follow so the piece trails the pointer slightly.
    const k = 1 - Math.exp(-28 * Math.max(dt, 1 / 120));
    p.x += (point.x - p.x) * k;
    p.z += (point.z - p.z) * k;
    p.y += (TIMING.liftHeight + 0.12 - p.y) * k;
    // Lean into the direction of travel.
    const vx = (p.x - prevX) / Math.max(dt, 1 / 120);
    const vz = (p.z - prevZ) / Math.max(dt, 1 / 120);
    o.lean.set(THREE.MathUtils.clamp(vz * 0.05, -0.35, 0.35), THREE.MathUtils.clamp(-vx * 0.05, -0.35, 0.35));
  }

  /** Spring a dragged piece back to its square (illegal drop). */
  async cancelDrag(sq: number) {
    const o = this.pieces.get(sq);
    if (!o) return;
    o.dragging = false;
    const from = o.mesh.position.clone();
    const to = squareCenter(sq);
    await this.animator.tween(0.28, t => {
      const e = ease.outBack(t, 1.4);
      o.mesh.position.x = THREE.MathUtils.lerp(from.x, to.x, e);
      o.mesh.position.z = THREE.MathUtils.lerp(from.z, to.z, e);
      o.mesh.position.y = THREE.MathUtils.lerp(from.y, 0, ease.outQuad(t));
    });
    o.lean.set(0, 0);
  }

  // ------------------------------------------------------------------ moves
  /**
   * Animate a move that the engine has already applied. Resolves when every piece has settled.
   */
  async animateMove(move: Move, hooks: MoveHooks, opts: { reducedMotion: boolean; slowImpact?: boolean }): Promise<void> {
    const mover = this.pieces.get(move.from);
    if (!mover) return;
    mover.dragging = false;
    mover.lift = mover.liftTarget = 0;
    mover.animating = true;
    try {
      await this.runMove(mover, move, hooks, opts);
    } finally {
      mover.animating = false;
      mover.mesh.rotation.x = mover.mesh.rotation.z = 0;
      mover.mesh.position.y = 0;
    }
  }

  private async runMove(mover: PieceObject, move: Move, hooks: MoveHooks, opts: { reducedMotion: boolean; slowImpact?: boolean }): Promise<void> {

    const capSq = move.isEnPassant ? (move.piece.color === 'w' ? move.to - 8 : move.to + 8) : move.captured ? move.to : -1;
    const victim = capSq >= 0 ? this.pieces.get(capSq) ?? null : null;
    if (victim) this.pieces.delete(capSq);
    this.pieces.delete(move.from);
    this.pieces.set(move.to, mover);
    mover.sq = move.to;

    const start = mover.mesh.position.clone();
    const end = squareCenter(move.to);
    const info: LandingInfo = { move, capturedObj: victim, impactPoint: end.clone() };

    // Castling: rook moves alongside the king.
    let rookAnim: Promise<void> = Promise.resolve();
    if (move.isCastling) {
      const rank = move.piece.color === 'w' ? 0 : 7;
      const rf = move.isCastling === 'kingside' ? 7 : 0;
      const rt = move.isCastling === 'kingside' ? 5 : 3;
      const rook = this.pieces.get(rank * 8 + rf);
      if (rook) {
        this.pieces.delete(rank * 8 + rf);
        this.pieces.set(rank * 8 + rt, rook);
        rook.sq = rank * 8 + rt;
        rook.animating = true;
        rookAnim = this.travel(rook, rook.mesh.position.clone(), squareCenter(rank * 8 + rt), 0.42, 'lift', 0.12, opts.reducedMotion).then(() => {
          rook.animating = false;
          rook.mesh.position.y = 0;
          this.restRotation(rook, rook.sq);
        });
      }
    }

    if (opts.reducedMotion) {
      if (victim) this.dying.add(victim), (victim.mesh.visible = false);
      mover.mesh.position.copy(end);
      this.restRotation(mover, move.to);
      await rookAnim;
      if (move.promotion) await this.promote(mover, move.promotion, hooks, true);
      hooks.onLand?.(info);
      return;
    }

    const dur = moveDuration(move.from, move.to) * (start.y > 0.05 ? 0.7 : 1);
    const kind = move.piece.type === 'n' ? 'hop' : 'lift';

    if (victim) {
      // Approach to just short of the victim, strike, knock it over, then settle.
      const dir = new THREE.Vector3().subVectors(end, start).setY(0);
      const dist = dir.length();
      dir.normalize();
      const stop = end.clone().addScaledVector(dir, -Math.min(0.38, dist * 0.4));
      await this.travel(mover, start, stop, dur * 0.8, kind, kind === 'hop' ? TIMING.knightHopHeight : TIMING.liftHeight, false, true);
      info.impactPoint.copy(end);
      hooks.onImpact?.(info);
      const fall = this.knockOver(victim, dir, opts.slowImpact ? 1.3 : 1);
      await this.travel(mover, mover.mesh.position.clone(), end, 0.2, 'slide', 0, false);
      await Promise.all([fall, rookAnim]);
    } else {
      await Promise.all([this.travel(mover, start, end, dur, kind, kind === 'hop' ? TIMING.knightHopHeight : TIMING.liftHeight, false), rookAnim]);
    }

    this.restRotation(mover, move.to);
    if (move.promotion) await this.promote(mover, move.promotion, hooks, false);
    hooks.onLand?.(info);
  }

  /** Move a piece along an arc. 'lift' rises, glides and settles; 'hop' is a parabola; 'slide' stays low. */
  private travel(obj: PieceObject, from: THREE.Vector3, to: THREE.Vector3, duration: number, kind: 'lift' | 'hop' | 'slide', height: number, reduced: boolean, stayUp = false): Promise<void> {
    if (reduced) {
      obj.mesh.position.copy(to);
      return Promise.resolve();
    }
    const startY = from.y;
    const dir = new THREE.Vector2(to.x - from.x, to.z - from.z);
    const tiltAxisX = dir.y;
    const tiltAxisZ = -dir.x;
    const len = Math.max(0.001, dir.length());
    return this.animator.tween(duration, t => {
      const e = ease.inOutCubic(t);
      obj.mesh.position.x = THREE.MathUtils.lerp(from.x, to.x, e);
      obj.mesh.position.z = THREE.MathUtils.lerp(from.z, to.z, e);
      let y: number;
      if (kind === 'hop') {
        y = THREE.MathUtils.lerp(startY, stayUp ? height * 0.5 : 0, t) + Math.sin(t * Math.PI) * height;
      } else if (kind === 'slide') {
        y = THREE.MathUtils.lerp(startY, 0, ease.outQuad(t));
      } else {
        // Rise quickly, glide, then set down; a short dip at the end reads as weight.
        const rise = Math.min(1, t / 0.25);
        const fall = stayUp ? 0 : Math.max(0, (t - 0.7) / 0.3);
        y = THREE.MathUtils.lerp(startY, height, ease.outCubic(rise)) * (1 - ease.inQuad(fall));
      }
      obj.mesh.position.y = y;
      // Lean forward while accelerating, back while braking.
      const lean = Math.sin(t * Math.PI * 2) * 0.09 * (kind === 'slide' ? 0.3 : 1);
      obj.mesh.rotation.x = (tiltAxisX / len) * lean;
      obj.mesh.rotation.z = (tiltAxisZ / len) * lean;
      if (t >= 1 && !stayUp) {
        obj.mesh.rotation.x = 0;
        obj.mesh.rotation.z = 0;
      }
    });
  }

  /** Captured piece topples away from the attacker, skids and sinks through the board while fading. */
  private knockOver(victim: PieceObject, dir: THREE.Vector3, slow: number): Promise<void> {
    this.dying.add(victim);
    const mesh = victim.mesh;
    // Fade needs its own material instance.
    const src = mesh.material;
    const cloned = (Array.isArray(src) ? src : [src]).map(m => {
      const c = (m as THREE.MeshPhysicalMaterial).clone();
      c.transparent = true;
      return c;
    });
    mesh.material = Array.isArray(src) ? cloned : cloned[0];
    mesh.userData.ownMaterial = true;
    mesh.castShadow = true;
    const start = mesh.position.clone();
    const h = PIECE_HEIGHT[victim.type];
    const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const q0 = mesh.quaternion.clone();
    const spin = (Math.random() - 0.5) * 1.2;
    const fallTime = TIMING.captureFall * slow;
    return this.animator.tween(fallTime + 0.5, t => {
      const total = fallTime + 0.5;
      const time = t * total;
      const ft = Math.min(1, time / fallTime);
      // Topple ~95° around the base edge, with a small bounce.
      const angle = ease.outBack(ft, 1.1) * 1.65;
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      mesh.quaternion.copy(q).multiply(q0);
      mesh.rotateY(spin * ft);
      const skid = ease.outCubic(ft) * (0.35 + h * 0.35);
      mesh.position.set(start.x + dir.x * skid, Math.sin(Math.min(1, ft * 1.4) * Math.PI) * 0.12, start.z + dir.z * skid);
      // Sink and fade after landing
      const st = Math.max(0, (time - fallTime) / 0.5);
      mesh.position.y -= ease.inQuad(st) * 0.45;
      cloned.forEach(m => (m.opacity = 1 - ease.inQuad(st)));
      if (t >= 1) {
        mesh.visible = false;
      }
    });
  }

  /** Pawn dissolves upward while the new piece grows in its place. */
  private async promote(obj: PieceObject, to: PieceType, hooks: MoveHooks, instant: boolean) {
    const sq = obj.sq;
    const fresh = this.create({ type: to, color: obj.color }, sq);
    this.pieces.set(sq, fresh);
    this.dying.add(obj);
    hooks.onPromote?.(fresh);
    if (instant) {
      obj.mesh.visible = false;
      return;
    }
    fresh.mesh.scale.setScalar(0.001);
    await this.animator.tween(0.55, t => {
      const s = 1 - ease.inCubic(Math.min(1, t * 1.6));
      obj.mesh.scale.set(Math.max(0.001, s), Math.max(0.001, 1 + (1 - s) * 0.6), Math.max(0.001, s));
      obj.mesh.position.y = (1 - s) * 0.3;
      const g = ease.outBack(Math.max(0, (t - 0.25) / 0.75), 1.8);
      fresh.mesh.scale.setScalar(Math.max(0.001, g));
      fresh.mesh.rotation.y = (1 - g) * Math.PI;
      if (t >= 1) obj.mesh.visible = false;
    });
    this.restRotation(fresh, sq);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, time: number) {
    const k = 1 - Math.exp(-14 * dt);
    this.pieces.forEach(o => {
      if (o.animating) return;
      if (o.dragging) {
        // Apply lean smoothly while dragging.
        o.mesh.rotation.x += (o.lean.x - o.mesh.rotation.x) * k;
        o.mesh.rotation.z += (o.lean.y - o.mesh.rotation.z) * k;
        o.lean.multiplyScalar(Math.exp(-6 * dt));
        return;
      }
      if (o.lift === 0 && o.liftTarget === 0) return;
      o.lift += (o.liftTarget - o.lift) * k;
      if (Math.abs(o.lift - o.liftTarget) < 1e-4) o.lift = o.liftTarget;
      const bob = o.liftTarget > 0.07 ? Math.sin(time * 3) * 0.012 : 0;
      o.mesh.position.y = o.lift + bob;
    });
  }

  /** Axis-aligned pick boxes (cheap hover picking against tall pieces). */
  pick(ray: THREE.Ray): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    this.pieces.forEach((o, sq) => {
      if (!o.mesh.visible) return;
      const p = o.mesh.position;
      const r = 0.3;
      box.min.set(p.x - r, p.y, p.z - r);
      box.max.set(p.x + r, p.y + PIECE_HEIGHT[o.type], p.z + r);
      if (ray.intersectBox(box, hit)) {
        const d = hit.distanceTo(ray.origin);
        if (d < bestDist) {
          bestDist = d;
          best = sq;
        }
      }
    });
    return best;
  }

  /** Highest point of a piece (for camera/particles). */
  topOf(sq: number): THREE.Vector3 {
    const o = this.pieces.get(sq);
    const c = squareCenter(sq);
    c.y = o ? PIECE_HEIGHT[o.type] : 0.5;
    return c;
  }

  materialAt(sq: number): THREE.Material | null {
    const o = this.pieces.get(sq);
    if (!o) return null;
    const m = o.mesh.material;
    return Array.isArray(m) ? m[0] : m;
  }

  clear() {
    this.pieces.forEach(o => this.remove(o));
    this.dying.forEach(o => this.remove(o));
    this.pieces.clear();
    this.dying.clear();
  }
}
