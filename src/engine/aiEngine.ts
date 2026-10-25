/**
 * Chess Realms - Tactical AI Engine
 * 5 Tactical ELO Levels from Beginner to World-Class Grandmaster.
 * Features:
 * - Complete Piece-Square Tables (PST) for Midgame & Endgame
 * - Minimax with Alpha-Beta Pruning
 * - Quiescence Search (Noisy moves: captures & promotions to eliminate horizon blunders)
 * - MVV-LVA (Most Valuable Victim - Least Valuable Attacker) Move Ordering & Killer Heuristic
 * - Curated Grandmaster Opening Book (Ruy Lopez, Sicilian, Queen's Gambit, King's Indian, Italian Game)
 * - Time-budgeted iterative deepening (runs in a Web Worker in the app)
 */

import { ChessEngine, GameState, Move, PieceColor, PieceType, coordsToSquare, squareToCoords } from './chess.ts';
import { AIDifficulty } from '../types.ts';

// Piece Material Values (centipawns)
const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Mirror square for Black (vertical flip)
function mirrorSquare(sq: number): number {
  const { file, rank } = squareToCoords(sq);
  return coordsToSquare(file, 7 - rank);
}

// --- PIECE-SQUARE TABLES (From White's perspective; rank 0 to 7) ---

// Pawns: encourage center control, advancing, and passed pawns
const PST_PAWN: number[] = [
   0,  0,  0,  0,  0,  0,  0,  0, // rank 1 (home)
   5, 10, 10,-20,-20, 10, 10,  5, // rank 2
   5, -5,-10,  0,  0,-10, -5,  5, // rank 3
   0,  0,  0, 24, 24,  0,  0,  0, // rank 4
   5,  5, 10, 27, 27, 10,  5,  5, // rank 5
  10, 10, 20, 30, 30, 20, 10, 10, // rank 6
  50, 50, 50, 50, 50, 50, 50, 50, // rank 7
   0,  0,  0,  0,  0,  0,  0,  0  // rank 8
];

// Knights: avoid edges, strong in center
const PST_KNIGHT: number[] = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50
];

// Bishops: open diagonals and center influence
const PST_BISHOP: number[] = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -20,-10,-10,-10,-10,-10,-10,-20
];

// Rooks: 7th rank and central files
const PST_ROOK: number[] = [
   0,  0,  0,  5,  5,  0,  0,  0,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   5, 10, 10, 10, 10, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

// Queens: centralized without rushing early
const PST_QUEEN: number[] = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -10,  5,  5,  5,  5,  5,  0,-10,
   0,  0,  5,  5,  5,  5,  0, -5,
  -5,  0,  5,  5,  5,  5,  0, -5,
 -10,  0,  5,  5,  5,  5,  0,-10,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20
];

// King Midgame: castled safety on g1/c1
const PST_KING_MIDGAME: number[] = [
  20, 30, 10,  0,  0, 10, 30, 20,
  20, 20,  0,  0,  0,  0, 20, 20,
 -10,-20,-20,-20,-20,-20,-20,-10,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30
];

// King Endgame: active king in the center
const PST_KING_ENDGAME: number[] = [
 -50,-30,-30,-30,-30,-30,-30,-50,
 -30,-20, -10,  0,  0,-10,-20,-30,
 -30,-10,  20, 30, 30, 20,-10,-30,
 -30,-10,  30, 40, 40, 30,-10,-30,
 -30,-10,  30, 40, 40, 30,-10,-30,
 -30,-10,  20, 30, 30, 20,-10,-30,
 -30,-30,   0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50
];

// --- CURATED GRANDMASTER OPENING BOOK ---
// Maps FEN piece placements to array of grandmaster response moves (from, to, promotion?)
interface BookMove {
  from: number;
  to: number;
  name: string;
}

