import React, { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { PieceColor, PieceType } from '../engine/chess.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { hapticTap } from '../utils/haptics.ts';

export const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;

export function tap() {
  soundEngine.playClickSound();
  hapticTap(8);
}

// ---------------------------------------------------------------- Segmented
export function Segmented<T extends string>({
  value, options, onChange, label, className = '',
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  label?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`seg ${className}`} role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => {
            if (o.value !== value) {
              tap();
              onChange(o.value);
            }
          }}
        >
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="seg-thumb" transition={spring} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Switch
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => {
        tap();
        onChange(!checked);
      }}
    />
  );
}

// ---------------------------------------------------------------- Slider
export function Slider({
  value, min = 0, max = 1, step = 0.01, onChange, label,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="slider"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--pct': `${pct}%` } as React.CSSProperties}
      onChange={e => onChange(parseFloat(e.target.value))}
    />
  );
}

// ---------------------------------------------------------------- Sheet / modal
export function Sheet({
  open, onClose, children, title, width = 520, dismissible = true, labelledBy,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  title?: string;
  width?: number;
  dismissible?: boolean;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Move focus into the dialog for keyboard and screen-reader users.
    const t = window.setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
      first?.focus({ preventScroll: true });
    }, 60);
    return () => {
      window.clearTimeout(t);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center [@media(max-height:520px)]:items-center [@media(max-height:520px)]:p-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div
            className="absolute inset-0 bg-black/45"
            style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={() => dismissible && onClose?.()}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={labelledBy ? undefined : title}
            aria-labelledby={labelledBy}
            className="glass-strong relative w-full flex flex-col max-h-[88dvh] sm:max-h-[84dvh] [@media(max-height:520px)]:max-h-[calc(100dvh-16px)] [@media(max-height:520px)]:rounded-[24px] rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
            style={{ maxWidth: width, paddingBottom: 'var(--safe-bottom)' }}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={spring}
          >
            {title && (
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <h2 className="t-title2">{title}</h2>
                {dismissible && onClose && (
                  <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Close" onClick={() => { tap(); onClose(); }}>
                    <X size={17} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            )}
            {/* Content scrolls when the screen is too short (e.g. a phone held sideways). */}
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto scroll-y">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- Piece icon
const PIECE_PATHS: Record<PieceType, string> = {
  p: 'M12 3.6a3.1 3.1 0 0 1 1.9 5.55c1.3.38 1.95 1.08 1.95 1.75h-1.6c.5 2.2 1.55 4.5 3 6.1V19h-10.5v-2c1.45-1.6 2.5-3.9 3-6.1H8.15c0-.67.65-1.37 1.95-1.75A3.1 3.1 0 0 1 12 3.6Z M6 19.6h12a.9.9 0 0 1 .9.9v.9H5.1v-.9a.9.9 0 0 1 .9-.9Z',
  r: 'M6.3 3.8h2.3v1.9h1.6V3.8h3.6v1.9h1.6V3.8h2.3v4.4l-1.6 1.4.7 7.5H7.2l.7-7.5-1.6-1.4Z M6 18.1h12a.9.9 0 0 1 .9.9v2.4H5.1V19a.9.9 0 0 1 .9-.9Z',
  n: 'M9.7 3.3l.9 1.6c3.4.6 6.3 3.6 6.8 8.2.25 2.2.15 4 0 5.1H8c.1-2.1 1.05-3.5 2.4-4.6 1-.8 1.5-1.7 1.6-2.7-.6.6-1.5.9-2.3.8l-1.2 1.6c-.4.5-1 .8-1.6.7l-1.3-.2c-.6-.1-1-.7-.8-1.3l.7-2c.4-1.5 1.3-3 2.6-4.1Z M6.4 18.6h11.2a.9.9 0 0 1 .9.9v1.9H5.5v-1.9a.9.9 0 0 1 .9-.9Z',
  b: 'M12 2.6a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm0 2.8c2.6 1.4 4 3.6 4 5.6 0 1.5-.8 2.6-1.9 3.2l.6 3.3H9.3l.6-3.3C8.8 13.6 8 12.5 8 11c0-2 1.4-4.2 4-5.6Zm.8 2.4-1.9 3.2h1.3l1.6-2.6Z M6 18.4h12a.9.9 0 0 1 .9.9v2.1H5.1v-2.1a.9.9 0 0 1 .9-.9Z',
  q: 'M4.2 6.6a1.3 1.3 0 1 1 1.6 1.2l1.6 5.1 2.3-6.2a1.3 1.3 0 1 1 1.3-.1L12 12l1-5.4a1.3 1.3 0 1 1 1.3.1l2.3 6.2 1.6-5.1a1.3 1.3 0 1 1 1.6-1.2c0 .5-.3.9-.7 1.1L17.3 17H6.7L4.9 7.7a1.2 1.2 0 0 1-.7-1.1Z M6 18.1h12a.9.9 0 0 1 .9.9v2.4H5.1V19a.9.9 0 0 1 .9-.9Z',
  k: 'M11.2 2.4h1.6v1.8h1.7v1.5h-1.7v1.5c3.4.3 5.6 2.2 5.6 4.6 0 1.9-1.3 3.4-2.6 4.7l.3.9H7.9l.3-.9C6.9 15.2 5.6 13.7 5.6 11.8c0-2.4 2.2-4.3 5.6-4.6V5.7H9.5V4.2h1.7Z M6 18.1h12a.9.9 0 0 1 .9.9v2.4H5.1V19a.9.9 0 0 1 .9-.9Z',
};

export function PieceIcon({ type, color, size = 18, className = '' }: { type: PieceType; color: PieceColor; size?: number; className?: string }) {
  const fill = color === 'w' ? '#f4f1ea' : '#1c1c22';
  const stroke = color === 'w' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={PIECE_PATHS[type]} fill={fill} stroke={stroke} strokeWidth={0.9} strokeLinejoin="round" fillRule="evenodd" />
    </svg>
  );
}

// ---------------------------------------------------------------- Logo
/** Chess Realms crest: silver rook and gold knight on a split shield (transparent PNG, square). */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}assets/logo.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="shrink-0 select-none"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

export function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
