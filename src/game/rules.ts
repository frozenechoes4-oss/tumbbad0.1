import type { ColliderCircle, InputMode, MonsterState } from './types';

export const REQUIRED_COINS = 5;
export const MAX_DECOYS = 3;
export const DECOY_DURATION = 8.0;
export const EYE_HEIGHT_STAND = 1.7;
export const EYE_HEIGHT_CROUCH = 1.0;

export const MONSTER_SPEEDS = {
  PATROL: 5.4,
  CHASE: 8.9,
  DECOY: 10.5,
} as const;

export const PLAYER_SPEEDS = {
  WALK: 4.7,
  CROUCH: 2.4,
  SPRINT: 8.1,
} as const;

export const CAVERN_PILLARS: ColliderCircle[] = [
  { x: -10, z: -16, r: 2.2 },
  { x: 10, z: -16, r: 2.2 },
  { x: -15, z: -3, r: 2.5 },
  { x: 15, z: -3, r: 2.5 },
  { x: -9, z: 11, r: 2.3 },
  { x: 9, z: 11, r: 2.3 },
  { x: 0, z: 16, r: 2.8 },
];

export const COIN_LOCATIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -18, z: -14 },
  { x: 18, z: -14 },
  { x: -20, z: 4 },
  { x: 20, z: 4 },
  { x: -12, z: 19 },
  { x: 12, z: 19 },
  { x: 0, z: 22 },
  { x: 0, z: -21 },
];

export const MONSTER_WAYPOINTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -17, z: -14 },
  { x: 17, z: -14 },
  { x: 18, z: 12 },
  { x: 0, z: 20 },
  { x: -18, z: 12 },
];

export const EXIT_DOOR_POS = { x: 0, y: 1.5, z: 17.4 };

export function getFloorHeight(x: number, z: number, currentFootY: number): number {
  if (Math.abs(x) <= 2.2 && z >= -12.0 && z <= 4.0) {
    const stairY = ((z - 4.0) / 16.0) * 14.0;
    if (currentFootY >= stairY - 2.2) {
      return stairY;
    }
  }
  if (currentFootY > -3.5) {
    return 0;
  }
  return -14.0;
}

export function resolveWorldConstraints(
  pos: { x: number; z: number },
  footY: number,
  colliders: ReadonlyArray<ColliderCircle> = CAVERN_PILLARS
): void {
  const onStairs = Math.abs(pos.x) <= 2.2 && pos.z >= -12.2 && pos.z <= 4.2 && footY > -13.8;

  if (onStairs && footY < -0.1) {
    pos.x = Math.max(-1.85, Math.min(1.85, pos.x));
    return;
  }

  if (footY >= -0.2) {
    pos.x = Math.max(-16.8, Math.min(16.8, pos.x));
    pos.z = Math.max(-16.8, Math.min(16.8, pos.z));

    if (pos.x > -4.3 && pos.x < 4.3 && pos.z > -4.3 && pos.z < 4.0) {
      if (Math.abs(pos.x) > 1.85) {
        pos.x = pos.x > 0 ? 4.3 : -4.3;
      } else if (pos.z < -3.8) {
        pos.z = -4.3;
      }
    }
    return;
  }

  const distSq = pos.x * pos.x + pos.z * pos.z;
  const maxR = 25.2;
  if (distSq > maxR * maxR) {
    const d = Math.sqrt(distSq);
    pos.x = (pos.x / d) * maxR;
    pos.z = (pos.z / d) * maxR;
  }

  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const minDist = c.r + 0.55;
    if (d < minDist && d > 0.001) {
      pos.x = c.x + (dx / d) * minDist;
      pos.z = c.z + (dz / d) * minDist;
    }
  }
}

export interface MonsterEvaluationInput {
  prevState: MonsterState;
  prevLightExposure: number;
  prevAlertTimer: number;
  dt: number;
  playerInCavern: boolean;
  distToPlayerXZ: number;
  distToPlayer3D: number;
  lookDot: number;
  isSprinting: boolean;
  isCrouching?: boolean;
  isMoving?: boolean;
  hasActiveDecoy: boolean;
}

