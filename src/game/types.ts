export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type GameOutcome = 'victory' | 'defeat';

export type MonsterState = 'PATROL' | 'CHASE' | 'DECOY';

export type PlayerStance = 'standing' | 'crouching' | 'sprinting';

export interface ColliderCircle {
  x: number;
  z: number;
  r: number;
}

export interface HudSnapshot {
  coins: number;
  requiredCoins: number;
  totalCoins: number;
  decoys: number;
  maxDecoys: number;
  stance: PlayerStance;
  monsterState: MonsterState;
  decoyTimeLeft: number;
  lightWarning: boolean;
  lightExposureRatio: number;
  promptText: string | null;
  inCavern: boolean;
  elapsedSeconds: number;
}

export interface RunSummary {
  outcome: GameOutcome;
  reason: string;
  coins: number;
  requiredCoins: number;
  decoysUsed: number;
  elapsedSeconds: number;
}
