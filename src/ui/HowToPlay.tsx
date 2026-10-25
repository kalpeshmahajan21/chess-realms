import React, { useState } from 'react';
import { Gamepad2, Keyboard, MousePointer2, Smartphone } from 'lucide-react';
import { Segmented, Sheet } from './kit.tsx';

type Tab = 'basics' | 'controls';

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('basics');
  return (
    <Sheet open={open} onClose={onClose} title="How to play" width={560}>
      <div className="px-6 pb-3">
        <Segmented label="Help section" value={tab} onChange={setTab} options={[{ value: 'basics', label: 'Basics' }, { value: 'controls', label: 'Controls' }]} />
      </div>
      <div className="scroll-y px-6 pb-7 space-y-4" style={{ minHeight: 320 }}>
        {tab === 'basics' ? (
          <>
            <Item title="Move a piece">Drag it to a square, or tap it and then tap the destination. Dots show quiet moves, rings show captures.</Item>
            <Item title="Win">Checkmate the opposing king. The game also ends on resignation, time-out, or a draw (stalemate, repetition, 50-move rule, insufficient material, or agreement).</Item>
            <Item title="Special moves">Castling, en passant and promotion are all supported. When a pawn reaches the last rank you choose its new piece.</Item>
            <Item title="Hints and undo">Stuck? Hint shows a suggested move. Undo takes back your last move (and the computer’s reply).</Item>
            <Item title="Highlights">Captures, checks and promotions are rated as they happen. After the game, watch the best ones replayed in 3D.</Item>
            <Item title="Online">Create a room, share the code, and your friend joins from their device. Moves sync instantly.</Item>
          </>
        ) : (
          <>
            <Controls icon={<MousePointer2 size={18} />} title="Mouse" rows={[['Click / drag', 'Select and move'], ['Drag empty space', 'Orbit camera'], ['Scroll', 'Zoom']]} />
            <Controls icon={<Smartphone size={18} />} title="Touch" rows={[['Tap / drag', 'Select and move'], ['Drag with one finger off the pieces', 'Orbit'], ['Pinch', 'Zoom']]} />
            <Controls
              icon={<Keyboard size={18} />}
              title="Keyboard"
              rows={[
                ['← ↑ → ↓', 'Move board cursor'],
                ['Enter', 'Select / move'],
                ['Space', 'Skip animation'],
                ['U · H · C', 'Undo · Hint · Camera view'],
                ['D · R', 'Offer draw · Resign'],
                ['M', 'Mute'],
                ['Esc', 'Pause / close'],
              ]}
            />
            <Controls icon={<Gamepad2 size={18} />} title="Gamepad" rows={[['D-pad / left stick', 'Move cursor'], ['A', 'Select / move'], ['B', 'Cancel'], ['X · Y', 'Hint · Camera view'], ['LB', 'Undo'], ['Start', 'Pause']]} />
          </>
        )}
      </div>
    </Sheet>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="t-headline">{title}</h3>
      <p className="t-subhead c-2 mt-1">{children}</p>
    </div>
  );
}

function Controls({ icon, title, rows }: { icon: React.ReactNode; title: string; rows: [string, string][] }) {
  return (
    <section>
      <div className="flex items-center gap-2 t-headline mb-2">
        {icon}
        {title}
      </div>
      <div className="group-card">
        {rows.map(([k, v]) => (
          <div key={k} className="row justify-between">
            <span className="t-subhead c-2">{v}</span>
            <span className="flex gap-1 flex-wrap justify-end">
              {k.split(' · ').map(part => (
                <span key={part} className="kbd">{part}</span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
