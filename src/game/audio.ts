export class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private initialized = false;
  private muted = false;
  private lastBeatTime = 0;
  private lastMonsterStepTime = 0;

  init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
    } catch {
      return;
    }

    this.initialized = true;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);

    // 1. Procedural Monsoon Rain (Filtered White Noise)
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = noiseBuffer;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 950;
    rainFilter.Q.value = 0.7;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.24;

    whiteNoise.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    whiteNoise.start();

    // 2. Eerie Subterranean Womb Drone (tritone dissonance)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc3.type = 'sawtooth';
    osc1.frequency.value = 41;
    osc2.frequency.value = 58;
    osc3.frequency.value = 82.5;

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 130;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.05;

    osc1.connect(this.droneFilter);
    osc2.connect(this.droneFilter);
    osc3.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);
    osc1.start();
    osc2.start();
    osc3.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.04);
    }
  }

  silenceAmbience(): void {
    if (!this.initialized || !this.ctx || !this.rainGain || !this.droneGain) return;
    this.rainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  updateAmbience(playerY: number, monsterDist: number, isChasing: boolean): void {
    if (!this.initialized || !this.ctx || !this.rainGain || !this.droneGain || !this.droneFilter) {
      return;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const depthFactor = Math.min(1, Math.max(0, -playerY / 14));
    const proximityUrgency = isChasing ? 1 : Math.max(0, 1 - monsterDist / 24);
    this.rainGain.gain.setTargetAtTime(0.26 * (1 - depthFactor * 0.85), this.ctx.currentTime, 0.12);
    this.droneGain.gain.setTargetAtTime(
      0.05 + depthFactor * 0.28 + proximityUrgency * 0.14,
      this.ctx.currentTime,
      0.1
    );
    this.droneFilter.frequency.setTargetAtTime(
      isChasing ? 440 : 120 + depthFactor * 90 + proximityUrgency * 140,
      this.ctx.currentTime,
      0.16
    );

    const now = performance.now();
    if (monsterDist < 24 || isChasing) {
      const beatInterval = 900 - proximityUrgency * 600;
      if (now - this.lastBeatTime > beatInterval) {
        this.playHeartbeat(0.16 + proximityUrgency * 0.46);
        this.lastBeatTime = now;
      }
    }

    if (depthFactor > 0.3 && monsterDist < 20) {
      const stepInterval = isChasing ? 240 : 410;
      if (now - this.lastMonsterStepTime > stepInterval) {
        this.playMonsterFootstep(monsterDist, isChasing);
        this.lastMonsterStepTime = now;
      }
    }
  }

  private playHeartbeat(vol: number): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const playThump = (delay: number, pitch: number, gainVal: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, t + delay);
      osc.frequency.exponentialRampToValueAtTime(20, t + delay + 0.14);
      gain.gain.setValueAtTime(gainVal, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + delay);
      osc.stop(t + delay + 0.17);
    };
    playThump(0, 68, vol);
    playThump(0.15, 50, vol * 0.78);
  }

  private playMonsterFootstep(dist: number, isChasing: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const atten = Math.max(0.05, 1 - dist / 21);
    const vol = atten * (isChasing ? 0.32 : 0.16);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const jitter = 0.9 + Math.random() * 0.2;
    osc.frequency.setValueAtTime((isChasing ? 92 : 70) * jitter, t);
    osc.frequency.exponentialRampToValueAtTime(22, t + 0.13);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playFootstep(isSprint: boolean, isCavern: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isCavern ? 'sine' : 'triangle';
    const pitchJitter = 0.92 + Math.random() * 0.16;
    const startFreq = (isSprint ? 130 : 85) * pitchJitter;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.09);

    const vol = isSprint ? 0.24 : 0.1;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  playCoinChime(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    [1150, 1720, 2300].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);
      gain.gain.setValueAtTime(0.14 / (idx + 1), t + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + idx * 0.04 + 0.85);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.9);
    });
  }

  playThrow(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.18);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  playMonsterShriek(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    [140, 215, 390, 565].forEach((f) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 1.48, t + 0.22);
      osc.frequency.exponentialRampToValueAtTime(f * 0.36, t + 1.25);
      gain.gain.setValueAtTime(0.19, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 1.35);
    });
  }

  playJumpscareScream(intensity = 1): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const scale = Math.max(0.4, Math.min(1.15, intensity));

    // 1. Sub-bass impact slam
    const slam = this.ctx.createOscillator();
    const slamGain = this.ctx.createGain();
    slam.type = 'sine';
    slam.frequency.setValueAtTime(135, t);
    slam.frequency.exponentialRampToValueAtTime(24, t + 0.45);
    slamGain.gain.setValueAtTime(0.65 * scale, t);
    slamGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    slam.connect(slamGain);
    slamGain.connect(this.masterGain);
    slam.start(t);
    slam.stop(t + 0.58);

    // 2. Dissonant shrieking cluster
    [290, 418, 612, 875, 1180].forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(f * 1.25, t);
      osc.frequency.linearRampToValueAtTime(f * 0.92, t + 0.14);
      osc.frequency.linearRampToValueAtTime(f * 1.38, t + 0.32);
      osc.frequency.exponentialRampToValueAtTime(f * 0.32, t + 0.95);
      gain.gain.setValueAtTime((0.22 / (1 + idx * 0.25)) * scale, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.98);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 1.0);
    });

    // 3. Harsh roaring noise burst
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, t);
      filter.frequency.exponentialRampToValueAtTime(380, t + 0.8);
      filter.Q.value = 1.4;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.45 * scale, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.88);
    }
  }

  playThunder(depthFactor: number): void {
    if (!this.initialized || !this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) {
      return;
    }
    const t = this.ctx.currentTime;
    const vol = Math.max(0.08, 0.38 * (1 - depthFactor * 0.72));
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(65, t + 2.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 2.45);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
