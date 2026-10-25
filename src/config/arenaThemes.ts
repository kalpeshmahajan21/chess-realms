import type { ArenaId } from '../audio/soundEngine.ts';

export type BoardStyle = 'wood' | 'marble' | 'stone' | 'slate' | 'glass';

export interface BoardTheme {
  style: BoardStyle;
  light: string; // CSS colours for the procedural texture painter
  dark: string;
  lightVein?: string;
  darkVein?: string;
  frame: string;
  frameStyle: BoardStyle;
  trim: number; // inlay / bezel colour (hex)
  trimMetal: boolean;
  label: string; // coordinate label colour
  roughness: number;
  clearcoat: number;
  /** Emissive edge strip (esports / arcane looks). */
  edgeGlow?: number;
  /** Real scanned materials (folder names under public/realms/tex). Overrides the painted squares. */
  scan?: { light: string; dark: string; lightTint?: string; darkTint?: string; lightFilter?: string; darkFilter?: string; frame: string; frameColor?: number };
}

export interface LightingTheme {
  sunColor: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  skyColor: number;
  groundColor: number;
  hemiIntensity: number;
  exposure: number;
  fogColor: number;
  fogDensity: number;
  /** Environment-map gradient used for reflections. */
  envTop: number;
  envHorizon: number;
  envBottom: number;
  envKey: number; // softbox colour
  envIntensity: number;
  bloom: number;
  /** Grade: saturation multiplier, contrast, warm(+)/cool(-) tint. */
  saturation: number;
  contrast: number;
  tint: number;
  vignette: number;
  ambientParticles: { color: number; count: number; size: number; motion: 'float' | 'fall' | 'drift' | 'rise' } | null;
}

export interface ArenaTheme {
  id: ArenaId;
  name: string;
  tagline: string;
  /** CSS gradient for UI thumbnails. */
  thumb: string;
  accent: string;
  board: BoardTheme;
  light: LightingTheme;
}

/** Real rendered preview for the photo/scan arenas (CSS background value). */
const realThumb = (id: string) => `#111 url(${import.meta.env.BASE_URL}realms/thumbs/${id}.jpg) center / cover`;

