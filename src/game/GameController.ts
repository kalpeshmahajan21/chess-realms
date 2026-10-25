import { ChessEngine, Move, PieceColor, PieceType, START_FEN } from '../engine/chess.ts';
import { evaluatePosition } from '../engine/aiEngine.ts';
import { aiClient } from '../engine/aiClient.ts';
import { soundEngine, ArenaId } from '../audio/soundEngine.ts';
import { createStore } from './store.ts';
import { scoreMoment, GameMoment, topMoments } from './moments.ts';
import { getPlayerRecord, getHeadToHeadRecord, recordMatchResult, PlayerRecord, HeadToHeadRecord } from '../utils/scoreTracker.ts';
import { hapticCapture, hapticCheck, hapticMove, hapticSelect, hapticTap, setHapticsEnabled } from '../utils/haptics.ts';
import { AI_LEVELS, CLOCK_SECONDS, DEFAULT_SETTINGS, STORAGE_KEYS, TIMING, aiDisplayName } from '../config/gameConfig.ts';
import type {
  AIDifficulty, CameraPreset, CapturedPiecesState, GameMode, GameSettings, PlayerProfile,
} from '../types.ts';
import type { RemoteMovePayload } from '../utils/onlineMultiplayer.ts';
import { PIECE_MATERIALS_LIST } from '../render/pieceMaterials.ts';

export type Screen = 'loading' | 'menu' | 'playing' | 'gameover';

export interface GameResult {
  winner?: PieceColor;
  winnerName?: string;
  title: string; // "Checkmate", "Stalemate", ...
  description: string;
  /** From the local player's perspective, for vs-AI / online. */
  outcome: 'win' | 'loss' | 'draw' | 'neutral';
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'success' | 'warning';
}

export interface OnlineState {
  roomCode: string;
  role: 'host' | 'guest';
  connected: boolean;
}

export interface GameState {
  screen: Screen;
  mode: GameMode;
  aiLevel: AIDifficulty;
  arena: ArenaId;
  p1: PlayerProfile;
  p2: PlayerProfile;
  settings: GameSettings;
  // Live position (mirrors engine, updated after every change)
  fen: string;
  turn: PieceColor;
  sanHistory: string[];
  lastMove: { from: number; to: number } | null;
  checkSquare: number; // king square in check, -1 if none
  checkerSquare: number; // attacking piece, -1 if none
  captured: CapturedPiecesState;
  evalHistory: number[]; // pawns, white-positive
  canUndo: boolean;
  // Interaction
  selected: number | null;
  targets: { sq: number; capture: boolean }[];
  cursor: number | null; // keyboard/gamepad board cursor
  hint: { from: number; to: number } | null;
  promotion: { from: number; to: number; color: PieceColor } | null;
  animating: boolean;
  cinematic: boolean;
  aiThinking: boolean;
  paused: boolean;
  cameraPreset: CameraPreset;
  // Clocks (seconds)
  whiteTime: number;
  blackTime: number;
  // Meta
  result: GameResult | null;
  moments: GameMoment[];
  replay: { active: boolean; index: number };
  p1Record: PlayerRecord;
  p2Record: PlayerRecord;
  h2h: HeadToHeadRecord;
  online: OnlineState | null;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  sceneReady: boolean;
  webglFailed: boolean;
  /** Real-world arena assets are downloading. */
  arenaLoading: boolean;
}

/** Events the 3D view reacts to. Handlers may return a promise the controller awaits (animations). */
export interface ViewEvents {
  /** Snap all pieces to the engine's board (new game, undo, replay jump). `intro` plays the arrival animation. */
  sync: { intro?: boolean };
  /** Animate a move that has already been applied to the engine. */
  move: { move: Move; isCheck: boolean; isMate: boolean; cinematic: boolean; byLocal: boolean };
  gameOver: { winner?: PieceColor };
  skip: Record<string, never>;
  screenshot: Record<string, never>;
}

type Handler<K extends keyof ViewEvents> = (payload: ViewEvents[K]) => void | Promise<void>;

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (raw) {
      const saved = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as GameSettings & { cinematics: string };
      // The old "big moments only" mode is gone: cinematics are now simply On (every capture) or Off.
      if (saved.cinematics !== 'off') saved.cinematics = 'all';
      return saved as GameSettings;
    }
  } catch { /* fall back to defaults */ }
  return { ...DEFAULT_SETTINGS };
}

function loadName(): string {
  try {
    return (localStorage.getItem(STORAGE_KEYS.playerName) || '').trim();
  } catch {
    return '';
  }
}

interface SavedSetup {
  mode: GameMode;
  aiLevel: AIDifficulty;
  arena: ArenaId;
  p1Material: PlayerProfile['material'];
  p2Material: PlayerProfile['material'];
  p1Color: PieceColor;
  p2Name: string;
}

function loadSetup(): Partial<SavedSetup> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.lastSetup) || '{}');
  } catch {
    return {};
  }
}

const START_CAPTURED: CapturedPiecesState = { white: [], black: [], materialAdvantage: 0 };

