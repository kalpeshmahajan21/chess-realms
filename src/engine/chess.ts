/**
 * Chess Realms - Pure Algorithmic Chess Engine
 * 100% accurate chess rules, legal move generation, check/mate/stalemate,
 * castling, en passant, promotion, 50-move rule, threefold repetition, and insufficient material.
 */

export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface Move {
  from: number; // 0..63
  to: number;   // 0..63
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
  isEnPassant?: boolean;
  isCastling?: 'kingside' | 'queenside';
  san?: string;
}

export interface CastlingRights {
  w: { k: boolean; q: boolean };
  b: { k: boolean; q: boolean };
}

export interface GameState {
  board: (Piece | null)[];
  turn: PieceColor;
  castling: CastlingRights;
  enPassant: number | null; // target square behind double-pushed pawn
  halfmoveClock: number;    // for 50-move rule
  fullmoveNumber: number;
  positionHistory: string[]; // FEN strings (board+turn+castling+ep) for threefold repetition
  moveHistory: Move[];
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Square conversions
export function squareToCoords(sq: number): { file: number; rank: number } {
  return { file: sq % 8, rank: Math.floor(sq / 8) };
}

export function coordsToSquare(file: number, rank: number): number {
  return rank * 8 + file;
}

export function squareToAlgebraic(sq: number): string {
  const file = String.fromCharCode('a'.charCodeAt(0) + (sq % 8));
  const rank = (Math.floor(sq / 8) + 1).toString();
  return `${file}${rank}`;
}

export function algebraicToSquare(alg: string): number {
  const file = alg.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(alg[1], 10) - 1;
  return coordsToSquare(file, rank);
}

// Direction offsets for 64-square board
const KNIGHT_OFFSETS = [-17, -15, -10, -6, 6, 10, 15, 17];
const KING_OFFSETS = [-9, -8, -7, -1, 1, 7, 8, 9];
const BISHOP_OFFSETS = [-9, -7, 7, 9];
const ROOK_OFFSETS = [-8, -1, 1, 8];

function isValidOffset(from: number, to: number, offset: number): boolean {
  if (to < 0 || to > 63) return false;
  const fromFile = from % 8;
  const toFile = to % 8;
  const fileDiff = Math.abs(toFile - fromFile);
  const rankDiff = Math.abs(Math.floor(to / 8) - Math.floor(from / 8));

  // Knight validation
  if (Math.abs(offset) === 17 || Math.abs(offset) === 15 || Math.abs(offset) === 10 || Math.abs(offset) === 6) {
    return (fileDiff === 1 && rankDiff === 2) || (fileDiff === 2 && rankDiff === 1);
  }

  // King / pawn 1-step diagonal validation
  if (Math.abs(offset) === 9 || Math.abs(offset) === 7) {
    return fileDiff === 1 && rankDiff === 1;
  }

  // Horizontal 1-step
  if (Math.abs(offset) === 1) {
    return fileDiff === 1 && rankDiff === 0;
  }

  // Vertical 1-step
  if (Math.abs(offset) === 8) {
    return fileDiff === 0 && rankDiff === 1;
  }

  return true;
}

export class ChessEngine {
  public state: GameState;
  /** Snapshots of previous states so undo works after any FEN load. */
  private undoStack: GameState[] = [];
  /** Legal moves memoised per state object (states are never mutated after creation). */
  private legalCache = new WeakMap<GameState, Move[]>();

  constructor(fen: string = START_FEN) {
    this.state = this.loadFen(fen);
  }