export const ARENA_THEMES: ArenaTheme[] = [
  {
    id: 'traditional',
    name: 'Grand Library',
    tagline: 'Walnut, leather and lamplight',
    thumb: realThumb('traditional'),
    accent: '#e0a458',
    board: { style: 'wood', light: '#d8b98a', dark: '#5b3a22', lightVein: '#b8915e', darkVein: '#3c2414', frame: '#2a180d', frameStyle: 'wood', trim: 0xc9a25a, trimMetal: true, label: '#e9d3a6', roughness: 0.5, clearcoat: 0.75, scan: { light: 'ash_veneer', lightTint: '#e6d6c0', lightFilter: 'contrast(1.5) saturate(0.8)', dark: 'black_walnut_veneer_01', darkTint: '#4b2e1c', darkFilter: 'contrast(2.0) saturate(0.95)', frame: 'european_walnut_veneer_04', frameColor: 0x6a3a1e } },
    light: {
      sunColor: 0xffd7a8, sunIntensity: 2.0, sunDir: [4, 10, 5], skyColor: 0x9db4ff, groundColor: 0x2a1a10, hemiIntensity: 0.85,
      exposure: 1.0, fogColor: 0x120c09, fogDensity: 0.011,
      envTop: 0x1a1420, envHorizon: 0x6b4a32, envBottom: 0x120b07, envKey: 0xffc98a, envIntensity: 0.9,
      bloom: 0.45, saturation: 1.05, contrast: 1.06, tint: 0.04, vignette: 0.32,
      ambientParticles: { color: 0xffd9a8, count: 70, size: 0.03, motion: 'float' },
    },
  },
  {
    id: 'india',
    name: 'Palace Courtyard',
    tagline: 'Rajput palace of sandstone and marble',
    thumb: realThumb('india'),
    accent: '#f0a03c',
    board: { style: 'marble', light: '#e9e3d8', dark: '#7a2a16', lightVein: '#bfb6a6', darkVein: '#4f1a0b', frame: '#d8cdb8', frameStyle: 'marble', trim: 0xc99a3f, trimMetal: true, label: '#e9d3a6', roughness: 0.32, clearcoat: 0.7, scan: { light: 'marble_01', dark: 'marble_01', darkTint: '#2b2a30', darkFilter: 'contrast(1.4)', frame: 'european_walnut_veneer_04', frameColor: 0x5a3018 } },
    light: {
      sunColor: 0xfff1d6, sunIntensity: 2.2, sunDir: [8, 14, 6], skyColor: 0xa8d4ff, groundColor: 0x6a4a30, hemiIntensity: 0.45,
      exposure: 0.78, fogColor: 0xbcd8ef, fogDensity: 0.012,
      envTop: 0x4f8ccc, envHorizon: 0xc9b79a, envBottom: 0x5a4430, envKey: 0xfff4dc, envIntensity: 0.65,
      bloom: 0.12, saturation: 1.06, contrast: 1.06, tint: 0.03, vignette: 0.22,
      ambientParticles: null,
    },
  },
  {
    id: 'chess_arena',
    name: 'Football Stadium',
    tagline: 'Centre circle at golden hour',
    thumb: realThumb('chess_arena'),
    accent: '#3ad0ff',
    board: { style: 'wood', light: '#d8b98a', dark: '#3a2414', frame: '#2a180d', frameStyle: 'wood', trim: 0xc9ccd2, trimMetal: true, label: '#e9d3a6', roughness: 0.5, clearcoat: 0.3, scan: { light: 'ash_veneer', lightTint: '#e6d6c0', lightFilter: 'contrast(1.5) saturate(0.8)', dark: 'black_walnut_veneer_01', darkTint: '#4b2e1c', darkFilter: 'contrast(2.0) saturate(0.95)', frame: 'european_walnut_veneer_04', frameColor: 0x6a3a1e } },
    light: {
      sunColor: 0xf2f6ff, sunIntensity: 2.0, sunDir: [2, 12, 4], skyColor: 0x8fb4ff, groundColor: 0x0b0e16, hemiIntensity: 0.5,
      exposure: 1.0, fogColor: 0x05070d, fogDensity: 0.022,
      envTop: 0x0b1020, envHorizon: 0x22314f, envBottom: 0x05060a, envKey: 0xe8f1ff, envIntensity: 1.0,
      bloom: 0.6, saturation: 1.05, contrast: 1.08, tint: -0.03, vignette: 0.38,
      ambientParticles: null,
    },
  },
  {
    id: 'shadow_dungeon',
    name: 'Deep Space',
    tagline: 'In orbit above Earth',
    thumb: realThumb('shadow_dungeon'),
    accent: '#7c8cff',
    board: { style: 'glass', light: '#b9c2cf', dark: '#11141b', frame: '#0b0d12', frameStyle: 'slate', trim: 0xaab4c4, trimMetal: true, label: '#9fb8ff', roughness: 0.14, clearcoat: 1, edgeGlow: 0x4f7dff },
    light: {
      sunColor: 0xe2e6ff, sunIntensity: 1.7, sunDir: [0, 12, 5], skyColor: 0x55608f, groundColor: 0x0a0a14, hemiIntensity: 0.4,
      exposure: 1.05, fogColor: 0x0a0b1c, fogDensity: 0.026,
      envTop: 0x0c0c24, envHorizon: 0x2b2d6a, envBottom: 0x06060c, envKey: 0x9fb6ff, envIntensity: 0.9,
      bloom: 0.6, saturation: 0.92, contrast: 1.08, tint: -0.03, vignette: 0.4,
      ambientParticles: null,
    },
  },
  {
    id: 'japan',
    name: 'Kyoto Garden',
    tagline: 'Tea house, koi pond and cherry blossom',
    thumb: realThumb('japan'),
    accent: '#f49ab0',
    board: { style: 'wood', light: '#ead2a8', dark: '#7a3b2a', lightVein: '#cfb084', darkVein: '#552416', frame: '#6e1d16', frameStyle: 'wood', trim: 0x1a1210, trimMetal: false, label: '#f3dcc0', roughness: 0.45, clearcoat: 0.25, scan: { light: 'ash_veneer', lightTint: '#e6d6c0', lightFilter: 'contrast(1.5) saturate(0.8)', dark: 'black_walnut_veneer_01', darkTint: '#4b2e1c', darkFilter: 'contrast(2.0) saturate(0.95)', frame: 'european_walnut_veneer_04', frameColor: 0x6a3a1e } },
    light: {
      sunColor: 0xffc49a, sunIntensity: 2.0, sunDir: [-8, 7, 6], skyColor: 0xc3a6ff, groundColor: 0x3a2020, hemiIntensity: 0.7,
      exposure: 1.02, fogColor: 0x5b3a52, fogDensity: 0.02,
      envTop: 0x3b2b5a, envHorizon: 0xe9967a, envBottom: 0x2a1a20, envKey: 0xffd0a8, envIntensity: 1.0,
      bloom: 0.4, saturation: 1.08, contrast: 1.03, tint: 0.05, vignette: 0.28,
      ambientParticles: null,
    },
  },
  {
    id: 'usa',
    name: 'Metropolis Night',
    tagline: 'Rooftop helipad above the city',
    thumb: realThumb('usa'),
    accent: '#7aa7ff',
    board: { style: 'slate', light: '#b9c0c9', dark: '#262c36', frame: '#15191f', frameStyle: 'slate', trim: 0x8c96a3, trimMetal: true, label: '#c8d3e0', roughness: 0.3, clearcoat: 0.4, scan: { light: 'marble_01', dark: 'marble_01', darkTint: '#26262c', darkFilter: 'contrast(1.4)', frame: 'european_walnut_veneer_04', frameColor: 0x2c1a10 } },
    light: {
      sunColor: 0xbcd0ff, sunIntensity: 1.7, sunDir: [6, 12, -4], skyColor: 0x5a78c8, groundColor: 0x10131c, hemiIntensity: 0.55,
      exposure: 1.05, fogColor: 0x0a1020, fogDensity: 0.016,
      envTop: 0x070b18, envHorizon: 0x2c3b66, envBottom: 0x0a0a10, envKey: 0xffc98a, envIntensity: 1.0,
      bloom: 0.65, saturation: 1.02, contrast: 1.08, tint: -0.04, vignette: 0.36,
      ambientParticles: null,
    },
  },
  {
    id: 'egypt',
    name: 'Pharaoh Sands',
    tagline: 'Temple of the pyramids at sunset',
    thumb: realThumb('egypt'),
    accent: '#f2b84b',
    board: { style: 'stone', light: '#e6cc96', dark: '#1f3c78', lightVein: '#c9a96a', darkVein: '#13285a', frame: '#b98a4a', frameStyle: 'stone', trim: 0xd8aa3e, trimMetal: true, label: '#4a2a10', roughness: 0.55, clearcoat: 0.35, scan: { light: 'marble_01', dark: 'marble_01', darkTint: '#1f2d5c', darkFilter: 'contrast(1.4)', frame: 'european_walnut_veneer_04', frameColor: 0x5a3018 } },
    light: {
      sunColor: 0xffcf8a, sunIntensity: 2.3, sunDir: [-10, 8, 4], skyColor: 0xf0d2b0, groundColor: 0x5a3a20, hemiIntensity: 0.45,
      exposure: 0.8, fogColor: 0xb8844e, fogDensity: 0.016,
      envTop: 0x4a6a9c, envHorizon: 0xd09a58, envBottom: 0x5a3a1e, envKey: 0xffe0a8, envIntensity: 0.75,
      bloom: 0.3, saturation: 0.98, contrast: 1.05, tint: 0.07, vignette: 0.28,
      ambientParticles: null,
    },
  },
  {
    id: 'royal_kingdom',
    name: 'Spanish Café',
    tagline: 'Café con leche and chess in Seville',
    thumb: realThumb('royal_kingdom'),
    accent: '#e3b04b',
    board: { style: 'marble', light: '#efece6', dark: '#16161b', lightVein: '#bdb7ad', darkVein: '#3c3c46', frame: '#20161a', frameStyle: 'wood', trim: 0xd4a843, trimMetal: true, label: '#e6c77d', roughness: 0.2, clearcoat: 0.45, scan: { light: 'marble_01', dark: 'marble_01', darkTint: '#222228', darkFilter: 'contrast(1.4)', frame: 'european_walnut_veneer_04', frameColor: 0x4a2814 } },
    light: {
      sunColor: 0xffe2b8, sunIntensity: 2.0, sunDir: [5, 11, 6], skyColor: 0xb59cff, groundColor: 0x1e1418, hemiIntensity: 0.5,
      exposure: 1.0, fogColor: 0x150f18, fogDensity: 0.02,
      envTop: 0x1a1426, envHorizon: 0x5a3a3a, envBottom: 0x100a0c, envKey: 0xffc884, envIntensity: 0.95,
      bloom: 0.5, saturation: 1.04, contrast: 1.07, tint: 0.04, vignette: 0.34,
      ambientParticles: null,
    },
  },
];

export function getArenaTheme(id: ArenaId): ArenaTheme {
  return ARENA_THEMES.find(a => a.id === id) ?? ARENA_THEMES[0];
}
