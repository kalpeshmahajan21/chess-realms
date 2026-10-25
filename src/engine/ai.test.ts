import { ChessEngine } from './chess.ts';
import { getAIMove, getAIMoveAsync } from './aiEngine.ts';
import { AIDifficulty } from '../types.ts';

function runAITests() {
  console.log('==============================================');
  console.log('CHESS REALMS - TACTICAL AI ENGINE TESTS');
  console.log('==============================================');

  const engine = new ChessEngine();

  // Test 1: Opening Book Move for Hard 3 & 4
  console.log('\nTesting Opening Book:');
  const bookMove = getAIMove(engine, 'hard_3');
  console.log(`Hard 3 opening move: from ${bookMove?.from} to ${bookMove?.to} (piece: ${bookMove?.piece.type})`);
  if (!bookMove) {
    throw new Error('[FAIL] Hard 3 failed to return an opening move');
  }
  console.log('[PASS] Grandmaster opening book produced legal move');

  // Test 2: Beginner Move Generation
  console.log('\nTesting Beginner (ELO 600):');
  const begMove = getAIMove(engine, 'beginner');
  if (!begMove) throw new Error('[FAIL] Beginner failed to return a move');
  console.log(`[PASS] Beginner move generated: from ${begMove.from} to ${begMove.to}`);

  // Test 3: Hard Level 1 (ELO 1200)
  console.log('\nTesting Hard Level 1 (ELO 1200):');
  const h1Move = getAIMove(engine, 'hard_1');
  if (!h1Move) throw new Error('[FAIL] Hard 1 failed to return a move');
  console.log(`[PASS] Hard Level 1 move generated: from ${h1Move.from} to ${h1Move.to}`);

  // Test 4: Hard Level 2 (ELO 1600 - Quiescence Search)
  console.log('\nTesting Hard Level 2 (ELO 1600):');
  const h2Move = getAIMove(engine, 'hard_2');
  if (!h2Move) throw new Error('[FAIL] Hard 2 failed to return a move');
  console.log(`[PASS] Hard Level 2 move generated: from ${h2Move.from} to ${h2Move.to}`);

  // Test 5: Tactical capture detection (free queen hanging)
  console.log('\nTesting Tactical Blunder Punish (Free Queen Capture):');
  // Position where White has a hanging queen on e4 that Black's knight on f6 can take
  const tacticalEngine = new ChessEngine('rnbqkb1r/pppppppp/5n2/8/4Q3/8/PPPPPPPP/RNB1KBNR b KQkq - 1 2');
  const punishMove = getAIMove(tacticalEngine, 'hard_2');
  console.log(`Punish move: from ${punishMove?.from} to ${punishMove?.to}, captured: ${punishMove?.captured?.type}`);
  if (punishMove?.captured?.type !== 'q') {
    throw new Error(`[FAIL] AI did not capture hanging queen on e4, move: ${punishMove?.san}`);
  }
  console.log('[PASS] AI tactical awareness successfully captured free queen on e4!');

  // Test 6: Asynchronous Non-blocking execution
  console.log('\nTesting Asynchronous Non-blocking AI Execution:');
  const start = Date.now();
  getAIMoveAsync(engine, 'hard_1', 100).then(asyncMove => {
    const elapsed = Date.now() - start;
    if (!asyncMove) throw new Error('[FAIL] getAIMoveAsync returned null');
    console.log(`[PASS] Async move resolved in ${elapsed}ms: ${asyncMove.from} -> ${asyncMove.to}`);
    console.log('\nALL AI ENGINE TESTS PASSED WITH 0 FAILURES!');
  });
}

runAITests();
