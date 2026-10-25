import { Move, PieceColor, PieceType, squareToAlgebraic } from '../engine/chess.ts';

/** A dramatic moment worth replaying on the game-over screen. */
export interface GameMoment {
  id: string;
  moveNumber: number;
  san: string;
  caption: string;
  fromSq: number;
  toSq: number;
  attackerColor: PieceColor;
  attackerPiece: PieceType;
  capturedPiece?: PieceType;
  isCheck: boolean;
  isCheckmate: boolean;
  isPromotion: boolean;
  dramaScore: number;
  fenBeforeMove: string;
  move: Move;
}

const NAMES: Record<PieceType, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

/** Scores a move for drama; returns null for quiet moves. Scores match v1 so highlight reels feel the same. */
export function scoreMoment(
  move: Move,
  plyNumber: number,
  attackerName: string,
  victimName: string,
  isCheck: boolean,
  isCheckmate: boolean,
  fenBeforeMove: string
): GameMoment | null {
  const moveNumber = Math.ceil(plyNumber / 2);
  const piece = NAMES[move.piece.type];
  let dramaScore = 0;
  let caption = '';
  if (isCheckmate) {
    dramaScore = 100;
    caption = `${attackerName} delivers checkmate with the ${piece}`;
  } else if (move.captured?.type === 'q') {
    dramaScore = 90;
    caption = `${attackerName}'s ${piece} takes ${victimName}'s Queen`;
  } else if (move.promotion) {
    dramaScore = 85;
    caption = `${attackerName} promotes to a ${NAMES[move.promotion]}`;
  } else if (move.captured?.type === 'r') {
    dramaScore = 75;
    caption = `${attackerName}'s ${piece} wins a Rook`;
  } else if (move.captured?.type === 'n' || move.captured?.type === 'b') {
    dramaScore = 65;
    caption = `${attackerName} takes ${victimName}'s ${NAMES[move.captured.type]}`;
  } else if (isCheck) {
    dramaScore = 55;
    caption = `${attackerName} checks the King with ${move.san}`;
  } else if (move.captured) {
    dramaScore = 40;
    caption = `${attackerName} captures on ${squareToAlgebraic(move.to)}`;
  }
  if (dramaScore === 0) return null;
  return {
    id: `m${plyNumber}_${move.from}_${move.to}`,
    moveNumber,
    san: move.san || '',
    caption,
    fromSq: move.from,
    toSq: move.to,
    attackerColor: move.piece.color,
    attackerPiece: move.piece.type,
    capturedPiece: move.captured?.type,
    isCheck,
    isCheckmate,
    isPromotion: !!move.promotion,
    dramaScore,
    fenBeforeMove,
    move,
  };
}

export function topMoments(moments: GameMoment[], count = 5): GameMoment[] {
  return [...moments]
    .sort((a, b) => b.dramaScore - a.dramaScore || a.moveNumber - b.moveNumber)
    .slice(0, count)
    .sort((a, b) => a.moveNumber - b.moveNumber);
}
