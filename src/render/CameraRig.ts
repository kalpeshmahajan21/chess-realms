import * as THREE from 'three';
import { damp, dampAngle } from './anim.ts';

interface View {
  azimuth: number; // 0 = behind White (+z), PI = behind Black
  polar: number; // angle from vertical
  distance: number;
  target: THREE.Vector3;
}

const BOARD_RADIUS = 6.1; // board + frame half-diagonal-ish, used for framing

/**
 * Smooth third-person orbit camera for the board.
 * Everything is damped so presets, turn changes, cinematics and user drags blend without snapping.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private current: View;
  private desired: View;
  private stored: View | null = null; // view to return to after a cinematic
  private track: (() => THREE.Vector3) | null = null;
  private trackLift = 0.35;
  private lambda = 4.2;
  private orbitSpeed = 0; // rad/s, for menu and victory
  private trauma = 0;
  private fovKick = 0;
  private baseFov = 40;
  private time = 0;
  private userActive = 0; // seconds since last user input (idle sway fades in)
  idleSway = true;
  sensitivity = 1;
  private aspect = 1;
  /** Fraction of the viewport height not covered by HUD (only matters on short screens). */
  private usableHeight = 1;
  /** Arena-specific seat angle (photo arenas sit lower so the horizon is in frame). */
  preferredPolar = 0.92;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 220);
    this.aspect = aspect;
    const d = this.fitDistance(0.95);
    this.current = { azimuth: 0.6, polar: 0.95, distance: d * 1.6, target: new THREE.Vector3(0, -0.2, 0) };
    this.desired = { azimuth: 0, polar: 0.95, distance: d, target: new THREE.Vector3(0, 0, 0) };
    this.apply();
  }

  /** Distance that frames the board for the current aspect ratio and polar angle. */
  fitDistance(polar = this.desired?.polar ?? 0.95, padding = 1.08): number {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.aspect);
    // When looking down steeply the board's projected depth shrinks; allow closer framing.
    const depthFactor = THREE.MathUtils.lerp(0.78, 1, Math.min(1, polar / 1.1));
    const needV = (BOARD_RADIUS * depthFactor) / Math.tan(vFov / 2) / this.usableHeight;
    // Horizontally only the frame's half-width (plus a little margin) has to fit.
    const needH = 5.15 / Math.tan(hFov / 2);
    return Math.max(needV * 0.86, needH) * padding;
  }

  resize(aspect: number, viewportHeight = 900) {
    this.aspect = aspect;
    // Short landscape phones: HUD bars take ~150px, so frame the board in what is left.
    this.usableHeight = viewportHeight < 600 ? Math.max(0.55, (viewportHeight - 150) / viewportHeight) : 1;
    this.camera.aspect = aspect;
    // Slightly wider lens in portrait so the board isn't tiny.
    this.baseFov = aspect < 0.8 ? 46 : aspect < 1.2 ? 42 : 38;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ presets
  setView(azimuth: number, polar: number, distanceScale = 1, lambda = 4.2) {
    this.orbitSpeed = 0;
    this.desired.azimuth = azimuth;
    this.desired.polar = polar;
    this.desired.distance = this.fitDistance(polar) * distanceScale;
    this.desired.target.set(0, polar < 0.2 ? 0 : -0.15, polar < 0.2 ? 0 : 0.25 * Math.cos(azimuth));
    this.lambda = lambda;
  }

  /** Player seat view for a side. */
  seat(side: 'w' | 'b', lambda = 3.4) {
    // Portrait phones: look down more steeply so the board fills the narrow screen.
    const polar = this.aspect < 0.75 ? 0.58 : this.aspect < 1.1 ? Math.min(0.9, this.preferredPolar) : this.preferredPolar;
    this.setView(side === 'w' ? 0 : Math.PI, polar, 1, lambda);
  }

  sideView() {
    this.setView(Math.PI / 2, 1.0, 1.02);
  }

  topView(side: 'w' | 'b') {
    this.setView(side === 'w' ? 0 : Math.PI, 0.0001, 0.92);
  }

  /** Slow continuous orbit (menu backdrop, victory). */
  orbit(speed: number, polar = 1.02, distanceScale = 1.12, height = 0) {
    this.orbitSpeed = speed;
    this.desired.polar = polar;
    this.desired.distance = this.fitDistance(polar) * distanceScale;
    this.desired.target.set(0, height, 0);
    this.lambda = 1.6;
  }

  /** Start far away and sweep in (match intro). */
  introFrom(side: 'w' | 'b') {
    const az = side === 'w' ? 0 : Math.PI;
    this.current.azimuth = az + 1.4;
    this.current.polar = 1.18;
    this.current.distance = this.fitDistance(1.1) * 1.9;
    this.current.target.set(0, 0.8, 0);
    this.seat(side, 1.9);
  }

  // ------------------------------------------------------------------ cinematics
  /** Close dramatic shot of a point; call release() to return. */
  /**
   * Close cinematic shot. The view the player had is stored once and restored by release().
   * `track` makes the target follow a moving point (e.g. the attacking piece); `orbitSpeed` circles it.
   */
  focus(point: THREE.Vector3, fromDir: THREE.Vector3, distance = 3.6, polar = 1.12, opts: { lambda?: number; track?: () => THREE.Vector3; orbitSpeed?: number; lift?: number } = {}) {
    if (!this.stored) this.stored = this.cloneView(this.desired);
    const az = Math.atan2(fromDir.x, fromDir.z);
    this.orbitSpeed = opts.orbitSpeed ?? 0;
    this.track = opts.track ?? null;
    this.trackLift = opts.lift ?? 0.35;
    this.desired.azimuth = az;
    this.desired.polar = polar;
    this.desired.distance = distance;
    this.desired.target.copy(point).setY(point.y + this.trackLift);
    this.lambda = opts.lambda ?? 3.2;
  }

  /** Return to exactly the view the player had before the cinematic. Safe to call more than once. */
  release(lambda = 3.6) {
    this.track = null;
    if (this.stored) {
      this.desired = this.cloneView(this.stored);
      this.stored = null;
      this.orbitSpeed = 0;
    }
    this.lambda = lambda;
  }

  get inCinematic() {
    return this.stored !== null;
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  kickFov(degrees: number) {
    this.fovKick += degrees;
  }

  // ------------------------------------------------------------------ user input
  rotateBy(dxPixels: number, dyPixels: number, viewportHeight: number) {
    const k = (Math.PI / Math.max(320, viewportHeight)) * 1.15 * this.sensitivity;
    this.orbitSpeed = 0;
    this.desired.azimuth -= dxPixels * k;
    this.desired.polar = THREE.MathUtils.clamp(this.desired.polar - dyPixels * k, 0.0001, 1.32);
    this.lambda = 10;
    this.userActive = 0;
  }

  zoomBy(factor: number) {
    const fit = this.fitDistance(this.desired.polar);
    this.desired.distance = THREE.MathUtils.clamp(this.desired.distance * factor, fit * 0.55, fit * 1.7);
    this.lambda = 8;
    this.userActive = 0;
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    this.time += dt;
    this.userActive += dt;
    if (this.orbitSpeed) this.desired.azimuth += this.orbitSpeed * dt;
    if (this.track) {
      const p = this.track();
      this.desired.target.set(p.x, p.y + this.trackLift, p.z);
    }

    const c = this.current;
    const d = this.desired;
    c.azimuth = dampAngle(c.azimuth, d.azimuth, this.lambda, dt);
    c.polar = damp(c.polar, d.polar, this.lambda, dt);
    c.distance = damp(c.distance, d.distance, this.lambda * 0.9, dt);
    c.target.x = damp(c.target.x, d.target.x, this.lambda, dt);
    c.target.y = damp(c.target.y, d.target.y, this.lambda, dt);
    c.target.z = damp(c.target.z, d.target.z, this.lambda, dt);

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.fovKick = damp(this.fovKick, 0, 3.5, dt);
    this.apply();
  }

  private apply() {
    const c = this.current;
    let az = c.azimuth;
    let polar = c.polar;
    // Gentle idle "breathing" so the scene never feels frozen.
    if (this.idleSway && !this.stored && this.orbitSpeed === 0 && c.polar > 0.2) {
      const fade = Math.min(1, Math.max(0, (this.userActive - 2) / 3));
      az += Math.sin(this.time * 0.13) * 0.035 * fade * Math.min(1, this.aspect);
      polar += Math.sin(this.time * 0.17 + 1.3) * 0.012 * fade;
    }
    const sinP = Math.sin(polar);
    const cam = this.camera;
    cam.position.set(
      c.target.x + sinP * Math.sin(az) * c.distance,
      c.target.y + Math.cos(polar) * c.distance,
      c.target.z + sinP * Math.cos(az) * c.distance
    );
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.12;
      const t = this.time * 30;
      cam.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * s;
      cam.position.y += (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.1) * 0.5) * s;
    }
    // Keep "up" stable for the top view so it doesn't spin at the pole.
    if (polar < 0.01) cam.up.set(-Math.sin(az), 0, -Math.cos(az));
    else cam.up.set(0, 1, 0);
    cam.lookAt(c.target);
    const fov = this.baseFov + this.fovKick;
    // Scenery between the camera and the board must never block the game: push the near plane out
    // in proportion to the orbit distance (the board's nearest edge is ~45% of the way in).
    const near = THREE.MathUtils.clamp(c.distance * 0.4, 0.1, 7);
    if (Math.abs(cam.fov - fov) > 0.01 || Math.abs(cam.near - near) > 0.02) {
      cam.fov = fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
  }

  private cloneView(v: View): View {
    return { azimuth: v.azimuth, polar: v.polar, distance: v.distance, target: v.target.clone() };
  }

  get azimuth() {
    return this.current.azimuth;
  }
}
