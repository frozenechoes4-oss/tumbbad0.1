import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundSystem } from './audio';
import {
  buildBrazierPost,
  buildCourtyardPillar,
  buildDoughDecoy,
  buildExitGate,
  buildHandheldLantern,
  buildHastarModel,
  buildMudraCoin,
  type HastarRig,
  type LanternRig,
} from './models';
import {
  canUnlockExit,
  COIN_LOCATIONS,
  computeDepthFactor,
  computeHorrorTension,
  DECOY_DURATION,
  detectAutoInputMode,
  evaluateMonsterState,
  EXIT_DOOR_POS,
  EYE_HEIGHT_CROUCH,
  EYE_HEIGHT_STAND,
  getFloorHeight,
  isPlayerCaptured,
  MAX_DECOYS,
  MONSTER_SPEEDS,
  MONSTER_WAYPOINTS,
  PLAYER_SPEEDS,
  REQUIRED_COINS,
  resolveWorldConstraints,
  shouldTriggerAmbushJumpscare,
} from './rules';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import type { GamePhase, HudSnapshot, InputMode, JumpscareKind, MonsterState, RunSummary } from './types';

interface CoinEntity {
  group: THREE.Group;
  spinMesh: THREE.Group;
  collected: boolean;
}

interface DecoyEntity {
  group: THREE.Group;
  vel: THREE.Vector3;
  landed: boolean;
  timer: number;
}

