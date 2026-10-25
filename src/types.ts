import type { PieceColor, PieceType } from './engine/chess.ts';
import type { ArenaId } from './audio/soundEngine.ts';
import type { PieceMaterialType } from './render/pieceMaterials.ts';

export type { ArenaId, PieceColor, PieceType, PieceMaterialType };

export type PieceSetId = 'staunton' | 'warrior';

export interface PlayerProfile {
  name: string;
  color: PieceColor;
  material: PieceMaterialType;
}

export type GameMode = 'pass_and_play' | 'vs_ai' | 'online';
export type AIDifficulty = 'beginner' | 'hard_1' | 'hard_2' | 'hard_3' | 'hard_4';
export type ClockMode = 'none' | '3min' | '5min' | '10min';
export type CameraPreset = 'auto' | 'white' | 'black' | 'side' | 'top';
export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high';
/** Capture cinematics: 'all' = On (every capture), 'off' = Off. */
export type CinematicMode = 'off' | 'all';
export type TextSize = 'small' | 'default' | 'large';

export interface GameSettings {
  // Audio
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
  // Gameplay
  clockMode: ClockMode;
  cinematics: CinematicMode;
  autoRotateCamera: boolean;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  confirmResign: boolean;
  pieceSet: PieceSetId;
  // Graphics
  graphicsQuality: GraphicsQuality;
  ambientEffects: boolean;
  // Accessibility
  reducedMotion: boolean;
  highVisibilityHints: boolean;
  cameraSensitivity: number; // 0.4..2
  textSize: TextSize;
  haptics: boolean;
}

export interface CapturedPiecesState {
  white: PieceType[]; // black pieces captured by white
  black: PieceType[]; // white pieces captured by black
  materialAdvantage: number; // + = white ahead
}
