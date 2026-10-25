/**
 * Chess Realms - Persistent Local Score Tracker
 * Stores and manages cumulative win/loss/draw records for player profiles in localStorage.
 */

export interface PlayerRecord {
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
}

export interface HeadToHeadRecord {
  p1Wins: number;
  p2Wins: number;
  draws: number;
  totalGames: number;
}

const STORAGE_KEY = 'chess_realms_player_records';
const H2H_STORAGE_KEY = 'chess_realms_h2h_records';

let inMemoryRecords: Record<string, PlayerRecord> = {};
let inMemoryH2H: Record<string, Record<string, number>> = {};

function normalizeName(name: string): string {
  return name.trim().toLowerCase() || 'player';
}

function loadAllRecords(): Record<string, PlayerRecord> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  return inMemoryRecords;
}

function saveAllRecords(records: Record<string, PlayerRecord>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.error('Failed to save player records:', err);
    }
  } else {
    inMemoryRecords = records;
  }
}

function getH2HKey(name1: string, name2: string): string {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  return [n1, n2].sort().join('::');
}

export function getPlayerRecord(name: string): PlayerRecord {
  const key = normalizeName(name);
  const records = loadAllRecords();
  return records[key] || { wins: 0, losses: 0, draws: 0, totalGames: 0 };
}

export function getHeadToHeadRecord(p1Name: string, p2Name: string): HeadToHeadRecord {
  const h2hKey = getH2HKey(p1Name, p2Name);
  let allH2H = inMemoryH2H;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(H2H_STORAGE_KEY);
      if (raw) allH2H = JSON.parse(raw);
    } catch {
      allH2H = {};
    }
  }

  const data = allH2H[h2hKey];
  if (!data) return { p1Wins: 0, p2Wins: 0, draws: 0, totalGames: 0 };

  const n1 = normalizeName(p1Name);
  const n2 = normalizeName(p2Name);
  return {
    p1Wins: data[n1] || 0,
    p2Wins: data[n2] || 0,
    draws: data.draws || 0,
    totalGames: (data[n1] || 0) + (data[n2] || 0) + (data.draws || 0),
  };
}

export function recordMatchResult(
  p1Name: string,
  p2Name: string,
  result: 'p1_win' | 'p2_win' | 'draw'
): { p1Record: PlayerRecord; p2Record: PlayerRecord; h2h: HeadToHeadRecord } {
  const records = loadAllRecords();
  const k1 = normalizeName(p1Name);
  const k2 = normalizeName(p2Name);

  const r1: PlayerRecord = records[k1] || { wins: 0, losses: 0, draws: 0, totalGames: 0 };
  const r2: PlayerRecord = records[k2] || { wins: 0, losses: 0, draws: 0, totalGames: 0 };

  r1.totalGames += 1;
  r2.totalGames += 1;

  if (result === 'p1_win') {
    r1.wins += 1;
    r2.losses += 1;
  } else if (result === 'p2_win') {
    r2.wins += 1;
    r1.losses += 1;
  } else {
    r1.draws += 1;
    r2.draws += 1;
  }

  records[k1] = r1;
  records[k2] = r2;
  saveAllRecords(records);

  // Update Head-to-Head
  let allH2H: Record<string, Record<string, number>> = inMemoryH2H;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(H2H_STORAGE_KEY);
      if (raw) allH2H = JSON.parse(raw);
    } catch {
      allH2H = {};
    }
  }

  const h2hKey = getH2HKey(p1Name, p2Name);
  const h2hData = allH2H[h2hKey] || { [k1]: 0, [k2]: 0, draws: 0 };

  if (result === 'p1_win') {
    h2hData[k1] = (h2hData[k1] || 0) + 1;
  } else if (result === 'p2_win') {
    h2hData[k2] = (h2hData[k2] || 0) + 1;
  } else {
    h2hData.draws = (h2hData.draws || 0) + 1;
  }

  allH2H[h2hKey] = h2hData;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(H2H_STORAGE_KEY, JSON.stringify(allH2H));
    } catch (e) {
      console.error(e);
    }
  } else {
    inMemoryH2H = allH2H;
  }

  return {
    p1Record: r1,
    p2Record: r2,
    h2h: {
      p1Wins: h2hData[k1] || 0,
      p2Wins: h2hData[k2] || 0,
      draws: h2hData.draws || 0,
      totalGames: (h2hData[k1] || 0) + (h2hData[k2] || 0) + (h2hData.draws || 0),
    },
  };
}

export function resetPlayerRecord(name: string): void {
  const records = loadAllRecords();
  const k = normalizeName(name);
  delete records[k];
  saveAllRecords(records);
}
