import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Eye, Film, Handshake, Home, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { game } from '../game/GameController.ts';
import { useStore } from '../game/store.ts';
import { softSpring, spring, tap } from './kit.tsx';

export function GameOver() {
  const s = useStore(game.store, st => ({
    screen: st.screen,
    result: st.result,
    plies: st.sanHistory.length,
    captured: st.captured,
    mode: st.mode,
    p1: st.p1,
    p2: st.p2,
    p1Record: st.p1Record,
    h2h: st.h2h,
    momentsCount: st.moments.length,
  }));
  const [peek, setPeek] = useState(false);
  const open = s.screen === 'gameover' && !!s.result;
  const r = s.result;
  const reel = open ? game.highlightReel : [];

  const title = !r ? '' : r.outcome === 'win' ? 'Victory' : r.outcome === 'loss' ? 'Defeat' : r.outcome === 'draw' || !r.winner ? 'Draw' : `${r.winnerName} wins`;
  const icon = !r ? null : r.outcome === 'win' ? <Trophy size={30} /> : r.outcome === 'loss' ? <XCircle size={30} /> : !r.winner ? <Handshake size={30} /> : <Crown size={30} />;
  const tint = !r ? '#fff' : r.outcome === 'win' ? '#ffd166' : r.outcome === 'loss' ? '#ff8a80' : !r.winner ? '#a0c4ff' : '#ffd166';

  return (
    <AnimatePresence>
      {open && !peek && (
        <motion.div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-6 [@media(max-height:520px)]:items-center [@media(max-height:520px)]:p-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 60% at 50% 50%, rgba(0,0,0,0.25), rgba(0,0,0,0.6))' }} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="go-title"
            className="glass-strong relative w-full sm:max-w-[440px] rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-7 max-h-[100dvh] overflow-y-auto scroll-y [@media(max-height:520px)]:max-h-[calc(100dvh-16px)] [@media(max-height:520px)]:rounded-[24px] [@media(max-height:520px)]:p-5"
            style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}
            initial={{ y: 60, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={softSpring}
          >
            <motion.div
              className="w-16 h-16 rounded-[20px] grid place-items-center mx-auto"
              style={{ background: `${tint}22`, color: tint, boxShadow: `0 0 40px ${tint}33` }}
              initial={{ scale: 0.4, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...spring, delay: 0.1 }}
            >
              {icon}
            </motion.div>
            <h2 id="go-title" className="t-large text-center mt-4">{title}</h2>
            <p className="t-subhead c-2 text-center mt-1.5">
              {r?.title}
              {r?.description ? ` · ${r.description}` : ''}
            </p>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <Stat label="Moves" value={Math.ceil(s.plies / 2)} />
              <Stat label="Captures" value={`${s.captured.white.length}–${s.captured.black.length}`} />
              <Stat label="Material" value={s.captured.materialAdvantage === 0 ? 'Even' : `${s.captured.materialAdvantage > 0 ? 'W' : 'B'} +${Math.abs(s.captured.materialAdvantage)}`} />
            </div>

            <div className="group-card mt-3 px-4 py-3 flex items-center justify-between">
              <div>
                <div className="t-footnote c-3">{s.p1.name}'s record</div>
                <div className="t-headline tabular">{s.p1Record.wins}W · {s.p1Record.losses}L · {s.p1Record.draws}D</div>
              </div>
              <div className="text-right">
                <div className="t-footnote c-3">Head to head</div>
                <div className="t-headline tabular">{s.h2h.p1Wins} – {s.h2h.p2Wins}{s.h2h.draws ? ` (${s.h2h.draws}=)` : ''}</div>
              </div>
            </div>

            {reel[0] && (
              <div className="mt-3 t-footnote c-2 text-center">
                Best moment: <span className="text-white">{reel.slice().sort((a, b) => b.dramaScore - a.dramaScore)[0].caption}</span>
              </div>
            )}

            <div className="mt-6 space-y-2">
              <button className="btn btn-primary btn-lg btn-block" autoFocus onClick={() => { tap(); game.rematch(); }}>
                <RotateCcw size={19} /> Rematch
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button className="btn btn-secondary" disabled={reel.length === 0} onClick={() => { tap(); game.openReplay(); }}>
                  <Film size={17} /> <span className="hidden sm:inline">Highlights</span>
                </button>
                <button className="btn btn-secondary" onClick={() => { tap(); setPeek(true); }}>
                  <Eye size={17} /> <span className="hidden sm:inline">Board</span>
                </button>
                <button className="btn btn-secondary" onClick={() => { tap(); game.toMenu(); }}>
                  <Home size={17} /> <span className="hidden sm:inline">Menu</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      {open && peek && (
        <motion.div className="fixed inset-x-0 z-40 flex justify-center" style={{ bottom: 'calc(var(--safe-bottom) + 20px)' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
          <button className="btn btn-light" onClick={() => { tap(); setPeek(false); }}>
            Back to results
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="group-card py-3 text-center">
      <div className="t-title3 tabular">{value}</div>
      <div className="t-caption c-3 mt-0.5">{label}</div>
    </div>
  );
}
