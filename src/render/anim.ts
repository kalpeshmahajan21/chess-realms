/** Easing functions (t in 0..1). */
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number, s = 1.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

interface Tween {
  duration: number;
  elapsed: number;
  delay: number;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

/**
 * Frame-driven tween runner. Uses its own clock so cinematic slow-motion
 * (timeScale) and "skip" (finishAll) affect every gameplay animation at once.
 */
export class Animator {
  private tweens: Tween[] = [];
  timeScale = 1;
  /** While true, newly started tweens complete instantly (promise chains resolve across microtasks). */
  private skipping = false;

  /** Animate over `duration` seconds. Resolves when done (or when skipped). */
  tween(duration: number, onUpdate: (t: number) => void, delay = 0): Promise<void> {
    return new Promise(resolve => {
      if ((duration <= 0 && delay <= 0) || this.skipping) {
        onUpdate(1);
        resolve();
        return;
      }
      this.tweens.push({ duration: Math.max(duration, 1e-4), elapsed: 0, delay, onUpdate, resolve });
    });
  }

  wait(seconds: number): Promise<void> {
    return this.tween(seconds, () => {}, 0);
  }

  get busy(): boolean {
    return this.tweens.length > 0;
  }

  update(dt: number) {
    if (this.tweens.length === 0) return;
    const step = dt * this.timeScale;
    // Iterate over a snapshot: callbacks may start new tweens.
    const list = this.tweens;
    this.tweens = [];
    const keep: Tween[] = [];
    for (const tw of list) {
      if (tw.delay > 0) {
        tw.delay -= step;
        keep.push(tw);
        continue;
      }
      tw.elapsed += step;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(t);
      if (t >= 1) tw.resolve();
      else keep.push(tw);
    }
    this.tweens = keep.concat(this.tweens);
  }

  /** Jump every running tween to its end state; tweens chained afterwards also complete instantly until endSkip(). */
  finishAll() {
    this.skipping = true;
    const list = this.tweens;
    this.tweens = [];
    for (const tw of list) {
      tw.onUpdate(1);
      tw.resolve();
    }
  }

  endSkip() {
    this.skipping = false;
  }

  get isSkipping() {
    return this.skipping;
  }
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}