export interface MonsterEvaluationResult {
  nextState: MonsterState;
  lightExposure: number;
  alertTimer: number;
  shiningLightOnMonster: boolean;
  lightDetected: boolean;
  sprintDetected: boolean;
  proximityDetected: boolean;
  triggeredChase: boolean;
}

export function evaluateMonsterState(input: MonsterEvaluationInput): MonsterEvaluationResult {
  const {
    prevState,
    prevLightExposure,
    prevAlertTimer,
    dt,
    playerInCavern,
    distToPlayerXZ,
    distToPlayer3D,
    lookDot,
    isSprinting,
    isCrouching = false,
    isMoving = true,
    hasActiveDecoy,
  } = input;

  const shiningLightOnMonster = playerInCavern && distToPlayer3D < 23 && lookDot > 0.85;
  let lightExposure =
    shiningLightOnMonster && !hasActiveDecoy
      ? prevLightExposure + dt * 1.15
      : Math.max(0, prevLightExposure - dt * 0.75);

  const sprintDetected = playerInCavern && isSprinting && distToPlayerXZ < 20;
  const proximityDetected = playerInCavern && !isCrouching && isMoving && distToPlayerXZ < 5.2;
  const lightDetected = lightExposure > 1.05;

  let nextState: MonsterState = 'PATROL';
  let alertTimer = prevAlertTimer;

  if (hasActiveDecoy) {
    nextState = 'DECOY';
    lightExposure = 0;
  } else if (sprintDetected || lightDetected || proximityDetected) {
    nextState = 'CHASE';
    alertTimer = 7.5;
  } else if (prevState === 'CHASE') {
    alertTimer = Math.max(0, prevAlertTimer - dt);
    if (playerInCavern && alertTimer > 0) {
      nextState = 'CHASE';
    } else {
      nextState = 'PATROL';
    }
  }

  return {
    nextState,
    lightExposure,
    alertTimer,
    shiningLightOnMonster: shiningLightOnMonster && !hasActiveDecoy,
    lightDetected,
    sprintDetected,
    proximityDetected,
    triggeredChase: prevState !== 'CHASE' && nextState === 'CHASE',
  };
}

export function isPlayerCaptured(
  monsterState: MonsterState,
  distToPlayerXZ: number,
  playerEyeY: number,
  monsterY: number
): boolean {
  if (monsterState === 'DECOY') return false;
  return distToPlayerXZ < 1.55 && Math.abs(playerEyeY - 1.5 - monsterY) < 2.8;
}

export function computeDepthFactor(playerY: number): number {
  return Math.min(1, Math.max(0, -playerY / 14));
}

export function canUnlockExit(coins: number): boolean {
  return coins >= REQUIRED_COINS;
}

export function formatRunTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function detectAutoInputMode(params: {
  hasCoarsePointer: boolean;
  maxTouchPoints: number;
  viewportWidth: number;
  recentTouch: boolean;
}): InputMode {
  if (params.recentTouch || params.hasCoarsePointer || params.viewportWidth <= 768) {
    return 'mobile';
  }
  if (params.maxTouchPoints > 0 && params.viewportWidth <= 1024) {
    return 'mobile';
  }
  return 'desktop';
}

export function shouldTriggerAmbushJumpscare(params: {
  triggeredChase: boolean;
  monsterState: MonsterState;
  distToPlayerXZ: number;
  cooldownRemaining: number;
  playerInCavern: boolean;
}): boolean {
  if (!params.playerInCavern || params.cooldownRemaining > 0) return false;
  if (params.triggeredChase && params.distToPlayerXZ < 18) return true;
  if (params.monsterState === 'CHASE' && params.distToPlayerXZ < 6.8) return true;
  return false;
}

export function computeHorrorTension(params: {
  monsterState: MonsterState;
  distToPlayerXZ: number;
  playerInCavern: boolean;
  lightExposureRatio: number;
}): number {
  const base = params.playerInCavern ? 0.22 : 0.04;
  const proximity = params.playerInCavern
    ? Math.max(0, 1 - params.distToPlayerXZ / 22) * 0.58
    : 0;
  const chaseBoost = params.monsterState === 'CHASE' ? 0.45 : 0;
  const lightBoost = params.lightExposureRatio * 0.25;
  return Math.min(1, Math.max(0, base + proximity + chaseBoost + lightBoost));
}