const OPENING_BOOK: Record<string, BookMove[]> = {
  // Start Position (White moves)
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR': [
    { from: 12, to: 28, name: 'e4 (King Pawn)' },
    { from: 11, to: 27, name: 'd4 (Queen Pawn)' },
    { from: 10, to: 26, name: 'c4 (English)' },
    { from: 6, to: 21, name: 'Nf3 (Reti)' },
  ],

  // 1. e4 responses (Black)
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR': [
    { from: 52, to: 36, name: 'e5 (Open Game)' },
    { from: 50, to: 34, name: 'c5 (Sicilian Defense)' },
    { from: 52, to: 44, name: 'e6 (French Defense)' },
    { from: 50, to: 42, name: 'c6 (Caro-Kann)' },
  ],

  // 1. d4 responses (Black)
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR': [
    { from: 51, to: 35, name: 'd5 (Closed Game)' },
    { from: 62, to: 45, name: 'Nf6 (Indian Defense)' },
    { from: 52, to: 44, name: 'e6' },
  ],

  // 1. e4 e5 (White)
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR': [
    { from: 6, to: 21, name: 'Nf3 (King Knight)' },
    { from: 1, to: 18, name: 'Nc3 (Vienna)' },
  ],

  // 1. e4 e5 2. Nf3 (Black)
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R': [
    { from: 57, to: 42, name: 'Nc6 (Main Line)' },
    { from: 62, to: 45, name: 'Nf6 (Petrov Defense)' },
  ],

  // 1. e4 e5 2. Nf3 Nc6 (White - Ruy Lopez or Italian)
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R': [
    { from: 5, to: 33, name: 'Bb5 (Ruy Lopez)' },
    { from: 5, to: 26, name: 'Bc4 (Italian Game)' },
    { from: 11, to: 27, name: 'd4 (Scotch Game)' },
  ],

  // 1. e4 c5 (White vs Sicilian)
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR': [
    { from: 6, to: 21, name: 'Nf3 (Open Sicilian)' },
    { from: 1, to: 18, name: 'Nc3 (Closed Sicilian)' },
  ],

  // 1. d4 d5 (White - Queen's Gambit)
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR': [
    { from: 10, to: 26, name: 'c4 (Queen Gambit)' },
    { from: 6, to: 21, name: 'Nf3 (London / Colle)' },
  ],

  // 1. d4 Nf6 2. c4 (King's Indian / Nimzo)
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR': [
    { from: 54, to: 46, name: 'g6 (King Indian Defense)' },
    { from: 52, to: 44, name: 'e6 (Nimzo-Indian setup)' },
  ],

  // --- CARO-KANN DEFENSE VARIATIONS ---
  // 1. e4 c6 (White options)
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR': [
    { from: 11, to: 27, name: 'd4 (Caro-Kann Main)' },
    { from: 1, to: 18, name: 'Nc3 (Two Knights / Modern)' },
  ],

  // 1. e4 c6 2. d4 (Black response: 2...d5)
  'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR': [
    { from: 51, to: 35, name: 'd5 (Caro-Kann 2...d5)' },
  ],

  // 1. e4 c6 2. d4 d5 (White options: Advance, Classical, Exchange)
  'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR': [
    { from: 28, to: 36, name: 'e5 (Advance Variation)' },
    { from: 1, to: 18, name: 'Nc3 (Classical Variation)' },
    { from: 28, to: 35, name: 'exd5 (Exchange Variation)' },
  ],

  // 1. e4 c6 2. d4 d5 3. e5 (Black in Advance Caro-Kann: 3...Bf5 or 3...c5)
  'rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR': [
    { from: 58, to: 37, name: 'Bf5 (Advance - Classical Bishop Out)' },
    { from: 42, to: 34, name: 'c5 (Advance - Arkell Counter)' },
  ],

  // 1. e4 c6 2. d4 d5 3. Nc3 (Black: 3...dxe4)
  'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR': [
    { from: 35, to: 28, name: 'dxe4 (Classical Capture)' },
  ],

  // 1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 (Black: 4...Bf5, 4...Nd7, or 4...Nf6)
  'rnbqkbnr/pp2pppp/2p5/8/3PN3/8/PPP2PPP/R1BQKBNR': [
    { from: 58, to: 37, name: 'Bf5 (Capablanca Variation)' },
    { from: 57, to: 51, name: 'Nd7 (Karpov Variation)' },
    { from: 62, to: 45, name: 'Nf6 (Tartakower Variation)' },
  ],

  // --- FRENCH DEFENSE VARIATIONS ---
  // 1. e4 e6 (White: 2. d4)
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR': [
    { from: 11, to: 27, name: 'd4 (French Main Line)' },
  ],

  // 1. e4 e6 2. d4 (Black: 2...d5)
  'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR': [
    { from: 51, to: 35, name: 'd5 (French 2...d5)' },
  ],

  // 1. e4 e6 2. d4 d5 (White options: Advance, Winawer/Classical, Tarrasch, Exchange)
  'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR': [
    { from: 28, to: 36, name: 'e5 (Advance French)' },
    { from: 1, to: 18, name: 'Nc3 (Winawer / Classical French)' },
    { from: 1, to: 11, name: 'Nd2 (Tarrasch Variation)' },
    { from: 28, to: 35, name: 'exd5 (Exchange French)' },
  ],

  // 1. e4 e6 2. d4 d5 3. e5 (Black in Advance French: 3...c5)
  'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR': [
    { from: 50, to: 34, name: 'c5 (Advance Counter)' },
  ],

  // 1. e4 e6 2. d4 d5 3. Nc3 (Black options: Winawer 3...Bb4, Classical 3...Nf6, Rubinstein 3...dxe4)
  'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR': [
    { from: 61, to: 25, name: 'Bb4 (Winawer Defense)' },
    { from: 62, to: 45, name: 'Nf6 (Classical Defense)' },
    { from: 35, to: 28, name: 'dxe4 (Rubinstein Variation)' },
  ],

  // 1. e4 e6 2. d4 d5 3. Nd2 (Black in Tarrasch: 3...c5 or 3...Nf6)
  'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPPN1PPP/R1BQKBNR': [
    { from: 50, to: 34, name: 'c5 (Open Tarrasch)' },
    { from: 62, to: 45, name: 'Nf6 (Closed Tarrasch)' },
  ],
};