  public loadFen(fen: string): GameState {
    const parts = fen.trim().split(/\s+/);
    const board: (Piece | null)[] = new Array(64).fill(null);
    const rows = parts[0].split('/');

    for (let r = 0; r < 8; r++) {
      const row = rows[r];
      let f = 0;
      const rank = 7 - r; // FEN begins with rank 8 (top row)
      for (const char of row) {
        if (/[1-8]/.test(char)) {
          f += parseInt(char, 10);
        } else {
          const color: PieceColor = char === char.toUpperCase() ? 'w' : 'b';
          const type = char.toLowerCase() as PieceType;
          board[coordsToSquare(f, rank)] = { type, color };
          f++;
        }
      }
    }

    const turn: PieceColor = (parts[1] || 'w') === 'w' ? 'w' : 'b';

    const castlingStr = parts[2] || '-';
    const castling: CastlingRights = {
      w: { k: castlingStr.includes('K'), q: castlingStr.includes('Q') },
      b: { k: castlingStr.includes('k'), q: castlingStr.includes('q') },
    };

    const epStr = parts[3] || '-';
    const enPassant = epStr !== '-' ? algebraicToSquare(epStr) : null;

    const halfmoveClock = parseInt(parts[4] || '0', 10);
    const fullmoveNumber = parseInt(parts[5] || '1', 10);

    const posKey = this.getPositionKey({ board, turn, castling, enPassant, halfmoveClock, fullmoveNumber, positionHistory: [], moveHistory: [] });

    const newState: GameState = {
      board,
      turn,
      castling,
      enPassant,
      halfmoveClock,
      fullmoveNumber,
      positionHistory: [posKey],
      moveHistory: [],
    };
    this.state = newState;
    this.undoStack = [];
    return newState;
  }

  public getPositionKey(state: GameState = this.state): string {
    // Generates key for repetition checking: piece placement + turn + castling + ep square
    let res = '';
    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (!p) res += '.';
      else res += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    res += ` ${state.turn}`;
    let c = '';
    if (state.castling.w.k) c += 'K';
    if (state.castling.w.q) c += 'Q';
    if (state.castling.b.k) c += 'k';
    if (state.castling.b.q) c += 'q';
    res += ` ${c || '-'}`;
    res += ` ${state.enPassant !== null ? squareToAlgebraic(state.enPassant) : '-'}`;
    return res;
  }

  public cloneState(state: GameState = this.state): GameState {
    return {
      board: [...state.board],
      turn: state.turn,
      castling: {
        w: { ...state.castling.w },
        b: { ...state.castling.b },
      },
      enPassant: state.enPassant,
      halfmoveClock: state.halfmoveClock,
      fullmoveNumber: state.fullmoveNumber,
      positionHistory: [...state.positionHistory],
      moveHistory: [...state.moveHistory],
    };
  }

  public getPiece(sq: number): Piece | null {
    return this.state.board[sq];
  }

  public isSquareAttacked(sq: number, byColor: PieceColor, board: (Piece | null)[] = this.state.board): boolean {
    const { file: targetFile, rank: targetRank } = squareToCoords(sq);

    // 1. Attacked by pawns
    const pawnRank = byColor === 'w' ? targetRank - 1 : targetRank + 1;
    if (pawnRank >= 0 && pawnRank <= 7) {
      if (targetFile > 0) {
        const p = board[coordsToSquare(targetFile - 1, pawnRank)];
        if (p && p.color === byColor && p.type === 'p') return true;
      }
      if (targetFile < 7) {
        const p = board[coordsToSquare(targetFile + 1, pawnRank)];
        if (p && p.color === byColor && p.type === 'p') return true;
      }
    }

    // 2. Attacked by knights
    for (const offset of KNIGHT_OFFSETS) {
      const src = sq + offset;
      if (src >= 0 && src <= 63) {
        const srcFile = src % 8;
        const srcRank = Math.floor(src / 8);
        const fDiff = Math.abs(srcFile - targetFile);
        const rDiff = Math.abs(srcRank - targetRank);
        if ((fDiff === 1 && rDiff === 2) || (fDiff === 2 && rDiff === 1)) {
          const p = board[src];
          if (p && p.color === byColor && p.type === 'n') return true;
        }
      }
    }

    // 3. Attacked by king
    for (const offset of KING_OFFSETS) {
      const src = sq + offset;
      if (src >= 0 && src <= 63) {
        const srcFile = src % 8;
        const srcRank = Math.floor(src / 8);
        if (Math.abs(srcFile - targetFile) <= 1 && Math.abs(srcRank - targetRank) <= 1) {
          const p = board[src];
          if (p && p.color === byColor && p.type === 'k') return true;
        }
      }
    }

    // 4. Attacked by sliders (Rook / Queen orthogonal)
    const orthoRays = [
      { df: 0, dr: 1 },  // North
      { df: 0, dr: -1 }, // South
      { df: 1, dr: 0 },  // East
      { df: -1, dr: 0 }, // West
    ];
    for (const ray of orthoRays) {
      let f = targetFile + ray.df;
      let r = targetRank + ray.dr;
      while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        const currSq = coordsToSquare(f, r);
        const p = board[currSq];
        if (p) {
          if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
          break; // ray blocked
        }
        f += ray.df;
        r += ray.dr;
      }
    }

