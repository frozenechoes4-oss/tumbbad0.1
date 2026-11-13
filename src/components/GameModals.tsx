import { formatRunTime } from '../game/rules';
import type { GamePhase, RunSummary } from '../game/types';
import { TumbbadCrest } from './GameIcons';

interface GameModalsProps {
  phase: GamePhase;
  runSummary: RunSummary | null;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export function GameModals({
  phase,
  runSummary,
  onStart,
  onResume,
  onRestart,
  onReturnTitle,
}: GameModalsProps) {
  if (phase === 'playing') return null;

  if (phase === 'title') {
    return (
      <div
        className="fixed inset-0 z-20 flex flex-col justify-between px-8 py-10 sm:px-16 sm:py-12"
        style={{
          background:
            'radial-gradient(circle at 65% 45%, rgba(16, 4, 4, 0.25) 0%, rgba(5, 2, 2, 0.88) 72%)',
        }}
      >
        <div className="max-w-xl my-auto">
          <TumbbadCrest className="w-16 h-16 mb-5" />
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-[0.08em] text-[#e8bf58] hud-stroke text-balance leading-[1.08]">
            Tumbbad: The Womb
          </h1>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#cbbca4] max-w-lg">
            Descend beneath the storm-swept courtyard into the crimson womb. Gather five cursed Gold Mudras, cast wheat dough dolls to lure Hastar, and never let your lantern linger upon his face.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="font-display px-8 py-3.5 rounded border text-base tracking-[0.18em] uppercase font-bold text-[#fff8e6] cursor-pointer transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-[#ffd35c]"
              style={{
                background: '#6e4914',
                borderColor: '#d4af37',
                boxShadow: '0 8px 28px rgba(0, 0, 0, 0.75)',
              }}
            >
              Enter The Womb
            </button>
          </div>
        </div>

        <div className="text-xs sm:text-sm text-[#9d8d75] tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
          WASD Move · Shift Sprint · C Crouch · E Collect / Unlock · F Throw Dough · Esc Pause
        </div>
      </div>
    );
  }

  if (phase === 'paused') {
    return (
      <div
        className="fixed inset-0 z-20 flex items-center justify-center p-6"
        style={{ background: 'rgba(4, 2, 2, 0.76)' }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-title"
          className="w-full max-w-md rounded border p-8 text-center"
          style={{
            background: 'rgba(14, 7, 6, 0.96)',
            borderColor: 'rgba(148, 114, 58, 0.5)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9)',
          }}
        >
          <h2 id="pause-title" className="font-display text-3xl tracking-[0.14em] text-[#e8bf58]">
            Paused
          </h2>
          <p className="mt-2 text-sm text-[#b4a48c]">
            The rain waits above the shaft.
          </p>

          <div className="mt-7 flex flex-col gap-3">
            <button
              type="button"
              onClick={onResume}
              className="font-display py-3 px-6 rounded border text-sm tracking-[0.16em] uppercase font-bold text-[#fff8e6] cursor-pointer hover:brightness-110 transition"
              style={{ background: '#6e4914', borderColor: '#d4af37' }}
            >
              Resume Descent
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="font-display py-2.5 px-6 rounded border text-sm tracking-[0.14em] uppercase text-[#dfd2bc] hover:text-[#ffd35c] cursor-pointer transition"
              style={{ background: 'rgba(28, 15, 12, 0.85)', borderColor: 'rgba(148, 114, 58, 0.4)' }}
            >
              Restart Run
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="font-display py-2.5 px-6 rounded border text-sm tracking-[0.14em] uppercase text-[#a9987c] hover:text-[#dfd2bc] cursor-pointer transition"
              style={{ background: 'transparent', borderColor: 'rgba(110, 86, 56, 0.3)' }}
            >
              Return to Title
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isVictory = runSummary?.outcome === 'victory';

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center p-6"
      style={{
        background: isVictory ? 'rgba(12, 9, 4, 0.8)' : 'rgba(22, 3, 3, 0.85)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-title"
        className="w-full max-w-lg rounded border p-8 text-center"
        style={{
          background: 'rgba(14, 7, 6, 0.96)',
          borderColor: isVictory ? 'rgba(212, 175, 55, 0.6)' : 'rgba(179, 32, 32, 0.65)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.92)',
        }}
      >
        <h2
          id="end-title"
          className="font-display text-3xl sm:text-4xl font-bold tracking-[0.12em] uppercase"
          style={{ color: isVictory ? '#ffd35c' : '#d93636' }}
        >
          {isVictory ? 'Escaped The Womb' : 'Consumed By Greed'}
        </h2>

        <p className="mt-3 text-base leading-relaxed text-[#cbbca4]">
          {runSummary?.reason}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3 border-y border-[#4a3723]/60 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#9c8c72]">Mudras</div>
            <div className="font-mono-num text-xl font-bold text-[#ffd35c] mt-0.5">
              {runSummary?.coins ?? 0} / {runSummary?.requiredCoins ?? 5}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#9c8c72]">Time</div>
            <div className="font-mono-num text-xl font-bold text-[#e6dccb] mt-0.5">
              {formatRunTime(runSummary?.elapsedSeconds ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#9c8c72]">Dough Used</div>
            <div className="font-mono-num text-xl font-bold text-[#e6ca9b] mt-0.5">
              {runSummary?.decoysUsed ?? 0}
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="w-full sm:w-auto font-display py-3 px-7 rounded border text-sm tracking-[0.16em] uppercase font-bold text-[#fff8e6] cursor-pointer hover:brightness-110 transition"
            style={{ background: '#6e4914', borderColor: '#d4af37' }}
          >
            {isVictory ? 'Brave Greed Again' : 'Descend Again'}
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full sm:w-auto font-display py-3 px-6 rounded border text-sm tracking-[0.14em] uppercase text-[#b4a48c] hover:text-[#dfd2bc] cursor-pointer transition"
            style={{ background: 'rgba(24, 13, 11, 0.85)', borderColor: 'rgba(110, 86, 56, 0.4)' }}
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
}
