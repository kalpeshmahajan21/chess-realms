import type { GraphicsQuality } from '../types.ts';

export type ResolvedQuality = Exclude<GraphicsQuality, 'auto'>;

export interface QualityPreset {
  /** Upper bound on device pixel ratio. Adaptive scaling may go lower. */
  maxPixelRatio: number;
  minPixelRatio: number;
  shadowMapSize: number;
  softShadows: boolean;
  msaaSamples: number;
  bloom: boolean;
  /** Ambient particle multiplier. */
  particles: number;
  /** Max dynamic point lights kept in an arena (extra ones are folded into ambient). */
  maxPointLights: number;
  /** Segments for lathe pieces (profile detail is derived from this too). */
  pieceSegments: number;
  /** Upper bound on rendered pixels per frame, in megapixels. Keeps big/high-DPI screens from overloading the GPU. */
  pixelBudget: number;
}

export const QUALITY_PRESETS: Record<ResolvedQuality, QualityPreset> = {
  low: { maxPixelRatio: 1, minPixelRatio: 0.6, shadowMapSize: 1024, softShadows: false, msaaSamples: 0, bloom: false, particles: 0.35, maxPointLights: 2, pieceSegments: 28, pixelBudget: 1.0 },
  medium: { maxPixelRatio: 1.5, minPixelRatio: 0.75, shadowMapSize: 2048, softShadows: true, msaaSamples: 2, bloom: true, particles: 0.7, maxPointLights: 4, pieceSegments: 40, pixelBudget: 2.2 },
  high: { maxPixelRatio: 2, minPixelRatio: 1, shadowMapSize: 2048, softShadows: true, msaaSamples: 4, bloom: true, particles: 1, maxPointLights: 8, pieceSegments: 48, pixelBudget: 3.6 },
};

/** Rough device tier guess used by "Auto". Adaptive resolution corrects mistakes at runtime. */
const AUTO_TIER_KEY = 'cr_auto_tier_v1';
const ORDER: ResolvedQuality[] = ['low', 'medium', 'high'];

/** Auto chose a tier this device couldn't sustain: remember one step lower for this and future sessions. */
export function lowerAutoTier(current: ResolvedQuality) {
  const next = ORDER[Math.max(0, ORDER.indexOf(current) - 1)];
  try {
    localStorage.setItem(AUTO_TIER_KEY, next);
  } catch {
    // Storage unavailable: the step-down still applies for this session via the caller.
  }
  autoTierOverride = next;
}

let autoTierOverride: ResolvedQuality | null = null;

export function detectQuality(): ResolvedQuality {
  if (typeof window === 'undefined') return 'medium';
  if (autoTierOverride) return autoTierOverride;
  try {
    const saved = localStorage.getItem(AUTO_TIER_KEY) as ResolvedQuality | null;
    if (saved && ORDER.includes(saved)) return saved;
  } catch {
    // Fall through to hardware detection.
  }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse && (cores <= 4 || mem <= 3)) return 'low';
  if (coarse) return 'medium';
  // Built-in laptop graphics share memory with the CPU and struggle with High even on 8-core machines.
  if (cores >= 8 && mem >= 8 && !isIntegratedGpu()) return 'high';
  return 'medium';
}

/** Touch-first device (phone or tablet): no mouse as the primary pointer. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches;
}

/**
 * The preset to actually render with. Phones and tablets get a lighter variant of the same tier:
 * their GPUs are far weaker and they throttle when hot, which is what made long sessions lag.
 * Their dense screens hide the difference (no MSAA needed, fewer lamps, lighter piece meshes).
 */
export function presetFor(name: ResolvedQuality): QualityPreset {
  const base = QUALITY_PRESETS[name];
  if (!isTouchDevice()) return base;
  const tablet = Math.min(screen.width, screen.height) >= 700;
  return {
    ...base,
    msaaSamples: 0,
    softShadows: base.softShadows && name === 'high',
    shadowMapSize: Math.min(base.shadowMapSize, 1024),
    maxPointLights: Math.min(base.maxPointLights, tablet ? 3 : 2),
    pieceSegments: Math.min(base.pieceSegments, 32),
    particles: Math.min(base.particles, 0.6),
    pixelBudget: Math.min(base.pixelBudget, tablet ? 2.0 : 1.15),
  };
}

/** Best-effort check for integrated (shared-memory) graphics from the WebGL renderer string. */
function isIntegratedGpu(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // Apple Silicon is integrated but fast; dedicated GeForce/RTX/Radeon RX/Arc cards are excluded by name.
    if (/Apple M\d|Apple GPU/i.test(name)) return false;
    if (/GeForce|RTX|Quadro|Radeon (RX|Pro)|Arc\(TM\) A\d/i.test(name)) return false;
    return /Intel|Radeon\(TM\) Graphics|Radeon Graphics|Vega|Iris|UHD|Mali|Adreno|PowerVR|llvmpipe|SwiftShader/i.test(name);
  } catch {
    return false;
  }
}

export function resolveQuality(q: GraphicsQuality): ResolvedQuality {
  return q === 'auto' ? detectQuality() : q;
}