export class GameController {
  readonly engine = new ChessEngine();
  readonly store;
  private handlers: { [K in keyof ViewEvents]?: Set<Handler<K>> } = {};
  private clockTimer: number | null = null;
  private clockLast = 0;
  private aiToken = 0;
  private moveQueue: Promise<void> = Promise.resolve();
  private finalFen = '';
  private toastId = 0;
  private hasPresenter = false;
  private online: typeof import('../utils/onlineMultiplayer.ts').onlineMultiplayer | null = null;

  constructor() {
    const setup = loadSetup();
    const name = loadName();
    const settings = loadSettings();
    const p1Name = name || 'Player 1';
    const p1Color = setup.p1Color ?? 'w';
    const mode = setup.mode ?? 'vs_ai';
    const aiLevel = setup.aiLevel ?? 'hard_2';
    const p2Name = mode === 'vs_ai' ? aiDisplayName(aiLevel) : setup.p2Name || 'Player 2';
    this.store = createStore<GameState>({
      screen: 'loading',
      mode,
      aiLevel,
      arena: setup.arena ?? 'traditional',
      p1: { name: p1Name, color: p1Color, material: setup.p1Material ?? 'marble' },
      p2: { name: p2Name, color: p1Color === 'w' ? 'b' : 'w', material: setup.p2Material ?? 'obsidian' },
      settings,
      fen: START_FEN,
      turn: 'w',
      sanHistory: [],
      lastMove: null,
      checkSquare: -1,
      checkerSquare: -1,
      captured: START_CAPTURED,
      evalHistory: [0],
      canUndo: false,
      selected: null,
      targets: [],
      cursor: null,
      hint: null,
      promotion: null,
      animating: false,
      cinematic: false,
      aiThinking: false,
      paused: false,
      cameraPreset: 'auto',
      whiteTime: 0,
      blackTime: 0,
      result: null,
      moments: [],
      replay: { active: false, index: 0 },
      p1Record: getPlayerRecord(p1Name),
      p2Record: getPlayerRecord(p2Name),
      h2h: getHeadToHeadRecord(p1Name, p2Name),
      online: null,
      toasts: [],
      confirm: null,
      sceneReady: false,
      webglFailed: false,
      arenaLoading: false,
    });
    this.applyAudioSettings(settings);
    setHapticsEnabled(settings.haptics);
  }

  get state() {
    return this.store.get();
  }

  // ---------------------------------------------------------------- events
  on<K extends keyof ViewEvents>(event: K, handler: Handler<K>): () => void {
    const set = (this.handlers[event] ??= new Set() as never) as Set<Handler<K>>;
    set.add(handler);
    if (event === 'move') this.hasPresenter = true;
    return () => {
      set.delete(handler);
      if (event === 'move' && set.size === 0) this.hasPresenter = false;
    };
  }

  private async emit<K extends keyof ViewEvents>(event: K, payload: ViewEvents[K]): Promise<void> {
    const set = this.handlers[event] as Set<Handler<K>> | undefined;
    if (!set || set.size === 0) return;
    await Promise.all([...set].map(h => Promise.resolve(h(payload)).catch(err => console.error(`[view:${event}]`, err))));
  }

  // ---------------------------------------------------------------- settings & setup
  updateSettings(patch: Partial<GameSettings>) {
    const settings = { ...this.state.settings, ...patch };
    this.store.set({ settings });
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch { /* storage full or blocked */ }
    this.applyAudioSettings(settings);
    if ('haptics' in patch) setHapticsEnabled(settings.haptics);
  }

  private applyAudioSettings(s: GameSettings) {
    // v1 persisted separate mute flags with no UI left to clear them; volumes now cover that.
    if (soundEngine.isMusicMuted) soundEngine.setMusicMuted(false);
    if (soundEngine.isSfxMuted) soundEngine.setSfxMuted(false);
    soundEngine.setVolume(s.masterVolume);
    soundEngine.setAmbientVolume(s.musicVolume * 0.4);
    soundEngine.setSfxVolume(s.sfxVolume);
    if (soundEngine.isMuted !== s.muted) soundEngine.toggleMute();
  }

  setMode(mode: GameMode) {
    const s = this.state;
    const p2Name = mode === 'vs_ai' ? aiDisplayName(s.aiLevel) : s.p2.name.startsWith('Rika') ? 'Player 2' : s.p2.name;
    this.store.set({ mode, p2: { ...s.p2, name: p2Name } });
    this.refreshRecords();
    this.saveSetup();
  }

  setAILevel(aiLevel: AIDifficulty) {
    this.store.set({ aiLevel, p2: { ...this.state.p2, name: aiDisplayName(aiLevel) } });
    this.refreshRecords();
    this.saveSetup();
  }

  setArena(arena: ArenaId) {
    this.store.set({ arena });
    this.saveSetup();
    if (this.online && this.state.online?.connected) this.online.sendArenaChange(arena);
  }

