import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Copy, Flag, Handshake, Lightbulb, ListOrdered, Menu, RotateCcw, Video, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { game, GameState } from '../game/GameController.ts';
import { useStore } from '../game/store.ts';
import type { CameraPreset, PieceColor, PieceType } from '../types.ts';
import { Dots, PieceIcon, Sheet, softSpring, spring, tap } from './kit.tsx';
import { TIMING } from '../config/gameConfig.ts';

const VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function formatClock(sec: number): string {
  if (sec < 10) return `0:0${Math.max(0, sec).toFixed(1)}`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Hud({ onPause }: { onPause: () => void }) {
  const s = useStore(game.store, st => ({
    mode: st.mode,
    p1: st.p1,
    p2: st.p2,
    turn: st.turn,
    check: st.checkSquare,
    aiThinking: st.aiThinking,
    result: st.result,
    clockMode: st.settings.clockMode,
    replay: st.replay.active,
    cinematic: st.cinematic,
    online: st.online,
    moves: st.sanHistory.length,
  }));
  const [movesOpen, setMovesOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1100);
  const [movesSheet, setMovesSheet] = useState(false);

  const white = s.p1.color === 'w' ? s.p1 : s.p2;
  const black = s.p1.color === 'w' ? s.p2 : s.p1;
  const localSide = s.mode === 'pass_and_play' ? null : s.p1.color;

  if (s.replay) return <ReplayBar />;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {/* Cinematic letterbox */}
      <AnimatePresence>
        {s.cinematic && (
          <>
            <motion.div className="letterbox top-0" initial={{ y: '-100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} />
            <motion.div className="letterbox bottom-0 flex items-center justify-center" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
              <span className="t-footnote c-3">Tap or press Space to skip</span>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.div className="absolute inset-0" animate={{ opacity: s.cinematic ? 0 : 1 }} transition={{ duration: 0.3 }}>
        {/* Player cards */}
        <div className="absolute left-0 right-0 flex justify-between gap-2 px-3 sm:px-5" style={{ top: 'calc(var(--safe-top) + 12px)' }}>
          <PlayerCard side="w" name={white.name} isYou={localSide === 'w'} align="left" />
          <StatusPill />
          <PlayerCard side="b" name={black.name} isYou={localSide === 'b'} align="right" />
        </div>

        {/* Moves panel (desktop) */}
        <div className="hidden lg:block absolute right-5 top-1/2 -translate-y-1/2">
          <AnimatePresence>
            {movesOpen && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={softSpring} className="pointer-events-auto">
                <MovesPanel onClose={() => setMovesOpen(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Online waiting card */}
        {s.mode === 'online' && s.online && !s.online.connected && !s.result && <WaitingCard code={s.online.roomCode} role={s.online.role} />}

        <Dock
          onPause={onPause}
          onMoves={() => {
            if (window.innerWidth >= 1024) setMovesOpen(o => !o);
            else setMovesSheet(true);
          }}
          movesOpen={movesOpen}
        />
      </motion.div>

      <Sheet open={movesSheet} onClose={() => setMovesSheet(false)} title="Moves" width={420}>
        <div className="px-4 pb-5">
          <MoveList tall />
        </div>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- player card
function PlayerCard({ side, name, isYou, align }: { side: PieceColor; name: string; isYou: boolean; align: 'left' | 'right' }) {
  const s = useStore(game.store, st => ({
    turn: st.turn,
    thinking: st.aiThinking && st.p2.color === side && st.mode === 'vs_ai',
    captured: side === 'w' ? st.captured.white : st.captured.black,
    adv: st.captured.materialAdvantage,
    clockMode: st.settings.clockMode,
    time: side === 'w' ? st.whiteTime : st.blackTime,
    inCheck: st.checkSquare >= 0 && st.turn === side,
    over: !!st.result,
    started: st.sanHistory.length > 0,
  }));
  const active = s.turn === side && !s.over;
  const lead = side === 'w' ? s.adv : -s.adv;
  const low = s.clockMode !== 'none' && s.time <= TIMING.lowClockSeconds;
  const enemy: PieceColor = side === 'w' ? 'b' : 'w';
  return (
    <motion.div
      layout
      className={`glass-thin pointer-events-auto rounded-[18px] px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 min-w-0 flex-1 sm:flex-none sm:w-[260px] ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
      animate={{
        boxShadow: active ? `0 0 0 1.5px ${s.inCheck ? 'rgba(255,69,58,0.9)' : 'rgba(255,255,255,0.55)'}, 0 10px 30px rgba(0,0,0,0.35)` : '0 0 0 0px rgba(255,255,255,0), 0 6px 18px rgba(0,0,0,0.25)',
      }}
      transition={{ duration: 0.3 }}
      aria-label={`${name}, ${side === 'w' ? 'White' : 'Black'}${active ? ', to move' : ''}`}
    >
      <div className="relative shrink-0">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full grid place-items-center" style={{ background: side === 'w' ? 'var(--white-side)' : 'var(--black-side)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }}>
          <PieceIcon type="k" color={side} size={22} />
        </div>
        {active && <motion.span layoutId="turn-dot" className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: s.inCheck ? 'var(--red)' : 'var(--green)', boxShadow: '0 0 0 2px #1c1c20' }} transition={spring} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
          <span className="t-headline truncate">{name}</span>
          {isYou && <span className="t-caption px-1.5 rounded-md shrink-0" style={{ background: 'var(--fill-2)' }}>You</span>}
        </div>
        <div className={`flex items-center gap-0.5 h-5 mt-0.5 ${align === 'right' ? 'justify-end' : ''}`}>
          {s.thinking ? (
            <span className="t-footnote c-2 flex items-center gap-1.5">Thinking <Dots /></span>
          ) : (
            <>
              <span className={`flex items-center ${align === 'right' ? 'flex-row-reverse' : ''}`}>
                {groupCaptured(s.captured).map(([t, n]) => (
                  <span key={t} className="flex -space-x-2 mr-0.5">
                    {Array.from({ length: n }).map((_, i) => <PieceIcon key={i} type={t} color={enemy} size={15} />)}
                  </span>
                ))}
              </span>
              {lead > 0 && <span className="t-caption c-2 tabular mx-1">+{lead}</span>}
              {s.captured.length === 0 && lead <= 0 && <span className="t-footnote c-3">{side === 'w' ? 'White' : 'Black'}</span>}
            </>
          )}
        </div>
      </div>
      {s.clockMode !== 'none' && (
        <div
          className="t-mono shrink-0 rounded-[10px] px-2 py-1 text-[0.95rem] sm:text-[1.05rem] font-semibold"
          style={{
            background: active ? (low ? 'rgba(255,69,58,0.22)' : 'rgba(255,255,255,0.92)') : 'var(--fill-3)',
            color: active ? (low ? 'var(--red)' : '#0b0b0d') : 'var(--label-2)',
            animation: active && low && s.started ? 'breathe 1s infinite' : undefined,
          }}
          aria-label={`Clock ${formatClock(s.time)}`}
        >
          {formatClock(s.time)}
        </div>
      )}
    </motion.div>
  );
}

function groupCaptured(list: PieceType[]): [PieceType, number][] {
  const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  return order.map(t => [t, list.filter(x => x === t).length] as [PieceType, number]).filter(([, n]) => n > 0);
}

// ---------------------------------------------------------------- status pill
function StatusPill() {
  const s = useStore(game.store, st => ({ turn: st.turn, check: st.checkSquare >= 0, mode: st.mode, p1: st.p1, p2: st.p2, thinking: st.aiThinking, result: st.result, online: st.online, animating: st.animating }));
  let text: string;
  let tone: 'normal' | 'check' | 'over' = 'normal';
  const mover = s.turn === s.p1.color ? s.p1 : s.p2;
  if (s.result) {
    text = s.result.title;
    tone = 'over';
  } else if (s.mode === 'online' && !s.online?.connected) {
    text = 'Waiting for opponent';
  } else if (s.check) {
    text = s.mode === 'pass_and_play' ? `Check · ${s.turn === 'w' ? 'White' : 'Black'} to move` : s.turn === s.p1.color ? 'Check — your move' : 'Check';
    tone = 'check';
  } else if (s.mode === 'pass_and_play') {
    text = `${mover.name} to move`;
  } else {
    text = s.turn === s.p1.color ? 'Your move' : s.mode === 'vs_ai' ? `${s.p2.name.split(' ·')[0]} is thinking` : `${s.p2.name} to move`;
  }
  return (
    <div className="hidden md:flex flex-1 justify-center pt-1.5 min-w-0">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={text}
          className="glass-thin pointer-events-auto rounded-full px-4 h-9 flex items-center gap-2 t-subhead font-medium whitespace-nowrap"
          style={tone === 'check' ? { background: 'rgba(255,69,58,0.24)', color: '#ffd7d4' } : undefined}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={spring}
          role="status"
          aria-live="polite"
        >
          <span className="w-2 h-2 rounded-full" style={{ background: tone === 'check' ? 'var(--red)' : s.turn === 'w' ? 'var(--white-side)' : '#555', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3)' }} />
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- moves
function MovesPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="glass rounded-[22px] w-[232px] p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="t-headline">Moves</span>
        <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Hide moves" onClick={() => { tap(); onClose(); }}>
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
      <EvalBar />
      <MoveList />
    </div>
  );
}

function EvalBar() {
  const ev = useStore(game.store, st => st.evalHistory[st.evalHistory.length - 1] ?? 0);
  const whiteShare = 1 / (1 + Math.exp(-ev * 0.7));
  return (
    <div className="px-1 pb-3" title="Position evaluation">
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#2a2a30' }}>
        <motion.div className="h-full" style={{ background: 'var(--white-side)' }} animate={{ width: `${whiteShare * 100}%` }} transition={softSpring} />
      </div>
      <div className="flex justify-between t-caption c-3 mt-1 tabular">
        <span>White</span>
        <span>{ev > 0 ? '+' : ''}{Math.abs(ev) >= 9.9 ? (ev > 0 ? 'M' : '-M') : ev.toFixed(1)}</span>
        <span>Black</span>
      </div>
    </div>
  );
}

function MoveList({ tall }: { tall?: boolean }) {
  const moves = useStore(game.store, st => st.sanHistory);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [moves.length]);
  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);
  return (
    <div ref={ref} className="scroll-y" style={{ maxHeight: tall ? '55vh' : 320 }} aria-label="Move list">
      {rows.length === 0 && <p className="t-footnote c-3 px-1 py-2">No moves yet.</p>}
      {rows.map(([w, b], i) => {
        const lastRow = i === rows.length - 1;
        return (
          <div key={i} className="grid grid-cols-[28px_1fr_1fr] items-center rounded-lg t-subhead tabular" style={{ background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.03)' }}>
            <span className="c-3 t-footnote pl-1.5">{i + 1}.</span>
            <span className="px-1.5 py-1 rounded-md" style={lastRow && !b ? { background: 'var(--fill-2)' } : undefined}>{w}</span>
            <span className="px-1.5 py-1 rounded-md" style={lastRow && b ? { background: 'var(--fill-2)' } : undefined}>{b ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Live CSS media query match. */
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

// ---------------------------------------------------------------- dock
function Dock({ onPause, onMoves, movesOpen }: { onPause: () => void; onMoves: () => void; movesOpen: boolean }) {
  const s = useStore(game.store, st => ({ canUndo: st.canUndo, mode: st.mode, over: !!st.result, preset: st.cameraPreset, aiThinking: st.aiThinking }));
  const [camOpen, setCamOpen] = useState(false);
  // Phones: the camera menu becomes a single 2D / 3D switch (no room for a menu, and it's what players reach for).
  const compact = useMediaQuery('(max-width: 639px), (max-height: 560px) and (pointer: coarse)');
  const flat = s.preset === 'top';
  const presets: { id: CameraPreset; label: string }[] = [
    { id: 'auto', label: 'Follow' },
    { id: 'white', label: 'White' },
    { id: 'black', label: 'Black' },
    { id: 'side', label: 'Side' },
    { id: 'top', label: 'Top' },
  ];
  const btn = (key: string, icon: React.ReactNode, label: string, onClick: () => void, opts: { disabled?: boolean; shortcut?: string; active?: boolean; danger?: boolean; desktopOnly?: boolean } = {}) => (
    <button
      key={key}
      className={`${opts.desktopOnly ? "hidden sm:flex" : "flex"} flex-col items-center justify-center gap-0.5 min-w-[44px] sm:min-w-[64px] h-[52px] [@media(max-height:560px)]:h-[42px] [@media(max-height:560px)]:min-w-[46px] rounded-[14px] transition-colors disabled:opacity-35 hover:bg-white/[0.08] active:scale-95`}
      style={{ color: opts.danger ? 'var(--red)' : opts.active ? 'var(--accent)' : undefined, transitionProperty: 'background-color, transform' }}
      onClick={() => { tap(); onClick(); }}
      disabled={opts.disabled}
      aria-label={label}
      title={opts.shortcut ? `${label} (${opts.shortcut})` : label}
    >
      {icon}
      <span className="t-caption hidden sm:block [@media(max-height:560px)]:hidden">{label}</span>
    </button>
  );
  return (
    <div className="absolute left-0 right-0 flex justify-center px-3" style={{ bottom: 'calc(var(--safe-bottom) + 14px)' }}>
      <div className="relative">
        <AnimatePresence>
          {camOpen && (
            <motion.div
              className="glass pointer-events-auto absolute bottom-[66px] left-1/2 -translate-x-1/2 rounded-[16px] p-1.5 flex gap-1"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={spring}
              role="menu"
            >
              {presets.map(p => (
                <button
                  key={p.id}
                  role="menuitemradio"
                  aria-checked={s.preset === p.id}
                  className="btn btn-sm"
                  style={{ background: s.preset === p.id ? 'rgba(255,255,255,0.92)' : 'transparent', color: s.preset === p.id ? '#0b0b0d' : undefined }}
                  onClick={() => { tap(); game.setCameraPreset(p.id); setCamOpen(false); }}
                >
                  {p.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <nav className="glass pointer-events-auto rounded-[20px] p-1.5 flex items-center gap-0.5" aria-label="Game controls">
          {btn('undo', <RotateCcw size={20} />, 'Undo', () => game.undo(), { disabled: !s.canUndo || s.over || s.mode === 'online', shortcut: 'U' })}
          {btn('hint', <Lightbulb size={20} />, 'Hint', () => void game.requestHint(), { disabled: s.over || s.aiThinking, shortcut: 'H' })}
          {compact
            ? btn('view', <span className="view-toggle" aria-hidden="true">{flat ? '3D' : '2D'}</span>, flat ? 'Switch to 3D view' : 'Switch to 2D view', () => game.toggleBoardView(), { active: flat })
            : btn('cam', <Video size={20} />, 'Camera', () => setCamOpen(o => !o), { active: camOpen, shortcut: 'C' })}
          {btn('moves', <ListOrdered size={20} />, 'Moves', onMoves, { active: movesOpen })}
          <span className="w-px h-7 mx-1" style={{ background: 'var(--separator)' }} />
          {btn('draw', <Handshake size={20} />, 'Draw', () => game.offerDraw(), { disabled: s.over, shortcut: 'D' })}
          {btn('resign', <Flag size={20} />, 'Resign', () => game.resign(), { disabled: s.over, shortcut: 'R' })}
          {btn('shot', <Camera size={20} />, 'Photo', () => game.screenshot(), { desktopOnly: true })}
          {btn('menu', <Menu size={20} />, 'Menu', onPause, { shortcut: 'Esc' })}
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- online waiting
function WaitingCard({ code, role }: { code: string; role: 'host' | 'guest' }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <motion.div className="glass pointer-events-auto rounded-[24px] p-6 w-full max-w-sm text-center" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
        <div className="t-overline c-2">{role === 'host' ? 'Room created' : 'Joining room'}</div>
        <div className="t-hero t-mono mt-2 tracking-wider">{code}</div>
        <p className="t-subhead c-2 mt-3 flex items-center justify-center gap-2">
          {role === 'host' ? 'Share this code with a friend' : 'Connecting to host'} <Dots />
        </p>
        {role === 'host' && (
          <button
            className="btn btn-secondary mt-5 btn-block"
            onClick={() => {
              tap();
              void navigator.clipboard?.writeText(code).then(() => setCopied(true));
              window.setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Copied' : 'Copy code'}
          </button>
        )}
        <button className="btn btn-ghost mt-2 btn-block" onClick={() => { tap(); game.toMenu(); }}>
          Cancel
        </button>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------- highlights replay
function ReplayBar() {
  const index = useStore(game.store, st => st.replay.index);
  const animating = useStore(game.store, st => st.animating);
  const reel = game.highlightReel;
  const m = reel[index];
  return (
    <div className="fixed inset-x-0 z-20 flex justify-center px-4 pointer-events-none" style={{ bottom: 'calc(var(--safe-bottom) + 18px)' }}>
      <motion.div className="glass pointer-events-auto rounded-[22px] p-4 w-full max-w-lg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
        <div className="flex items-center justify-between">
          <span className="t-overline c-2">Highlight {index + 1} of {reel.length}</span>
          <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Close highlights" onClick={() => { tap(); game.closeReplay(); }}>
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={m?.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <div className="t-title3 mt-1.5">{m?.caption}</div>
            <div className="t-footnote c-2 mt-0.5">Move {m?.moveNumber} · {m?.san}</div>
          </motion.div>
        </AnimatePresence>
        <div className="flex items-center gap-2 mt-4">
          <button className="btn btn-secondary btn-sm" disabled={index === 0 || animating} onClick={() => { tap(); void game.playMoment(index - 1); }} aria-label="Previous highlight">
            <ChevronLeft size={18} />
          </button>
          <button className="btn btn-secondary btn-sm flex-1" disabled={animating} onClick={() => { tap(); void game.playMoment(index); }}>
            Replay
          </button>
          <button className="btn btn-secondary btn-sm" disabled={index >= reel.length - 1 || animating} onClick={() => { tap(); void game.playMoment(index + 1); }} aria-label="Next highlight">
            <ChevronRight size={18} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export type { GameState };
