import { ChessEngine } from './chess.ts';
import { scoreMoment, topMoments as pickTop, GameMoment } from '../game/moments.ts';

console.log('==============================================');
console.log('CHESS REALMS - GAMEPLAY SIMULATION TESTS');
console.log('==============================================\n');

// 1. Scholar's Mate Simulation: 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
console.log("Simulating Scholar's Mate:");
const scholarsEngine = new ChessEngine();
const moments: GameMoment[] = [];

// 1. e4 (e2 to e4 -> from 12 to 28)
const m1 = scholarsEngine.makeMove(12, 28);
console.log(`Move 1: White plays ${m1?.san}`);

// 1... e5 (e7 to e5 -> from 52 to 36)
const m2 = scholarsEngine.makeMove(52, 36);
console.log(`Move 1... Black plays ${m2?.san}`);

// 2. Qh5 (d1 to h5 -> from 3 to 39)
const m3 = scholarsEngine.makeMove(3, 39);
console.log(`Move 2: White plays ${m3?.san}`);

// 2... Nc6 (b8 to c6 -> from 57 to 42)
const m4 = scholarsEngine.makeMove(57, 42);
console.log(`Move 2... Black plays ${m4?.san}`);

// 3. Bc4 (f1 to c4 -> from 5 to 26)
const m5 = scholarsEngine.makeMove(5, 26);
console.log(`Move 3: White plays ${m5?.san}`);

// 3... Nf6 (g8 to f6 -> from 62 to 45)
const m6 = scholarsEngine.makeMove(62, 45);
console.log(`Move 3... Black plays ${m6?.san}`);

// 4. Qxf7# (h5 to f7 -> from 39 to 53)
const m7 = scholarsEngine.makeMove(39, 53);
console.log(`Move 4: White plays ${m7?.san}`);

// Record moments
const mateMoment = scoreMoment(m7!, 7, 'Vivek', 'Pratik', true, true, '');
if (mateMoment) moments.push(mateMoment);

const status = scholarsEngine.getGameStatus();
console.log(`Status after Qxf7#: isOver=${status.isOver}, result=${status.result}, winner=${status.winner}, desc="${status.description}"`);

if (status.isOver && status.result === 'checkmate' && status.winner === 'w') {
  console.log("[PASS] Scholar's Mate successfully detected checkmate! White wins.");
} else {
  console.error("[FAIL] Scholar's Mate failed checkmate detection!");
  process.exit(1);
}

const topMoments = pickTop(moments, 3);
if (topMoments[0]?.dramaScore !== 100) { console.error('[FAIL] Checkmate moment not recorded'); process.exit(1); }
console.log(`[PASS] Recorded ${topMoments.length} top moment(s). Highlight: "${topMoments[0]?.caption}"`);

// 2. Game with En Passant, Castling, and Promotion:
console.log('\nSimulating Game with En Passant, Castling, and Promotion:');
const fullGame = new ChessEngine();

// 1. e4 Nf6
fullGame.makeMove(12, 28);
fullGame.makeMove(62, 45);
// 2. e5 d5 (triggers en passant availability on d6!)
fullGame.makeMove(28, 36);
fullGame.makeMove(51, 35);
console.log(`En passant target square after d5: ${fullGame.state.enPassant}`);

// 3. exd6 (Capture en passant!)
const epMove = fullGame.makeMove(36, 43);
console.log(`Move 3: White captures ${epMove?.san} (isEnPassant: ${epMove?.isEnPassant})`);
if (!epMove?.isEnPassant) {
  console.error('[FAIL] Expected en passant move flag!');
  process.exit(1);
}

// 3... cxd6
fullGame.makeMove(50, 43);

// 4. Nf3 g6
fullGame.makeMove(6, 21);
fullGame.makeMove(54, 46);

// 5. Be2 Bg7
fullGame.makeMove(5, 12);
fullGame.makeMove(61, 54);

// 6. O-O (White kingside castling!)
const castleW = fullGame.makeMove(4, 6);
console.log(`Move 6: White castles ${castleW?.san} (isCastling: ${castleW?.isCastling})`);
if (castleW?.isCastling !== 'kingside') {
  console.error('[FAIL] Expected White kingside castling!');
  process.exit(1);
}

// 6... O-O (Black kingside castling!)
const castleB = fullGame.makeMove(60, 62);
console.log(`Move 6... Black castles ${castleB?.san} (isCastling: ${castleB?.isCastling})`);
if (castleB?.isCastling !== 'kingside') {
  console.error('[FAIL] Expected Black kingside castling!');
  process.exit(1);
}

// Now test promotion: setup pawn advance to promotion (king on h1, a8)
const promoGame = new ChessEngine('k7/4P3/8/8/8/8/8/4K2k w - - 0 1');
const promoMove = promoGame.makeMove(52, 60, 'q'); // e7 to e8=Q
console.log(`Promotion move: ${promoMove?.san} to ${promoMove?.promotion}`);
if (promoMove?.promotion === 'q' && promoGame.state.board[60]?.type === 'q') {
  console.log('[PASS] Pawn promotion to Queen executed and updated on board!');
} else {
  console.error('[FAIL] Pawn promotion failed!');
  process.exit(1);
}

console.log('\nALL GAMEPLAY SCENARIOS VERIFIED SUCCESSFULLY!');