  updatePlayer(which: 'p1' | 'p2', patch: Partial<PlayerProfile>) {
    const s = this.state;
    const next = { ...s[which], ...patch };
    const other = which === 'p1' ? 'p2' : 'p1';
    const update: Partial<GameState> = { [which]: next };
    if (patch.color) update[other] = { ...s[other], color: patch.color === 'w' ? 'b' : 'w' };
    this.store.set(update);
    if (which === 'p1' && patch.name !== undefined) {
      try {
        if (patch.name.trim()) localStorage.setItem(STORAGE_KEYS.playerName, patch.name.trim());
      } catch { /* ignore */ }
    }
    if (patch.name !== undefined) this.refreshRecords();
    this.saveSetup();
  }

  private refreshRecords() {
    const { p1, p2 } = this.state;
    this.store.set({
      p1Record: getPlayerRecord(p1.name || 'Player 1'),
      p2Record: getPlayerRecord(p2.name || 'Player 2'),
      h2h: getHeadToHeadRecord(p1.name || 'Player 1', p2.name || 'Player 2'),
    });
  }

  private saveSetup() {
    const s = this.state;
    const setup: SavedSetup = {
      mode: s.mode,
      aiLevel: s.aiLevel,
      arena: s.arena,
      p1Material: s.p1.material,
      p2Material: s.p2.material,
      p1Color: s.p1.color,
      p2Name: s.mode === 'vs_ai' ? 'Player 2' : s.p2.name,
    };
    try {
      localStorage.setItem(STORAGE_KEYS.lastSetup, JSON.stringify(setup));
    } catch { /* ignore */ }
  }

  setSceneReady(ready: boolean) {
    this.store.set({ sceneReady: ready });
    if (ready && this.state.screen === 'loading') this.store.set({ screen: 'menu' });
  }

  setArenaLoading(arenaLoading: boolean) {
    this.store.set({ arenaLoading });
  }

  setWebglFailed() {
    this.store.set({ webglFailed: true, sceneReady: true });
    if (this.state.screen === 'loading') this.store.set({ screen: 'menu' });
  }

  // ---------------------------------------------------------------- toasts & dialogs
  toast(text: string, tone: Toast['tone'] = 'info') {
    const id = ++this.toastId;
    this.store.set(s => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
    window.setTimeout(() => this.store.set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), TIMING.toastMs);
  }

  ask(req: ConfirmRequest) {
    this.store.set({ confirm: req });
  }

  resolveConfirm(accepted: boolean) {
    const req = this.state.confirm;
    this.store.set({ confirm: null });
    if (!req) return;
    if (accepted) req.onConfirm();
    else req.onCancel?.();
  }

  // ---------------------------------------------------------------- match lifecycle
  /** Who may move pieces of `color` from this device. */
  isLocalColor(color: PieceColor): boolean {
    const s = this.state;
    if (s.mode === 'pass_and_play') return true;
    return color === s.p1.color;
  }

  isAITurn(): boolean {
    const s = this.state;
    return s.mode === 'vs_ai' && s.turn === s.p2.color;
  }

  startMatch() {
    const s = this.state;
    aiClient.cancelAll();
    this.aiToken++;
    const p1 = { ...s.p1, name: s.p1.name.trim() || 'Player 1' };
    let p2 = { ...s.p2, color: (p1.color === 'w' ? 'b' : 'w') as PieceColor };
    if (s.mode === 'vs_ai') p2 = { ...p2, name: aiDisplayName(s.aiLevel) };
    else if (s.mode === 'pass_and_play') p2 = { ...p2, name: p2.name.trim() || 'Player 2' };

    this.engine.loadFen(START_FEN);
    this.finalFen = '';
    const secs = CLOCK_SECONDS[s.settings.clockMode];
    this.store.set({
      p1,
      p2,
      screen: 'playing',
      result: null,
      moments: [],
      replay: { active: false, index: 0 },
      evalHistory: [0],
      whiteTime: secs,
      blackTime: secs,
      paused: false,
      hint: null,
      promotion: null,
      cameraPreset: 'auto',
      cursor: null,
    });
    this.refreshRecords();
    this.syncFromEngine();
    this.saveSetup();
    soundEngine.playGameStart();
    void this.emit('sync', { intro: true });
    this.startClock();
    this.maybeScheduleAI();
  }

  rematch() {
    if (this.state.mode === 'online' && this.online) this.online.sendRematch();
    // Swap colours for fairness in local and AI games.
    if (this.state.mode !== 'online') {
      const { p1 } = this.state;
      this.updatePlayer('p1', { color: p1.color === 'w' ? 'b' : 'w' });
    }
    this.startMatch();
  }

  toMenu() {
    aiClient.cancelAll();
    this.aiToken++;
    this.stopClock();
    if (this.state.replay.active) this.closeReplay();
    if (this.state.mode === 'online') this.leaveOnline();
    this.clearSelection();
    this.store.set({ screen: 'menu', paused: false, aiThinking: false, promotion: null, hint: null, cinematic: false });
    void this.emit('skip', {});
  }

  setPaused(paused: boolean) {
    const s = this.state;
    if (s.screen !== 'playing') return;
    this.store.set({ paused });
    if (paused) {
      this.clearSelection();
    } else {
      this.clockLast = performance.now();
      this.maybeScheduleAI();
    }
  }

