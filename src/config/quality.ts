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
  /** Segments for lathe pieces. */
  pieceSegments: number;
}

export const QUALITY_PRESETS: Record<ResolvedQuality, QualityPreset> = {
  low: { maxPixelRatio: 1, minPixelRatio: 0.6, shadowMapSize: 1024, softShadows: false, msaaSamples: 0, bloom: false, particles: 0.35, maxPointLights: 2, pieceSegments: 28 },
  medium: { maxPixelRatio: 1.5, minPixelRatio: 0.75, shadowMapSize: 2048, softShadows: true, msaaSamples: 2, bloom: true, particles: 0.7, maxPointLights: 4, pieceSegments: 40 },
  high: { maxPixelRatio: 2, minPixelRatio: 1, shadowMapSize: 2048, softShadows: true, msaaSamples: 4, bloom: true, particles: 1, maxPointLights: 8, pieceSegments: 56 },
};

/** Rough device tier guess used by "Auto". Adaptive resolution corrects mistakes at runtime. */
export function detectQuality(): ResolvedQuality {
  if (typeof window === 'undefined') return 'medium';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse && (cores <= 4 || mem <= 3)) return 'low';
  if (coarse) return 'medium';
  if (cores >= 8 && mem >= 8) return 'high';
  return 'medium';
}

export function resolveQuality(q: GraphicsQuality): ResolvedQuality {
  return q === 'auto' ? detectQuality() : q;
}
