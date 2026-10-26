import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ChevronLeft, ChevronRight, Globe, HelpCircle, Pencil, Settings, Users, Check } from 'lucide-react';
import { game } from '../game/GameController.ts';
import { useStore } from '../game/store.ts';
import { AI_LEVELS, CLOCK_LABELS } from '../config/gameConfig.ts';
import { ARENA_THEMES, getArenaTheme } from '../config/arenaThemes.ts';
import { PIECE_MATERIALS_LIST } from '../render/pieceMaterials.ts';
import { prefetchArenas } from '../render/realms/prefetch.ts';
import type { ClockMode, GameMode, PieceColor } from '../types.ts';
import { LogoMark, Segmented, softSpring, spring, tap } from './kit.tsx';

type ColorChoice = PieceColor | 'random';

export function MainMenu({ onOpenSettings, onOpenHelp, onEditName }: { onOpenSettings: () => void; onOpenHelp: () => void; onEditName: () => void }) {
  const s = useStore(game.store, st => ({
    mode: st.mode,
    aiLevel: st.aiLevel,
    arena: st.arena,
    p1: st.p1,
    p2: st.p2,
    clock: st.settings.clockMode,
    record: st.p1Record,
  }));
  const [view, setView] = useState<'setup' | 'arena'>('setup');
  const [colorChoice, setColorChoice] = useState<ColorChoice>(s.p1.color);
  const [onlineTab, setOnlineTab] = useState<'host' | 'join'>('host');
  const [joinCode, setJoinCode] = useState('');

  const whiteOwner = s.p1.color === 'w' ? 'p1' : 'p2';
  const blackOwner = whiteOwner === 'p1' ? 'p2' : 'p1';
  const whiteMat = s[whiteOwner].material;
  const blackMat = s[blackOwner].material;
  const arena = getArenaTheme(s.arena);

  const play = () => {
    tap();
    if (s.mode === 'online') {
      if (onlineTab === 'host') void game.hostOnline(colorChoice);
      else void game.joinOnline(joinCode);
      return;
    }
    if (s.mode === 'vs_ai') {
      const c: PieceColor = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
      game.updatePlayer('p1', { color: c });
    }
    game.startMatch();
  };

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      <AnimatePresence mode="wait">
        {view === 'setup' ? (
          <div key="setup" className="absolute inset-0 flex items-end sm:items-center sm:pl-8">
          <motion.aside
            className="menu-panel glass pointer-events-auto flex flex-col w-full max-h-[78vh] rounded-t-[28px]
              sm:w-[440px] sm:max-h-[92vh] sm:rounded-[28px] lg:w-[820px]"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={softSpring}
            aria-label="Match setup"
          >
            <div className="menu-scroll scroll-y px-6 pt-6 pb-4 lg:px-8 flex-1">
              {/* Header */}
              <div className="menu-header flex items-center gap-4">
                <LogoMark size={72} />
                <h1 className="brand-title">Chess Realms</h1>
              </div>

              <div className="menu-grid lg:grid lg:grid-cols-2 lg:gap-x-8">
              <div className="min-w-0">
              {/* Name tag */}
              <PlayerCard greeting={greeting} name={s.p1.name} record={s.record} onEdit={() => { tap(); onEditName(); }} />

              {/* Mode */}
              <Segmented
                className="mt-5"
                label="Game mode"
                value={s.mode}
                onChange={(m: GameMode) => game.setMode(m)}
                options={[
                  { value: 'vs_ai', label: <span className="inline-flex items-center gap-1.5"><Bot size={15} /> Computer</span> },
                  { value: 'pass_and_play', label: <span className="inline-flex items-center gap-1.5"><Users size={15} /> Local</span> },
                  { value: 'online', label: <span className="inline-flex items-center gap-1.5"><Globe size={15} /> Online</span> },
                ]}
              />

              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={s.mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  {s.mode === 'vs_ai' && (
                    <>
                      <Label>Opponent</Label>
                      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Computer strength">
                        {AI_LEVELS.map(l => (
                          <button
                            key={l.id}
                            className="choice py-2.5 px-1 text-center"
                            aria-pressed={s.aiLevel === l.id}
                            title={l.tagline}
                            onClick={() => { tap(); game.setAILevel(l.id); }}
                          >
                            <div className="t-footnote font-semibold truncate">{l.label}</div>
                            <div className="t-caption c-3 tabular">{l.elo}</div>
                          </button>
                        ))}
                      </div>
                      <p className="t-footnote c-3 mt-2">{AI_LEVELS.find(l => l.id === s.aiLevel)?.tagline}</p>
                      <Label>Play as</Label>
                      <Segmented
                        label="Your colour"
                        value={colorChoice}
                        onChange={setColorChoice}
                        options={[
                          { value: 'w', label: 'White' },
                          { value: 'b', label: 'Black' },
                          { value: 'random', label: 'Random' },
                        ]}
                      />
                    </>
                  )}

                  {s.mode === 'pass_and_play' && (
                    <>
                      <Label>Players</Label>
                      <div className="group-card">
                        <NameRow color={s.p1.color} value={s.p1.name} onChange={v => game.updatePlayer('p1', { name: v })} placeholder="Player 1" />
                        <NameRow color={s.p2.color} value={s.p2.name} onChange={v => game.updatePlayer('p2', { name: v })} placeholder="Player 2" />
                      </div>
                      <button
                        className="btn btn-ghost btn-sm mt-1.5 -ml-2"
                        onClick={() => { tap(); game.updatePlayer('p1', { color: s.p1.color === 'w' ? 'b' : 'w' }); }}
                      >
                        Swap colours
                      </button>
                    </>
                  )}

                  {s.mode === 'online' && (
                    <>
                      <Label>Room</Label>
                      <Segmented label="Host or join" value={onlineTab} onChange={setOnlineTab} options={[{ value: 'host', label: 'Create room' }, { value: 'join', label: 'Join room' }]} />
                      {onlineTab === 'host' ? (
                        <>
                          <Label>Your colour</Label>
                          <Segmented label="Your colour" value={colorChoice} onChange={setColorChoice} options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }, { value: 'random', label: 'Random' }]} />
                          <p className="t-footnote c-3 mt-2">You’ll get a code to share with a friend.</p>
                        </>
                      ) : (
                        <input
                          className="field mt-3 t-mono tracking-widest uppercase"
                          placeholder="CW-XXXX"
                          aria-label="Room code"
                          value={joinCode}
                          maxLength={8}
                          onChange={e => setJoinCode(e.target.value.toUpperCase())}
                          onKeyDown={e => e.key === 'Enter' && joinCode.trim() && play()}
                        />
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              </div>
              <div className="min-w-0">
              {/* Pieces */}
              <Label>Pieces</Label>
              {s.mode === 'online' ? (
                <>
                  <div className="group-card px-4 py-3">
                    <SwatchRow label="Your pieces" value={s.p1.material} onChange={m => game.updatePlayer('p1', { material: m })} />
                  </div>
                  <p className="t-footnote c-3 mt-2">
                    {onlineTab === 'host'
                      ? 'Your friend picks their own pieces, but they can’t use yours.'
                      : 'Any except your host’s. If they already have yours, you’ll get a contrasting set.'}
                  </p>
                </>
              ) : (
                <div className="group-card px-4 py-3 space-y-3">
                  <SwatchRow label="White" value={whiteMat} onChange={m => game.updatePlayer(whiteOwner, { material: m })} />
                  <div style={{ borderTop: 'var(--hairline)' }} />
                  <SwatchRow label="Black" value={blackMat} onChange={m => game.updatePlayer(blackOwner, { material: m })} />
                </div>
              )}

              {/* Arena */}
              <Label>Arena</Label>
              <button className="group-card w-full flex items-center gap-3 p-2.5 pr-3 text-left hover:bg-white/[0.07] transition-colors" onClick={() => { tap(); setView('arena'); }}>
                <span className="w-14 h-14 rounded-[12px] shrink-0" style={{ background: arena.thumb, boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.15)' }} />
                <span className="flex-1 min-w-0">
                  <span className="t-headline block truncate">{arena.name}</span>
                  <span className="t-footnote c-2 block truncate">{arena.tagline}</span>
                </span>
                <ChevronRight size={18} className="c-3" />
              </button>

              {/* Clock */}
              <Label>Clock</Label>
              <Segmented
                label="Clock"
                value={s.clock}
                onChange={(c: ClockMode) => game.updateSettings({ clockMode: c })}
                options={(['none', '3min', '5min', '10min'] as ClockMode[]).map(c => ({ value: c, label: CLOCK_LABELS[c] }))}
              />
              </div>
              </div>
            </div>

            {/* Footer */}
            <div className="menu-footer px-6 pt-3 pb-3 sm:pb-5 lg:px-8" style={{ borderTop: 'var(--hairline)' }}>
              <motion.button
                className="btn btn-primary btn-lg btn-block"
                whileTap={{ scale: 0.98 }}
                onClick={play}
                disabled={s.mode === 'online' && onlineTab === 'join' && !joinCode.trim()}
              >
                {s.mode === 'online' ? (onlineTab === 'host' ? 'Create room' : 'Join room') : 'Play'}
              </motion.button>
              <div className="flex items-center justify-between mt-1.5 sm:mt-3">
                <span />
                <div className="flex gap-1">
                  <button className="btn btn-ghost btn-sm" onClick={() => { tap(); onOpenHelp(); }} aria-label="How to play">
                    <HelpCircle size={17} /> <span className="hidden sm:inline">How to play</span>
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { tap(); onOpenSettings(); }} aria-label="Settings">
                    <Settings size={17} /> <span className="hidden sm:inline">Settings</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
          </div>
        ) : (
          <ArenaPicker key="arena" current={s.arena} onDone={() => setView('setup')} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Large, tappable name tag: initial avatar, name, record. */
function PlayerCard({ greeting, name, record, onEdit }: { greeting: string; name: string; record: { totalGames: number; wins: number; losses: number; draws: number }; onEdit: () => void }) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <button
      className="player-card group-card w-full mt-5 flex items-center gap-4 p-3.5 pr-4 text-left hover:bg-white/[0.07] transition-colors"
      onClick={onEdit}
      aria-label={`Your name: ${name}. Tap to change.`}
    >
      <span
        className="w-14 h-14 rounded-full shrink-0 grid place-items-center t-title2"
        style={{ background: 'linear-gradient(145deg, #ffe3a3 0%, #e2b04f 45%, #8a5a18 100%)', color: '#2a1a06', boxShadow: '0 4px 14px rgba(226,176,79,0.35), inset 0 0 0 1px rgba(255,255,255,0.35)' }}
        aria-hidden="true"
      >
        {initial}
      </span>
      <span className="flex-1 min-w-0">
        <span className="t-overline c-3 block">{greeting}</span>
        <span className="t-title2 block truncate">{name}</span>
        <span className="t-footnote c-2 block tabular">
          {record.totalGames > 0 ? `${record.wins} won · ${record.losses} lost · ${record.draws} drawn` : 'No games yet'}
        </span>
      </span>
      <span className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--fill-2)' }}>
        <Pencil size={16} />
      </span>
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="t-overline c-3 mt-6 mb-2">{children}</div>;
}

function NameRow({ color, value, onChange, placeholder }: { color: PieceColor; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="row">
      <span className="w-6 h-6 rounded-full shrink-0" style={{ background: color === 'w' ? 'var(--white-side)' : 'var(--black-side)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' }} aria-hidden="true" />
      <input className="flex-1 bg-transparent border-none outline-none t-body min-w-0" value={value} placeholder={placeholder} maxLength={18} aria-label={`${color === 'w' ? 'White' : 'Black'} player name`} onChange={e => onChange(e.target.value)} />
      <span className="t-footnote c-3">{color === 'w' ? 'White' : 'Black'}</span>
    </label>
  );
}

function SwatchRow({ label, value, onChange }: { label: string; value: string; onChange: (m: (typeof PIECE_MATERIALS_LIST)[number]['id']) => void }) {
  const current = PIECE_MATERIALS_LIST.find(m => m.id === value);
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="t-subhead font-medium">{label}</span>
        <span className="t-footnote c-2">{current?.name}</span>
      </div>
      <div className="flex justify-between gap-1" role="radiogroup" aria-label={`${label} piece material`}>
        {PIECE_MATERIALS_LIST.map(m => (
          <button
            key={m.id}
            role="radio"
            aria-checked={m.id === value}
            aria-label={m.name}
            title={`${m.name} — ${m.description}`}
            onClick={() => { tap(); onChange(m.id); }}
            className="relative w-9 h-9 rounded-full grid place-items-center transition-transform active:scale-90"
          >
            <span
              className="w-7 h-7 rounded-full"
              style={{ background: `radial-gradient(circle at 35% 30%, #ffffffaa 0%, ${m.swatch} 38%, ${m.swatchEdge} 100%)`, boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.3), 0 2px 6px rgba(0,0,0,0.35)' }}
            />
            {m.id === value && (
              <motion.span layoutId={`swatch-${label}`} className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 2px var(--accent)' }} transition={spring} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArenaPicker({ current, onDone }: { current: string; onDone: () => void }) {
  const selected = getArenaTheme(current as never);
  // The player is about to choose: download every arena in the background (picker order) so a tap opens it fast.
  React.useEffect(() => {
    prefetchArenas(ARENA_THEMES.map(a => a.id));
  }, []);
  const row = React.useRef<HTMLDivElement>(null);
  const { canLeft, canRight, page, dragProps } = useSideScroll(row);
  return (
    <motion.div
      className="pointer-events-auto absolute left-0 right-0 bottom-0 pt-16"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)', background: 'linear-gradient(180deg, rgba(6,6,10,0) 0%, rgba(6,6,10,0.55) 30%, rgba(6,6,10,0.85) 100%)' }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={softSpring}
    >
      <div className="flex items-end justify-between gap-4 mb-3 max-w-6xl mx-auto px-4 sm:px-8">
        <div className="min-w-0">
          <div className="t-overline" style={{ color: selected.accent }}>Choose your arena</div>
          <motion.div key={selected.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="arena-headline truncate">
            {selected.name}
          </motion.div>
          <div className="t-subhead c-2 truncate" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}>{selected.tagline}</div>
        </div>
        <button className="btn btn-light shrink-0" onClick={() => { tap(); onDone(); }}>
          <Check size={18} strokeWidth={2.6} /> Done
        </button>
      </div>
      <div className="relative max-w-6xl mx-auto">
      {/* Edge fades and arrows: computers can't swipe, so these (plus wheel and drag) move the row. */}
      <span className="arena-row-fade left" data-on={canLeft} aria-hidden="true" />
      <span className="arena-row-fade right" data-on={canRight} aria-hidden="true" />
      <button className="arena-row-arrow left" data-on={canLeft} aria-label="Previous arenas" tabIndex={canLeft ? 0 : -1} onClick={() => { tap(); page(-1); }}>
        <ChevronLeft size={22} strokeWidth={2.4} />
      </button>
      <button className="arena-row-arrow right" data-on={canRight} aria-label="More arenas" tabIndex={canRight ? 0 : -1} onClick={() => { tap(); page(1); }}>
        <ChevronRight size={22} strokeWidth={2.4} />
      </button>
      <div ref={row} {...dragProps} className="arena-row flex gap-3 overflow-x-auto no-scrollbar snap-x snap-proximity px-4 sm:px-8 pb-1 pt-2" role="radiogroup" aria-label="Arena">
        {ARENA_THEMES.map((a, i) => {
          const on = a.id === current;
          return (
            <motion.button
              key={a.id}
              role="radio"
              aria-checked={on}
              aria-label={a.name}
              className="arena-card snap-start shrink-0"
              data-selected={on}
              style={{ ['--accent-arena' as string]: a.accent }}
              animate={{ y: on ? -6 : 0 }}
              transition={spring}
              whileTap={{ scale: 0.97 }}
              onClick={() => { tap(); game.setArena(a.id); }}
            >
              <span className="arena-card-img" style={{ background: a.thumb }} />
              <span className="arena-card-shade" />
              <span className="arena-card-sweep" />
              <span className="arena-card-num tabular">{String(i + 1).padStart(2, '0')}</span>
              {on && (
                <motion.span layoutId="arena-selected" className="arena-card-badge" transition={spring}>
                  <Check size={12} strokeWidth={3} /> Selected
                </motion.span>
              )}
              <span className="arena-card-text">
                <span className="arena-card-name">{a.name}</span>
                <span className="arena-card-tag">{a.tagline}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      </div>
    </motion.div>
  );
}

/**
 * Sideways scrolling for a row of cards on every input: touch swipes natively; a mouse wheel scrolls it
 * sideways; click-and-drag scrolls it; `page(±1)` jumps by most of a screen (the arrow buttons).
 */
function useSideScroll(ref: React.RefObject<HTMLDivElement | null>) {
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const drag = React.useRef({ down: false, moved: false, x: 0, left: 0 });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    // A vertical wheel moves the row sideways (only while it can still move, so the page never feels stuck).
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    // Start with the selected arena in view.
    el.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('resize', update);
    };
  }, [ref]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  // Mouse click-and-drag (touch already scrolls natively). A drag never counts as a click on a card.
  const dragProps = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse' || !ref.current) return;
      drag.current = { down: true, moved: false, x: e.clientX, left: ref.current.scrollLeft };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.down || !ref.current) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 6) {
        d.moved = true;
        ref.current.setPointerCapture(e.pointerId);
        ref.current.classList.add('dragging');
      }
      if (d.moved) ref.current.scrollLeft = d.left - dx;
    },
    onPointerUp: () => {
      drag.current.down = false;
      ref.current?.classList.remove('dragging');
    },
    onPointerCancel: () => {
      drag.current.down = false;
      ref.current?.classList.remove('dragging');
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (drag.current.moved) {
        e.stopPropagation();
        e.preventDefault();
        drag.current.moved = false;
      }
    },
  };

  return { canLeft, canRight, page, dragProps };
}