  // ---------------------------------------------------------------- engine mirror
  private syncFromEngine() {
    const e = this.engine;
    const turn = e.state.turn;
    const inCheck = e.isInCheck(turn);
    const last = e.state.moveHistory[e.state.moveHistory.length - 1];
    this.store.set({
      fen: e.getFen(),
      turn,
      sanHistory: e.state.moveHistory.map(m => m.san || ''),
      lastMove: last ? { from: last.from, to: last.to } : null,
      checkSquare: inCheck ? e.findKing(turn) : -1,
      checkerSquare: inCheck ? e.findCheckingSquare(turn) : -1,
      captured: computeCaptured(e),
      canUndo: e.canUndo() && this.state.mode !== 'online',
    });
  }

  // ---------------------------------------------------------------- selection & moves
  private canInteract(): boolean {
    const s = this.state;
    return (
      s.screen === 'playing' && !s.paused && !s.animating && !s.promotion && !s.result && !s.replay.active &&
      !(s.mode === 'online' && !s.online?.connected) && this.isLocalColor(s.turn) && !this.isAITurn()
    );
  }

  /** Square tapped/clicked/entered. Handles select, re-select, move and deselect. */
  pressSquare(sq: number) {
    const s = this.state;
    if (!this.canInteract()) {
      if (s.screen === 'playing' && s.animating) void this.emit('skip', {});
      return;
    }
    if (s.selected !== null && s.targets.some(t => t.sq === sq)) {
      this.requestMove(s.selected, sq);
      return;
    }
    const piece = this.engine.getPiece(sq);
    if (piece && piece.color === s.turn) {
      if (s.selected === sq) {
        this.clearSelection();
        return;
      }
      this.select(sq);
      return;
    }
    if (s.selected !== null) hapticTap(8);
    this.clearSelection();
  }

  /** Begin a drag on `sq`. Returns true if the piece may be dragged. */
  beginDrag(sq: number): boolean {
    if (!this.canInteract()) return false;
    const piece = this.engine.getPiece(sq);
    if (!piece || piece.color !== this.state.turn) return false;
    if (this.state.selected !== sq) this.select(sq);
    return true;
  }

  /** Drop a dragged piece. Returns true if a move was made. */
  dropOn(from: number, to: number | null): boolean {
    if (to === null || to === from) return false;
    if (!this.state.targets.some(t => t.sq === to)) {
      this.clearSelection();
      return false;
    }
    this.requestMove(from, to);
    return true;
  }

  private select(sq: number) {
    const moves = this.engine.generateLegalMoves().filter(m => m.from === sq);
    const seen = new Set<number>();
    const targets: GameState['targets'] = [];
    for (const m of moves) {
      if (seen.has(m.to)) continue; // promotions produce 4 moves per square
      seen.add(m.to);
      targets.push({ sq: m.to, capture: !!m.captured });
    }
    this.store.set({ selected: sq, targets, cursor: this.state.cursor === null ? null : sq });
    hapticSelect();
    soundEngine.playSelectSound(sq % 8);
  }

  clearSelection() {
    if (this.state.selected !== null || this.state.targets.length) this.store.set({ selected: null, targets: [] });
  }

  moveCursor(df: number, dr: number) {
    const s = this.state;
    if (s.screen !== 'playing') return;
    // Arrow keys are relative to the viewer: when playing black, "up" means toward rank 1.
    const flip = (s.mode !== 'pass_and_play' ? s.p1.color : s.turn) === 'b' ? -1 : 1;
    const start = s.cursor ?? s.selected ?? (flip === 1 ? 12 : 52);
    const file = Math.max(0, Math.min(7, (start % 8) + df * flip));
    const rank = Math.max(0, Math.min(7, Math.floor(start / 8) + dr * flip));
    this.store.set({ cursor: rank * 8 + file });
    soundEngine.playClickSound();
  }

  pressCursor() {
    const c = this.state.cursor;
    if (c === null) {
      this.moveCursor(0, 0);
      return;
    }
    this.pressSquare(c);
  }

  hideCursor() {
    if (this.state.cursor !== null) this.store.set({ cursor: null });
  }

  private requestMove(from: number, to: number) {
    const candidates = this.engine.generateLegalMoves().filter(m => m.from === from && m.to === to);
    if (candidates.length === 0) return;
    if (candidates.length > 1 && candidates[0].promotion) {
      this.store.set({ promotion: { from, to, color: candidates[0].piece.color } });
      return;
    }
    void this.commitMove(candidates[0], true);
  }

  choosePromotion(piece: PieceType | null) {
    const p = this.state.promotion;
    this.store.set({ promotion: null });
    if (!p || !piece) {
      this.clearSelection();
      return;
    }
    const move = this.engine.generateLegalMoves().find(m => m.from === p.from && m.to === p.to && m.promotion === piece);
    if (move) void this.commitMove(move, true);
  }

