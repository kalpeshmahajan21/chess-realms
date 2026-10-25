import { ChessEngine, START_FEN } from './chess.ts';
import { perft } from './perft.ts';

function runTests() {
  console.log('==============================================');
  console.log('CHESS REALMS - ENGINE ACCEPTANCE & PERFT TESTS');
  console.log('==============================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Perft Initial Position:
  // depth 1 = 20, depth 2 = 400, depth 3 = 8,902, depth 4 = 197,281
  console.log('Running Perft - Start Position:');
  const engine = new ChessEngine(START_FEN);
  const p1 = perft(engine, 1);
  assert(p1 === 20, `Start position Perft depth 1: ${p1} (expected 20)`);

  const p2 = perft(engine, 2);
  assert(p2 === 400, `Start position Perft depth 2: ${p2} (expected 400)`);

  const p3 = perft(engine, 3);
  assert(p3 === 8902, `Start position Perft depth 3: ${p3} (expected 8902)`);

  console.log('Calculating Perft depth 4 (please wait)...');
  const t0 = Date.now();
  const p4 = perft(engine, 4);
  const t1 = Date.now();
  assert(p4 === 197281, `Start position Perft depth 4: ${p4} (expected 197281) in ${t1 - t0}ms`);

  // 2. Kiwipete Position:
  // r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
  // depth 1 = 48, depth 2 = 2,039, depth 3 = 97,862
  console.log('\nRunning Perft - Kiwipete Position:');
  const kiwipeteFen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  const kiwipeteEngine = new ChessEngine(kiwipeteFen);

  const k1 = perft(kiwipeteEngine, 1);
  assert(k1 === 48, `Kiwipete Perft depth 1: ${k1} (expected 48)`);

  const k2 = perft(kiwipeteEngine, 2);
  assert(k2 === 2039, `Kiwipete Perft depth 2: ${k2} (expected 2039)`);

  console.log('Calculating Kiwipete Perft depth 3 (please wait)...');
  const kt0 = Date.now();
  const k3 = perft(kiwipeteEngine, 3);
  const kt1 = Date.now();
  assert(k3 === 97862, `Kiwipete Perft depth 3: ${k3} (expected 97862) in ${kt1 - kt0}ms`);

  // 3. Unit Tests:
  console.log('\nRunning Rules Unit Tests:');

  // 3a. Castling through check test:
  // White King on e1, Rook on h1. Black rook on f8 attacking f1. White cannot castle kingside through f1.
  const castleThroughCheckFen = 'r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1';
  const cEng = new ChessEngine(castleThroughCheckFen);
  const cMoves = cEng.generateLegalMoves();
  const canCastleKingside = cMoves.some(m => m.isCastling === 'kingside');
  assert(!canCastleKingside, 'King cannot castle through check on f1');
  // Can White castle queenside if squares are safe?
  const canCastleQueenside = cMoves.some(m => m.isCastling === 'queenside');
  assert(canCastleQueenside, 'King CAN castle queenside when path is clear and unattacked');

  // 3b. Castling out of check:
  // If King is directly attacked, cannot castle
  const castleOutOfCheckFen = '4k3/8/8/8/8/4r3/8/R3K2R w KQ - 0 1';
  const cOutEng = new ChessEngine(castleOutOfCheckFen);
  const cOutMoves = cOutEng.generateLegalMoves();
  const hasCastlingInCheck = cOutMoves.some(m => m.isCastling);
  assert(!hasCastlingInCheck, 'King cannot castle while currently in check');

  // 3c. En Passant test:
  // White pawn on e5, Black pawn on d7 moves d7-d5. White can capture exd6 en passant!
  const epFen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
  const epEng = new ChessEngine(epFen);
  const epMoves = epEng.generateLegalMoves();
  const epMove = epMoves.find(m => m.isEnPassant);
  assert(!!epMove, 'En passant capture move is generated when target square is active');
  if (epMove) {
    const afterEp = epEng.applyMove(epEng.state, epMove);
    assert(afterEp.board[epMove.to]?.type === 'p', 'Pawn landed on destination');
    const capturedPawnSq = epMove.to - 8; // d5
    assert(afterEp.board[capturedPawnSq] === null, 'Captured enemy pawn on d5 removed');
  }

  // 3d. Promotion test:
  // White pawn on a7 moves to a8 -> 4 promotion options (Q, R, B, N)
  const promoFen = '8/P7/8/8/8/8/8/4K2k w - - 0 1';
  const promoEng = new ChessEngine(promoFen);
  const promoMoves = promoEng.generateLegalMoves().filter(m => m.promotion);
  assert(promoMoves.length === 4, `Promotion generates 4 piece choices (found ${promoMoves.length})`);
  const promoTypes = promoMoves.map(m => m.promotion).sort();
  assert(JSON.stringify(promoTypes) === JSON.stringify(['b', 'n', 'q', 'r']), 'Generates B, N, Q, R');

  // 3e. Stalemate test:
  // King on a8, Black Queen on b6, King on c7 -> White has no legal moves and is NOT in check
  const staleFen = 'k7/2K5/1Q6/8/8/8/8/8 b - - 0 1'; // Black to move: king on a8
  const staleEng = new ChessEngine(staleFen);
  assert(staleEng.isStalemate(), 'Identifies stalemate accurately');
  assert(!staleEng.isInCheck('b'), 'King is not in check during stalemate');

  // 3f. Threefold Repetition test:
  const repEng = new ChessEngine();
  // Move knights back and forth 3 times
  // 1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8
  repEng.makeMove(1, 18); // b1 -> c3 (or g1 -> f3)
  repEng.makeMove(57, 42); // b8 -> c6
  repEng.makeMove(18, 1); // c3 -> b1
  repEng.makeMove(42, 57); // c6 -> b8 (Position repeated 2nd time)
  assert(!repEng.isThreefoldRepetition(), 'Not threefold on 2nd repetition');
  repEng.makeMove(1, 18);
  repEng.makeMove(57, 42);
  repEng.makeMove(18, 1);
  repEng.makeMove(42, 57); // Position repeated 3rd time!
  assert(repEng.isThreefoldRepetition(), 'Threefold repetition detected on 3rd identical position');

  // 3g. Insufficient Material test:
  const kVsK = new ChessEngine('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
  assert(kVsK.isInsufficientMaterial(), 'K vs K is insufficient material');

  const kBVsK = new ChessEngine('8/8/8/4k3/8/5B2/8/4K3 w - - 0 1');
  assert(kBVsK.isInsufficientMaterial(), 'K+B vs K is insufficient material');

  const kNVsK = new ChessEngine('8/8/8/4k3/8/5N2/8/4K3 w - - 0 1');
  assert(kNVsK.isInsufficientMaterial(), 'K+N vs K is insufficient material');

  // Same color bishops (c1 = (2,0) dark, f8 = (5,7) dark -> (2+0)%2 === 0, (5+7)%2 === 0)
  const kBVsKB_same = new ChessEngine('5b2/8/8/4k3/8/8/8/2B1K3 w - - 0 1');
  assert(kBVsKB_same.isInsufficientMaterial(), 'K+B vs K+B on same color square is insufficient');

  // Opposite color bishops (c1 = dark, c8 = (2,7) light)
  const kBVsKB_diff = new ChessEngine('2b5/8/8/4k3/8/8/8/2B1K3 w - - 0 1');
  assert(!kBVsKB_diff.isInsufficientMaterial(), 'K+B vs K+B on opposite color squares is sufficient (not draw)');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
