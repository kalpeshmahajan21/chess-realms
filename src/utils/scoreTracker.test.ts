import { getPlayerRecord, recordMatchResult, getHeadToHeadRecord } from '../utils/scoreTracker.ts';

console.log('Testing Score Tracker...');

// Test 1: Initial empty record
const initial = getPlayerRecord('TestAlpha');
console.assert(initial.wins === 0 && initial.losses === 0 && initial.draws === 0, 'Initial record must be 0-0-0');

// Test 2: Win recorded
const res1 = recordMatchResult('TestAlpha', 'TestBeta', 'p1_win');
console.assert(res1.p1Record.wins === 1 && res1.p1Record.losses === 0, 'P1 should have 1 win');
console.assert(res1.p2Record.losses === 1 && res1.p2Record.wins === 0, 'P2 should have 1 loss');
console.assert(res1.h2h.p1Wins === 1 && res1.h2h.p2Wins === 0, 'H2H should show 1-0');

// Test 3: Draw recorded
const res2 = recordMatchResult('TestAlpha', 'TestBeta', 'draw');
console.assert(res2.p1Record.wins === 1 && res2.p1Record.draws === 1, 'P1 should have 1 win and 1 draw');
console.assert(res2.p2Record.losses === 1 && res2.p2Record.draws === 1, 'P2 should have 1 loss and 1 draw');
console.assert(res2.h2h.draws === 1, 'H2H should have 1 draw');

// Test 4: Case insensitivity
const recInsensitive = getPlayerRecord('testalpha');
console.assert(recInsensitive.wins === 1, 'Record should be case-insensitive');

console.log('[PASS] All Score Tracker tests passed successfully!');
