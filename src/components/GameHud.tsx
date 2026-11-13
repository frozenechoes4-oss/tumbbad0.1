import { formatRunTime } from '../game/rules';
import type { HudSnapshot } from '../game/types';
import { DoughDollIcon, MudraIcon, PauseIcon, RestartIcon, SoundIcon } from './GameIcons';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

export function GameHud({ hud, muted, onToggleMute, onPause, onRestart }: GameHudProps) {
  const isDanger = hud.monsterState === 'CHASE';
  const isDecoy = hud.monsterState === 'DECOY';

  const stanceLabel =
    hud.stance === 'crouching'
      ? 'Crouching · Silent'
      : hud.stance === 'sprinting'
      ? 'Sprinting · Loud'
      : 'Standing · Quiet';

  const monsterLabel = isDanger
    ? 'Hastar · Hunting You'
    : isDecoy
    ? `Hastar · Devouring Dough (${Math.ceil(hud.decoyTimeLeft)}s)`
    : hud.inCavern
    ? 'Hastar · Prowling the Womb'
    : 'Hastar · Dormant Below';

  return (
    <div
      className="fixed inset-0 pointer-events-none z-10"
      style={{
        boxShadow: isDanger
          ? 'inset 0 0 160px rgba(155, 10, 10, 0.85)'
          : 'inset 0 0 120px rgba(0, 0, 0, 0.9)',
        transition: 'box-shadow 0.25s ease',
      }}
    >
      {/* Top-Left Compact Status Cluster */}
      <div
        className="absolute top-5 left-6 px-4 py-3 rounded border"
        style={{
          background: 'rgba(12, 6, 5, 0.82)',
          borderColor: isDanger ? 'rgba(195, 36, 36, 0.65)' : 'rgba(148, 114, 58, 0.42)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.78)',
        }}
      >
        {/* Gold Mudras Row */}
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#a9987c]">
              Gold Mudras
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="font-mono-num text-2xl font-bold text-[#ffd35c] hud-stroke"
                data-testid="hud-coins"
              >
                {hud.coins}
              </span>
              <span className="font-mono-num text-sm text-[#9c8c72]">/ {hud.requiredCoins}</span>
              <div className="flex items-center gap-1 ml-1">
                {Array.from({ length: hud.requiredCoins }).map((_, idx) => (
                  <MudraIcon key={idx} filled={idx < hud.coins} className="w-4 h-4" />
                ))}
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-[#4a3723]/70" />

          {/* Dough Decoys Row */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#a9987c]">
              Dough Dolls [F]
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="font-mono-num text-lg font-bold text-[#e6ca9b] mr-1"
                data-testid="hud-decoys"
              >
                {hud.decoys}
              </span>
              {Array.from({ length: hud.maxDecoys }).map((_, idx) => (
                <DoughDollIcon key={idx} active={idx < hud.decoys} className="w-4 h-4" />
              ))}
            </div>
          </div>
        </div>

        {/* Quiet Stance & Hastar Status */}
        <div className="mt-2 pt-2 border-t border-[#4a3723]/55 flex items-center gap-2 text-xs">
          <span
            className={
              hud.stance === 'sprinting'
                ? 'text-[#ff7854] font-semibold'
                : hud.stance === 'crouching'
                ? 'text-[#a3d49c]'
                : 'text-[#cabda6]'
            }
            data-testid="hud-stance"
          >
            {stanceLabel}
          </span>
          <span aria-hidden="true" className="text-[#695642]">
            ·
          </span>
          <span
            className={
              isDanger
                ? 'text-[#ff4a4a] font-semibold'
                : isDecoy
                ? 'text-[#ffd35c]'
                : 'text-[#a9987c]'
            }
            data-testid="hud-monster"
          >
            {monsterLabel}
          </span>
        </div>
      </div>

      {/* Top-Right Compact Utility Controls */}
      <div className="absolute top-5 right-6 flex items-center gap-2 pointer-events-auto">
        <div
          className="px-2.5 py-1.5 rounded border text-xs font-mono-num text-[#cabda6]"
          style={{
            background: 'rgba(12, 6, 5, 0.78)',
            borderColor: 'rgba(148, 114, 58, 0.35)',
          }}
        >
          {formatRunTime(hud.elapsedSeconds)}
        </div>

        <button
          type="button"
          tabIndex={-1}
          aria-label={muted ? 'Unmute audio [M]' : 'Mute audio [M]'}
          title={muted ? 'Unmute [M]' : 'Mute [M]'}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          className="w-9 h-9 flex items-center justify-center rounded border text-[#dfd2bc] hover:text-[#ffd35c] hover:border-[#d4af37] transition-colors cursor-pointer"
          style={{
            background: 'rgba(12, 6, 5, 0.84)',
            borderColor: 'rgba(148, 114, 58, 0.45)',
          }}
        >
          <SoundIcon muted={muted} />
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Pause game [P]"
          title="Pause [P]"
          onClick={(e) => {
            e.currentTarget.blur();
            onPause();
          }}
          className="w-9 h-9 flex items-center justify-center rounded border text-[#dfd2bc] hover:text-[#ffd35c] hover:border-[#d4af37] transition-colors cursor-pointer"
          style={{
            background: 'rgba(12, 6, 5, 0.84)',
            borderColor: 'rgba(148, 114, 58, 0.45)',
          }}
        >
          <PauseIcon />
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Restart run [R]"
          title="Restart [R]"
          onClick={(e) => {
            e.currentTarget.blur();
            onRestart();
          }}
          className="w-9 h-9 flex items-center justify-center rounded border text-[#dfd2bc] hover:text-[#ffd35c] hover:border-[#d4af37] transition-colors cursor-pointer"
          style={{
            background: 'rgba(12, 6, 5, 0.84)',
            borderColor: 'rgba(148, 114, 58, 0.45)',
          }}
        >
          <RestartIcon />
        </button>
      </div>

      {/* Lantern Warning Banner */}
      {hud.lightWarning && (
        <div className="absolute top-[18%] left-1/2 -translate-x-1/2 text-center">
          <div className="font-display text-sm sm:text-base tracking-[0.22em] uppercase text-[#ff4438] hud-stroke">
            Do Not Shine Light Upon Him
          </div>
          <div className="mt-1.5 w-48 h-1 mx-auto bg-black/60 rounded overflow-hidden border border-[#731814]">
            <div
              className="h-full bg-[#ff3b30] transition-all duration-75"
              style={{ width: `${Math.round(hud.lightExposureRatio * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Center Crosshair */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150"
        style={{
          width: hud.promptText ? '10px' : '6px',
          height: hud.promptText ? '10px' : '6px',
          background: hud.promptText ? '#ffd35c' : 'rgba(255, 211, 92, 0.58)',
          boxShadow: '0 0 8px rgba(255, 211, 92, 0.8)',
        }}
      />

      {/* Contextual Interact Prompt */}
      {hud.promptText && (
        <div
          className="absolute top-[56%] left-1/2 -translate-x-1/2 px-4 py-1.5 rounded border text-sm tracking-wide text-[#ffd35c] hud-stroke"
          style={{
            background: 'rgba(8, 4, 4, 0.82)',
            borderColor: 'rgba(212, 175, 55, 0.45)',
          }}
        >
          {hud.promptText}
        </div>
      )}

      {/* Subtle Bottom Hint Line */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-[#b8a78c] tracking-wide whitespace-nowrap hud-stroke">
        Click scene to lock aim · WASD Move · Shift Sprint · C Crouch · E Collect/Unlock · F Throw Dough
      </div>
    </div>
  );
}
