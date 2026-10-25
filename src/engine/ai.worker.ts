/// <reference lib="webworker" />
import { ChessEngine, GameState } from './chess.ts';
import { getAIMove } from './aiEngine.ts';
import type { AIDifficulty } from '../types.ts';

export interface AIRequest {
  id: number;
  state: GameState;
  difficulty: AIDifficulty;
  timeScale?: number;
}

export interface AIResponse {
  id: number;
  from: number;
  to: number;
  promotion?: string;
  error?: string;
}

const engine = new ChessEngine();

self.onmessage = (e: MessageEvent<AIRequest>) => {
  const { id, state, difficulty, timeScale } = e.data;
  try {
    engine.state = state;
    const move = getAIMove(engine, difficulty, timeScale ?? 1);
    const reply: AIResponse = move
      ? { id, from: move.from, to: move.to, promotion: move.promotion }
      : { id, from: -1, to: -1 };
    (self as unknown as Worker).postMessage(reply);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, from: -1, to: -1, error: String(err) } satisfies AIResponse);
  }
};
