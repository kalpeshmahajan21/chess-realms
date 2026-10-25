import { useEffect, useRef } from 'react';
import { game } from '../game/GameController.ts';
import type { CameraPreset } from '../types.ts';

const CAMERA_CYCLE: CameraPreset[] = ['auto', 'white', 'black', 'side', 'top'];

function cycleCamera() {
  const cur = game.state.cameraPreset;
  game.setCameraPreset(CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(cur) + 1) % CAMERA_CYCLE.length]);
}

interface Options {
  /** Gameplay keys are active (no modal open, screen is playing). */
  enabled: boolean;
  onPause: () => void;
  onEscape: () => void;
}

/**
 * Keyboard and gamepad bindings for gameplay.
 * Board cursor: arrows / WASD / D-pad / left stick; Enter / A selects.
 */
export function useControls({ enabled, onPause, onEscape }: Options) {
  const opts = useRef({ enabled, onPause, onEscape });
  opts.current = { enabled, onPause, onEscape };

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        opts.current.onEscape();
        return;
      }
      if (!opts.current.enabled) return;
      const s = game.state;
      const k = e.key.toLowerCase();
      const dir: Record<string, [number, number]> = {
        arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1],
        a: [-1, 0], d: [1, 0], w: [0, 1], s: [0, -1],
      };
      // WASD only drives the cursor once it is visible, so D can still offer a draw.
      if (dir[k] && (k.startsWith('arrow') || s.cursor !== null)) {
        e.preventDefault();
        game.moveCursor(dir[k][0], dir[k][1]);
        return;
      }
      switch (k) {
        case 'enter':
          e.preventDefault();
          game.pressCursor();
          break;
        case ' ':
          e.preventDefault();
          if (s.animating) game.skipAnimation();
          else if (s.cursor !== null) game.pressCursor();
          break;
        case 'u':
          game.undo();
          break;
        case 'h':
          void game.requestHint();
          break;
        case 'c':
          cycleCamera();
          break;
        case 'v':
          game.setCameraPreset(s.cameraPreset === 'top' ? 'auto' : 'top');
          break;
        case 'd':
          game.offerDraw();
          break;
        case 'r':
          game.resign();
          break;
        case 'm':
          game.updateSettings({ muted: !s.settings.muted });
          game.toast(s.settings.muted ? 'Sound on' : 'Sound off');
          break;
        case 'p':
          opts.current.onPause();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Gamepad (polled; browsers do not emit button events)
  useEffect(() => {
    let raf = 0;
    const prev: Record<string, boolean> = {};
    let repeatAt = 0;
    let lastDir = '';
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find(p => p && p.connected);
      if (!pad) return;
      const pressed = (i: number) => !!pad.buttons[i]?.pressed;
      const edge = (name: string, now: boolean) => {
        const was = prev[name];
        prev[name] = now;
        return now && !was;
      };
      const now = performance.now();
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dx = pressed(14) || ax < -0.6 ? -1 : pressed(15) || ax > 0.6 ? 1 : 0;
      const dy = pressed(12) || ay < -0.6 ? 1 : pressed(13) || ay > 0.6 ? -1 : 0;
      const dirKey = `${dx},${dy}`;
      const o = opts.current;
      if (edge('start', pressed(9))) o.onPause();
      if (!o.enabled) {
        if (edge('b', pressed(1))) o.onEscape();
        return;
      }
      if (dx || dy) {
        if (dirKey !== lastDir || now >= repeatAt) {
          game.moveCursor(dx, dy);
          repeatAt = now + (dirKey !== lastDir ? 320 : 120);
        }
      }
      lastDir = dirKey;
      if (edge('a', pressed(0))) {
        if (game.state.animating) game.skipAnimation();
        else game.pressCursor();
      }
      if (edge('b', pressed(1))) game.clearSelection();
      if (edge('x', pressed(2))) void game.requestHint();
      if (edge('y', pressed(3))) cycleCamera();
      if (edge('lb', pressed(4))) game.undo();
    };
    const onConnect = () => game.toast('Controller connected', 'success');
    window.addEventListener('gamepadconnected', onConnect);
    raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('gamepadconnected', onConnect);
    };
  }, []);
}
