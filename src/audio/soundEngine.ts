/**
 * Chess Realms - Web Audio Procedural Synthesizer
 * Generates all SFX and 8 distinct ambient arena audio loops completely in code.
 * Zero external audio files or network dependencies.
 */

export type ArenaId =
  | 'chess_arena'
  | 'traditional'
  | 'japan'
  | 'india'
  | 'usa'
  | 'egypt'
  | 'royal_kingdom'
  | 'shadow_dungeon';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private cinematicGain: GainNode | null = null;

  private currentAmbientNodes: { stop: () => void } | null = null;
  private currentArena: ArenaId | null = null;

  public volume: number = 0.7;
  public ambientVolume: number = 0.18;
  public sfxVolume: number = 0.85;
  public cinematicVolume: number = 0.9;
  public isMuted: boolean = false;
  public isMusicMuted: boolean = false;
  public isSfxMuted: boolean = false;

  constructor() {
    // Load preferences from localStorage if available
    if (typeof window !== 'undefined') {
      const savedVol = localStorage.getItem('chess_realms_volume');
      if (savedVol !== null) this.volume = parseFloat(savedVol);
      const savedMute = localStorage.getItem('chess_realms_muted');
      if (savedMute !== null) this.isMuted = savedMute === 'true';

      const amb = localStorage.getItem('chess_realms_ambient_vol');
      if (amb !== null) {
        const val = parseFloat(amb);
        this.ambientVolume = val <= 0.03 ? 0.18 : val;
      } else {
        this.ambientVolume = 0.18;
      }

      const sfx = localStorage.getItem('chess_realms_sfx_vol');
      if (sfx !== null) this.sfxVolume = parseFloat(sfx);
      const cin = localStorage.getItem('chess_realms_cinematic_vol');
      if (cin !== null) this.cinematicVolume = parseFloat(cin);

      const musicMuted = localStorage.getItem('chess_realms_music_muted');
      if (musicMuted !== null) this.isMusicMuted = musicMuted === 'true';
      const sfxMuted = localStorage.getItem('chess_realms_sfx_muted');
      if (sfxMuted !== null) this.isSfxMuted = sfxMuted === 'true';

      // Global window unlock listener on user interaction
      const unlockAudio = () => {
        this.getAudioContext();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('click', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio);
      window.addEventListener('keydown', unlockAudio);
      window.addEventListener('touchstart', unlockAudio);
      window.addEventListener('click', unlockAudio);
    }
  }

  public getAudioContext(): AudioContext | null {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.isSfxMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(this.isMusicMuted ? 0 : this.ambientVolume, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      this.cinematicGain = this.ctx.createGain();
      this.cinematicGain.gain.setValueAtTime(this.cinematicVolume, this.ctx.currentTime);
      this.cinematicGain.connect(this.masterGain);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public toggleMusic(): boolean {
    this.getAudioContext();
    this.isMusicMuted = !this.isMusicMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_music_muted', this.isMusicMuted.toString());
    }
    if (this.ambientGain && this.ctx) {
      const target = this.isMusicMuted ? 0 : this.ambientVolume;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    if (this.isMusicMuted) {
      this.stopAmbient();
    } else if (this.currentArena) {
      this.playArenaAmbient(this.currentArena);
    }
    return !this.isMusicMuted;
  }

  public setMusicMuted(muted: boolean) {
    this.getAudioContext();
    this.isMusicMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_music_muted', this.isMusicMuted.toString());
    }
    if (this.ambientGain && this.ctx) {
      const target = this.isMusicMuted ? 0 : this.ambientVolume;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    if (this.isMusicMuted) {
      this.stopAmbient();
    } else if (this.currentArena) {
      this.playArenaAmbient(this.currentArena);
    }
  }

  public toggleSfx(): boolean {
    this.initContext();
    this.isSfxMuted = !this.isSfxMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_sfx_muted', this.isSfxMuted.toString());
    }
    if (this.sfxGain && this.ctx) {
      const target = this.isSfxMuted ? 0 : this.sfxVolume;
      this.sfxGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    return !this.isSfxMuted;
  }

  public setSfxMuted(muted: boolean) {
    this.initContext();
    this.isSfxMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_sfx_muted', this.isSfxMuted.toString());
    }
    if (this.sfxGain && this.ctx) {
      const target = this.isSfxMuted ? 0 : this.sfxVolume;
      this.sfxGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setAmbientVolume(vol: number) {
    this.ambientVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_ambient_vol', this.ambientVolume.toString());
    }
    if (this.ambientGain && this.ctx) {
      const target = this.isMusicMuted ? 0 : this.ambientVolume;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_sfx_vol', this.sfxVolume.toString());
    }
    if (this.sfxGain && this.ctx) {
      const target = this.isSfxMuted ? 0 : this.sfxVolume;
      this.sfxGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setCinematicVolume(vol: number) {
    this.cinematicVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_cinematic_vol', this.cinematicVolume.toString());
    }
    if (this.cinematicGain && this.ctx) {
      this.cinematicGain.gain.setTargetAtTime(this.cinematicVolume, this.ctx.currentTime, 0.05);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_volume', this.volume.toString());
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_realms_muted', this.isMuted.toString());
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    if (this.isMuted) {
      this.stopAmbient();
    } else if (this.currentArena && !this.isMusicMuted) {
      this.playArenaAmbient(this.currentArena);
    }
    return this.isMuted;
  }

  // --- ADAPTIVE TENSION LAYER ---
  // A soft heartbeat whose rate and level follow game tension (check, low clock),
  // while the ambient bed ducks slightly so the pulse reads clearly.
  private tension = 0;
  private heartbeatTimer: number | null = null;

  public setTension(t: number) {
    const next = Math.max(0, Math.min(1, t));
    if (Math.abs(next - this.tension) < 0.02) return;
    this.tension = next;
    if (this.ambientGain && this.ctx) {
      const target = this.isMusicMuted ? 0 : this.ambientVolume * (1 - 0.4 * next);
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    }
    if (next > 0.05 && this.heartbeatTimer === null) this.scheduleHeartbeat();
  }

  private scheduleHeartbeat() {
    const bpm = 64 + this.tension * 56;
    this.heartbeatTimer = window.setTimeout(() => {
      this.heartbeatTimer = null;
      if (this.tension <= 0.05) return;
      this.playHeartbeat(this.tension);
      this.scheduleHeartbeat();
    }, 60000 / bpm);
  }

  private playHeartbeat(level: number) {
    if (!this.ctx || !this.sfxGain || this.isMuted || this.isSfxMuted) return;
    const now = this.ctx.currentTime;
    const thump = (at: number, gain: number) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(62, at);
      o.frequency.exponentialRampToValueAtTime(38, at + 0.16);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      o.connect(g).connect(this.sfxGain!);
      o.start(at);
      o.stop(at + 0.25);
    };
    const v = 0.08 + level * 0.22;
    thump(now, v);
    thump(now + 0.19, v * 0.7);
  }

  // --- SOUND EFFECTS ---

  private lastMoveVariant: number = -1;
  private lastCaptureVariant: number = -1;
  private lastSoundTimes: Record<string, number> = {};

  private getSfxDestination(fileIndex?: number): AudioNode {
    if (!this.ctx || !this.sfxGain) return this.sfxGain!;
    if (fileIndex !== undefined && (this.ctx as any).createStereoPanner) {
      const panner = (this.ctx as any).createStereoPanner();
      // fileIndex: 0 (A-file, left) to 7 (H-file, right)
      panner.pan.value = Math.max(-1, Math.min(1, ((fileIndex - 3.5) / 3.5) * 0.65));
      panner.connect(this.sfxGain);
      return panner;
    }
    return this.sfxGain;
  }

  private playMaterialOvertones(destination: AudioNode, material?: string, now?: number) {
    if (!this.ctx || !material) return;
    const t = now ?? this.ctx.currentTime;
    const m = material.toLowerCase();
    if (m === 'gold' || m === 'silver') {
      // Warm metallic bell harmonic (880Hz decay)
      const bellOsc = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(880, t);
      bellGain.gain.setValueAtTime(0.22, t);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      bellOsc.connect(bellGain);
      bellGain.connect(destination);
      bellOsc.start(t);
      bellOsc.stop(t + 0.35);
    } else if (m === 'diamond' || m === 'ruby' || m === 'jade') {
      // Crisp crystalline glass chime (1760Hz shimmer)
      const chimeOsc = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      chimeOsc.type = 'triangle';
      chimeOsc.frequency.setValueAtTime(1760, t);
      chimeGain.gain.setValueAtTime(0.18, t);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      chimeOsc.connect(chimeGain);
      chimeGain.connect(destination);
      chimeOsc.start(t);
      chimeOsc.stop(t + 0.28);
    } else if (m === 'obsidian' || m === 'marble') {
      // Deep carved stone bass thud (95Hz resonance)
      const stoneOsc = this.ctx.createOscillator();
      const stoneGain = this.ctx.createGain();
      stoneOsc.type = 'sine';
      stoneOsc.frequency.setValueAtTime(95, t);
      stoneOsc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      stoneGain.gain.setValueAtTime(0.35, t);
      stoneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      stoneOsc.connect(stoneGain);
      stoneGain.connect(destination);
      stoneOsc.start(t);
      stoneOsc.stop(t + 0.2);
    }
  }

  public playSelectSound(fileIndex?: number) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    } catch {
      // Ignore vibration errors on unsupported browsers
    }
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastSoundTimes['select'] || 0) < 0.04) return;
    this.lastSoundTimes['select'] = now;
    const sfxDest = this.getSfxDestination(fileIndex);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.028);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

    osc.connect(gain);
    gain.connect(sfxDest);
    osc.start(now);
    osc.stop(now + 0.032);
  }

  public playMoveSound(fileIndex?: number, material?: string) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(24);
      }
    } catch {
      // Ignore vibration errors on unsupported browsers
    }
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastSoundTimes['move'] || 0) < 0.06) return;
    this.lastSoundTimes['move'] = now;
    const originalGain = this.sfxGain;
    const sfxDest = this.getSfxDestination(fileIndex);
    this.sfxGain = sfxDest as GainNode;

    try {
      this.playMaterialOvertones(sfxDest, material, now);

      // Pick a randomized variant that differs from the previous one
      let variant: number;
      do {
        variant = Math.floor(Math.random() * 5);
      } while (variant === this.lastMoveVariant);
      this.lastMoveVariant = variant;

    switch (variant) {
      case 0: {
        // Variant 0: Classic Hardwood Clack (warm triangle drop + tactile high snap)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(225, now);
        osc.frequency.exponentialRampToValueAtTime(68, now + 0.08);

        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.12);

        const snapOsc = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();
        snapOsc.type = 'sine';
        snapOsc.frequency.setValueAtTime(1450, now);
        snapOsc.frequency.exponentialRampToValueAtTime(320, now + 0.03);

        snapGain.gain.setValueAtTime(0.28, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        snapOsc.connect(snapGain);
        snapGain.connect(this.sfxGain);
        snapOsc.start(now);
        snapOsc.stop(now + 0.04);
        break;
      }

      case 1: {
        // Variant 1: Crisp Marble Tap (higher fundamental + ceramic glass transient)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(310, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.07);

        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.09);

        // High ceramic click
        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(2200, now);
        clickOsc.frequency.exponentialRampToValueAtTime(550, now + 0.025);

        clickGain.gain.setValueAtTime(0.35, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        clickOsc.connect(clickGain);
        clickGain.connect(this.sfxGain);
        clickOsc.start(now);
        clickOsc.stop(now + 0.03);
        break;
      }

      case 2: {
        // Variant 2: Heavy Solid Piece Thud (deep low-end drop + textured tactile impact)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(175, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.11);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.14);

        // Low-pass filtered noise punch
        const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.04, this.ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.015));

        const src = this.ctx.createBufferSource();
        src.buffer = noiseBuf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, now);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.4, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        src.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.sfxGain);
        src.start(now);
        break;
      }

      case 3: {
        // Variant 3: Resonant Hardwood Snap (dual harmonic tone + punchy clack)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(260, now);
        osc1.frequency.exponentialRampToValueAtTime(75, now + 0.09);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(390, now);
        osc2.frequency.exponentialRampToValueAtTime(110, now + 0.06);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.sfxGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.1);
        osc2.stop(now + 0.1);
        break;
      }

      case 4: {
        // Variant 4: Smooth Felted Glide & Tap (gentle glide + subtle felt acoustic body)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(195, now);
        osc.frequency.exponentialRampToValueAtTime(62, now + 0.09);

        gain.gain.setValueAtTime(0.68, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.11);

        const whisperOsc = this.ctx.createOscillator();
        const whisperGain = this.ctx.createGain();
        whisperOsc.type = 'triangle';
        whisperOsc.frequency.setValueAtTime(880, now);
        whisperOsc.frequency.exponentialRampToValueAtTime(220, now + 0.035);

        whisperGain.gain.setValueAtTime(0.2, now);
        whisperGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        whisperOsc.connect(whisperGain);
        whisperGain.connect(this.sfxGain);
        whisperOsc.start(now);
        whisperOsc.stop(now + 0.04);
        break;
      }
    }
    } finally {
      this.sfxGain = originalGain;
    }
  }

  public playCaptureSound(fileIndex?: number, material?: string) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([40, 30, 65]);
      }
    } catch {
      // Ignore vibration errors on unsupported browsers
    }
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastSoundTimes['capture'] || 0) < 0.06) return;
    this.lastSoundTimes['capture'] = now;
    const originalGain = this.sfxGain;
    const sfxDest = this.getSfxDestination(fileIndex);
    this.sfxGain = sfxDest as GainNode;

    try {
      this.playMaterialOvertones(sfxDest, material, now);

      // Pick a randomized variant that differs from the previous one
      let variant: number;
      do {
        variant = Math.floor(Math.random() * 5);
      } while (variant === this.lastCaptureVariant);
      this.lastCaptureVariant = variant;

    switch (variant) {
      case 0: {
        // Variant 0: Deep Sub Punch + Crystal Shatter
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(190, now);
        subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35);

        subGain.gain.setValueAtTime(1.0, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        subOsc.connect(subGain);
        subGain.connect(this.sfxGain);
        subOsc.start(now);
        subOsc.stop(now + 0.38);

        // High bandpass crystal shatter
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.28, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
          output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
        }
        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.Q.setValueAtTime(4.5, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.85, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        noiseSource.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.sfxGain);
        noiseSource.start(now);
        break;
      }

      case 1: {
        // Variant 1: Explosive Kinetic Clash (dual dissonant impact + high metallic clash)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(245, now);
        osc1.frequency.exponentialRampToValueAtTime(42, now + 0.3);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(360, now);
        osc2.frequency.exponentialRampToValueAtTime(55, now + 0.25);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.sfxGain);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.35);
        osc2.stop(now + 0.35);

        // Sharp metallic transient
        const clashOsc = this.ctx.createOscillator();
        const clashGain = this.ctx.createGain();
        clashOsc.type = 'triangle';
        clashOsc.frequency.setValueAtTime(2800, now);
        clashOsc.frequency.exponentialRampToValueAtTime(480, now + 0.06);

        clashGain.gain.setValueAtTime(0.5, now);
        clashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        clashOsc.connect(clashGain);
        clashGain.connect(this.sfxGain);
        clashOsc.start(now);
        clashOsc.stop(now + 0.07);
        break;
      }

      case 2: {
        // Variant 2: Heavy Rock-Crush & Boulder Explosion SFX
        // 1. Sub Punch (Sine wave starting at 68Hz exponentially diving to 22Hz over 0.45s)
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(68, now);
        subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.45);

        subGain.gain.setValueAtTime(1.1, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        subOsc.connect(subGain);
        subGain.connect(this.sfxGain);
        subOsc.start(now);
        subOsc.stop(now + 0.45);

        // 2. Crushing Core (Triangular low-frequency impact at 120Hz diving to 30Hz)
        const coreOsc = this.ctx.createOscillator();
        const coreGain = this.ctx.createGain();
        coreOsc.type = 'triangle';
        coreOsc.frequency.setValueAtTime(120, now);
        coreOsc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

        coreGain.gain.setValueAtTime(0.85, now);
        coreGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        coreOsc.connect(coreGain);
        coreGain.connect(this.sfxGain);
        coreOsc.start(now);
        coreOsc.stop(now + 0.35);

        // 3. Rock Debris Burst (Random noise routed through resonant BiquadFilter bandpass Q=3.0 sweeping 1400Hz down to 180Hz over 0.35s)
        const debrisBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.35, this.ctx.sampleRate);
        const debrisData = debrisBuf.getChannelData(0);
        for (let i = 0; i < debrisData.length; i++) {
          debrisData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.09));
        }
        const debrisSrc = this.ctx.createBufferSource();
        debrisSrc.buffer = debrisBuf;

        const debrisFilter = this.ctx.createBiquadFilter();
        debrisFilter.type = 'bandpass';
        debrisFilter.frequency.setValueAtTime(1400, now);
        debrisFilter.frequency.exponentialRampToValueAtTime(180, now + 0.35);
        debrisFilter.Q.setValueAtTime(3.0, now);

        const debrisGain = this.ctx.createGain();
        debrisGain.gain.setValueAtTime(0.9, now);
        debrisGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        debrisSrc.connect(debrisFilter);
        debrisFilter.connect(debrisGain);
        debrisGain.connect(this.sfxGain);
        debrisSrc.start(now);

        // 4. Staggered Gravel Clatter (+0.04s, +0.09s)
        [0.04, 0.09].forEach((offset, idx) => {
          if (!this.ctx || !this.sfxGain) return;
          const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < ch.length; i++) {
            ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.015));
          }

          const s = this.ctx.createBufferSource();
          s.buffer = buf;

          const f = this.ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.setValueAtTime(1200 - idx * 400, now + offset);
          f.Q.setValueAtTime(3.0, now + offset);

          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.6 / (idx + 1), now + offset);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

          s.connect(f);
          f.connect(g);
          g.connect(this.sfxGain);
          s.start(now + offset);
        });
        break;
      }

      case 3: {
        // Variant 3: Resonant Hammer Clash with Harmonic Ring (heavy impact + sustained ringing tail)
        const punchOsc = this.ctx.createOscillator();
        const punchGain = this.ctx.createGain();
        punchOsc.type = 'triangle';
        punchOsc.frequency.setValueAtTime(215, now);
        punchOsc.frequency.exponentialRampToValueAtTime(38, now + 0.3);

        punchGain.gain.setValueAtTime(0.9, now);
        punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        punchOsc.connect(punchGain);
        punchGain.connect(this.sfxGain);
        punchOsc.start(now);
        punchOsc.stop(now + 0.35);

        // Ringing metallic harmonics
        [520, 1040].forEach((freq, i) => {
          if (!this.ctx || !this.sfxGain) return;
          const ring = this.ctx.createOscillator();
          const rGain = this.ctx.createGain();
          ring.type = 'sine';
          ring.frequency.setValueAtTime(freq, now);

          rGain.gain.setValueAtTime(0.25 / (i + 1), now);
          rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

          ring.connect(rGain);
          rGain.connect(this.sfxGain);
          ring.start(now);
          ring.stop(now + 0.55);
        });
        break;
      }

      case 4: {
        // Variant 4: Thunderous Arcane Shatter (wide sweep drop + descending filter burst)
        const sweepOsc = this.ctx.createOscillator();
        const sweepGain = this.ctx.createGain();
        sweepOsc.type = 'sawtooth';
        sweepOsc.frequency.setValueAtTime(320, now);
        sweepOsc.frequency.exponentialRampToValueAtTime(28, now + 0.38);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(180, now + 0.35);

        sweepGain.gain.setValueAtTime(0.85, now);
        sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        sweepOsc.connect(filter);
        filter.connect(sweepGain);
        sweepGain.connect(this.sfxGain);
        sweepOsc.start(now);
        sweepOsc.stop(now + 0.4);

        // Descending noise rush
        const nBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.22, this.ctx.sampleRate);
        const nd = nBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.04));

        const nSrc = this.ctx.createBufferSource();
        nSrc.buffer = nBuf;
        const nFilter = this.ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(3200, now);
        nFilter.frequency.exponentialRampToValueAtTime(280, now + 0.2);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.7, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        nSrc.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.sfxGain);
        nSrc.start(now);
        break;
      }
    }
    } finally {
      this.sfxGain = originalGain;
    }
  }

  public playCheckSound(fileIndex?: number) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([35, 25, 50]);
      }
    } catch {
      // Ignore vibration errors on unsupported browsers
    }
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastSoundTimes['check'] || 0) < 0.08) return;
    this.lastSoundTimes['check'] = now;
    const originalGain = this.sfxGain;
    const sfxDest = this.getSfxDestination(fileIndex);
    this.sfxGain = sfxDest as GainNode;

    try {
      // Double-thump sub-bass heartbeat (55Hz -> 32Hz)
      [0, 0.16].forEach(offset => {
        if (!this.ctx || !this.sfxGain) return;
        const hbOsc = this.ctx.createOscillator();
        const hbGain = this.ctx.createGain();
        hbOsc.type = 'sine';
        hbOsc.frequency.setValueAtTime(55, now + offset);
        hbOsc.frequency.exponentialRampToValueAtTime(32, now + offset + 0.12);

        hbGain.gain.setValueAtTime(0.65, now + offset);
        hbGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);

        hbOsc.connect(hbGain);
        hbGain.connect(this.sfxGain);
        hbOsc.start(now + offset);
        hbOsc.stop(now + offset + 0.15);
      });

      // Dramatic warning chord (chime dissonance: D5 + Eb5 + A5)
      const freqs = [587.33, 622.25, 880.0];
      freqs.forEach((freq, idx) => {
        if (!this.ctx || !this.sfxGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.35, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.8);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.8);
      });
    } finally {
      this.sfxGain = originalGain;
    }
  }

  public playCheckmateSound() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([55, 35, 70, 35, 110]);
      }
    } catch {
      // Ignore vibration errors on unsupported browsers
    }
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastSoundTimes['checkmate'] || 0) < 0.1) return;
    this.lastSoundTimes['checkmate'] = now;

    // Grand cinematic fanfare chord arpeggio (C major 9th -> triumph)
    const notes = [261.63, 329.63, 392.0, 493.88, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.4, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 1.8);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 1.8);
    });
  }

  public playClickSound() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    } catch {
      // Ignore vibration errors on unsupported browsers
    }
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.03);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  public playGameStart() {
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.22, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.55);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.55);
    });
  }

  public playClockTick() {
    if (this.isSfxMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.02);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.02);
  }

  // --- ARENA PROCEDURAL AMBIENT SOUNDSCAPES ---

  public startAmbientSound(arena: ArenaId = 'chess_arena') {
    this.playArenaAmbient(arena);
  }

  public playArenaAmbient(arena: ArenaId) {
    this.getAudioContext();
    if (!this.ctx || !this.ambientGain) return;
    if (this.currentArena === arena && this.currentAmbientNodes) return;

    this.stopAmbient();
    this.currentArena = arena;

    if (this.isMusicMuted || this.isMuted) return;

    const ctx = this.getAudioContext()!;
    const now = ctx.currentTime;

    const gainNode = ctx.createGain();
    const targetVol = this.ambientVolume > 0.03 ? this.ambientVolume : 0.18;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(targetVol, now + 1.0);
    gainNode.connect(this.ambientGain);

    const activeNodes: (AudioNode & { stop?: () => void })[] = [];

    switch (arena) {
      case 'chess_arena': {
        // 01. Esports Arena: Clean synth pad + arpeggiated bassline (130Hz to 260Hz) + electro beat every 2.4s
        const padFreqs = [130.81, 196.0, 261.63, 329.63]; // C3, G3, C4, E4
        padFreqs.forEach(f => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          const padFilter = ctx.createBiquadFilter();
          padFilter.type = 'lowpass';
          padFilter.frequency.value = 1200;
          const g = ctx.createGain();
          g.gain.value = 0.08;
          osc.connect(padFilter);
          padFilter.connect(g);
          g.connect(gainNode);
          osc.start();
          activeNodes.push(osc);
        });

        const bassNotes = [130.81, 164.81, 196.0, 261.63];
        let noteStep = 0;
        let beatCount = 0;

        const playEsportsStep = () => {
          if (!this.ctx || this.isMusicMuted || this.isMuted) return;
          const t = this.ctx.currentTime;
          const f = bassNotes[noteStep % bassNotes.length];

          const bassOsc = this.ctx.createOscillator();
          const bassFilter = this.ctx.createBiquadFilter();
          const bassGain = this.ctx.createGain();

          bassOsc.type = 'sawtooth';
          bassOsc.frequency.setValueAtTime(f, t);

          bassFilter.type = 'lowpass';
          bassFilter.frequency.setValueAtTime(800, t);
          bassFilter.frequency.exponentialRampToValueAtTime(250, t + 0.35);

          bassGain.gain.setValueAtTime(0.18, t);
          bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

          bassOsc.connect(bassFilter);
          bassFilter.connect(bassGain);
          bassGain.connect(gainNode);

          bassOsc.start(t);
          bassOsc.stop(t + 0.55);

          if (beatCount % 4 === 0) {
            const kickOsc = this.ctx.createOscillator();
            const kickGain = this.ctx.createGain();
            kickOsc.type = 'sine';
            kickOsc.frequency.setValueAtTime(150, t);
            kickOsc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

            kickGain.gain.setValueAtTime(0.3, t);
            kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

            kickOsc.connect(kickGain);
            kickGain.connect(gainNode);
            kickOsc.start(t);
            kickOsc.stop(t + 0.2);
          }

          noteStep++;
          beatCount++;
        };

        playEsportsStep();
        const interval = setInterval(playEsportsStep, 600);
        activeNodes.push({ stop: () => clearInterval(interval) } as unknown as AudioNode);
        break;
      }

      case 'traditional': {
        // 02. Warrior Keep: Two warm sawtooth waves (110Hz & 165Hz) through a gentle 450Hz lowpass filter + lute-style plucked chords every 4s
        const freqs = [110, 165]; // A2, E3
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = f;

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 450;

          const g = ctx.createGain();
          g.gain.value = 0.08 / (i + 1);

          osc.connect(filter);
          filter.connect(g);
          g.connect(gainNode);
          osc.start();
          activeNodes.push(osc);
        });

        const chordNotes = [110, 138.59, 164.81, 220]; // A-major open chord
        const playLuteChord = () => {
          if (!this.ctx || this.isMusicMuted || this.isMuted) return;
          const t = this.ctx.currentTime;
          chordNotes.forEach((f, idx) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f * 2, t + idx * 0.06);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, t + idx * 0.06);

            g.gain.setValueAtTime(0, t + idx * 0.06);
            g.gain.linearRampToValueAtTime(0.18, t + idx * 0.06 + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 2.2);

            osc.connect(filter);
            filter.connect(g);
            g.connect(gainNode);

            osc.start(t + idx * 0.06);
            osc.stop(t + idx * 0.06 + 2.3);
          });
        };

        playLuteChord();
        const interval = setInterval(playLuteChord, 4000);
        activeNodes.push({ stop: () => clearInterval(interval) } as unknown as AudioNode);
        break;
      }

      case 'japan': {
        // 03. Kyoto Sanctuary: Authentic Pentatonic Koto / Shamisen (A4, C5, D5, E5, G5, A5) + Wood-block accents + Wind chimes + Shakuhachi drone
        // Warm meditative Shakuhachi bamboo drone (A3: 220Hz + E4: 330Hz)
        [220, 330].forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = 0.04 / (i + 1);
          osc.connect(g);
          g.connect(gainNode);
          osc.start();
          activeNodes.push(osc);
        });

        // Traditional Japanese pentatonic Koto scale (A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880)
        const kotoNotes = [
          440.0,   // A4
          523.25,  // C5
          587.33,  // D5
          659.25,  // E5
          783.99,  // G5
          880.0,   // A5
        ];
        let kotoIdx = 0;
        let phraseStep = 0;

        const playKoto = () => {
          if (!this.ctx || this.isMusicMuted || this.isMuted) return;
          const t = this.ctx.currentTime;
          const freq = kotoNotes[kotoIdx % kotoNotes.length];

          // 1. Primary string pluck (triangle + saw bite with fast initial pitch drop for pick release)
          const osc = this.ctx.createOscillator();
          const oscHarmonic = this.ctx.createOscillator();
          const bridgeFilter = this.ctx.createBiquadFilter();
          const g = this.ctx.createGain();

          osc.type = 'triangle';
          oscHarmonic.type = 'sawtooth';
          // Initial finger pick bend: starts 1.8% sharp and settles within 0.025s
          osc.frequency.setValueAtTime(freq * 1.018, t);
          osc.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
          oscHarmonic.frequency.setValueAtTime(freq * 2.018, t);
          oscHarmonic.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.025);

          // Resonant wooden soundboard bridge filter (Q=5.0)
          bridgeFilter.type = 'bandpass';
          bridgeFilter.frequency.setValueAtTime(freq * 2.1, t);
          bridgeFilter.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.4);
          bridgeFilter.Q.setValueAtTime(5.0, t);

          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.32, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.85);

          osc.connect(bridgeFilter);
          oscHarmonic.connect(bridgeFilter);
          bridgeFilter.connect(g);
          g.connect(gainNode);

          osc.start(t);
          oscHarmonic.start(t);
          osc.stop(t + 1.9);
          oscHarmonic.stop(t + 1.9);

          // 2. Hyoshigi / Wood-Block Percussive Accent every 4 steps
          if (phraseStep % 4 === 1) {
            const woodOsc = this.ctx.createOscillator();
            const woodFilter = this.ctx.createBiquadFilter();
            const woodGain = this.ctx.createGain();

            woodOsc.type = 'sine';
            woodOsc.frequency.setValueAtTime(920, t + 0.12);
            woodOsc.frequency.exponentialRampToValueAtTime(380, t + 0.17);

            woodFilter.type = 'bandpass';
            woodFilter.frequency.setValueAtTime(950, t + 0.12);
            woodFilter.Q.setValueAtTime(4.0, t + 0.12);

            woodGain.gain.setValueAtTime(0.18, t + 0.12);
            woodGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

            woodOsc.connect(woodFilter);
            woodFilter.connect(woodGain);
            woodGain.connect(gainNode);

            woodOsc.start(t + 0.12);
            woodOsc.stop(t + 0.25);
          }

          // 3. Ethereal Glass / Brass Wind Chimes
          if (phraseStep % 3 === 0) {
            const chimeOsc = this.ctx.createOscillator();
            const chimeG = this.ctx.createGain();
            chimeOsc.type = 'sine';
            const chimeFreq = 1480 + (phraseStep % 5) * 180;
            chimeOsc.frequency.setValueAtTime(chimeFreq, t + 0.2);

            chimeG.gain.setValueAtTime(0.08, t + 0.2);
            chimeG.gain.exponentialRampToValueAtTime(0.001, t + 1.6);

            chimeOsc.connect(chimeG);
            chimeG.connect(gainNode);
            chimeOsc.start(t + 0.2);
            chimeOsc.stop(t + 1.65);
          }

          kotoIdx = (kotoIdx + 1) % kotoNotes.length;
          phraseStep++;
        };

        playKoto();
        const interval = setInterval(playKoto, 1600);
        activeNodes.push({ stop: () => clearInterval(interval) } as unknown as AudioNode);
        break;
      }

      case 'india': {
        // 04. Imperial Colosseum: Royal court sitar/tanpura harmonic drone + periodic tabla-style stone thuds
        const tanpuraFreqs = [146.83, 220.0, 293.66, 294.5]; // D3, A3, D4
        tanpuraFreqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;

          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.15 + idx * 0.05;
          const lfoG = ctx.createGain();
          lfoG.gain.value = 0.8;
          lfo.connect(lfoG);
          lfoG.connect(osc.frequency);
          lfo.start();
          activeNodes.push(lfo);

          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = f * 1.5;
          filter.Q.value = 2.5;

          const g = ctx.createGain();
          g.gain.value = 0.08;

          osc.connect(filter);
          filter.connect(g);
          g.connect(gainNode);
          osc.start();
          activeNodes.push(osc);
        });

        const playTablaThud = () => {
          if (!this.ctx || this.isMusicMuted || this.isMuted) return;
          const t = this.ctx.currentTime;
          const thudOsc = this.ctx.createOscillator();
          const thudG = this.ctx.createGain();

          thudOsc.type = 'sine';
          thudOsc.frequency.setValueAtTime(180, t);
          thudOsc.frequency.exponentialRampToValueAtTime(50, t + 0.15);

          thudG.gain.setValueAtTime(0.28, t);
          thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

          thudOsc.connect(thudG);
          thudG.connect(gainNode);

          thudOsc.start(t);
          thudOsc.stop(t + 0.3);
        };

        playTablaThud();
        const interval = setInterval(playTablaThud, 3200);
        activeNodes.push({ stop: () => clearInterval(interval) } as unknown as AudioNode);
        break;
      }

      case 'usa': {
        // 05. Gotham Metropolis: Moody minor chord pads with low-pass sweep filter and distant rain/wind white-noise
        const padFreqs = [110, 130.81, 164.81, 196.0]; // A2, C3, E3, G3 (Am7)
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);

        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.1;
        const lfoG = ctx.createGain();
        lfoG.gain.value = 280;
        lfo.connect(lfoG);
        lfoG.connect(filter.frequency);
        lfo.start();
        activeNodes.push(lfo);

        padFreqs.forEach(f => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = 0.05;
          osc.connect(g);
          g.connect(filter);
          osc.start();
          activeNodes.push(osc);
        });
        filter.connect(gainNode);

        const bufSize = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.05;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        noise.loop = true;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 500;
        noiseFilter.Q.value = 1.8;

        noise.connect(noiseFilter);
        noiseFilter.connect(gainNode);
        noise.start();
        activeNodes.push(noise);
        break;
      }

      case 'egypt': {
        // 06. Egypt Sands: Phrygian dominant desert scale melody + desert wind + warm bronze finger cymbals
        const droneFreqs = [98.0, 146.83]; // G2, D3
        droneFreqs.forEach(f => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = 0.08;
          osc.connect(g);
          g.connect(gainNode);
          osc.start();
          activeNodes.push(osc);
        });

        const desertNotes = [196.0, 207.65, 246.94, 261.63, 293.66, 311.13, 349.23];
        let desertIdx = 0;

        const playDesertStep = () => {
          if (!this.ctx || this.isMusicMuted || this.isMuted) return;
          const t = this.ctx.currentTime;
          const f = desertNotes[desertIdx % desertNotes.length];

          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const g = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, t);

          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(f * 1.8, t);
          filter.Q.setValueAtTime(3.0, t);

          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.25, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

          osc.connect(filter);
          filter.connect(g);
          g.connect(gainNode);

          osc.start(t);
          osc.stop(t + 1.85);

          if (desertIdx % 3 === 0) {
            const cymbalOsc = this.ctx.createOscillator();
            const cymbalG = this.ctx.createGain();
            cymbalOsc.type = 'sine';
            cymbalOsc.frequency.setValueAtTime(1600, t + 0.08);

            cymbalG.gain.setValueAtTime(0.08, t + 0.08);
            cymbalG.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

            cymbalOsc.connect(cymbalG);
            cymbalG.connect(gainNode);
            cymbalOsc.start(t + 0.08);
            cymbalOsc.stop(t + 1.55);
          }

          desertIdx++;
        };

        playDesertStep();
        const interval = setInterval(playDesertStep, 2200);
        activeNodes.push({ stop: () => clearInterval(interval) } as unknown as AudioNode);
        break;
      }

      case 'royal_kingdom': {
        // 07. Spanish Café: murmur of conversation, the odd cup on a saucer, and a nylon-string guitar
        // playing the Andalusian cadence (Am – G – F – E) softly in the corner.
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish noise
          data[i] = last * 6;
        }
        const murmur = ctx.createBufferSource();
        murmur.buffer = buf;
        murmur.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 420;
        band.Q.value = 0.7;
        const mg = ctx.createGain();
        mg.gain.value = 0.05;
        // Slow swells, like voices rising and falling around the room.
        const swell = ctx.createOscillator();
        swell.frequency.value = 0.13;
        const swellG = ctx.createGain();
        swellG.gain.value = 0.02;
        swell.connect(swellG);
        swellG.connect(mg.gain);
        murmur.connect(band);
        band.connect(mg);
        mg.connect(gainNode);
        murmur.start();
        swell.start();
        activeNodes.push(murmur, swell);

        const pluck = (freq: number, t: number, vel: number) => {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = freq;
          const o2 = ctx.createOscillator();
          o2.type = 'sine';
          o2.frequency.value = freq * 2;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(2600, t);
          f.frequency.exponentialRampToValueAtTime(500, t + 0.8);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vel, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
          const g2 = ctx.createGain();
          g2.gain.value = 0.25;
          o.connect(f);
          o2.connect(g2);
          g2.connect(f);
          f.connect(g);
          g.connect(gainNode);
          o.start(t);
          o2.start(t);
          o.stop(t + 1.9);
          o2.stop(t + 1.9);
        };
        // Arpeggio shapes for Am, G, F, E (Hz).
        const chords = [
          [110.0, 164.81, 220.0, 261.63, 329.63],
          [98.0, 146.83, 196.0, 246.94, 293.66],
          [87.31, 130.81, 174.61, 220.0, 261.63],
          [82.41, 123.47, 164.81, 207.65, 246.94],
        ];
        let bar = 0;
        const playBar = () => {
          const t0 = ctx.currentTime + 0.05;
          const ch = chords[bar % 4];
          const order = [0, 2, 3, 4, 3, 2];
          order.forEach((n, i) => pluck(ch[n], t0 + i * 0.36, i === 0 ? 0.09 : 0.05));
          // Now and then a cup is set down on a saucer.
          if (Math.random() < 0.35) {
            const t = t0 + Math.random() * 2;
            const c = ctx.createOscillator();
            c.type = 'sine';
            c.frequency.value = 2400 + Math.random() * 900;
            const cg = ctx.createGain();
            cg.gain.setValueAtTime(0.025, t);
            cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
            c.connect(cg);
            cg.connect(gainNode);
            c.start(t);
            c.stop(t + 0.2);
          }
          bar++;
        };
        playBar();
        const interval = setInterval(playBar, 2200);
        activeNodes.push({ stop: () => clearInterval(interval) } as unknown as AudioNode);
        break;
      }

      case 'shadow_dungeon': {
        // 08. Shadow Dungeon: Resonant low-frequency choir drones (65Hz + 130Hz bandpass) with slow soul-shimmer swells
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 65.41; // C2 sub-bass
        const g1 = ctx.createGain();
        g1.gain.value = 0.12;
        osc1.connect(g1);
        g1.connect(gainNode);
        osc1.start();
        activeNodes.push(osc1);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.value = 130.81; // C3 choir drone
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 260;
        filter.Q.value = 4.0;

        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.2;
        const lfoG = ctx.createGain();
        lfoG.gain.value = 0.04;
        lfo.connect(lfoG);

        const g2 = ctx.createGain();
        g2.gain.value = 0.08;
        lfoG.connect(g2.gain);

        osc2.connect(filter);
        filter.connect(g2);
        g2.connect(gainNode);

        lfo.start();
        osc2.start();
        activeNodes.push(lfo);
        activeNodes.push(osc2);
        break;
      }
    }

    this.currentAmbientNodes = {
      stop: () => {
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        setTimeout(() => {
          activeNodes.forEach(node => {
            try {
              if (typeof node.stop === 'function') node.stop();
              node.disconnect();
            } catch {
              // ignore stopped
            }
          });
          gainNode.disconnect();
        }, 350);
      },
    };
  }

  public stopAmbient() {
    if (this.currentAmbientNodes) {
      this.currentAmbientNodes.stop();
      this.currentAmbientNodes = null;
    }
    this.currentArena = null;
  }
}

export const soundEngine = new SoundEngine();
