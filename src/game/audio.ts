export class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private initialized = false;
  private muted = false;
  private lastBeatTime = 0;

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

    // 2. Eerie Subterranean Womb Drone
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.value = 46;
    osc2.frequency.value = 69;

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 130;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.04;

    osc1.connect(this.droneFilter);
    osc2.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);
    osc1.start();
    osc2.start();
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
    this.rainGain.gain.setTargetAtTime(0.26 * (1 - depthFactor * 0.82), this.ctx.currentTime, 0.12);
    this.droneGain.gain.setTargetAtTime(0.04 + depthFactor * 0.25, this.ctx.currentTime, 0.12);
    this.droneFilter.frequency.setTargetAtTime(
      isChasing ? 320 : 120 + depthFactor * 60,
      this.ctx.currentTime,
      0.2
    );

    const now = performance.now();
    if (monsterDist < 22 || isChasing) {
      const urgency = isChasing ? 1 : Math.max(0, 1 - monsterDist / 22);
      const beatInterval = 950 - urgency * 620;
      if (now - this.lastBeatTime > beatInterval) {
        this.playHeartbeat(0.14 + urgency * 0.42);
        this.lastBeatTime = now;
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
      osc.frequency.exponentialRampToValueAtTime(22, t + delay + 0.14);
      gain.gain.setValueAtTime(gainVal, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + delay);
      osc.stop(t + delay + 0.17);
    };
    playThump(0, 65, vol);
    playThump(0.16, 52, vol * 0.75);
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
    [140, 215, 390].forEach((f) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 1.4, t + 0.25);
      osc.frequency.exponentialRampToValueAtTime(f * 0.4, t + 1.2);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 1.3);
    });
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