    // 5. Attacked by sliders (Bishop / Queen diagonal)
    const diagRays = [
      { df: 1, dr: 1 },
      { df: 1, dr: -1 },
      { df: -1, dr: 1 },
      { df: -1, dr: -1 },
    ];
    for (const ray of diagRays) {
      let f = targetFile + ray.df;
      let r = targetRank + ray.dr;
      while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        const currSq = coordsToSquare(f, r);
        const p = board[currSq];
        if (p) {
          if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
          break; // ray blocked
        }
        f += ray.df;
        r += ray.dr;
      }
    }

    return false;
  }

  public findKing(color: PieceColor, board: (Piece | null)[] = this.state.board): number {
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (p && p.color === color && p.type === 'k') return i;
    }
    return -1;
  }

  public isInCheck(color: PieceColor = this.state.turn, board: (Piece | null)[] = this.state.board): boolean {
    const kingSq = this.findKing(color, board);
    if (kingSq === -1) return false;
    const opponent: PieceColor = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingSq, opponent, board);
  }

  /**
   * Pseudo-legal move generator for a given board state
   */
  public generatePseudoMoves(state: GameState = this.state): Move[] {
    const moves: Move[] = [];
    const color = state.turn;
    const enemy: PieceColor = color === 'w' ? 'b' : 'w';
    const isWhite = color === 'w';

    for (let sq = 0; sq < 64; sq++) {
      const piece = state.board[sq];
      if (!piece || piece.color !== color) continue;

      const { file, rank } = squareToCoords(sq);

      switch (piece.type) {
        case 'p': {
          const forward = isWhite ? 8 : -8;
          const startRank = isWhite ? 1 : 6;
          const promoRank = isWhite ? 7 : 0;
          const to1 = sq + forward;

          // Single push
          if (to1 >= 0 && to1 <= 63 && !state.board[to1]) {
            const destRank = Math.floor(to1 / 8);
            if (destRank === promoRank) {
              const promos: PieceType[] = ['q', 'r', 'b', 'n'];
              for (const pr of promos) {
                moves.push({ from: sq, to: to1, piece, promotion: pr });
              }
            } else {
              moves.push({ from: sq, to: to1, piece });
              // Double push
              if (rank === startRank) {
                const to2 = sq + forward * 2;
                if (!state.board[to2]) {
                  moves.push({ from: sq, to: to2, piece });
                }
              }
            }
          }

          // Diagonal captures & en passant
          const captureOffsets = isWhite ? [7, 9] : [-9, -7];
          for (const off of captureOffsets) {
            const dest = sq + off;
            if (dest >= 0 && dest <= 63) {
              const destFile = dest % 8;
              const destRank = Math.floor(dest / 8);
              if (Math.abs(destFile - file) === 1 && Math.abs(destRank - rank) === 1) {
                const target = state.board[dest];
                if (target && target.color === enemy) {
                  if (destRank === promoRank) {
                    const promos: PieceType[] = ['q', 'r', 'b', 'n'];
                    for (const pr of promos) {
                      moves.push({ from: sq, to: dest, piece, captured: target, promotion: pr });
                    }
                  } else {
                    moves.push({ from: sq, to: dest, piece, captured: target });
                  }
                } else if (state.enPassant === dest) {
                  // En passant capture
                  const epCapturedSq = isWhite ? dest - 8 : dest + 8;
                  const epCaptured = state.board[epCapturedSq];
                  if (epCaptured && epCaptured.color === enemy && epCaptured.type === 'p') {
                    moves.push({
                      from: sq,
                      to: dest,
                      piece,
                      captured: epCaptured,
                      isEnPassant: true,
                    });
                  }
                }
              }
            }
          }
          break;
        }

        case 'n': {
          for (const off of KNIGHT_OFFSETS) {
            const dest = sq + off;
            if (isValidOffset(sq, dest, off)) {
              const target = state.board[dest];
              if (!target) {
                moves.push({ from: sq, to: dest, piece });
              } else if (target.color === enemy) {
                moves.push({ from: sq, to: dest, piece, captured: target });
              }
            }
          }
          break;
        }

        case 'b': {
          const diagDirs = [
            { df: 1, dr: 1 },
            { df: 1, dr: -1 },
            { df: -1, dr: 1 },
            { df: -1, dr: -1 },
          ];
          for (const d of diagDirs) {
            let f = file + d.df;
            let r = rank + d.dr;
            while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
              const dest = coordsToSquare(f, r);
              const target = state.board[dest];
              if (!target) {
                moves.push({ from: sq, to: dest, piece });
              } else {
                if (target.color === enemy) {
                  moves.push({ from: sq, to: dest, piece, captured: target });
                }
                break;
              }
              f += d.df;
              r += d.dr;
            }
          }
          break;
        }

        case 'r': {
          const orthoDirs = [
            { df: 0, dr: 1 },
            { df: 0, dr: -1 },
            { df: 1, dr: 0 },
            { df: -1, dr: 0 },
          ];
          for (const d of orthoDirs) {
            let f = file + d.df;
            let r = rank + d.dr;
            while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
              const dest = coordsToSquare(f, r);
              const target = state.board[dest];
              if (!target) {
                moves.push({ from: sq, to: dest, piece });
              } else {
                if (target.color === enemy) {
                  moves.push({ from: sq, to: dest, piece, captured: target });
                }
                break;
              }
              f += d.df;
              r += d.dr;
            }
          }
          break;
        }

        case 'q': {
          const allDirs = [
            { df: 0, dr: 1 },
            { df: 0, dr: -1 },
            { df: 1, dr: 0 },
            { df: -1, dr: 0 },
            { df: 1, dr: 1 },
            { df: 1, dr: -1 },
            { df: -1, dr: 1 },
            { df: -1, dr: -1 },
          ];
          for (const d of allDirs) {
            let f = file + d.df;
            let r = rank + d.dr;
            while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
              const dest = coordsToSquare(f, r);
              const target = state.board[dest];
              if (!target) {
                moves.push({ from: sq, to: dest, piece });
              } else {
                if (target.color === enemy) {
                  moves.push({ from: sq, to: dest, piece, captured: target });
                }
                break;
              }
              f += d.df;
              r += d.dr;
            }
          }
          break;
        }

        case 'k': {
          for (const off of KING_OFFSETS) {
            const dest = sq + off;
            if (isValidOffset(sq, dest, off)) {
              const target = state.board[dest];
              if (!target) {
                moves.push({ from: sq, to: dest, piece });
              } else if (target.color === enemy) {
                moves.push({ from: sq, to: dest, piece, captured: target });
              }
            }
          }

          // Castling
          const rights = state.castling[color];
          const homeRank = isWhite ? 0 : 7;
          const kingHome = coordsToSquare(4, homeRank); // e1 or e8

          if (sq === kingHome) {
            // Kingside castling (O-O)
            if (rights.k) {
              const f1 = coordsToSquare(5, homeRank);
              const g1 = coordsToSquare(6, homeRank);
              const h1 = coordsToSquare(7, homeRank);
              const rook = state.board[h1];
              if (
                rook &&
                rook.type === 'r' &&
                rook.color === color &&
                !state.board[f1] &&
                !state.board[g1]
              ) {
                // Must not be in check, and neither passage square nor dest square can be attacked
                if (
                  !this.isSquareAttacked(kingHome, enemy, state.board) &&
                  !this.isSquareAttacked(f1, enemy, state.board) &&
                  !this.isSquareAttacked(g1, enemy, state.board)
                ) {
                  moves.push({
                    from: sq,
                    to: g1,
                    piece,
                    isCastling: 'kingside',
                  });
                }
              }
            }

            // Queenside castling (O-O-O)
            if (rights.q) {
              const d1 = coordsToSquare(3, homeRank);
              const c1 = coordsToSquare(2, homeRank);
              const b1 = coordsToSquare(1, homeRank);
              const a1 = coordsToSquare(0, homeRank);
              const rook = state.board[a1];
              if (
                rook &&
                rook.type === 'r' &&
                rook.color === color &&
                !state.board[d1] &&
                !state.board[c1] &&
                !state.board[b1]
              ) {
                if (
                  !this.isSquareAttacked(kingHome, enemy, state.board) &&
                  !this.isSquareAttacked(d1, enemy, state.board) &&
                  !this.isSquareAttacked(c1, enemy, state.board)
                ) {
                  moves.push({
                    from: sq,
                    to: c1,
                    piece,
                    isCastling: 'queenside',
                  });
                }
              }
            }
          }
          break;
        }
      }
    }

    return moves;
  }

  /**
   * Applies move to a copy of state without full check verification (for engine testing / simulation)
   */
  public applyMove(state: GameState, move: Move): GameState {
    const nextState = this.cloneState(state);
    const { from, to, piece, promotion, isEnPassant, isCastling } = move;

    // Reset en passant target
    nextState.enPassant = null;

    // Remove piece from origin
    nextState.board[from] = null;

    // En passant handling
    if (isEnPassant) {
      const epCapturedSq = piece.color === 'w' ? to - 8 : to + 8;
      nextState.board[epCapturedSq] = null;
    }

    // Castling rook move
    if (isCastling === 'kingside') {
      const rookFrom = piece.color === 'w' ? coordsToSquare(7, 0) : coordsToSquare(7, 7);
      const rookTo = piece.color === 'w' ? coordsToSquare(5, 0) : coordsToSquare(5, 7);
      const rook = nextState.board[rookFrom];
      nextState.board[rookFrom] = null;
      nextState.board[rookTo] = rook;
    } else if (isCastling === 'queenside') {
      const rookFrom = piece.color === 'w' ? coordsToSquare(0, 0) : coordsToSquare(0, 7);
      const rookTo = piece.color === 'w' ? coordsToSquare(3, 0) : coordsToSquare(3, 7);
      const rook = nextState.board[rookFrom];
      nextState.board[rookFrom] = null;
      nextState.board[rookTo] = rook;
    }

    // Place piece (with promotion if applicable)
    if (promotion) {
      nextState.board[to] = { type: promotion, color: piece.color };
    } else {
      nextState.board[to] = piece;
    }

    // Double pawn push sets enPassant
    if (piece.type === 'p' && Math.abs(to - from) === 16) {
      nextState.enPassant = piece.color === 'w' ? from + 8 : from - 8;
    }

    // Update castling rights
    if (piece.type === 'k') {
      nextState.castling[piece.color].k = false;
      nextState.castling[piece.color].q = false;
    }
    if (piece.type === 'r') {
      if (from === 0) nextState.castling.w.q = false;
      if (from === 7) nextState.castling.w.k = false;
      if (from === 56) nextState.castling.b.q = false;
      if (from === 63) nextState.castling.b.k = false;
    }
    // If a rook is captured on its home square, forfeit opponent's right
    if (to === 0) nextState.castling.w.q = false;
    if (to === 7) nextState.castling.w.k = false;
    if (to === 56) nextState.castling.b.q = false;
    if (to === 63) nextState.castling.b.k = false;

    // Halfmove clock for 50-move rule
    if (piece.type === 'p' || move.captured) {
      nextState.halfmoveClock = 0;
    } else {
      nextState.halfmoveClock++;
    }

    // Switch turn
    nextState.turn = state.turn === 'w' ? 'b' : 'w';
    if (state.turn === 'b') {
      nextState.fullmoveNumber++;
    }

    const posKey = this.getPositionKey(nextState);
    nextState.positionHistory.push(posKey);
    nextState.moveHistory.push(move);

    return nextState;
  }

  /**
   * Generates strictly legal moves
   */
  public generateLegalMoves(state: GameState = this.state): Move[] {
    const cached = this.legalCache.get(state);
    if (cached) return cached;
    const pseudo = this.generatePseudoMoves(state);
    const legal: Move[] = [];
    const color = state.turn;

    for (const move of pseudo) {
      // Simulate move
      const next = this.applyMove(state, move);
      // Own king must not be left in check
      if (!this.isInCheck(color, next.board)) {
        legal.push(move);
      }
    }

    this.legalCache.set(state, legal);
    return legal;
  }

  /**
   * Formats a legal move into Standard Algebraic Notation (SAN)
   */
  public moveToSAN(move: Move, state: GameState = this.state): string {
    if (move.isCastling === 'kingside') return 'O-O';
    if (move.isCastling === 'queenside') return 'O-O-O';

    let san = '';
    const { from, to, piece, promotion, captured } = move;

    if (piece.type !== 'p') {
      san += piece.type.toUpperCase();

      // Disambiguation: check if any other piece of same type and color can move to 'to'
      const legalMoves = this.generateLegalMoves(state);
      const candidates = legalMoves.filter(
        m => m.to === to && m.from !== from && m.piece.type === piece.type && m.piece.color === piece.color
      );

      if (candidates.length > 0) {
        const fromFile = squareToAlgebraic(from)[0];
        const fromRank = squareToAlgebraic(from)[1];

        const sameFile = candidates.some(m => squareToAlgebraic(m.from)[0] === fromFile);
        const sameRank = candidates.some(m => squareToAlgebraic(m.from)[1] === fromRank);

        if (!sameFile) {
          san += fromFile;
        } else if (!sameRank) {
          san += fromRank;
        } else {
          san += fromFile + fromRank;
        }
      }
    } else if (captured) {
      san += squareToAlgebraic(from)[0];
    }

    if (captured) {
      san += 'x';
    }

    san += squareToAlgebraic(to);

    if (promotion) {
      san += `=${promotion.toUpperCase()}`;
    }

    // Check for check or checkmate
    const nextState = this.applyMove(state, move);
    const opponent = state.turn === 'w' ? 'b' : 'w';
    if (this.isInCheck(opponent, nextState.board)) {
      const nextLegal = this.generateLegalMoves(nextState);
      if (nextLegal.length === 0) {
        san += '#';
      } else {
        san += '+';
      }
    }

    return san;
  }

  /**
   * Execute move on game state
   */
  public makeMove(fromOrMove: number | Move, to?: number, promotion?: PieceType): Move | null {
    const legalMoves = this.generateLegalMoves();
    let move: Move | undefined;

    if (typeof fromOrMove === 'object') {
      move = legalMoves.find(
        m => m.from === fromOrMove.from && m.to === fromOrMove.to && (!m.promotion || m.promotion === fromOrMove.promotion)
      );
    } else if (to !== undefined) {
      const candidates = legalMoves.filter(m => m.from === fromOrMove && m.to === to);
      if (candidates.length === 1) {
        move = candidates[0];
      } else if (candidates.length > 1 && promotion) {
        move = candidates.find(m => m.promotion === promotion);
      } else if (candidates.length > 1) {
        // default to queen promotion if not specified
        move = candidates.find(m => m.promotion === 'q') || candidates[0];
      }
    }

    if (!move) return null;

    // Attach SAN notation before state update
    move.san = this.moveToSAN(move, this.state);

    this.undoStack.push(this.state);
    this.state = this.applyMove(this.state, move);
    return move;
  }

  /** Undo the last move. Returns the move that was taken back. */
  public undoMove(): Move | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    const undone = this.state.moveHistory[this.state.moveHistory.length - 1] || null;
    this.state = previous;
    return undone;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Square of the first enemy piece giving check to `color`'s king, or -1. */
  public findCheckingSquare(color: PieceColor = this.state.turn): number {
    const kingSq = this.findKing(color);
    if (kingSq < 0) return -1;
    const enemy: PieceColor = color === 'w' ? 'b' : 'w';
    const probe: GameState = { ...this.state, turn: enemy };
    const hit = this.generatePseudoMoves(probe).find(m => m.to === kingSq);
    return hit ? hit.from : -1;
  }

  // --- DRAW / ENDGAME CONDITIONS ---

  public isCheckmate(): boolean {
    if (!this.isInCheck(this.state.turn)) return false;
    return this.generateLegalMoves().length === 0;
  }

  public isStalemate(): boolean {
    if (this.isInCheck(this.state.turn)) return false;
    return this.generateLegalMoves().length === 0;
  }

  public isThreefoldRepetition(): boolean {
    const currentKey = this.getPositionKey();
    const count = this.state.positionHistory.filter(k => k === currentKey).length;
    return count >= 3;
  }

  public isFiftyMoveRule(): boolean {
    return this.state.halfmoveClock >= 100; // 50 full moves = 100 half moves
  }

  public isInsufficientMaterial(): boolean {
    const pieces: Piece[] = [];
    for (let i = 0; i < 64; i++) {
      const p = this.state.board[i];
      if (p) pieces.push(p);
    }

    // King vs King
    if (pieces.length === 2) return true;

    // King + Bishop vs King OR King + Knight vs King
    if (pieces.length === 3) {
      const minor = pieces.find(p => p.type === 'b' || p.type === 'n');
      if (minor) return true;
    }

    // King + Bishop vs King + Bishop with both bishops on same color square
    if (pieces.length === 4) {
      const bishops: { color: PieceColor; sq: number }[] = [];
      for (let i = 0; i < 64; i++) {
        const p = this.state.board[i];
        if (p && p.type === 'b') {
          bishops.push({ color: p.color, sq: i });
        }
      }
      if (bishops.length === 2 && bishops[0].color !== bishops[1].color) {
        const { file: f1, rank: r1 } = squareToCoords(bishops[0].sq);
        const { file: f2, rank: r2 } = squareToCoords(bishops[1].sq);
        const sqColor1 = (f1 + r1) % 2;
        const sqColor2 = (f2 + r2) % 2;
        if (sqColor1 === sqColor2) return true;
      }
    }

    return false;
  }

  public getGameStatus(): {
    isOver: boolean;
    result?: 'checkmate' | 'stalemate' | 'threefold' | 'fifty-moves' | 'insufficient-material' | 'resigned' | 'draw-agreed';
    winner?: PieceColor;
    description?: string;
  } {
    if (this.isCheckmate()) {
      const winner = this.state.turn === 'w' ? 'b' : 'w';
      return { isOver: true, result: 'checkmate', winner, description: `Checkmate! ${winner === 'w' ? 'White' : 'Black'} wins!` };
    }
    if (this.isStalemate()) {
      return { isOver: true, result: 'stalemate', description: 'Draw by Stalemate!' };
    }
    if (this.isThreefoldRepetition()) {
      return { isOver: true, result: 'threefold', description: 'Draw by Threefold Repetition!' };
    }
    if (this.isFiftyMoveRule()) {
      return { isOver: true, result: 'fifty-moves', description: 'Draw by 50-Move Rule!' };
    }
    if (this.isInsufficientMaterial()) {
      return { isOver: true, result: 'insufficient-material', description: 'Draw by Insufficient Material!' };
    }

    return { isOver: false };
  }

  public getFen(state: GameState = this.state): string {
    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let rowStr = '';
      let emptyCount = 0;
      for (let f = 0; f < 8; f++) {
        const sq = coordsToSquare(f, r);
        const p = state.board[sq];
        if (!p) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount.toString();
            emptyCount = 0;
          }
          rowStr += p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();
        }
      }
      if (emptyCount > 0) {
        rowStr += emptyCount.toString();
      }
      rows.push(rowStr);
    }

    let castling = '';
    if (state.castling.w.k) castling += 'K';
    if (state.castling.w.q) castling += 'Q';
    if (state.castling.b.k) castling += 'k';
    if (state.castling.b.q) castling += 'q';
    if (!castling) castling = '-';

    const ep = state.enPassant !== null ? squareToAlgebraic(state.enPassant) : '-';
    return `${rows.join('/')} ${state.turn} ${castling} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`;
  }
}
