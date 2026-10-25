import React, { Component, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { game } from './game/GameController.ts';
import { useStore } from './game/store.ts';
import { STORAGE_KEYS } from './config/gameConfig.ts';
import { useControls } from './input/useControls.ts';
import { LoadingScreen } from './ui/LoadingScreen.tsx';
import { MainMenu } from './ui/MainMenu.tsx';
import { Hud } from './ui/Hud.tsx';
import { GameOver } from './ui/GameOver.tsx';
import { SettingsSheet } from './ui/SettingsSheet.tsx';
import { HowToPlay } from './ui/HowToPlay.tsx';
import { ArenaLoading, ConfirmDialog, NameSheet, PauseMenu, PromotionPicker, Toasts } from './ui/Dialogs.tsx';

/** Mounts the WebGL scene once for the lifetime of the app (it is lazy-loaded to keep first paint fast). */
function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let scene: { dispose(): void } | null = null;
    import('./render/ChessScene.ts')
      .then(({ ChessScene }) => {
        if (disposed || !ref.current) return;
        try {
          scene = new ChessScene(ref.current, game);
        } catch (err) {
          console.error('WebGL initialisation failed', err);
          game.setWebglFailed();
        }
      })
      .catch(err => {
        console.error('Failed to load renderer', err);
        game.setWebglFailed();
      });
    return () => {
      disposed = true;
      scene?.dispose();
    };
  }, []);
  return <div ref={ref} className="fixed inset-0" aria-hidden="true" />;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 grid place-items-center p-8 text-center">
        <div>
          <h1 className="t-title1">Something went wrong</h1>
          <p className="t-subhead c-2 mt-2 max-w-sm">The game hit an unexpected error. Your settings and records are safe.</p>
          <button className="btn btn-primary mt-6" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const screen = useStore(game.store, s => s.screen);
  const paused = useStore(game.store, s => s.paused);
  const settings = useStore(game.store, s => ({ textSize: s.settings.textSize, reducedMotion: s.settings.reducedMotion }));
  const webglFailed = useStore(game.store, s => s.webglFailed);
  const blocking = useStore(game.store, s => !!s.promotion || !!s.confirm);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.textSize = settings.textSize;
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  }, [settings.textSize, settings.reducedMotion]);

  // First launch: ask for a name once the menu is visible.
  useEffect(() => {
    if (screen !== 'menu') return;
    let onboarded = false;
    try {
      onboarded = !!localStorage.getItem(STORAGE_KEYS.onboarded) || !!localStorage.getItem(STORAGE_KEYS.playerName);
    } catch { /* ignore */ }
    if (!onboarded) {
      setFirstRun(true);
      setNameOpen(true);
    }
  }, [screen]);

  const anyModal = settingsOpen || helpOpen || nameOpen || paused || blocking;

  useControls({
    enabled: screen === 'playing' && !anyModal,
    onPause: () => {
      if (screen === 'playing' && !game.state.replay.active) game.setPaused(!paused);
    },
    onEscape: () => {
      if (game.state.confirm) return game.resolveConfirm(false);
      if (game.state.promotion) return game.choosePromotion(null);
      if (settingsOpen) return setSettingsOpen(false);
      if (helpOpen) return setHelpOpen(false);
      if (nameOpen && !firstRun) return setNameOpen(false);
      if (game.state.replay.active) return game.closeReplay();
      if (game.state.selected !== null) return game.clearSelection();
      if (screen === 'playing') game.setPaused(!paused);
    },
  });

  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
      <ErrorBoundary>
        <Stage />
        <AnimatePresence>{(screen === 'loading' || webglFailed) && <LoadingScreen key="loading" failed={webglFailed} />}</AnimatePresence>
        <AnimatePresence>
          {screen === 'menu' && !webglFailed && (
            <MainMenu key="menu" onOpenSettings={() => setSettingsOpen(true)} onOpenHelp={() => setHelpOpen(true)} onEditName={() => { setFirstRun(false); setNameOpen(true); }} />
          )}
        </AnimatePresence>
        {screen === 'playing' && <Hud onPause={() => game.setPaused(true)} />}
        <GameOver />
        <PromotionPicker />
        <PauseMenu
          open={paused}
          onResume={() => game.setPaused(false)}
          onSettings={() => setSettingsOpen(true)}
          onHelp={() => setHelpOpen(true)}
        />
        <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <HowToPlay open={helpOpen} onClose={() => setHelpOpen(false)} />
        <NameSheet open={nameOpen} firstRun={firstRun} onClose={() => { setNameOpen(false); setFirstRun(false); }} />
        <ConfirmDialog />
        <ArenaLoading />
        <Toasts />
      </ErrorBoundary>
    </MotionConfig>
  );
}

if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __chess: unknown }).__chess = game.debugApi();
}
