import { useRef, useState } from 'react';
import type { HudSnapshot } from '../game/types';
import { DoughDollIcon } from './GameIcons';

interface MobileControlsProps {
  hud: HudSnapshot;
  onMove: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onToggleSprint: (active: boolean) => void;
  onToggleCrouch: () => void;
  onThrowDecoy: () => void;
  onInteract: () => void;
}

const JOYSTICK_RADIUS = 38;

export function MobileControls({
  hud,
  onMove,
  onLookDelta,
  onToggleSprint,
  onToggleCrouch,
  onThrowDecoy,
  onInteract,
}: MobileControlsProps) {
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const joyPointerIdRef = useRef<number | null>(null);
  const joyCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const lookPointerIdRef = useRef<number | null>(null);
  const lookLastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyPointerIdRef.current = e.pointerId;
    joyCenterRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    joyPointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onMove(0, 0);
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    const dx = clientX - joyCenterRef.current.x;
    const dy = clientY - joyCenterRef.current.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(JOYSTICK_RADIUS, dist);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0 ? Math.cos(angle) * clampedDist : 0;
    const ky = dist > 0 ? Math.sin(angle) * clampedDist : 0;
    setKnobOffset({ x: kx, y: ky });
    // Negative ky on screen is forward (+1) in world space
    onMove(kx / JOYSTICK_RADIUS, -ky / JOYSTICK_RADIUS);
  };

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== null) return;
    lookPointerIdRef.current = e.pointerId;
    lookLastPosRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - lookLastPosRef.current.x;
    const dy = e.clientY - lookLastPosRef.current.y;
    lookLastPosRef.current = { x: e.clientX, y: e.clientY };
    onLookDelta(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== e.pointerId) return;
    lookPointerIdRef.current = null;
  };

  const isCrouching = hud.stance === 'crouching';
  const isSprinting = hud.stance === 'sprinting';

  return (
    <div
      data-testid="mobile-controls"
      className="fixed inset-0 pointer-events-none z-20 select-none"
    >
      {/* Right-half touch drag zone for looking around */}
      <div
        data-testid="mobile-look-zone"
        aria-label="Drag to look around"
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="absolute top-0 right-0 bottom-0 left-[38%] pointer-events-auto touch-none"
      />

      {/* Left Virtual Thumb Joystick */}
      <div
        data-testid="mobile-joystick"
        role="application"
        aria-label="Movement joystick"
        onPointerDown={handleJoyDown}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyUp}
        onPointerCancel={handleJoyUp}
        className="absolute bottom-6 left-5 w-28 h-28 rounded-full border-2 flex items-center justify-center pointer-events-auto touch-none"
        style={{
          background: 'rgba(12, 6, 5, 0.72)',
          borderColor: 'rgba(186, 144, 72, 0.5)',
          boxShadow: '0 8px 26px rgba(0, 0, 0, 0.78), inset 0 0 18px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* Subtle cardinal direction ticks */}
        <span className="absolute top-2 text-[9px] text-[#9c8c72] font-display">N</span>
        <span className="absolute bottom-2 text-[9px] text-[#9c8c72] font-display">S</span>
        <div
          className="w-11 h-11 rounded-full border pointer-events-none transition-transform duration-75"
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            background: 'radial-gradient(circle at 35% 35%, #d4af37 0%, #6e4914 75%)',
            borderColor: '#ffe38e',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.8)',
          }}
        />
      </div>

      {/* Bottom-Right Ergonomic Action Pad */}
      <div
        data-testid="mobile-actions"
        className="absolute bottom-6 right-5 grid grid-cols-2 gap-2.5 pointer-events-auto touch-none"
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle crouch"
          data-testid="mobile-crouch-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleCrouch();
          }}
          className="min-w-[68px] h-12 px-3 rounded border font-display text-[11px] tracking-[0.1em] uppercase font-bold transition-colors cursor-pointer"
          style={{
            background: isCrouching ? 'rgba(42, 82, 44, 0.88)' : 'rgba(14, 7, 6, 0.85)',
            borderColor: isCrouching ? '#8fd488' : 'rgba(148, 114, 58, 0.48)',
            color: isCrouching ? '#e8ffe5' : '#dfd2bc',
          }}
        >
          {isCrouching ? 'Silent' : 'Crouch'}
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle sprint"
          data-testid="mobile-sprint-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleSprint(!isSprinting);
          }}
          className="min-w-[68px] h-12 px-3 rounded border font-display text-[11px] tracking-[0.1em] uppercase font-bold transition-colors cursor-pointer"
          style={{
            background: isSprinting ? 'rgba(148, 42, 22, 0.9)' : 'rgba(14, 7, 6, 0.85)',
            borderColor: isSprinting ? '#ff8b66' : 'rgba(148, 114, 58, 0.48)',
            color: isSprinting ? '#fff2eb' : '#dfd2bc',
          }}
        >
          {isSprinting ? 'Running' : 'Sprint'}
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Throw dough decoy"
          data-testid="mobile-decoy-btn"
          disabled={hud.decoys <= 0}
          onClick={(e) => {
            e.currentTarget.blur();
            onThrowDecoy();
          }}
          className="min-w-[68px] h-13 px-2.5 rounded border flex items-center justify-center gap-1.5 font-display text-[11px] tracking-[0.08em] uppercase font-bold transition-opacity cursor-pointer disabled:opacity-40"
          style={{
            background: 'rgba(32, 18, 12, 0.9)',
            borderColor: 'rgba(212, 175, 55, 0.55)',
            color: '#f2dfb8',
          }}
        >
          <DoughDollIcon active={hud.decoys > 0} className="w-4 h-4 shrink-0" />
          <span className="font-mono-num">{hud.decoys}</span>
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Take Mudra or unlock gate"
          data-testid="mobile-interact-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onInteract();
          }}
          className="min-w-[68px] h-13 px-3 rounded border font-display text-[11px] tracking-[0.1em] uppercase font-bold transition-transform active:scale-95 cursor-pointer"
          style={{
            background: hud.canInteract ? '#7d5214' : 'rgba(14, 7, 6, 0.84)',
            borderColor: hud.canInteract ? '#ffd35c' : 'rgba(148, 114, 58, 0.42)',
            color: hud.canInteract ? '#fff9e6' : '#9c8c72',
            boxShadow: hud.canInteract ? '0 0 18px rgba(255, 200, 65, 0.45)' : 'none',
          }}
        >
          {hud.canInteract ? 'Take' : 'Act'}
        </button>
      </div>
    </div>
  );
}