export interface TumbbadEngineCallbacks {
  onPhaseChange: (phase: GamePhase) => void;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRunEnd: (summary: RunSummary) => void;
  onMuteChange: (muted: boolean) => void;
}

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class TumbbadEngine {
  private container: HTMLElement;
  private callbacks: TumbbadEngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pitchObject: THREE.Object3D;
  private yawObject: THREE.Object3D;
  private lantern: LanternRig;
  private hastar: HastarRig;
  private textures: ProceduralTextureSet;
  private sound: SoundSystem;
  private envRT: THREE.WebGLRenderTarget;

  private moonKey!: THREE.DirectionalLight;
  private wombLights: THREE.PointLight[] = [];
  private rainGeo!: THREE.BufferGeometry;
  private rainLines!: THREE.LineSegments;
  private readonly rainCount = 1600;

  private coins: CoinEntity[] = [];
  private activeDecoys: DecoyEntity[] = [];

  private phase: GamePhase = 'title';
  private inputMode: InputMode = 'desktop';
  private recentTouch = false;
  private lastTouchTimestamp = 0;
  private muted = false;
  private isDisposed = false;
  private contextLost = false;
  private frameId = 0;

  // Player & simulation state
  private coinsCollected = 0;
  private decoysRemaining = MAX_DECOYS;
  private decoysUsed = 0;
  private isCrouching = false;
  private isSprinting = false;
  private touchSprint = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private elapsedSeconds = 0;
  private stepAccumulator = 0;
  private distanceBob = 0;

  // Monster AI state
  private monsterState: MonsterState = 'PATROL';
  private wpIndex = 0;
  private lightExposure = 0;
  private alertTimer = 0;

  // Horror & Jumpscare state
  private horrorTension = 0;
  private cameraTrauma = 0;
  private jumpscareTimer = 0;
  private jumpscareKind: JumpscareKind | null = null;
  private ambushCooldown = 3.0;
  private capturingTimer = 0;
  private captureReason = '';
  private nextLightningTimer = 7.0;
  private lightningFlash = 0;

  // Interaction state
  private nearbyCoin: CoinEntity | null = null;
  private nearExitDoor = false;
  private lastHudEmit = 0;

  // Input state
  private keysPressed = new Set<string>();
  private lastTime = performance.now();
  private simTime = 0;
  private coarseQuery: MediaQueryList | null = null;

  // Pre-allocated scratch math objects (zero-GC inside animation loop)
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _moveDir = new THREE.Vector3();
  private readonly _upAxis = new THREE.Vector3(0, 1, 0);
  private readonly _camDir = new THREE.Vector3();
  private readonly _toMonster = new THREE.Vector3();
  private readonly _monsterHeadPos = new THREE.Vector3();
  private readonly _exitDoorVec = new THREE.Vector3(EXIT_DOOR_POS.x, EXIT_DOOR_POS.y, EXIT_DOOR_POS.z);

  constructor(container: HTMLElement, callbacks: TumbbadEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.sound = new SoundSystem();
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'block w-full h-full outline-none';
    this.renderer.domElement.setAttribute('data-testid', 'tumbbad-canvas');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040202);
    this.scene.fog = new THREE.FogExp2(0x060203, 0.044);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.22;
    pmremGenerator.dispose();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 130);
    this.pitchObject = new THREE.Object3D();
    this.pitchObject.add(this.camera);

    this.yawObject = new THREE.Object3D();
    this.yawObject.position.set(0, EYE_HEIGHT_STAND, 13);
    this.yawObject.add(this.pitchObject);
    this.scene.add(this.yawObject);

    // Handheld Lantern attached to camera
    this.lantern = buildHandheldLantern(this.isSoftwareGl);
    this.camera.add(this.lantern.group);
    this.camera.add(this.lantern.spotTarget);
    this.lantern.spotLight.target = this.lantern.spotTarget;

    // Warm/cool atmospheric lighting (dimmer & moodier for horror)
    const hemiLight = new THREE.HemisphereLight(0x2f3b58, 0x2d0507, 0.5);
    this.scene.add(hemiLight);

    this.moonKey = new THREE.DirectionalLight(0x7c96bd, 0.65);
    this.moonKey.position.set(-16, 26, 12);
    if (!this.isSoftwareGl) {
      this.moonKey.castShadow = true;
      this.moonKey.shadow.mapSize.set(1024, 1024);
      this.moonKey.shadow.camera.left = -22;
      this.moonKey.shadow.camera.right = 22;
      this.moonKey.shadow.camera.top = 22;
      this.moonKey.shadow.camera.bottom = -22;
      this.moonKey.shadow.camera.near = 1;
      this.moonKey.shadow.camera.far = 65;
      this.moonKey.shadow.bias = -0.0005;
      this.moonKey.shadow.normalBias = 0.02;
    }
    this.scene.add(this.moonKey);

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.buildEnvironment();
    this.buildRain();

    this.hastar = buildHastarModel(this.textures.shadowDisc);
    this.hastar.group.position.set(0, -14, -18);
    this.scene.add(this.hastar.group);

    this.spawnCoins();
    this.refreshInputMode(false);
    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.emitHud(true);
    this.scheduleNextFrame();
  }

  private buildEnvironment(): void {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.stoneAlbedo,
      bumpMap: this.textures.stoneBump,
      bumpScale: 0.08,
      roughness: 0.72,
      metalness: 0.08,
    });

    const wombMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.wombAlbedo,
      bumpMap: this.textures.wombBump,
      bumpScale: 0.16,
      roughness: 0.36,
      metalness: 0.12,
    });

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.woodAlbedo,
      roughness: 0.65,
      metalness: 0.05,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0x9c7834,
      roughness: 0.3,
      metalness: 0.86,
    });

    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.55,
      metalness: 0.78,
    });

    // 1. Courtyard Floor around the 8x8 central pit
    const floorPieces = [
      { x: 0, z: -11, w: 36, d: 14 },
      { x: 0, z: 11, w: 36, d: 14 },
      { x: -11, z: 0, w: 14, d: 8 },
      { x: 11, z: 0, w: 14, d: 8 },
    ];
    for (const p of floorPieces) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, 1, p.d), stoneMat);
      mesh.position.set(p.x, -0.5, p.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // Outer storm-swept mansion courtyard terrain horizon extension
    const outerGround = new THREE.Mesh(
      new THREE.RingGeometry(24, 95, 32),
      new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.95, metalness: 0.0 })
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.04;
    this.scene.add(outerGround);

    // Pit Rim Parapet Walls (North, East, West — South is open for the descent staircase)
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x221b17, roughness: 0.85, metalness: 0.08 });
    const rims = [
      { x: 0, z: -4.2, w: 8.8, d: 0.45, h: 0.95 },
      { x: -4.2, z: 0, w: 0.45, d: 8.8, h: 0.95 },
      { x: 4.2, z: 0, w: 0.45, d: 8.8, h: 0.95 },
    ];
    for (const r of rims) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.h, r.d), rimMat);
      m.position.set(r.x, r.h / 2, r.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }

    // Twin Fire Braziers flanking the pit staircase entrance (guides player gaze immediately)
    for (const bx of [-2.45, 2.45]) {
      const brazier = buildBrazierPost(stoneMat, ironMat);
      brazier.position.set(bx, 0, 4.15);
      this.scene.add(brazier);
    }
    const stairBeacon = new THREE.PointLight(0xff7733, 2.6, 16, 1.4);
    stairBeacon.position.set(0, 2.2, 3.6);
    this.scene.add(stairBeacon);

    // Outer Courtyard Mansion Walls
    const wallSpecs = [
      { x: 0, z: -18, w: 36, d: 1, h: 9.5 },
      { x: 0, z: 18, w: 36, d: 1, h: 9.5 },
      { x: -18, z: 0, w: 1, d: 36, h: 9.5 },
      { x: 18, z: 0, w: 1, d: 36, h: 9.5 },
    ];
    for (const w of wallSpecs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), stoneMat);
      mesh.position.set(w.x, w.h / 2, w.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // Composite Stone Courtyard Columns
    for (const x of [-10, 10]) {
      for (const z of [-10, 10]) {
        const pillar = buildCourtyardPillar(stoneMat, brassMat);
        pillar.position.set(x, 0, z);
        this.scene.add(pillar);
      }
    }

    // Framed Mansion Exit Gate at South Wall
    const exitGate = buildExitGate(stoneMat, woodMat, brassMat, ironMat);
    this.scene.add(exitGate);

    // 2. Vertical Pit Shaft & Stone Staircase Descent
    const shaftWalls = [
      { x: -4.3, z: -4, w: 0.6, d: 17, h: 14 },
      { x: 4.3, z: -4, w: 0.6, d: 17, h: 14 },
      { x: 0, z: 4.3, w: 8.6, d: 0.6, h: 14 },
    ];
    for (const sw of shaftWalls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sw.w, sw.h, sw.d), wombMat);
      m.position.set(sw.x, -sw.h / 2, sw.z);
      this.scene.add(m);
    }

    const numSteps = 28;
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const stepZ = 4.0 - t * 16.0;
      const stepY = -t * 14.0;
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 0.82), stoneMat);
      stepMesh.position.set(0, stepY - 0.25, stepZ);
      stepMesh.receiveShadow = true;
      this.scene.add(stepMesh);
    }

    // Crimson glow rising from the pit shaft
    const pitGlow = new THREE.PointLight(0xe01b1b, 3.2, 24, 1.3);
    pitGlow.position.set(0, -3.5, -1.5);
    this.scene.add(pitGlow);

    // 3. Underground Red-Lit Organic Womb Cavern (Y = -14)
    const cavernFloor = new THREE.Mesh(new THREE.CircleGeometry(29, 36), wombMat);
    cavernFloor.rotation.x = -Math.PI / 2;
    cavernFloor.position.y = -14;
    cavernFloor.receiveShadow = true;
    this.scene.add(cavernFloor);

    // Organic perimeter womb ribs/walls
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      const r = 27.5 + Math.sin(i * 3) * 1.2;
      const wallBlob = new THREE.Mesh(new THREE.DodecahedronGeometry(4.8, 1), wombMat);
      wallBlob.position.set(Math.cos(angle) * r, -10, Math.sin(angle) * r);
      wallBlob.scale.set(1, 2.5, 1);
      this.scene.add(wallBlob);
    }

    // Fleshy Tendril Columns inside the Womb Cavern (Obstruction + Stealth Cover)
    const pillars = [
      { x: -10, z: -16, r: 2.2 },
      { x: 10, z: -16, r: 2.2 },
      { x: -15, z: -3, r: 2.5 },
      { x: 15, z: -3, r: 2.5 },
      { x: -9, z: 11, r: 2.3 },
      { x: 9, z: 11, r: 2.3 },
      { x: 0, z: 16, r: 2.8 },
    ];
    for (const p of pillars) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.75, p.r * 1.1, 14, 12), wombMat);
      col.position.set(p.x, -7, p.z);
      col.castShadow = true;
      col.receiveShadow = true;
      this.scene.add(col);
    }

    // Strategic pulsing crimson womb lights (budget <= 5 unshadowed cavern point lights)
    const wombLightSpecs = [
      { x: 0, y: -8.5, z: -18, i: 1.75 },
      { x: -16, y: -8, z: -6, i: 1.45 },
      { x: 16, y: -8, z: -6, i: 1.45 },
      { x: 0, y: -8, z: 14, i: 1.55 },
    ];
    for (const wl of wombLightSpecs) {
      const pl = new THREE.PointLight(0xd91414, wl.i, 26, 1.65);
      pl.position.set(wl.x, wl.y, wl.z);
      pl.userData.baseIntensity = wl.i;
      this.scene.add(pl);
      this.wombLights.push(pl);
    }
  }

  private buildRain(): void {
    this.rainGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 6);
    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * 36;
      const y = Math.random() * 18;
      const z = (Math.random() - 0.5) * 36;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y - 0.65;
      positions[i * 6 + 5] = z;
    }
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0x8ea0b8,
      transparent: true,
      opacity: 0.42,
    });
    this.rainLines = new THREE.LineSegments(this.rainGeo, rainMat);
    this.scene.add(this.rainLines);
  }

  private updateRain(dt: number): void {
    const attr = this.rainGeo.attributes.position as THREE.BufferAttribute;
    const pos = attr.array as Float32Array;
    for (let i = 0; i < this.rainCount; i++) {
      pos[i * 6 + 1] -= 22 * dt;
      pos[i * 6 + 4] -= 22 * dt;
      if (pos[i * 6 + 1] < 0) {
        const ny = 16 + Math.random() * 3;
        pos[i * 6 + 1] = ny;
        pos[i * 6 + 4] = ny - 0.65;
      }
    }
    attr.needsUpdate = true;
  }

  private spawnCoins(): void {
    for (const c of this.coins) {
      this.scene.remove(c.group);
    }
    this.coins.length = 0;

    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0x996d08,
      emissiveIntensity: 0.55,
      metalness: 0.92,
      roughness: 0.18,
    });

    const glyphMat = new THREE.MeshStandardMaterial({
      color: 0xc99312,
      emissive: 0x5c3d04,
      metalness: 0.85,
      roughness: 0.35,
    });

    for (const loc of COIN_LOCATIONS) {
      const { group, spinMesh } = buildMudraCoin(coinMat, glyphMat, this.textures.shadowDisc);
      group.position.set(loc.x, -13.3, loc.z);
      this.scene.add(group);
      this.coins.push({ group, spinMesh, collected: false });
    }
  }

  // ============================================================================
  // AUTOMATIC DESKTOP / MOBILE DETECTION & TOUCH CONTROL API
  // ============================================================================
  private refreshInputMode(emit: boolean): void {
    const hasCoarsePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
    const viewportWidth = this.container.clientWidth || window.innerWidth;

    const nextMode = detectAutoInputMode({
      hasCoarsePointer,
      maxTouchPoints,
      viewportWidth,
      recentTouch: this.recentTouch,
    });

    if (nextMode !== this.inputMode || !document.body.dataset.inputMode) {
      this.inputMode = nextMode;
      document.body.dataset.inputMode = nextMode;
      if (nextMode === 'mobile') {
        this.exitPointerLock();
      }
      if (emit) {
        this.emitHud(true);
      }
    }
  }

  setTouchMove(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  applyLookDelta(dx: number, dy: number): void {
    if (this.phase !== 'playing' || this.capturingTimer > 0) return;
    const sensitivity = 0.0042;
    this.yawObject.rotation.y -= dx * sensitivity;
    this.pitchObject.rotation.x -= dy * sensitivity;
    this.pitchObject.rotation.x = Math.max(
      -Math.PI / 2.1,
      Math.min(Math.PI / 2.1, this.pitchObject.rotation.x)
    );
  }

  setTouchSprint(active: boolean): void {
    this.touchSprint = active;
    if (active && this.isCrouching) {
      this.isCrouching = false;
    }
    this.emitHud(true);
  }

  toggleCrouch(): void {
    if (this.phase !== 'playing' || this.capturingTimer > 0) return;
    this.isCrouching = !this.isCrouching;
    if (this.isCrouching) {
      this.touchSprint = false;
    }
    this.emitHud(true);
  }

  // ============================================================================
  // PUBLIC GAME LIFECYCLE CONTROLS
  // ============================================================================
  startNewRun(requestLock = true): void {
    this.sound.init();
    this.resetSimulation();
    this.setPhase('playing');
    if (requestLock && this.inputMode === 'desktop') {
      this.tryRequestPointerLock();
    }
  }

  resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.sound.init();
    this.setPhase('playing');
    if (this.inputMode === 'desktop') {
      this.tryRequestPointerLock();
    }
  }

  pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.keysPressed.clear();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
    this.exitPointerLock();
    this.sound.silenceAmbience();
    this.setPhase('paused');
  }

  returnToTitle(): void {
    this.keysPressed.clear();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
    this.exitPointerLock();
    this.sound.silenceAmbience();
    this.resetSimulation();
    this.setPhase('title');
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.sound.setMuted(this.muted);
    this.callbacks.onMuteChange(this.muted);
  }

  private setPhase(nextPhase: GamePhase): void {
    this.phase = nextPhase;
    document.body.dataset.state = nextPhase;
    this.callbacks.onPhaseChange(nextPhase);
  }

  private tryRequestPointerLock(): void {
    if (this.inputMode === 'mobile') return;
    try {
      const el = this.renderer.domElement;
      if (document.pointerLockElement !== el && typeof el.requestPointerLock === 'function') {
        const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Headless browsers or iframe restrictions may decline pointer lock silently
    }
  }

  private exitPointerLock(): void {
    try {
      if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
        document.exitPointerLock();
      }
    } catch {
      // Ignore
    }
  }

  private resetSimulation(): void {
    this.coinsCollected = 0;
    this.decoysRemaining = MAX_DECOYS;
    this.decoysUsed = 0;
    this.isCrouching = false;
    this.isSprinting = false;
    this.touchSprint = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.elapsedSeconds = 0;
    this.stepAccumulator = 0;
    this.distanceBob = 0;
    this.keysPressed.clear();

    // Reset horror & jumpscare timers
    this.horrorTension = 0;
    this.cameraTrauma = 0;
    this.jumpscareTimer = 0;
    this.jumpscareKind = null;
    this.ambushCooldown = 3.0;
    this.capturingTimer = 0;
    this.captureReason = '';
    this.lightningFlash = 0;
    this.nextLightningTimer = 7.0;

    // Spawn facing north toward the glowing central pit staircase!
    this.yawObject.position.set(0, EYE_HEIGHT_STAND, 13.0);
    this.yawObject.rotation.set(0, 0, 0);
    this.pitchObject.rotation.set(-0.08, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.fov = 70;
    this.camera.updateProjectionMatrix();

    // Reset Hastar inside the cavern
    this.hastar.group.position.set(0, -14, -18);
    this.hastar.group.rotation.set(0, 0, 0);
    this.monsterState = 'PATROL';
    this.wpIndex = 0;
    this.lightExposure = 0;
    this.alertTimer = 0;

    for (const d of this.activeDecoys) {
      this.scene.remove(d.group);
    }
    this.activeDecoys.length = 0;
    this.spawnCoins();
    this.emitHud(true);
  }

  // ============================================================================
  // INPUT & WINDOW EVENTS
  // ============================================================================
  private onKeyDown = (e: KeyboardEvent): void => {
    // Physical keyboard input confirms desktop mode unless viewport is strictly phone-sized
    if (this.recentTouch && (this.container.clientWidth || window.innerWidth) > 768) {
      this.recentTouch = false;
      this.refreshInputMode(true);
    }

    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.phase === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.startNewRun(true);
      }
      return;
    }

    if (this.phase === 'paused') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        this.resumeGame();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.startNewRun(true);
      }
      return;
    }

    if (this.phase !== 'playing' || this.capturingTimer > 0) return;

    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      this.pauseGame();
      return;
    }

    if (e.code === 'KeyR') {
      e.preventDefault();
      this.startNewRun(true);
      return;
    }

    if (!e.repeat) {
      if (e.code === 'KeyC') {
        this.toggleCrouch();
      } else if (e.code === 'KeyF') {
        this.throwDoughDecoy();
      } else if (e.code === 'KeyE') {
        this.tryInteract();
      }
    }

    this.keysPressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysPressed.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (performance.now() - this.lastTouchTimestamp > 700 && this.recentTouch) {
      if ((this.container.clientWidth || window.innerWidth) > 768) {
        this.recentTouch = false;
        this.refreshInputMode(true);
      }
    }
    if (this.phase !== 'playing' || this.capturingTimer > 0) return;
    if (document.pointerLockElement !== this.renderer.domElement) return;
    const sensitivity = 0.0022;
    this.yawObject.rotation.y -= e.movementX * sensitivity;
    this.pitchObject.rotation.x -= e.movementY * sensitivity;
    this.pitchObject.rotation.x = Math.max(
      -Math.PI / 2.1,
      Math.min(Math.PI / 2.1, this.pitchObject.rotation.x)
    );
  };

  private onTouchDetect = (): void => {
    this.lastTouchTimestamp = performance.now();
    if (!this.recentTouch) {
      this.recentTouch = true;
      this.refreshInputMode(true);
    }
  };

  private onPointerMediaChange = (): void => {
    this.refreshInputMode(true);
  };

  private onCanvasClick = (): void => {
    if (this.phase === 'playing') {
      this.sound.init();
      if (this.inputMode === 'desktop') {
        this.tryRequestPointerLock();
      }
    }
  };

  private onWindowBlur = (): void => {
    this.keysPressed.clear();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysPressed.clear();
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      this.touchSprint = false;
    }
  };

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.refreshInputMode(true);
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('touchstart', this.onTouchDetect, { passive: true });
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize);
    if (typeof window.matchMedia === 'function') {
      this.coarseQuery = window.matchMedia('(pointer: coarse)');
      this.coarseQuery.addEventListener?.('change', this.onPointerMediaChange);
    }
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  // ============================================================================
  // GAMEPLAY INTERACTIONS & DECOYS
  // ============================================================================
  throwDoughDecoy(): void {
    if (this.phase !== 'playing' || this.decoysRemaining <= 0 || this.capturingTimer > 0) return;
    this.decoysRemaining--;
    this.decoysUsed++;
    this.sound.playThrow();

    const decoyGroup = buildDoughDecoy();
    decoyGroup.scale.setScalar(0.72);
    this.camera.getWorldDirection(this._camDir);
    decoyGroup.position
      .copy(this.yawObject.position)
      .addScaledVector(this._camDir, 1.05);
    decoyGroup.position.y -= 0.25;
    this.scene.add(decoyGroup);

    const vel = this._camDir.clone().multiplyScalar(15.5);
    vel.y += 3.2;

    this.activeDecoys.push({
      group: decoyGroup,
      vel,
      landed: false,
      timer: DECOY_DURATION,
    });
    this.emitHud(true);
  }

  tryInteract(): void {
    if (this.phase !== 'playing' || this.capturingTimer > 0) return;
    if (this.nearbyCoin) {
      this.nearbyCoin.collected = true;
      this.scene.remove(this.nearbyCoin.group);
      this.coinsCollected++;
      this.sound.playCoinChime();
      this.emitHud(true);
    } else if (this.nearExitDoor && canUnlockExit(this.coinsCollected)) {
      this.triggerEnd(
        'victory',
        'You climbed out of the crimson womb into the pouring monsoon clutching your stolen Mudras, barring the ancestral gates behind you.'
      );
    }
  }

  private triggerEnd(outcome: 'victory' | 'defeat', reason: string): void {
    this.keysPressed.clear();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
    this.jumpscareTimer = 0;
    this.jumpscareKind = null;
    this.capturingTimer = 0;
    this.exitPointerLock();
    this.sound.silenceAmbience();
    if (outcome === 'victory') {
      this.sound.playCoinChime();
    }

    const summary: RunSummary = {
      outcome,
      reason,
      coins: this.coinsCollected,
      requiredCoins: REQUIRED_COINS,
      decoysUsed: this.decoysUsed,
      elapsedSeconds: this.elapsedSeconds,
    };

    this.setPhase('gameover');
    this.callbacks.onRunEnd(summary);
  }

  // ============================================================================
  // SIMULATION STEP & RENDER LOOP
  // ============================================================================
  private tick = (): void => {
    if (this.isDisposed) return;

    const now = performance.now();
    const rawDt = Math.max(0, (now - this.lastTime) / 1000);
    const dt = Math.min(rawDt, 0.05);
    this.lastTime = now;

    if (!this.contextLost) {
      if (this.phase === 'title') {
        this.simTime += dt;
        this.updateRain(dt);
        this.updateAtmosphereAndLightning(dt, this.simTime);
        this.updateLanternFlicker(this.simTime);
        this.updateTitleTour(this.simTime);
        (this.scene.fog as THREE.FogExp2).density = 0.032;
      } else if (this.phase === 'playing') {
        this.simTime += dt;
        this.elapsedSeconds += Math.min(rawDt, 0.25);
        this.updateRain(dt);
        this.updateAtmosphereAndLightning(dt, this.simTime);
        this.updateLanternFlicker(this.simTime);
        this.updateCoins(dt);

        if (this.capturingTimer > 0) {
          this.updateCaptureJumpscare(dt, this.simTime);
          this.emitHud(false);
        } else {
          this.updatePlayer(dt);
          this.checkInteractions();
          this.updateMonsterAndDecoys(dt, this.simTime);
          this.updateCameraHorrorEffects(dt);
          this.emitHud(false);
        }
      }

      this.renderer.render(this.scene, this.camera);
    }

    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.isDisposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.isDisposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            this.frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.frameId = window.setTimeout(cb, 80);
          }
        };
        this.frameId = window.setTimeout(poll, 5);
        return;
      }
    } catch {
      // Fallback
    }
    this.frameId = window.setTimeout(cb, 80);
  }

  private updateTitleTour(t: number): void {
    const angle = t * 0.14;
    this.yawObject.position.set(
      Math.sin(angle) * 9.0,
      3.5 + Math.sin(t * 0.4) * 0.25,
      Math.cos(angle) * 9.0
    );
    this.yawObject.rotation.y = angle;
    this.pitchObject.rotation.x = -0.26;
    this.lantern.group.visible = false;
  }

  private updateAtmosphereAndLightning(dt: number, elapsedTime: number): void {
    // Organic breathing pulse of the crimson womb lights
    for (let i = 0; i < this.wombLights.length; i++) {
      const wl = this.wombLights[i];
      const base = (wl.userData.baseIntensity as number) || 1.5;
      wl.intensity = base * (0.78 + Math.sin(elapsedTime * 2.3 + i * 1.4) * 0.25);
    }

    // Monsoon thunder & lightning flashes
    this.nextLightningTimer -= dt;
    if (this.nextLightningTimer <= 0) {
      this.lightningFlash = 1.0;
      this.nextLightningTimer = 9 + Math.random() * 8;
      if (this.phase === 'playing') {
        this.sound.playThunder(computeDepthFactor(this.yawObject.position.y));
      }
    }

    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 2.8);
      const pulse = this.lightningFlash > 0.72 || (this.lightningFlash > 0.35 && this.lightningFlash < 0.52)
        ? 1
        : 0.15;
      this.moonKey.intensity = 0.65 + pulse * 3.6 * this.lightningFlash;
    } else {
      this.moonKey.intensity = 0.65;
    }
  }

  private updateLanternFlicker(t: number): void {
    this.lantern.group.visible = this.phase === 'playing' || this.phase === 'paused';
    const captureOut = this.capturingTimer > 0 ? 0.12 : 1;
    const horrorSputter =
      this.horrorTension > 0.55 || this.monsterState === 'CHASE'
        ? Math.sin(t * 47) * Math.sin(t * 73) > 0.48
          ? 0.28
          : 1.0
        : 1.0;
    const flicker = (1.0 + Math.sin(t * 19) * 0.065 + Math.sin(t * 31) * 0.045) * horrorSputter * captureOut;
    this.lantern.ambientLight.intensity = 1.35 * flicker;
    this.lantern.spotLight.intensity = 2.75 * flicker;
    this.lantern.flameCore.scale.set(0.85 * flicker, 1.35 * flicker, 0.85 * flicker);
  }

  private updateCoins(dt: number): void {
    for (const c of this.coins) {
      if (!c.collected) {
        c.spinMesh.rotation.y += 2.1 * dt;
      }
    }
  }

  private updatePlayer(dt: number): void {
    this._forward.set(0, 0, -1).applyAxisAngle(this._upAxis, this.yawObject.rotation.y);
    this._right.set(1, 0, 0).applyAxisAngle(this._upAxis, this.yawObject.rotation.y);
    this._moveDir.set(0, 0, 0);

    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) {
      this._moveDir.add(this._forward);
    }
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
      this._moveDir.sub(this._forward);
    }
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
      this._moveDir.add(this._right);
    }
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) {
      this._moveDir.sub(this._right);
    }

    // Merge virtual touch joystick vector (touchMoveY > 0 moves forward, touchMoveX > 0 strafes right)
    if (Math.abs(this.touchMoveX) > 0.05 || Math.abs(this.touchMoveY) > 0.05) {
      this._moveDir.addScaledVector(this._forward, this.touchMoveY);
      this._moveDir.addScaledVector(this._right, this.touchMoveX);
    }

    // Optional keyboard look for accessibility
    if (this.keysPressed.has('KeyQ')) {
      this.yawObject.rotation.y += 1.65 * dt;
    }

    const isMoving = this._moveDir.lengthSq() > 0.002;
    const wantsSprint =
      (this.keysPressed.has('ShiftLeft') ||
        this.keysPressed.has('ShiftRight') ||
        this.touchSprint) &&
      isMoving;

    if (wantsSprint && this.isCrouching) {
      this.isCrouching = false;
    }
    const prevSprint = this.isSprinting;
    this.isSprinting = wantsSprint && !this.isCrouching;
    if (prevSprint !== this.isSprinting) {
      this.emitHud(true);
    }

    let moveSpeed: number = PLAYER_SPEEDS.WALK;
    if (this.isCrouching) moveSpeed = PLAYER_SPEEDS.CROUCH;
    else if (this.isSprinting) moveSpeed = PLAYER_SPEEDS.SPRINT;

    const eyeHeight = this.isCrouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
    const currentFootY = this.yawObject.position.y - eyeHeight;

    if (isMoving) {
      const mag = Math.min(1, this._moveDir.length());
      this._moveDir.normalize();
      const stepDist = moveSpeed * mag * dt;
      this.yawObject.position.addScaledVector(this._moveDir, stepDist);
      this.distanceBob += stepDist;

      this.stepAccumulator += stepDist;
      const stepThreshold = this.isSprinting ? 2.2 : 1.85;
      if (this.stepAccumulator >= stepThreshold) {
        this.stepAccumulator = 0;
        if (!this.isCrouching) {
          this.sound.playFootstep(this.isSprinting, this.yawObject.position.y < -3);
        }
      }

      const baseLanternX = Math.min(0.36, 0.14 + this.camera.aspect * 0.18);
      // Gait-synced lantern bobbing
      this.lantern.group.position.y = -0.32 + Math.sin(this.distanceBob * 3.1) * 0.026;
      this.lantern.group.position.x = baseLanternX + Math.cos(this.distanceBob * 1.55) * 0.018;
    } else {
      const baseLanternX = Math.min(0.36, 0.14 + this.camera.aspect * 0.18);
      this.lantern.group.position.y = THREE.MathUtils.damp(this.lantern.group.position.y, -0.32, 8, dt);
      this.lantern.group.position.x = THREE.MathUtils.damp(this.lantern.group.position.x, baseLanternX, 8, dt);
    }

    resolveWorldConstraints(this.yawObject.position, currentFootY);

    const targetFloorY = getFloorHeight(
      this.yawObject.position.x,
      this.yawObject.position.z,
      currentFootY
    );
    const targetEyeY = targetFloorY + eyeHeight;
    this.yawObject.position.y = THREE.MathUtils.damp(this.yawObject.position.y, targetEyeY, 14, dt);

    // Thicker horror fog density inside crimson womb
    const depth = computeDepthFactor(this.yawObject.position.y);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = THREE.MathUtils.lerp(0.044, 0.066, depth);
  }

  private checkInteractions(): void {
    this.nearbyCoin = null;
    this.nearExitDoor = false;
    const pPos = this.yawObject.position;

    for (const c of this.coins) {
      if (!c.collected && pPos.distanceTo(c.group.position) < 2.85) {
        this.nearbyCoin = c;
        break;
      }
    }

    if (pPos.distanceTo(this._exitDoorVec) < 3.75) {
      this.nearExitDoor = true;
    }
  }

  private updateMonsterAndDecoys(dt: number, elapsedTime: number): void {
    const pPos = this.yawObject.position;
    const mPos = this.hastar.group.position;

    this.ambushCooldown = Math.max(0, this.ambushCooldown - dt);
    if (this.jumpscareTimer > 0) {
      this.jumpscareTimer = Math.max(0, this.jumpscareTimer - dt);
      if (this.jumpscareTimer === 0) {
        this.jumpscareKind = null;
        this.emitHud(true);
      }
    }

    let activeDecoyTarget: DecoyEntity | null = null;
    for (let i = this.activeDecoys.length - 1; i >= 0; i--) {
      const d = this.activeDecoys[i];
      if (!d.landed) {
        d.vel.y -= 24 * dt;
        d.group.position.addScaledVector(d.vel, dt);
        const floorY = getFloorHeight(
          d.group.position.x,
          d.group.position.z,
          d.group.position.y
        );
        if (d.group.position.y <= floorY + 0.2) {
          d.group.position.y = floorY + 0.2;
          d.landed = true;
        }
      } else {
        d.timer -= dt;
        if (d.timer <= 0) {
          this.scene.remove(d.group);
          this.activeDecoys.splice(i, 1);
          continue;
        }
      }
      activeDecoyTarget = d;
    }

    const distToPlayerXZ = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);
    const playerInCavern = pPos.y < -4.5;
    const isMoving =
      this.keysPressed.has('KeyW') ||
      this.keysPressed.has('KeyS') ||
      this.keysPressed.has('KeyA') ||
      this.keysPressed.has('KeyD') ||
      this.keysPressed.has('ArrowUp') ||
      this.keysPressed.has('ArrowDown') ||
      this.keysPressed.has('ArrowLeft') ||
      this.keysPressed.has('ArrowRight') ||
      Math.hypot(this.touchMoveX, this.touchMoveY) > 0.1;

    this.camera.getWorldDirection(this._camDir);
    this._monsterHeadPos.set(mPos.x, mPos.y + 2.4, mPos.z);
    this._toMonster.subVectors(this._monsterHeadPos, pPos);
    const distToPlayer3D = this._toMonster.length();
    if (distToPlayer3D > 0.001) {
      this._toMonster.divideScalar(distToPlayer3D);
    }
    const lookDot = this._camDir.dot(this._toMonster);

    const evalRes = evaluateMonsterState({
      prevState: this.monsterState,
      prevLightExposure: this.lightExposure,
      prevAlertTimer: this.alertTimer,
      dt,
      playerInCavern,
      distToPlayerXZ,
      distToPlayer3D,
      lookDot,
      isSprinting: this.isSprinting,
      isCrouching: this.isCrouching,
      isMoving,
      hasActiveDecoy: activeDecoyTarget !== null,
    });

    if (evalRes.triggeredChase) {
      this.sound.playMonsterShriek();
      this.cameraTrauma = Math.max(this.cameraTrauma, 0.55);
    }

    const prevState = this.monsterState;
    this.monsterState = evalRes.nextState;
    this.lightExposure = evalRes.lightExposure;
    this.alertTimer = evalRes.alertTimer;

    this.horrorTension = computeHorrorTension({
      monsterState: this.monsterState,
      distToPlayerXZ,
      playerInCavern,
      lightExposureRatio: Math.min(1, this.lightExposure / 1.05),
    });

    // Ambush Jumpscare shock event when Hastar suddenly rushes from the dark
    if (
      shouldTriggerAmbushJumpscare({
        triggeredChase: evalRes.triggeredChase,
        monsterState: this.monsterState,
        distToPlayerXZ,
        cooldownRemaining: this.ambushCooldown,
        playerInCavern,
      })
    ) {
      this.ambushCooldown = 12.0;
      this.jumpscareTimer = 0.45;
      this.jumpscareKind = 'ambush';
      this.cameraTrauma = 0.92;
      this.sound.playJumpscareScream(0.8);
      this.emitHud(true);
    }

    // Move monster toward target with increased horror speed
    const wp = MONSTER_WAYPOINTS[this.wpIndex];
    let targetX = wp.x;
    let targetZ = wp.z;
    let speed: number = MONSTER_SPEEDS.PATROL;

    if (this.monsterState === 'DECOY' && activeDecoyTarget) {
      targetX = activeDecoyTarget.group.position.x;
      targetZ = activeDecoyTarget.group.position.z;
      speed = MONSTER_SPEEDS.DECOY;
    } else if (this.monsterState === 'CHASE') {
      targetX = pPos.x;
      targetZ = pPos.z;
      speed = MONSTER_SPEEDS.CHASE;
    }

    const dx = targetX - mPos.x;
    const dz = targetZ - mPos.z;
    const distToTarget = Math.hypot(dx, dz);

    if (distToTarget > 0.35) {
      const moveStep = Math.min(distToTarget, speed * dt);
      mPos.x += (dx / distToTarget) * moveStep;
      mPos.z += (dz / distToTarget) * moveStep;
      this.hastar.group.rotation.y = Math.atan2(dx, dz);
    } else if (this.monsterState === 'PATROL') {
      this.wpIndex = (this.wpIndex + 1) % MONSTER_WAYPOINTS.length;
    }

    // Aggressive, unsettling stalker animation
    const strideFreq = speed * 1.65;
    mPos.y = -14.0 + Math.abs(Math.sin(elapsedTime * strideFreq)) * 0.28;
    this.hastar.leftArm.rotation.x = -0.45 + Math.sin(elapsedTime * speed * 2.1) * 0.72;
    this.hastar.rightArm.rotation.x = -0.45 - Math.sin(elapsedTime * speed * 2.1) * 0.72;
    this.hastar.head.rotation.z =
      Math.sin(elapsedTime * 5.2) * 0.16 +
      (this.monsterState === 'CHASE' ? Math.sin(elapsedTime * 29) * 0.1 : 0);
    this.hastar.auraLight.intensity = this.monsterState === 'CHASE' ? 3.4 : 2.0;

    if (isPlayerCaptured(this.monsterState, distToPlayerXZ, pPos.y, mPos.y)) {
      this.captureReason = evalRes.lightDetected
        ? "You lingered your lantern light upon Hastar's cursed face. He lunged from the crimson dark."
        : 'Hastar tore out of the crimson fog and dragged you into the womb.';
      this.capturingTimer = 0.85;
      this.jumpscareTimer = 0.85;
      this.jumpscareKind = 'capture';
      this.cameraTrauma = 1.0;
      this.keysPressed.clear();
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      this.sound.playJumpscareScream(1.1);
      this.emitHud(true);
      return;
    }

    this.sound.updateAmbience(pPos.y, distToPlayerXZ, this.monsterState === 'CHASE');

    if (prevState !== this.monsterState || evalRes.shiningLightOnMonster) {
      this.emitHud(true);
    }
  }

  private updateCaptureJumpscare(dt: number, elapsedTime: number): void {
    this.capturingTimer = Math.max(0, this.capturingTimer - dt);
    this.jumpscareTimer = this.capturingTimer;

    // Lunge Hastar directly in front of the player's eyes with violent shake
    const pPos = this.yawObject.position;
    this._forward.set(0, 0, -1).applyAxisAngle(this._upAxis, this.yawObject.rotation.y);
    const lungeX = pPos.x + this._forward.x * 1.15;
    const lungeZ = pPos.z + this._forward.z * 1.15;
    const lungeY = pPos.y - 2.95 + Math.sin(elapsedTime * 42) * 0.08;

    this.hastar.group.position.x = THREE.MathUtils.damp(this.hastar.group.position.x, lungeX, 24, dt);
    this.hastar.group.position.z = THREE.MathUtils.damp(this.hastar.group.position.z, lungeZ, 24, dt);
    this.hastar.group.position.y = THREE.MathUtils.damp(this.hastar.group.position.y, lungeY, 24, dt);
    this.hastar.group.rotation.y = this.yawObject.rotation.y + Math.PI;
    this.hastar.leftArm.rotation.x = -1.6 + Math.sin(elapsedTime * 36) * 0.25;
    this.hastar.rightArm.rotation.x = -1.6 - Math.sin(elapsedTime * 36) * 0.25;
    this.hastar.head.rotation.z = Math.sin(elapsedTime * 55) * 0.24;
    this.hastar.auraLight.intensity = 5.5;

    // Snap camera level toward Hastar's roaring face
    this.pitchObject.rotation.x = THREE.MathUtils.damp(this.pitchObject.rotation.x, 0.06, 18, dt);
    this.cameraTrauma = 1.0;
    this.updateCameraHorrorEffects(dt);

    if (this.capturingTimer <= 0) {
      this.triggerEnd('defeat', this.captureReason);
    }
  }

  private updateCameraHorrorEffects(dt: number): void {
    // Decay trauma smoothly
    const ambientDread = this.monsterState === 'CHASE' ? 0.22 : this.horrorTension * 0.08;
    this.cameraTrauma = Math.max(ambientDread, this.cameraTrauma - dt * 1.35);
    const shake = this.cameraTrauma * this.cameraTrauma;

    if (shake > 0.001) {
      const t = this.simTime;
      this.camera.rotation.z = Math.sin(t * 43) * 0.065 * shake;
      this.camera.rotation.x = Math.cos(t * 51) * 0.045 * shake;
      this.camera.rotation.y = Math.sin(t * 37) * 0.045 * shake;
    } else {
      this.camera.rotation.set(0, 0, 0);
    }

    // Dynamic FOV dread kick (widens on sprint/chase, punches inward on capture jumpscare)
    const targetFov =
      this.capturingTimer > 0
        ? 54
        : this.jumpscareKind === 'ambush' && this.jumpscareTimer > 0
        ? 82
        : this.monsterState === 'CHASE' || this.isSprinting
        ? 75
        : 70;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private emitHud(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmit < 100) return;
    this.lastHudEmit = now;

    const interactVerb = this.inputMode === 'mobile' ? 'Tap Take' : '[E]';
    const unlockVerb = this.inputMode === 'mobile' ? 'Tap Unlock' : '[E]';

    let promptText: string | null = null;
    let canInteract = false;
    if (this.nearbyCoin) {
      promptText = `${interactVerb} Gold Mudra`;
      canInteract = true;
    } else if (this.nearExitDoor) {
      if (canUnlockExit(this.coinsCollected)) {
        promptText = `${unlockVerb} Mansion Gates & Escape`;
        canInteract = true;
      } else {
        promptText = `Locked — Collect ${REQUIRED_COINS} Gold Mudras (${this.coinsCollected}/${REQUIRED_COINS})`;
      }
    }

    const activeDecoy = this.activeDecoys.length > 0 ? this.activeDecoys[this.activeDecoys.length - 1] : null;
    const decoyTimeLeft = activeDecoy ? Math.max(0, activeDecoy.timer) : 0;

    this.callbacks.onHudUpdate({
      coins: this.coinsCollected,
      requiredCoins: REQUIRED_COINS,
      totalCoins: COIN_LOCATIONS.length,
      decoys: this.decoysRemaining,
      maxDecoys: MAX_DECOYS,
      stance: this.isCrouching ? 'crouching' : this.isSprinting ? 'sprinting' : 'standing',
      monsterState: this.monsterState,
      decoyTimeLeft,
      lightWarning: this.lightExposure > 0.08 && this.monsterState !== 'DECOY',
      lightExposureRatio: Math.min(1, this.lightExposure / 1.05),
      promptText,
      canInteract,
      inCavern: this.yawObject.position.y < -4.5,
      elapsedSeconds: this.elapsedSeconds,
      inputMode: this.inputMode,
      jumpscareActive: this.jumpscareTimer > 0,
      jumpscareKind: this.jumpscareTimer > 0 ? this.jumpscareKind : null,
      horrorTension: this.horrorTension,
    });
  }

  dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('touchstart', this.onTouchDetect);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
    this.coarseQuery?.removeEventListener?.('change', this.onPointerMediaChange);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.exitPointerLock();
    this.sound.dispose();
    this.textures.dispose();
    this.envRT.dispose();

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
