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
  DECOY_DURATION,
  evaluateMonsterState,
  EXIT_DOOR_POS,
  EYE_HEIGHT_CROUCH,
  EYE_HEIGHT_STAND,
  getFloorHeight,
  isPlayerCaptured,
  MAX_DECOYS,
  MONSTER_WAYPOINTS,
  REQUIRED_COINS,
  resolveWorldConstraints,
} from './rules';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import type { GamePhase, HudSnapshot, MonsterState, RunSummary } from './types';

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

  private rainGeo!: THREE.BufferGeometry;
  private rainLines!: THREE.LineSegments;
  private readonly rainCount = 1600;

  private coins: CoinEntity[] = [];
  private activeDecoys: DecoyEntity[] = [];

  private phase: GamePhase = 'title';
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
  private elapsedSeconds = 0;
  private stepAccumulator = 0;
  private distanceBob = 0;

  // Monster AI state
  private monsterState: MonsterState = 'PATROL';
  private wpIndex = 0;
  private lightExposure = 0;
  private alertTimer = 0;

  // Interaction state
  private nearbyCoin: CoinEntity | null = null;
  private nearExitDoor = false;
  private lastHudEmit = 0;

  // Input state
  private keysPressed = new Set<string>();
  private lastTime = performance.now();
  private simTime = 0;

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
    this.renderer.toneMappingExposure = 1.12;
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
    this.scene.background = new THREE.Color(0x050203);
    this.scene.fog = new THREE.FogExp2(0x070304, 0.038);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.25;
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

    // Warm/cool atmospheric lighting
    const hemiLight = new THREE.HemisphereLight(0x3a4866, 0x330809, 0.62);
    this.scene.add(hemiLight);

    const moonKey = new THREE.DirectionalLight(0x7c96bd, 0.72);
    moonKey.position.set(-16, 26, 12);
    if (!this.isSoftwareGl) {
      moonKey.castShadow = true;
      moonKey.shadow.mapSize.set(1024, 1024);
      moonKey.shadow.camera.left = -22;
      moonKey.shadow.camera.right = 22;
      moonKey.shadow.camera.top = 22;
      moonKey.shadow.camera.bottom = -22;
      moonKey.shadow.camera.near = 1;
      moonKey.shadow.camera.far = 65;
      moonKey.shadow.bias = -0.0005;
      moonKey.shadow.normalBias = 0.02;
    }
    this.scene.add(moonKey);

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.buildEnvironment();
    this.buildRain();

    this.hastar = buildHastarModel(this.textures.shadowDisc);
    this.hastar.group.position.set(0, -14, -18);
    this.scene.add(this.hastar.group);

    this.spawnCoins();
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
    const stairBeacon = new THREE.PointLight(0xff7733, 2.8, 16, 1.4);
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
    const pitGlow = new THREE.PointLight(0xe01b1b, 3.4, 24, 1.3);
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

    // Strategic crimson womb lights (budget <= 5 unshadowed cavern point lights)
    const wombLights = [
      { x: 0, y: -8.5, z: -18, i: 2.0 },
      { x: -16, y: -8, z: -6, i: 1.7 },
      { x: 16, y: -8, z: -6, i: 1.7 },
      { x: 0, y: -8, z: 14, i: 1.8 },
    ];
    for (const wl of wombLights) {
      const pl = new THREE.PointLight(0xd91414, wl.i, 28, 1.6);
      pl.position.set(wl.x, wl.y, wl.z);
      this.scene.add(pl);
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
  // PUBLIC GAME LIFECYCLE CONTROLS
  // ============================================================================
  startNewRun(requestLock = true): void {
    this.sound.init();
    this.resetSimulation();
    this.setPhase('playing');
    if (requestLock) {
      this.tryRequestPointerLock();
    }
  }

  resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.sound.init();
    this.setPhase('playing');
    this.tryRequestPointerLock();
  }

  pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.keysPressed.clear();
    this.exitPointerLock();
    this.sound.silenceAmbience();
    this.setPhase('paused');
  }

  returnToTitle(): void {
    this.keysPressed.clear();
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
    this.elapsedSeconds = 0;
    this.stepAccumulator = 0;
    this.distanceBob = 0;
    this.keysPressed.clear();

    // Spawn facing north toward the glowing central pit staircase!
    this.yawObject.position.set(0, EYE_HEIGHT_STAND, 13.0);
    this.yawObject.rotation.set(0, 0, 0);
    this.pitchObject.rotation.set(-0.08, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);

    // Reset Hastar inside the cavern
    this.hastar.group.position.set(0, -14, -18);
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

    if (this.phase !== 'playing') return;

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
        this.isCrouching = !this.isCrouching;
        this.emitHud(true);
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
    if (this.phase !== 'playing') return;
    if (document.pointerLockElement !== this.renderer.domElement) return;
    const sensitivity = 0.0022;
    this.yawObject.rotation.y -= e.movementX * sensitivity;
    this.pitchObject.rotation.x -= e.movementY * sensitivity;
    this.pitchObject.rotation.x = Math.max(
      -Math.PI / 2.1,
      Math.min(Math.PI / 2.1, this.pitchObject.rotation.x)
    );
  };

  private onCanvasClick = (): void => {
    if (this.phase === 'playing') {
      this.sound.init();
      this.tryRequestPointerLock();
    }
  };

  private onWindowBlur = (): void => {
    this.keysPressed.clear();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysPressed.clear();
    }
  };

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
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
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  // ============================================================================
  // GAMEPLAY INTERACTIONS & DECOYS
  // ============================================================================
  throwDoughDecoy(): void {
    if (this.phase !== 'playing' || this.decoysRemaining <= 0) return;
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

  private tryInteract(): void {
    if (this.nearbyCoin) {
      this.nearbyCoin.collected = true;
      this.scene.remove(this.nearbyCoin.group);
      this.coinsCollected++;
      this.sound.playCoinChime();
      this.emitHud(true);
    } else if (this.nearExitDoor && canUnlockExit(this.coinsCollected)) {
      this.triggerEnd('victory', 'You climbed out of the crimson womb into the pouring monsoon clutching your stolen Mudras, barring the ancestral gates behind you.');
    }
  }

  private triggerEnd(outcome: 'victory' | 'defeat', reason: string): void {
    this.keysPressed.clear();
    this.exitPointerLock();
    this.sound.silenceAmbience();
    if (outcome === 'victory') {
      this.sound.playCoinChime();
    } else {
      this.sound.playMonsterShriek();
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
        this.updateLanternFlicker(this.simTime);
        this.updateTitleTour(this.simTime);
      } else if (this.phase === 'playing') {
        this.simTime += dt;
        this.elapsedSeconds += Math.min(rawDt, 0.25);
        this.updateRain(dt);
        this.updateLanternFlicker(this.simTime);
        this.updateCoins(dt);
        this.updatePlayer(dt);
        this.checkInteractions();
        this.updateMonsterAndDecoys(dt, this.simTime);
        this.emitHud(false);
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
      Math.sin(angle) * 11.5,
      4.4 + Math.sin(t * 0.4) * 0.35,
      Math.cos(angle) * 11.5
    );
    this.yawObject.rotation.y = angle;
    this.pitchObject.rotation.x = -0.34;
    this.lantern.group.visible = false;
  }

  private updateLanternFlicker(t: number): void {
    this.lantern.group.visible = this.phase === 'playing' || this.phase === 'paused';
    const flicker = 1.0 + Math.sin(t * 19) * 0.055 + Math.sin(t * 31) * 0.035;
    this.lantern.ambientLight.intensity = 1.4 * flicker;
    this.lantern.spotLight.intensity = 2.8 * flicker;
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

    // Optional keyboard look for accessibility (Q/E? No, E is interact; ArrowLeft/Right move, J/L look)
    if (this.keysPressed.has('KeyQ')) {
      this.yawObject.rotation.y += 1.65 * dt;
    }

    const isMoving = this._moveDir.lengthSq() > 0;
    const wantsSprint =
      (this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight')) && isMoving;

    if (wantsSprint && this.isCrouching) {
      this.isCrouching = false;
    }
    const prevSprint = this.isSprinting;
    this.isSprinting = wantsSprint && !this.isCrouching;
    if (prevSprint !== this.isSprinting) {
      this.emitHud(true);
    }

    let moveSpeed = 4.6;
    if (this.isCrouching) moveSpeed = 2.35;
    else if (this.isSprinting) moveSpeed = 8.0;

    const eyeHeight = this.isCrouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
    const currentFootY = this.yawObject.position.y - eyeHeight;

    if (isMoving) {
      this._moveDir.normalize();
      const stepDist = moveSpeed * dt;
      this.yawObject.position.addScaledVector(this._moveDir, stepDist);
      this.distanceBob += stepDist;

      this.stepAccumulator += stepDist;
      const stepThreshold = this.isSprinting ? 2.3 : 1.9;
      if (this.stepAccumulator >= stepThreshold) {
        this.stepAccumulator = 0;
        if (!this.isCrouching) {
          this.sound.playFootstep(this.isSprinting, this.yawObject.position.y < -3);
        }
      }

      // Gait-synced lantern bobbing
      this.lantern.group.position.y = -0.32 + Math.sin(this.distanceBob * 3.1) * 0.026;
      this.lantern.group.position.x = 0.36 + Math.cos(this.distanceBob * 1.55) * 0.018;
    } else {
      this.lantern.group.position.y = THREE.MathUtils.damp(this.lantern.group.position.y, -0.32, 8, dt);
      this.lantern.group.position.x = THREE.MathUtils.damp(this.lantern.group.position.x, 0.36, 8, dt);
    }

    resolveWorldConstraints(this.yawObject.position, currentFootY);

    const targetFloorY = getFloorHeight(
      this.yawObject.position.x,
      this.yawObject.position.z,
      currentFootY
    );
    const targetEyeY = targetFloorY + eyeHeight;
    this.yawObject.position.y = THREE.MathUtils.damp(this.yawObject.position.y, targetEyeY, 14, dt);

    // Depth-modulated fog density (heavier inside crimson womb)
    const depth = computeDepthFactor(this.yawObject.position.y);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = THREE.MathUtils.lerp(0.036, 0.048, depth);
  }

  private checkInteractions(): void {
    this.nearbyCoin = null;
    this.nearExitDoor = false;
    const pPos = this.yawObject.position;

    for (const c of this.coins) {
      if (!c.collected && pPos.distanceTo(c.group.position) < 2.75) {
        this.nearbyCoin = c;
        break;
      }
    }

    if (pPos.distanceTo(this._exitDoorVec) < 3.65) {
      this.nearExitDoor = true;
    }
  }

  private updateMonsterAndDecoys(dt: number, elapsedTime: number): void {
    const pPos = this.yawObject.position;
    const mPos = this.hastar.group.position;

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
      hasActiveDecoy: activeDecoyTarget !== null,
    });

    if (evalRes.triggeredChase) {
      this.sound.playMonsterShriek();
    }

    const prevState = this.monsterState;
    this.monsterState = evalRes.nextState;
    this.lightExposure = evalRes.lightExposure;
    this.alertTimer = evalRes.alertTimer;

    // Move monster toward target
    const wp = MONSTER_WAYPOINTS[this.wpIndex];
    let targetX = wp.x;
    let targetZ = wp.z;
    let speed = 3.6;

    if (this.monsterState === 'DECOY' && activeDecoyTarget) {
      targetX = activeDecoyTarget.group.position.x;
      targetZ = activeDecoyTarget.group.position.z;
      speed = 8.2;
    } else if (this.monsterState === 'CHASE') {
      targetX = pPos.x;
      targetZ = pPos.z;
      speed = 6.6;
    }

    const dx = targetX - mPos.x;
    const dz = targetZ - mPos.z;
    const distToTarget = Math.hypot(dx, dz);

    if (distToTarget > 0.4) {
      const moveStep = Math.min(distToTarget, speed * dt);
      mPos.x += (dx / distToTarget) * moveStep;
      mPos.z += (dz / distToTarget) * moveStep;
      this.hastar.group.rotation.y = Math.atan2(dx, dz);
    } else if (this.monsterState === 'PATROL') {
      this.wpIndex = (this.wpIndex + 1) % MONSTER_WAYPOINTS.length;
    }

    mPos.y = -14.0 + Math.abs(Math.sin(elapsedTime * speed * 1.5)) * 0.22;
    this.hastar.leftArm.rotation.x = -0.35 + Math.sin(elapsedTime * speed * 2) * 0.55;
    this.hastar.rightArm.rotation.x = -0.35 - Math.sin(elapsedTime * speed * 2) * 0.55;
    this.hastar.head.rotation.z = Math.sin(elapsedTime * 3.1) * 0.08;
    this.hastar.auraLight.intensity = this.monsterState === 'CHASE' ? 2.8 : 1.7;

    if (isPlayerCaptured(this.monsterState, distToPlayerXZ, pPos.y, mPos.y)) {
      const reason = evalRes.lightDetected
        ? "You lingered your lantern light upon Hastar's cursed face. He lunged from the crimson dark."
        : 'Hastar heard your footsteps echoing through the womb and dragged you into the dark.';
      this.triggerEnd('defeat', reason);
      return;
    }

    this.sound.updateAmbience(pPos.y, distToPlayerXZ, this.monsterState === 'CHASE');

    if (prevState !== this.monsterState || evalRes.shiningLightOnMonster) {
      this.emitHud(true);
    }
  }

  private emitHud(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmit < 100) return;
    this.lastHudEmit = now;

    let promptText: string | null = null;
    if (this.nearbyCoin) {
      promptText = '[E] Take Gold Mudra';
    } else if (this.nearExitDoor) {
      promptText = canUnlockExit(this.coinsCollected)
        ? '[E] Unlock Mansion Gates & Escape'
        : `Locked — Collect ${REQUIRED_COINS} Gold Mudras (${this.coinsCollected}/${REQUIRED_COINS})`;
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
      lightExposureRatio: Math.min(1, this.lightExposure / 1.15),
      promptText,
      inCavern: this.yawObject.position.y < -4.5,
      elapsedSeconds: this.elapsedSeconds,
    });
  }

  dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
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
