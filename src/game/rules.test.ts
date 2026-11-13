import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUnlockExit,
  CAVERN_PILLARS,
  computeDepthFactor,
  evaluateMonsterState,
  formatRunTime,
  getFloorHeight,
  isPlayerCaptured,
  REQUIRED_COINS,
  resolveWorldConstraints,
} from './rules';

test('getFloorHeight handles courtyard, staircase slope, and deep cavern floor', () => {
  // Surface courtyard outside pit corridor
  assert.equal(getFloorHeight(10, 10, 0), 0);
  // Top of stairs at Z = 4.0
  assert.equal(getFloorHeight(0, 4.0, 0), 0);
  // Midpoint of stairs at Z = -4.0 -> Y = -7.0
  assert.equal(getFloorHeight(0, -4.0, -6.5), -7);
  // Bottom of stairs at Z = -12.0 -> Y = -14.0
  assert.equal(getFloorHeight(0, -12.0, -13.5), -14);
  // Deep cavern floor away from stairs
  assert.equal(getFloorHeight(15, 10, -14), -14);
});

test('resolveWorldConstraints blocks courtyard pit rim except south staircase entrance', () => {
  // North rim of pit pushes player out to -4.3
  const northRimPos = { x: 0, z: -3.9 };
  resolveWorldConstraints(northRimPos, 0);
  assert.equal(northRimPos.z, -4.3);

  // Side rim inside pit footprint pushes player out to ±4.3
  const eastRimPos = { x: 3.0, z: 0 };
  resolveWorldConstraints(eastRimPos, 0);
  assert.equal(eastRimPos.x, 4.3);

  // South staircase entrance corridor remains passable
  const stairEntry = { x: 0.5, z: 3.5 };
  resolveWorldConstraints(stairEntry, 0);
  assert.equal(stairEntry.x, 0.5);
  assert.equal(stairEntry.z, 3.5);
});

test('resolveWorldConstraints keeps player inside cavern perimeter and outside pillars', () => {
  // Outer cavern perimeter clamped to 25.2
  const farPos = { x: 40, z: 0 };
  resolveWorldConstraints(farPos, -14);
  assert.ok(Math.abs(farPos.x - 25.2) < 0.001);

  // Pillar collision pushes player outside r + 0.55
  const pillar = CAVERN_PILLARS[0];
  const nearPillar = { x: pillar.x + 1.0, z: pillar.z };
  resolveWorldConstraints(nearPillar, -14);
  const dist = Math.hypot(nearPillar.x - pillar.x, nearPillar.z - pillar.z);
  assert.ok(Math.abs(dist - (pillar.r + 0.55)) < 0.001);
});

test('evaluateMonsterState switches to CHASE on sprint or lantern exposure, and DECOY overrides', () => {
  // Sprinting near monster triggers chase immediately
  const sprintChase = evaluateMonsterState({
    prevState: 'PATROL',
    prevLightExposure: 0,
    prevAlertTimer: 0,
    dt: 0.016,
    playerInCavern: true,
    distToPlayerXZ: 12,
    distToPlayer3D: 12,
    lookDot: 0,
    isSprinting: true,
    hasActiveDecoy: false,
  });
  assert.equal(sprintChase.nextState, 'CHASE');
  assert.equal(sprintChase.triggeredChase, true);
  assert.equal(sprintChase.alertTimer, 6.5);

  // Shining lantern continuously builds exposure > 1.15 -> CHASE
  const lightChase = evaluateMonsterState({
    prevState: 'PATROL',
    prevLightExposure: 1.1,
    prevAlertTimer: 0,
    dt: 0.1,
    playerInCavern: true,
    distToPlayerXZ: 15,
    distToPlayer3D: 15,
    lookDot: 0.95,
    isSprinting: false,
    hasActiveDecoy: false,
  });
  assert.equal(lightChase.nextState, 'CHASE');
  assert.equal(lightChase.lightDetected, true);

  // Active decoy immediately overrides CHASE into DECOY and clears light exposure
  const decoyOverride = evaluateMonsterState({
    prevState: 'CHASE',
    prevLightExposure: 1.2,
    prevAlertTimer: 5.0,
    dt: 0.016,
    playerInCavern: true,
    distToPlayerXZ: 4,
    distToPlayer3D: 4,
    lookDot: 0.99,
    isSprinting: true,
    hasActiveDecoy: true,
  });
  assert.equal(decoyOverride.nextState, 'DECOY');
  assert.equal(decoyOverride.lightExposure, 0);
});

test('capture, exit unlock, depth factor, and run timer helpers work accurately', () => {
  assert.equal(isPlayerCaptured('CHASE', 1.2, -12.3, -14.0), true);
  assert.equal(isPlayerCaptured('DECOY', 0.5, -12.3, -14.0), false);
  assert.equal(isPlayerCaptured('PATROL', 5.0, -12.3, -14.0), false);

  assert.equal(canUnlockExit(REQUIRED_COINS - 1), false);
  assert.equal(canUnlockExit(REQUIRED_COINS), true);

  assert.equal(computeDepthFactor(1.7), 0);
  assert.equal(computeDepthFactor(-7), 0.5);
  assert.equal(computeDepthFactor(-16), 1);

  assert.equal(formatRunTime(0), '00:00');
  assert.equal(formatRunTime(75.8), '01:15');
});