// Killer moves table: [ply][slot 0 or 1]
const killerMoves: (Move | null)[][] = Array.from({ length: 32 }, () => [null, null]);

// Transposition Table Entry
interface TTEntry {
  depth: number;
  score: number;
  flag: 'exact' | 'lower' | 'upper';
  bestMove: Move | null;
}
const transpositionTable = new Map<string, TTEntry>();

/**
 * Total game phase calculation for tapered evaluation (0 = pure endgame, 24 = full midgame)
 */
function getGamePhase(board: (any | null)[]): number {
  let phase = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    if (p.type === 'n' || p.type === 'b') phase += 1;
    else if (p.type === 'r') phase += 2;
    else if (p.type === 'q') phase += 4;
  }
  return Math.min(24, phase);
}

/**
 * Static position evaluation function with Piece-Square Tables and material balance
 */
export function evaluatePosition(state: GameState): number {
  const { board, turn } = state;
  let whiteScore = 0;
  let blackScore = 0;

  const phase = getGamePhase(board); // 24 = midgame, 0 = endgame

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece) continue;

    const val = PIECE_VALUES[piece.type];
    const isW = piece.color === 'w';
    const evalSq = isW ? sq : mirrorSquare(sq);

    let pstVal = 0;
    switch (piece.type) {
      case 'p':
        pstVal = PST_PAWN[evalSq];
        break;
      case 'n':
        pstVal = PST_KNIGHT[evalSq];
        break;
      case 'b':
        pstVal = PST_BISHOP[evalSq];
        break;
      case 'r':
        pstVal = PST_ROOK[evalSq];
        break;
      case 'q':
        pstVal = PST_QUEEN[evalSq];
        break;
      case 'k': {
        const mgVal = PST_KING_MIDGAME[evalSq];
        const egVal = PST_KING_ENDGAME[evalSq];
        // Tapered king score between midgame safety and endgame activity
        pstVal = Math.round((mgVal * phase + egVal * (24 - phase)) / 24);
        break;
      }
    }

    if (isW) {
      whiteScore += val + pstVal;
    } else {
      blackScore += val + pstVal;
    }
  }

  // Perspective relative to current turn
  const total = whiteScore - blackScore;
  return turn === 'w' ? total : -total;
}

/**
 * MVV-LVA (Most Valuable Victim - Least Valuable Attacker) move scoring
 */
