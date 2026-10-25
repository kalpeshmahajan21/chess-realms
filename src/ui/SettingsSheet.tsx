import React, { useState } from 'react';
import { game } from '../game/GameController.ts';
import { useStore } from '../game/store.ts';
import { resolveQuality } from '../config/quality.ts';
import type { CinematicMode, GameSettings, GraphicsQuality, PieceSetId, TextSize } from '../types.ts';
import { Segmented, Sheet, Slider, Switch } from './kit.tsx';

type Tab = 'game' | 'graphics' | 'audio' | 'access';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const st = useStore(game.store, s => s.settings);
  const [tab, setTab] = useState<Tab>('game');
  const set = (patch: Partial<GameSettings>) => game.updateSettings(patch);

  return (
    <Sheet open={open} onClose={onClose} title="Settings" width={540}>
      <div className="px-6 pb-3">
        <Segmented
          label="Settings section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'game', label: 'Game' },
            { value: 'graphics', label: 'Graphics' },
            { value: 'audio', label: 'Audio' },
            { value: 'access', label: 'Access' },
          ]}
        />
      </div>
      <div className="scroll-y px-6 pb-6 space-y-5" style={{ minHeight: 340 }}>
        {tab === 'game' && (
          <>
            <Group title="Board">
              <Row label="Show legal moves" hint="Dots for moves, rings for captures">
                <Switch label="Show legal moves" checked={st.showLegalMoves} onChange={v => set({ showLegalMoves: v })} />
              </Row>
              <Row label="Coordinates">
                <Switch label="Coordinates" checked={st.showCoordinates} onChange={v => set({ showCoordinates: v })} />
              </Row>
              <Row label="Rotate camera each turn" hint="Local two-player games">
                <Switch label="Rotate camera each turn" checked={st.autoRotateCamera} onChange={v => set({ autoRotateCamera: v })} />
              </Row>
              <Row label="Confirm before resigning">
                <Switch label="Confirm before resigning" checked={st.confirmResign} onChange={v => set({ confirmResign: v })} />
              </Row>
            </Group>
            <Group title="Cinematics">
              <Row
                label="Capture cinematics"
                hint={st.reducedMotion ? 'Paused while Reduce motion is on' : 'A short close-up on every capture · click or Space to skip'}
              >
                <Switch
                  label="Capture cinematics"
                  checked={st.cinematics !== 'off'}
                  onChange={v => set({ cinematics: (v ? 'all' : 'off') as CinematicMode })}
                />
              </Row>
            </Group>
            <Group title="Piece set">
              <div className="p-3">
                <Segmented<PieceSetId>
                  label="Piece set"
                  value={st.pieceSet}
                  onChange={v => set({ pieceSet: v })}
                  options={[
                    { value: 'staunton', label: 'Tournament Staunton' },
                    { value: 'warrior', label: 'Gilded Warriors' },
                  ]}
                />
              </div>
            </Group>
          </>
        )}

        {tab === 'graphics' && (
          <>
            <Group title="Quality">
              <div className="p-3">
                <Segmented<GraphicsQuality>
                  label="Graphics quality"
                  value={st.graphicsQuality}
                  onChange={v => set({ graphicsQuality: v })}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                  ]}
                />
                <p className="t-footnote c-3 mt-2 px-1">
                  {st.graphicsQuality === 'auto' ? `Auto picked ${resolveQuality('auto')} for this device. ` : ''}
                  Resolution also adapts automatically to keep play smooth.
                </p>
              </div>
            </Group>
            <Group title="Atmosphere">
              <Row label="Ambient effects" hint="Petals, embers, dust and arena animation">
                <Switch label="Ambient effects" checked={st.ambientEffects} onChange={v => set({ ambientEffects: v })} />
              </Row>
            </Group>
          </>
        )}

        {tab === 'audio' && (
          <Group title="Volume">
            <Row label="Mute all">
              <Switch label="Mute all" checked={st.muted} onChange={v => set({ muted: v })} />
            </Row>
            <SliderRow label="Master" value={st.masterVolume} onChange={v => set({ masterVolume: v })} disabled={st.muted} />
            <SliderRow label="Music & ambience" value={st.musicVolume} onChange={v => set({ musicVolume: v })} disabled={st.muted} />
            <SliderRow label="Sound effects" value={st.sfxVolume} onChange={v => set({ sfxVolume: v })} disabled={st.muted} />
          </Group>
        )}

        {tab === 'access' && (
          <>
            <Group title="Motion">
              <Row label="Reduce motion" hint="Instant moves, no cinematics, shake or idle drift">
                <Switch label="Reduce motion" checked={st.reducedMotion} onChange={v => set({ reducedMotion: v })} />
              </Row>
              <Row label="Haptics" hint="Vibration on supported phones">
                <Switch label="Haptics" checked={st.haptics} onChange={v => set({ haptics: v })} />
              </Row>
            </Group>
            <Group title="Visibility">
              <Row label="High-visibility move hints" hint="Large green dots and red capture rings">
                <Switch label="High-visibility move hints" checked={st.highVisibilityHints} onChange={v => set({ highVisibilityHints: v })} />
              </Row>
              <div className="row">
                <span className="row-label t-body">Text size</span>
                <Segmented<TextSize>
                  label="Text size"
                  className="w-[210px]"
                  value={st.textSize}
                  onChange={v => set({ textSize: v })}
                  options={[
                    { value: 'small', label: 'A−' },
                    { value: 'default', label: 'A' },
                    { value: 'large', label: 'A+' },
                  ]}
                />
              </div>
            </Group>
            <Group title="Camera">
              <SliderRow label="Orbit sensitivity" value={st.cameraSensitivity} min={0.4} max={2} onChange={v => set({ cameraSensitivity: v })} format={v => `${v.toFixed(1)}×`} />
            </Group>
          </>
        )}
      </div>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="t-overline c-3 mb-2 px-1">{title}</div>
      <div className="group-card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">
        <div className="t-body">{label}</div>
        {hint && <div className="t-footnote c-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function SliderRow({ label, value, onChange, min = 0, max = 1, disabled, format }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean; format?: (v: number) => string }) {
  return (
    <div className="row" style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : undefined }}>
      <div className="row-label">
        <div className="flex justify-between">
          <span className="t-body">{label}</span>
          <span className="t-subhead c-2 tabular">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
        </div>
        <Slider label={label} value={value} min={min} max={max} step={0.01} onChange={onChange} />
      </div>
    </div>
  );
}
