/**
 * Tactile Haptic Feedback Utility for Mobile & Touch Devices
 * Safely wraps `navigator.vibrate()` with pattern presets for piece selection,
 * movement, captures, check alerts, and mobile HUD interactions.
 */

let lastHapticTimestamp = 0;
let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

export function triggerHaptic(pattern: number | number[], minIntervalMs: number = 15): boolean {
  if (!hapticsEnabled) return false;
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (typeof navigator.vibrate !== 'function') return false;

    const now = performance.now();
    if (now - lastHapticTimestamp < minIntervalMs) return false;
    lastHapticTimestamp = now;

    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/** Light, crisp 12ms tick when a chess piece or square is selected on touch devices */
export function hapticSelect(): void {
  triggerHaptic(12, 15);
}

/** Subtle 24ms pulse when a piece completes a move to a target square */
export function hapticMove(): void {
  triggerHaptic(24, 25);
}

/** Heavy double-pulse impact pattern when a piece is captured */
export function hapticCapture(): void {
  triggerHaptic([40, 30, 65], 40);
}

/** Urgent rhythmic warning pulse when a King is placed in Check or Checkmate */
export function hapticCheck(isMate: boolean = false): void {
  if (isMate) {
    triggerHaptic([55, 35, 70, 35, 110], 50);
  } else {
    triggerHaptic([35, 25, 50], 40);
  }
}

/** Crisp 10ms micro-tap for mobile HUD buttons and control toggles */
export function hapticTap(pattern: number | number[] = 10): void {
  triggerHaptic(pattern, 10);
}