function scoreMoveForOrdering(move: Move, ply: number, ttMove: Move | null): number {
  // 1. Transposition table best move gets highest priority
  if (ttMove && move.from === ttMove.from && move.to === ttMove.to && move.promotion === ttMove.promotion) {
    return 100000;
  }

  // 2. MVV-LVA for captures
  if (move.captured) {
    const victimVal = PIECE_VALUES[move.captured.type];
    const attackerVal = PIECE_VALUES[move.piece.type];
    return 10000 + (victimVal * 10 - attackerVal);
  }

  // 3. Queen promotions
  if (move.promotion === 'q') {
    return 9000;
  }

  // 4. Killer moves (moves that caused beta cutoff at same ply)
  if (ply < 32) {
    if (killerMoves[ply][0] && move.from === killerMoves[ply][0]!.from && move.to === killerMoves[ply][0]!.to) {
      return 8000;
    }
    if (killerMoves[ply][1] && move.from === killerMoves[ply][1]!.from && move.to === killerMoves[ply][1]!.to) {
      return 7000;
    }
  }

  // 5. Positional piece-square improvement
  const fromEval = move.piece.color === 'w' ? move.from : mirrorSquare(move.from);
  const toEval = move.piece.color === 'w' ? move.to : mirrorSquare(move.to);
  let pstGain = 0;
  if (move.piece.type === 'p') pstGain = PST_PAWN[toEval] - PST_PAWN[fromEval];
  else if (move.piece.type === 'n') pstGain = PST_KNIGHT[toEval] - PST_KNIGHT[fromEval];
  else if (move.piece.type === 'b') pstGain = PST_BISHOP[toEval] - PST_BISHOP[fromEval];

  return pstGain;
}

function orderMoves(moves: Move[], ply: number, ttMove: Move | null): Move[] {
  return [...moves].sort((a, b) => {
    return scoreMoveForOrdering(b, ply, ttMove) - scoreMoveForOrdering(a, ply, ttMove);
  });
}

// --- Search budget -----------------------------------------------------------
// The search checks the clock every 1024 nodes and aborts by throwing; iterative
// deepening then falls back to the best move of the last fully searched depth.
class SearchTimeout extends Error {}
let searchDeadline = Infinity;
let nodeCounter = 0;
const TT_MAX_ENTRIES = 250_000;

function checkBudget() {
  if ((++nodeCounter & 1023) === 0 && performance.now() > searchDeadline) {
    throw new SearchTimeout();
  }
}

/**
 * Quiescence Search:
 * Only evaluates noisy moves (captures and promotions) to prevent the horizon effect.
 */
function quiescence(
  engine: ChessEngine,
  state: GameState,
  alpha: number,
  beta: number,
  depth: number,
  maxQDepth: number
): number {
  checkBudget();
  const standPat = evaluatePosition(state);

  if (depth >= maxQDepth) return standPat;
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const legalMoves = engine.generateLegalMoves(state);
  const loudMoves = legalMoves.filter(m => !!m.captured || !!m.promotion);
  const ordered = orderMoves(loudMoves, 0, null);

  for (const move of ordered) {
    // Delta pruning: if capturing this piece cannot possibly raise alpha, skip
    if (move.captured && standPat + PIECE_VALUES[move.captured.type] + 200 < alpha) continue;
    const nextState = engine.applyMove(state, move);
    const score = -quiescence(engine, nextState, -beta, -alpha, depth + 1, maxQDepth);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

/**
 * Negamax with Alpha-Beta Pruning, Transposition Table, and Quiescence Search
 */
function minimax(
  engine: ChessEngine,
  state: GameState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  enableTT: boolean,
  enableQuiescence: boolean
): { score: number; bestMove: Move | null } {
  checkBudget();
  const originalAlpha = alpha;
  const posKey = enableTT ? engine.getPositionKey(state) : '';

  let ttMove: Move | null = null;
  if (enableTT) {
    const entry = transpositionTable.get(posKey);
    if (entry) {
      ttMove = entry.bestMove;
      if (entry.depth >= depth && ply > 0) {
        if (entry.flag === 'exact') return { score: entry.score, bestMove: entry.bestMove };
        if (entry.flag === 'lower') alpha = Math.max(alpha, entry.score);
        else if (entry.flag === 'upper') beta = Math.min(beta, entry.score);
        if (alpha >= beta) return { score: entry.score, bestMove: entry.bestMove };
      }
    }
  }

  const legalMoves = engine.generateLegalMoves(state);
  if (legalMoves.length === 0) {
    if (engine.isInCheck(state.turn, state.board)) {
      return { score: -30000 + ply, bestMove: null }; // prefer faster mates
    }
    return { score: 0, bestMove: null }; // stalemate
  }

  if (depth <= 0) {
    if (enableQuiescence) {
      return { score: quiescence(engine, state, alpha, beta, 0, 4), bestMove: null };
    }
    return { score: evaluatePosition(state), bestMove: null };
  }

  const orderedMoves = orderMoves(legalMoves, ply, ttMove);
  let bestScore = -Infinity;
  let bestMove: Move | null = orderedMoves[0] || null;

  for (const move of orderedMoves) {
    const nextState = engine.applyMove(state, move);
    const score = -minimax(engine, nextState, depth - 1, ply + 1, -beta, -alpha, enableTT, enableQuiescence).score;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!move.captured && ply < 32) {
        killerMoves[ply][1] = killerMoves[ply][0];
        killerMoves[ply][0] = move;
      }
      break;
    }
  }

  if (enableTT) {
    let flag: 'exact' | 'lower' | 'upper' = 'exact';
    if (bestScore <= originalAlpha) flag = 'upper';
    else if (bestScore >= beta) flag = 'lower';
    if (transpositionTable.size > TT_MAX_ENTRIES) transpositionTable.clear();
    transpositionTable.set(posKey, { depth, score: bestScore, flag, bestMove });
  }

  return { score: bestScore, bestMove };
}