  /**
   * Moves are applied strictly one after another: a move that arrives while the previous one (and its
   * capture cinematic) is still animating waits its turn instead of running concurrently.
   */
  private commitMove(candidate: Move, byLocal: boolean, opts: { forceCinematic?: boolean; fromReplay?: boolean } = {}): Promise<void> {
    const run = this.moveQueue.then(() => this.commitMoveNow(candidate, byLocal, opts));
    this.moveQueue = run.catch(err => console.error('[move] failed', err));
    return this.moveQueue;
  }

  /** Apply a move to the engine, animate it, then advance the game. */
  private async commitMoveNow(candidate: Move, byLocal: boolean, opts: { forceCinematic?: boolean; fromReplay?: boolean } = {}) {
    const s = this.state;
    const fenBefore = this.engine.getFen();
    // Re-resolve against the current position: a queued move must still be legal when its turn comes.
    const legal = this.engine.generateLegalMoves().find(m => m.from === candidate.from && m.to === candidate.to && m.promotion === candidate.promotion);
    if (!legal) return;
    const moved = this.engine.makeMove(legal);
    if (!moved) return;

    const isMate = this.engine.isCheckmate();
    const isCheck = this.engine.isInCheck(this.engine.state.turn);
    const plyNumber = this.engine.state.moveHistory.length;

    if (!opts.fromReplay) {
      const mover = moved.piece.color === s.p1.color ? s.p1 : s.p2;
      const victim = mover === s.p1 ? s.p2 : s.p1;
      const moment = scoreMoment(moved, plyNumber, mover.name, victim.name, isCheck, isMate, fenBefore);
      const evalPawns = evaluatePosition(this.engine.state) / 100;
      const whiteEval = this.engine.state.turn === 'w' ? evalPawns : -evalPawns;
      this.store.set(st => ({
        moments: moment ? [...st.moments, moment] : st.moments,
        evalHistory: [...st.evalHistory, isMate ? (moved.piece.color === 'w' ? 10 : -10) : Math.max(-10, Math.min(10, whiteEval))],
      }));
      if (byLocal && s.mode === 'online' && this.online) {
        this.online.sendMove({ from: moved.from, to: moved.to, promotion: moved.promotion, san: moved.san, fen: this.engine.getFen() });
      }
    }

    // Haptics fire immediately for responsiveness; sounds are timed to the landing by the view.
    if (isMate || isCheck) hapticCheck(isMate);
    else if (moved.captured) hapticCapture();
    else hapticMove();

    // Every capture gets a cinematic (both colours, all modes, en passant and capture-promotions included)
    // unless the player turned cinematics off or asked for reduced motion.
    const cinematic = !!moved.captured && (!!opts.forceCinematic || (s.settings.cinematics !== 'off' && !s.settings.reducedMotion));

    this.store.set({ selected: null, targets: [], hint: null, animating: true, cinematic });
    this.syncFromEngine();

    if (this.hasPresenter) {
      await this.emit('move', { move: moved, isCheck, isMate, cinematic, byLocal });
    } else {
      playMoveSounds(moved, isCheck, isMate);
    }
    this.store.set({ animating: false, cinematic: false });

    if (opts.fromReplay) return;
    this.afterMove();
  }

  private afterMove() {
    const status = this.engine.getGameStatus();
    if (status.isOver) {
      const titles: Record<string, string> = {
        checkmate: 'Checkmate',
        stalemate: 'Stalemate',
        threefold: 'Draw by repetition',
        'fifty-moves': 'Draw by 50-move rule',
        'insufficient-material': 'Draw — insufficient material',
      };
      const descriptions: Record<string, string> = {
        stalemate: 'No legal moves, but the king is not in check.',
        threefold: 'The same position occurred three times.',
        'fifty-moves': 'Fifty moves without a capture or pawn move.',
        'insufficient-material': 'Neither side can deliver checkmate.',
      };
      const winner = status.winner;
      const winnerName = winner ? this.nameFor(winner) : undefined;
      this.finishGame({
        winner,
        title: titles[status.result || ''] || 'Game over',
        description: winner ? `${winnerName} wins with ${this.state.sanHistory[this.state.sanHistory.length - 1] || 'mate'}.` : descriptions[status.result || ''] || '',
      });
      return;
    }
    this.maybeScheduleAI();
  }

  private nameFor(color: PieceColor) {
    const { p1, p2 } = this.state;
    return color === p1.color ? p1.name : p2.name;
  }

  private finishGame(r: { winner?: PieceColor; title: string; description: string }) {
    const s = this.state;
    if (s.result) return;
    this.stopClock();
    aiClient.cancelAll();
    this.aiToken++;
    const winnerName = r.winner ? this.nameFor(r.winner) : undefined;
    const key = !r.winner ? 'draw' : r.winner === s.p1.color ? 'p1_win' : 'p2_win';
    const updated = recordMatchResult(s.p1.name, s.p2.name, key);
    const outcome: GameResult['outcome'] =
      s.mode === 'pass_and_play' ? (r.winner ? 'neutral' : 'draw') : !r.winner ? 'draw' : r.winner === s.p1.color ? 'win' : 'loss';
    this.finalFen = this.engine.getFen();
    this.store.set({
      result: { ...r, winnerName, outcome },
      p1Record: updated.p1Record,
      p2Record: updated.p2Record,
      h2h: updated.h2h,
      aiThinking: false,
      selected: null,
      targets: [],
      hint: null,
    });
    if (r.winner && !this.engine.isCheckmate()) soundEngine.playCheckmateSound(); // mate already rang on landing
    void this.emit('gameOver', { winner: r.winner });
    // Let the victory camera move breathe before the results sheet slides in.
    window.setTimeout(() => {
      if (this.state.result && this.state.screen === 'playing') this.store.set({ screen: 'gameover' });
    }, this.state.settings.reducedMotion ? 300 : 1800);
  }

