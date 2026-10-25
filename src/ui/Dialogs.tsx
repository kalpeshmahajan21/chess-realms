import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, Home, Play, RotateCcw, Settings } from 'lucide-react';
import { game } from '../game/GameController.ts';
import { useStore } from '../game/store.ts';
import type { PieceType } from '../types.ts';
import { PieceIcon, Sheet, spring, tap } from './kit.tsx';
import { STORAGE_KEYS } from '../config/gameConfig.ts';

// ---------------------------------------------------------------- pause
export function PauseMenu({ open, onResume, onSettings, onHelp }: { open: boolean; onResume: () => void; onSettings: () => void; onHelp: () => void }) {
  const mode = useStore(game.store, s => s.mode);
  const item = (icon: React.ReactNode, label: string, onClick: () => void, variant = 'btn-secondary') => (
    <button className={`btn ${variant} btn-lg btn-block justify-start`} onClick={() => { tap(); onClick(); }}>
      {icon}
      {label}
    </button>
  );
  return (
    <Sheet open={open} onClose={onResume} width={380}>
      <div className="p-6 pt-7 space-y-2.5">
        <h2 className="t-title2 text-center mb-1">Paused</h2>
        <p className="t-footnote c-2 text-center mb-5">{mode === 'online' ? 'Your clock keeps running in online games.' : 'The clock is stopped.'}</p>
        {item(<Play size={19} />, 'Resume', onResume, 'btn-light')}
        {mode !== 'online' &&
          item(<RotateCcw size={19} />, 'Restart match', () =>
            game.ask({
              title: 'Restart the match?',
              message: 'The current game will be lost.',
              confirmLabel: 'Restart',
              destructive: true,
              onConfirm: () => {
                onResume();
                game.startMatch();
              },
            })
          )}
        {item(<Settings size={19} />, 'Settings', onSettings)}
        {item(<HelpCircle size={19} />, 'How to play', onHelp)}
        {item(<Home size={19} />, 'Quit to menu', () =>
          game.ask({
            title: 'Leave this game?',
            message: mode === 'online' ? 'You will disconnect from the room.' : 'Progress in this game will be lost.',
            confirmLabel: 'Leave',
            destructive: true,
            onConfirm: () => {
              onResume();
              game.toMenu();
            },
          }),
          'btn-danger'
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- promotion
export function PromotionPicker() {
  const promo = useStore(game.store, s => s.promotion);
  const choices: { t: PieceType; label: string }[] = [
    { t: 'q', label: 'Queen' },
    { t: 'r', label: 'Rook' },
    { t: 'b', label: 'Bishop' },
    { t: 'n', label: 'Knight' },
  ];
  return (
    <Sheet open={!!promo} onClose={() => game.choosePromotion(null)} width={440} title="Promote pawn">
      <div className="grid grid-cols-4 gap-2.5 px-6 pb-6">
        {promo &&
          choices.map((c, i) => (
            <motion.button
              key={c.t}
              className="choice flex flex-col items-center py-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: i * 0.04 }}
              onClick={() => { tap(); game.choosePromotion(c.t); }}
              autoFocus={i === 0}
            >
              <PieceIcon type={c.t} color={promo.color} size={46} />
              <span className="t-footnote mt-1.5">{c.label}</span>
            </motion.button>
          ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- confirm
export function ConfirmDialog() {
  const req = useStore(game.store, s => s.confirm);
  return (
    <AnimatePresence>
      {req && (
        <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => game.resolveConfirm(false)} />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="glass-strong relative rounded-[22px] w-full max-w-[300px] overflow-hidden text-center"
            initial={{ scale: 1.08, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={spring}
          >
            <div className="px-5 pt-5 pb-4">
              <h3 id="confirm-title" className="t-headline">{req.title}</h3>
              <p className="t-footnote c-2 mt-1.5">{req.message}</p>
            </div>
            <div className="grid grid-cols-2" style={{ borderTop: 'var(--hairline)' }}>
              <button className="h-12 t-body hover:bg-white/5" style={{ color: 'var(--accent)', borderRight: 'var(--hairline)' }} onClick={() => { tap(); game.resolveConfirm(false); }}>
                {req.cancelLabel ?? 'Cancel'}
              </button>
              <button
                autoFocus
                className="h-12 t-body font-semibold hover:bg-white/5"
                style={{ color: req.destructive ? 'var(--red)' : 'var(--accent)' }}
                onClick={() => { tap(); game.resolveConfirm(true); }}
              >
                {req.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- arena loading
export function ArenaLoading() {
  const loading = useStore(game.store, s => s.arenaLoading && s.screen !== 'loading');
  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          className="fixed left-1/2 z-[66] -translate-x-1/2 glass-strong rounded-full px-4 h-9 flex items-center gap-2.5 t-subhead font-medium pointer-events-none"
          style={{ top: 'calc(var(--safe-top) + 84px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="status"
        >
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          Loading arena…
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- toasts
export function Toasts() {
  const toasts = useStore(game.store, s => s.toasts);
  return (
    <div className="fixed left-0 right-0 z-[65] flex flex-col items-center gap-2 pointer-events-none" style={{ top: 'calc(var(--safe-top) + 84px)' }} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            layout
            className="glass-strong rounded-full px-4 py-2 t-subhead font-medium max-w-[90vw] text-center"
            style={t.tone === 'warning' ? { color: '#ffd9a8' } : t.tone === 'success' ? { color: '#c9f5d4' } : undefined}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={spring}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- name / onboarding
export function NameSheet({ open, onClose, firstRun }: { open: boolean; onClose: () => void; firstRun: boolean }) {
  const current = useStore(game.store, s => s.p1.name);
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName(current === 'Player 1' ? '' : current);
  }, [open, current]);
  const save = () => {
    const n = name.trim();
    if (!n) return;
    tap();
    game.updatePlayer('p1', { name: n });
    try {
      localStorage.setItem(STORAGE_KEYS.onboarded, '1');
    } catch { /* ignore */ }
    onClose();
  };
  return (
    <Sheet open={open} onClose={firstRun ? undefined : onClose} dismissible={!firstRun} width={420}>
      <form className="p-7" onSubmit={e => { e.preventDefault(); save(); }}>
        <h2 className="t-title1">{firstRun ? 'Welcome to Chess Realms' : 'Your name'}</h2>
        <p className="t-subhead c-2 mt-2">{firstRun ? 'What should we call you? Your name appears on the board and in your records.' : 'Records are kept per name on this device.'}</p>
        <input className="field mt-6" autoFocus value={name} maxLength={18} placeholder="Your name" aria-label="Your name" onChange={e => setName(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-lg btn-block mt-4" disabled={!name.trim()}>
          {firstRun ? 'Continue' : 'Save'}
        </button>
        {firstRun && (
          <button type="button" className="btn btn-ghost btn-block mt-1" onClick={() => { setName('Player'); game.updatePlayer('p1', { name: 'Player' }); try { localStorage.setItem(STORAGE_KEYS.onboarded, '1'); } catch { /* ignore */ } onClose(); }}>
            Skip for now
          </button>
        )}
      </form>
    </Sheet>
  );
}
