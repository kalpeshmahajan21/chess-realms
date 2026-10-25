import type { AIDifficulty, ClockMode, GameSettings } from '../types.ts';

/** Gameplay timing and balance. All durations in seconds unless noted. */
export const TIMING = {
  /** Base piece travel time; scaled by distance (see moveDuration). */
  moveBase: 0.32,
  movePerSquare: 0.045,
  moveMax: 0.62,
  knightHopHeight: 0.85,
  liftHeight: 0.28,
  /** How long the captured piece takes to topple and sink. */
  captureFall: 0.55,
  /** Minimum "thinking" time shown for the AI so its moves never feel instant. */
  aiMinThinkMs: 650,
  /** Clock seconds left when low-time tension starts. */
  lowClockSeconds: 20,
  toastMs: 3200,
} as const;

export function moveDuration(fromSq: number, toSq: number): number {
  const df = Math.abs((fromSq % 8) - (toSq % 8));
  const dr = Math.abs(Math.floor(fromSq / 8) - Math.floor(toSq / 8));
  const dist = Math.hypot(df, dr);
  return Math.min(TIMING.moveMax, TIMING.moveBase + dist * TIMING.movePerSquare);
}

export const CLOCK_SECONDS: Record<ClockMode, number> = {
  none: 0,
  '3min': 180,
  '5min': 300,
  '10min': 600,
};

export const CLOCK_LABELS: Record<ClockMode, string> = {
  none: 'Untimed',
  '3min': '3 min',
  '5min': '5 min',
  '10min': '10 min',
};

export interface AILevelInfo {
  id: AIDifficulty;
  label: string;
  elo: number;
  tagline: string;
}

export const AI_LEVELS: AILevelInfo[] = [
  { id: 'beginner', label: 'Beginner', elo: 600, tagline: 'Relaxed, makes mistakes' },
  { id: 'hard_1', label: 'Casual', elo: 1200, tagline: 'Plays for the centre' },
  { id: 'hard_2', label: 'Club', elo: 1600, tagline: 'Spots tactics' },
  { id: 'hard_3', label: 'Expert', elo: 2000, tagline: 'Opening book, deeper search' },
  { id: 'hard_4', label: 'Master', elo: 2400, tagline: 'Deepest search' },
];

export const AI_NAME = 'Rika';

export function aiDisplayName(level: AIDifficulty): string {
  const info = AI_LEVELS.find(l => l.id === level) ?? AI_LEVELS[2];
  return `${AI_NAME} · ${info.label}`;
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.85,
  muted: false,
  clockMode: 'none',
  cinematics: 'all',
  autoRotateCamera: true,
  showCoordinates: true,
  showLegalMoves: true,
  confirmResign: true,
  pieceSet: 'staunton',
  graphicsQuality: 'auto',
  ambientEffects: true,
  reducedMotion: false,
  highVisibilityHints: false,
  cameraSensitivity: 1,
  textSize: 'default',
  haptics: true,
};

export const STORAGE_KEYS = {
  settings: 'cr_settings_v2',
  playerName: 'chess_world_username', // kept from v1 so returning players keep their name
  lastSetup: 'cr_last_setup_v2',
  onboarded: 'cr_onboarded_v2',
} as const;