/** Per-level search profile. Time budgets keep every level responsive. */
interface SearchProfile {
  maxDepth: number;
  timeMs: number;
  tt: boolean;
  quiescence: boolean;
  randomMoveChance: number;
  useBook: boolean;
}

export const AI_PROFILES: Record<AIDifficulty, SearchProfile> = {
  beginner: { maxDepth: 1, timeMs: 300, tt: false, quiescence: false, randomMoveChance: 0.3, useBook: false },
  hard_1: { maxDepth: 2, timeMs: 600, tt: false, quiescence: false, randomMoveChance: 0, useBook: false },
  hard_2: { maxDepth: 3, timeMs: 1200, tt: true, quiescence: true, randomMoveChance: 0, useBook: false },
  hard_3: { maxDepth: 4, timeMs: 2200, tt: true, quiescence: true, randomMoveChance: 0, useBook: true },
  hard_4: { maxDepth: 6, timeMs: 3500, tt: true, quiescence: true, randomMoveChance: 0, useBook: true },
};

/** Strips history arrays so the thousands of state clones made during search stay cheap. */
function searchRoot(state: GameState): GameState {
  return { ...state, positionHistory: [], moveHistory: [] };
}

/**
 * Main AI entry point. Searches the engine's current position.
 * `timeScale` lets callers shorten the budget (e.g. hints).
 */
export function getAIMove(engine: ChessEngine, difficulty: AIDifficulty, timeScale = 1): Move | null {
  const legalMoves = engine.generateLegalMoves();
  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) return legalMoves[0];

  const profile = AI_PROFILES[difficulty] ?? AI_PROFILES.hard_2;

  if (profile.useBook) {
    const boardPart = engine.getFen().split(' ')[0];
    const bookOptions = OPENING_BOOK[boardPart];
    if (bookOptions && bookOptions.length > 0) {
      const choice = bookOptions[Math.floor(Math.random() * bookOptions.length)];
      const matched = legalMoves.find(m => m.from === choice.from && m.to === choice.to);
      if (matched) return matched;
    }
  }

  if (profile.randomMoveChance > 0 && Math.random() < profile.randomMoveChance) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  const root = searchRoot(engine.state);
  const searchEngine = new ChessEngine();
  searchEngine.state = root;

  for (const row of killerMoves) { row[0] = null; row[1] = null; }
  nodeCounter = 0;
  searchDeadline = performance.now() + profile.timeMs * timeScale;

  let best: Move | null = null;
  try {
    for (let d = 1; d <= profile.maxDepth; d++) {
      const res = minimax(searchEngine, root, d, 0, -Infinity, Infinity, profile.tt, profile.quiescence);
      if (res.bestMove) best = res.bestMove;
      if (Math.abs(res.score) > 29000) break; // forced mate found
    }
  } catch (err) {
    if (!(err instanceof SearchTimeout)) throw err;
  } finally {
    searchDeadline = Infinity;
  }

  const chosen = best || legalMoves[0];
  // Hand back the live engine's own move object (search ran on a separate engine).
  return legalMoves.find(m => m.from === chosen.from && m.to === chosen.to && m.promotion === chosen.promotion) || chosen;
}

export function getBestAIMove(engine: ChessEngine, level: AIDifficulty): Move | null {
  return getAIMove(engine, level);
}

/** Non-blocking wrapper used when Web Workers are unavailable (tests, old browsers). */
export async function getAIMoveAsync(engine: ChessEngine, difficulty: AIDifficulty, delayMs = 400): Promise<Move | null> {
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return getAIMove(engine, difficulty);
}
