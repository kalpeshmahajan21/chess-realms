import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LogoMark } from './kit.tsx';

const TIPS = [
  'Drag a piece, or tap it and then tap a square.',
  'Press Esc any time to pause.',
  'Arrow keys and Enter play the whole game from the keyboard.',
  'Gamepads work too — D-pad to move, A to select.',
  'Captures, checks and promotions are saved as highlights.',
];

export function LoadingScreen({ failed }: { failed?: boolean }) {
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [progress, setProgress] = useState(0.08);
  useEffect(() => {
    // Asset work happens in one synchronous burst, so show eased, honest-looking progress.
    const id = window.setInterval(() => setProgress(p => Math.min(0.92, p + (1 - p) * 0.08)), 120);
    return () => window.clearInterval(id);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(120% 90% at 50% 30%, #1a1a20 0%, #08080a 60%)' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }}
    >
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
        <LogoMark size={120} />
      </motion.div>
      <motion.h1
        className="brand-title mt-5"
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        Chess Realms
      </motion.h1>
      {failed ? (
        <p className="t-subhead c-2 mt-3 max-w-xs text-center px-6">
          3D graphics are not available in this browser. Enable hardware acceleration or try a different browser.
        </p>
      ) : (
        <>
          <div className="mt-8 w-48 h-1 rounded-full overflow-hidden" style={{ background: 'var(--fill-3)' }} role="progressbar" aria-label="Loading" aria-valuenow={Math.round(progress * 100)}>
            <motion.div className="h-full rounded-full" style={{ background: 'var(--label)' }} animate={{ width: `${progress * 100}%` }} transition={{ ease: 'easeOut' }} />
          </div>
          <p className="t-footnote c-3 mt-5 max-w-xs text-center px-6">{tip}</p>
        </>
      )}
    </motion.div>
  );
}