  // ---------------------------------------------------------------- AI
  private maybeScheduleAI() {
    const s = this.state;
    if (s.screen !== 'playing' || s.paused || s.result || s.replay.active || !this.isAITurn()) return;
    if (s.aiThinking) return;
    const token = ++this.aiToken;
    const started = performance.now();
    this.store.set({ aiThinking: true });
    aiClient
      .findMove(this.engine, s.aiLevel)
      .then(async move => {
        const wait = TIMING.aiMinThinkMs - (performance.now() - started);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        if (token !== this.aiToken) return;
        this.store.set({ aiThinking: false });
        const st = this.state;
        if (st.paused || st.result || st.screen !== 'playing' || !this.isAITurn()) return;
        if (move) void this.commitMove(move, false);
      })
      .catch(err => {
        console.error('AI error', err);
        if (token === this.aiToken) this.store.set({ aiThinking: false });
      });
  }

  async requestHint() {
    const s = this.state;
    if (!this.canInteract()) return;
    this.toast('Thinking about a hint…');
    const level = s.mode === 'vs_ai' ? s.aiLevel : 'hard_2';
    const move = await aiClient.findMove(this.engine, level === 'beginner' || level === 'hard_1' ? 'hard_2' : level, 0.6);
    if (!move || this.state.screen !== 'playing') return;
    this.store.set({ hint: { from: move.from, to: move.to } });
    soundEngine.playClickSound();
  }

  // ---------------------------------------------------------------- undo / draw / resign
  undo() {
    const s = this.state;
    if (s.screen !== 'playing' || s.result || s.animating || s.mode === 'online' || !this.engine.canUndo()) return;
    aiClient.cancelAll();
    this.aiToken++;
    this.store.set({ aiThinking: false });
    let undone = this.engine.undoMove();
    // vs AI: take back the AI reply too, so it's the human's turn again.
    if (s.mode === 'vs_ai' && this.engine.state.turn === s.p2.color && this.engine.canUndo()) {
      undone = this.engine.undoMove();
    }
    if (!undone) return;
    const plies = this.engine.state.moveHistory.length;
    this.store.set(st => ({
      evalHistory: st.evalHistory.slice(0, plies + 1),
      moments: st.moments.filter(m => m.moveNumber * 2 - (m.attackerColor === 'w' ? 1 : 0) <= plies),
      hint: null,
      selected: null,
      targets: [],
    }));
    this.syncFromEngine();
    void this.emit('sync', {});
    soundEngine.playClickSound();
    this.maybeScheduleAI();
  }

  offerDraw() {
    const s = this.state;
    if (s.screen !== 'playing' || s.result) return;
    if (s.mode === 'vs_ai') {
      const evalNow = s.evalHistory[s.evalHistory.length - 1] ?? 0;
      const aiAdvantage = s.p2.color === 'w' ? evalNow : -evalNow;
      if (aiAdvantage < -1.5 && s.sanHistory.length > 20) {
        this.finishGame({ title: 'Draw agreed', description: `${s.p2.name} accepted your draw offer.` });
      } else {
        this.toast(`${s.p2.name} declines the draw.`);
      }
      return;
    }
    if (s.mode === 'online') {
      this.online?.sendDrawOffer();
      this.toast('Draw offer sent.');
      return;
    }
    this.ask({
      title: 'Agree to a draw?',
      message: 'Both players agree to end the game as a draw.',
      confirmLabel: 'Draw',
      onConfirm: () => this.finishGame({ title: 'Draw agreed', description: 'Both players agreed to a draw.' }),
    });
  }

  resign() {
    const s = this.state;
    if (s.screen !== 'playing' || s.result) return;
    // In local games the side to move resigns; otherwise the local player.
    const color: PieceColor = s.mode === 'pass_and_play' ? s.turn : s.p1.color;
    const doIt = () => {
      if (s.mode === 'online') this.online?.sendResign(color);
      const winner: PieceColor = color === 'w' ? 'b' : 'w';
      this.finishGame({ winner, title: 'Resignation', description: `${this.nameFor(color)} resigned.` });
    };
    if (!s.settings.confirmResign) return doIt();
    this.ask({
      title: `Resign as ${this.nameFor(color)}?`,
      message: 'The game will end and count as a loss.',
      confirmLabel: 'Resign',
      destructive: true,
      onConfirm: doIt,
    });
  }

  // ---------------------------------------------------------------- clocks
  private startClock() {
    this.stopClock();
    if (this.state.settings.clockMode === 'none') return;
    this.clockLast = performance.now();
    this.clockTimer = window.setInterval(() => this.tickClock(), 100);
  }

