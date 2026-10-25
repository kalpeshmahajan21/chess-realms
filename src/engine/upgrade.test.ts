/**
 * Regression tests for v2 engine/AI changes:
 * - undo works after loading any FEN (v1 replayed from the start position)
 * - legal-move cache returns consistent results
 * - AI search honours its time budget and still finds forced mates
 * - highlight scoring
 */
import { ChessEngine, START_FEN } from './chess.ts';
import { getAIMove, AI_PROFILES } from './aiEngine.ts';
import { scoreMoment } from '../game/moments.ts';

let failed = 0;
function check(ok: boolean, msg: string) {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}`);
  if (!ok) failed++;
}

// 1. Undo after FEN load
{
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const e = new ChessEngine(fen);
  const m = e.makeMove(5, 33); // Bb5
  check(!!m && m.san === 'Bb5', `move from FEN position played (${m?.san})`);
  const undone = e.undoMove();
  check(undone?.san === 'Bb5', 'undo returns the move taken back');
  check(e.getFen() === fen, 'undo restores the exact FEN position (not the start position)');
  check(e.undoMove() === null, 'cannot undo past the loaded position');
}

// 2. Undo chain from start + canUndo
{
  const e = new ChessEngine();
  e.makeMove(12, 28);
  e.makeMove(52, 36);
  check(e.canUndo(), 'canUndo after moves');
  e.undoMove();
  e.undoMove();
  check(e.getFen() === START_FEN && !e.canUndo(), 'two undos return to start');
}

// 3. Legal cache consistency
{
  const e = new ChessEngine('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const a = e.generateLegalMoves();
  const b = e.generateLegalMoves();
  check(a === b && a.length === 48, `cached legal moves stable (Kiwipete ${a.length})`);
}

// 4. Mate in one is found at every searching level
{
  // White to move: Qh5xf7# is available after 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6
  const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  for (const lvl of ['hard_1', 'hard_2', 'hard_3'] as const) {
    const e = new ChessEngine(fen);
    const m = getAIMove(e, lvl);
    check(m?.from === 39 && m?.to === 53, `${lvl} finds Qxf7# (${m?.san ?? `${m?.from}->${m?.to}`})`);
  }
}

// 5. Time budget respected on a busy middlegame position
{
  const fen = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R w KQ - 0 8';
  const e = new ChessEngine(fen);
  const t0 = performance.now();
  const m = getAIMove(e, 'hard_4');
  const ms = performance.now() - t0;
  const budget = AI_PROFILES.hard_4.timeMs;
  check(!!m, `hard_4 returns a move (${m?.from}->${m?.to})`);
  check(ms < budget * 1.6, `hard_4 search ${Math.round(ms)} ms within budget ${budget} ms (+60% slack)`);
  check(e.getFen() === fen, 'search does not mutate the live position');
}

// 6. Highlight scoring
{
  const e = new ChessEngine('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  const before = e.getFen();
  const m = e.makeMove(39, 53)!;
  const mom = scoreMoment(m, 7, 'A', 'B', true, e.isCheckmate(), before);
  check(mom?.dramaScore === 100 && mom.moveNumber === 4, 'checkmate scores 100 on move 4');
  const quiet = new ChessEngine().makeMove(12, 28)!;
  check(scoreMoment(quiet, 1, 'A', 'B', false, false, START_FEN) === null, 'quiet move is not a highlight');
}

console.log(failed ? `\n${failed} FAILED` : '\nALL UPGRADE TESTS PASSED');
if (failed) process.exit(1);
