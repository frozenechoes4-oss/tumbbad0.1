import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameModals } from './components/GameModals';
import { detectAutoInputMode, MAX_DECOYS, REQUIRED_COINS } from './game/rules';
import { TumbbadEngine } from './game/TumbbadEngine';
import type { GamePhase, HudSnapshot, RunSummary } from './game/types';

function getInitialHud(): HudSnapshot {
  const hasCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;

  return {
    coins: 0,
    requiredCoins: REQUIRED_COINS,
    totalCoins: 8,
    decoys: MAX_DECOYS,
    maxDecoys: MAX_DECOYS,
    stance: 'standing',
    monsterState: 'PATROL',
    decoyTimeLeft: 0,
    lightWarning: false,
    lightExposureRatio: 0,
    promptText: null,
    canInteract: false,
    inCavern: false,
    elapsedSeconds: 0,
    inputMode: detectAutoInputMode({
      hasCoarsePointer,
      maxTouchPoints,
      viewportWidth,
      recentTouch: false,
    }),
    jumpscareActive: false,
    jumpscareKind: null,
    horrorTension: 0,
  };
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TumbbadEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [hud, setHud] = useState<HudSnapshot>(() => getInitialHud());
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    document.body.dataset.state = 'title';

    const engine = new TumbbadEngine(mountEl, {
      onPhaseChange: (nextPhase) => setPhase(nextPhase),
      onHudUpdate: (snapshot) => setHud(snapshot),
      onRunEnd: (summary) => setRunSummary(summary),
      onMuteChange: (isMuted) => setMuted(isMuted),
    });

    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startNewRun(false);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    setRunSummary(null);
    engineRef.current?.startNewRun(true);
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resumeGame();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.pauseGame();
  }, []);

  const handleRestart = useCallback(() => {
    setRunSummary(null);
    engineRef.current?.startNewRun(true);
  }, []);

  const handleReturnTitle = useCallback(() => {
    setRunSummary(null);
    engineRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    engineRef.current?.setTouchMove(x, y);
  }, []);

  const handleLookDelta = useCallback((dx: number, dy: number) => {
    engineRef.current?.applyLookDelta(dx, dy);
  }, []);

  const handleToggleSprint = useCallback((active: boolean) => {
    engineRef.current?.setTouchSprint(active);
  }, []);

  const handleToggleCrouch = useCallback(() => {
    engineRef.current?.toggleCrouch();
  }, []);

  const handleThrowDecoy = useCallback(() => {
    engineRef.current?.throwDoughDecoy();
  }, []);

  const handleInteract = useCallback(() => {
    engineRef.current?.tryInteract();
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#060303]">
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Tumbbad 3D World Viewport"
      />

      {phase === 'playing' && (
        <GameHud
          hud={hud}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onRestart={handleRestart}
          onTouchMove={handleTouchMove}
          onLookDelta={handleLookDelta}
          onToggleSprint={handleToggleSprint}
          onToggleCrouch={handleToggleCrouch}
          onThrowDecoy={handleThrowDecoy}
          onInteract={handleInteract}
        />
      )}

      <GameModals
        phase={phase}
        inputMode={hud.inputMode}
        runSummary={runSummary}
        onStart={handleStart}
        onResume={handleResume}
        onRestart={handleRestart}
        onReturnTitle={handleReturnTitle}
      />
    </main>
  );
}