  private stopClock() {
    if (this.clockTimer !== null) window.clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  private tickClock() {
    const now = performance.now();
    const dt = (now - this.clockLast) / 1000;
    this.clockLast = now;
    const s = this.state;
    if (s.screen !== 'playing' || s.result || s.replay.active) return;
    if (s.paused && s.mode !== 'online') return;
    if (s.mode === 'online' && !s.online?.connected) return;
    if (s.sanHistory.length === 0) return; // clocks start after White's first move
    const key = s.turn === 'w' ? 'whiteTime' : 'blackTime';
    const prev = s[key];
    const next = Math.max(0, prev - dt);
    this.store.set({ [key]: next } as Partial<GameState>);
    if (next <= TIMING.lowClockSeconds && Math.floor(prev) !== Math.floor(next) && this.isLocalColor(s.turn)) {
      soundEngine.playClockTick();
    }
    if (next <= 0) {
      const winner: PieceColor = s.turn === 'w' ? 'b' : 'w';
      this.finishGame({ winner, title: 'Time out', description: `${this.nameFor(s.turn)} ran out of time.` });
    }
  }

  // ---------------------------------------------------------------- camera & misc
  setCameraPreset(cameraPreset: CameraPreset) {
    this.store.set({ cameraPreset });
  }

  skipAnimation() {
    void this.emit('skip', {});
  }

  screenshot() {
    void this.emit('screenshot', {});
  }

  // ---------------------------------------------------------------- best-moments replay
  get highlightReel(): GameMoment[] {
    return topMoments(this.state.moments, 5);
  }

  openReplay() {
    if (!this.state.result) return;
    if (!this.finalFen) this.finalFen = this.engine.getFen();
    this.store.set({ replay: { active: true, index: 0 }, screen: 'playing' });
    const first = this.highlightReel[0];
    if (first) void this.playMoment(0);
  }

  async playMoment(index: number) {
    const reel = this.highlightReel;
    const m = reel[index];
    if (!m) return;
    this.store.set({ replay: { active: true, index } });
    this.engine.loadFen(m.fenBeforeMove);
    this.syncFromEngine();
    await this.emit('sync', {});
    await new Promise(r => setTimeout(r, 350));
    if (!this.state.replay.active || this.state.replay.index !== index) return;
    const move = this.engine.generateLegalMoves().find(x => x.from === m.fromSq && x.to === m.toSq && x.promotion === m.move.promotion);
    if (move) await this.commitMove(move, false, { forceCinematic: !this.state.settings.reducedMotion && !!move.captured, fromReplay: true });
  }

  closeReplay() {
    if (this.finalFen) {
      this.engine.loadFen(this.finalFen);
      this.syncFromEngine();
      void this.emit('sync', {});
    }
    this.store.set({ replay: { active: false, index: 0 }, screen: this.state.result ? 'gameover' : 'menu' });
  }

  // ---------------------------------------------------------------- online
  private async ensureOnline() {
    if (!this.online) {
      const mod = await import('../utils/onlineMultiplayer.ts');
      this.online = mod.onlineMultiplayer;
    }
    const om = this.online;
    om.callbacks = {
      onConnected: (peerName, role, myColor, materials) => {
        const s = this.state;
        const mine = (materials?.mine as PlayerProfile['material'] | undefined) ?? s.p1.material;
        const theirs = (materials?.theirs as PlayerProfile['material'] | undefined) ?? s.p2.material;
        this.store.set({
          online: { roomCode: s.online?.roomCode || '', role, connected: true },
          p1: { ...s.p1, color: myColor, material: mine },
          p2: { ...s.p2, name: peerName, color: myColor === 'w' ? 'b' : 'w', material: theirs },
        });
        if (materials?.changed) {
          const name = (id: string) => PIECE_MATERIALS_LIST.find(m => m.id === id)?.name ?? id;
          this.toast(`${peerName} is already playing ${name(theirs)}, so your pieces are ${name(mine)}.`);
        }
        this.refreshRecords();
        this.toast(role === 'host' ? `${peerName} joined. Good luck!` : `Connected to ${peerName}. Good luck!`, 'success');
        soundEngine.playGameStart();
        void this.emit('sync', { intro: true });
        this.startClock();
      },
      onDisconnected: () => {
        const s = this.state;
        if (s.online) this.store.set({ online: { ...s.online, connected: false } });
        if (s.screen === 'playing' && !s.result) this.toast('Opponent disconnected.', 'warning');
      },
      onMoveReceived: (remote: RemoteMovePayload) => {
        const move = this.engine
          .generateLegalMoves()
          .find(m => m.from === remote.from && m.to === remote.to && (m.promotion ?? undefined) === ((remote.promotion as PieceType) ?? undefined));
        if (move) void this.commitMove(move, false);
      },
      onResignReceived: color => {
        const winner: PieceColor = color === 'w' ? 'b' : 'w';
        this.finishGame({ winner, title: 'Resignation', description: `${this.nameFor(color)} resigned.` });
      },
      onDrawOfferReceived: () =>
        this.ask({
          title: 'Draw offered',
          message: `${this.state.p2.name} offers a draw.`,
          confirmLabel: 'Accept',
          cancelLabel: 'Decline',
          onConfirm: () => {
            this.online?.sendDrawAccept();
            this.finishGame({ title: 'Draw agreed', description: 'Both players agreed to a draw.' });
          },
          onCancel: () => this.online?.sendDrawDecline(),
        }),
      onDrawAcceptReceived: () => this.finishGame({ title: 'Draw agreed', description: 'Both players agreed to a draw.' }),
      onDrawDeclineReceived: () => this.toast('Draw offer declined.'),
      onRematchReceived: () => {
        this.toast(`${this.state.p2.name} started a rematch.`);
        this.startMatch();
      },
      onArenaChangeReceived: arena => this.store.set({ arena }),
      onError: err => this.toast(`Connection: ${err}`, 'warning'),
    };
    return om;
  }

  async hostOnline(colorPref: 'w' | 'b' | 'random') {
    const om = await this.ensureOnline();
    const { OnlineMultiplayerManager } = await import('../utils/onlineMultiplayer.ts');
    const code = OnlineMultiplayerManager.generateRoomCode();
    const color: PieceColor = colorPref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorPref;
    this.store.set({ mode: 'online', online: { roomCode: code, role: 'host', connected: false } });
    this.updatePlayer('p1', { color });
    this.store.set({ p2: { ...this.state.p2, name: 'Waiting…' } });
    this.startMatch();
    this.stopClock();
    try {
      await om.createRoom(code, color, this.state.p1.name, this.state.p1.material);
    } catch {
      this.toast('Peer network unavailable — same-device tabs still work.', 'warning');
    }
  }

  async joinOnline(code: string) {
    const om = await this.ensureOnline();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    this.store.set({ mode: 'online', online: { roomCode: clean, role: 'guest', connected: false } });
    this.store.set({ p2: { ...this.state.p2, name: 'Connecting…' } });
    this.startMatch();
    this.stopClock();
    try {
      await om.joinRoom(clean, this.state.p1.name, this.state.p1.material);
    } catch {
      this.toast('Could not reach that room.', 'warning');
    }
  }

  private leaveOnline() {
    this.online?.disconnect();
    this.store.set({ online: null, mode: 'vs_ai', p2: { ...this.state.p2, name: aiDisplayName(this.state.aiLevel) } });
  }

  /** Test/debug hook used by the automated browser checks. */
  debugApi() {
    return {
      state: () => this.state,
      arenaIds: () => ['chess_arena', 'traditional', 'japan', 'india', 'usa', 'egypt', 'royal_kingdom', 'shadow_dungeon'],
      startMatch: (opts: { arena?: ArenaId; mode?: GameMode } = {}) => {
        if (opts.arena) this.setArena(opts.arena);
        if (opts.mode) this.setMode(opts.mode);
        this.startMatch();
      },
      toMenu: () => this.toMenu(),
      move: (from: number, to: number) => {
        this.pressSquare(from);
        this.pressSquare(to);
      },
      press: (sq: number) => this.pressSquare(sq),
      legalMoves: () => this.engine.generateLegalMoves().map(m => ({ from: m.from, to: m.to, captured: m.captured?.type ?? null, promotion: m.promotion ?? null })),
      turn: () => this.engine.state.turn,
      promote: (piece: PieceType) => this.choosePromotion(piece),
      settings: (patch: Partial<GameSettings>) => this.updateSettings(patch),
      hint: () => this.requestHint(),
      host: (color: 'w' | 'b' | 'random' = 'w') => this.hostOnline(color),
      join: (code: string) => this.joinOnline(code),
      levels: AI_LEVELS,
    };
  }
}

function computeCaptured(engine: ChessEngine): CapturedPiecesState {
  const counts: Record<string, number> = {};
  for (const p of engine.state.board) if (p && p.type !== 'k') counts[p.color + p.type] = (counts[p.color + p.type] || 0) + 1;
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const values: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const white: PieceType[] = [];
  const black: PieceType[] = [];
  (['q', 'r', 'b', 'n', 'p'] as PieceType[]).forEach(t => {
    // Promotions can push counts above the start; clamp so they don't show as negative captures.
    for (let i = 0; i < Math.max(0, start[t] - (counts['b' + t] || 0)); i++) white.push(t);
    for (let i = 0; i < Math.max(0, start[t] - (counts['w' + t] || 0)); i++) black.push(t);
  });
  // Material on board is the honest measure (handles promotions).
  let adv = 0;
  for (const p of engine.state.board) if (p) adv += (p.color === 'w' ? 1 : -1) * values[p.type];
  return { white, black, materialAdvantage: adv };
}

export function playMoveSounds(move: Move, isCheck: boolean, isMate: boolean, material?: string) {
  const file = move.to % 8;
  if (isMate) soundEngine.playCheckmateSound();
  else if (isCheck) soundEngine.playCheckSound(file);
  else if (move.captured) soundEngine.playCaptureSound(file, material);
  else soundEngine.playMoveSound(file, material);
}

export const game = new GameController();
