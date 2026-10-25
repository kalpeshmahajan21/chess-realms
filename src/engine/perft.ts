import { ChessEngine, GameState } from './chess.ts';

export function perft(engine: ChessEngine, depth: number, state: GameState = engine.state): number {
  if (depth === 0) return 1;

  const moves = engine.generateLegalMoves(state);
  if (depth === 1) return moves.length;

  let totalNodes = 0;
  for (const move of moves) {
    const nextState = engine.applyMove(state, move);
    totalNodes += perft(engine, depth - 1, nextState);
  }
  return totalNodes;
}

export function perftDivide(engine: ChessEngine, depth: number, state: GameState = engine.state): Map<string, number> {
  const moves = engine.generateLegalMoves(state);
  const results = new Map<string, number>();

  for (const move of moves) {
    const nextState = engine.applyMove(state, move);
    const count = depth > 1 ? perft(engine, depth - 1, nextState) : 1;
    const key = `${move.from}->${move.to}${move.promotion ? '=' + move.promotion : ''}`;
    results.set(key, count);
  }

  return results;
}
