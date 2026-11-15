/**
 * Efeitos sonoros 100% procedurais via WebAudio API — sem arquivos externos.
 * Passos, pulo, aterrissagem, teletransporte e clique de interface.
 */
interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

export class SfxSynth {
  private graph: AudioGraph | null = null;
  private volume = 0.7;
  private lastStepAt = 0;

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.graph) {
      this.graph.master.gain.setTargetAtTime(this.volume, this.graph.ctx.currentTime, 0.02);
    }
  }

  /** Deve ser chamado a partir de um gesto do usuário (política de autoplay). */
  resume(): void {
    try {
      if (!this.graph) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = this.volume;
        master.connect(ctx.destination);
        this.graph = { ctx, master, noise: this.createNoiseBuffer(ctx, 0.5) };
      }
      if (this.graph.ctx.state === 'suspended') {
        void this.graph.ctx.resume();
      }
    } catch {
      /* áudio indisponível */
    }
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private ready(): AudioGraph | null {
    if (!this.graph || this.graph.ctx.state !== 'running') return null;
    return this.graph;
  }

  step(sprinting: boolean): void {
    const audio = this.ready();
    if (!audio) return;
    const now = performance.now();
    if (now - this.lastStepAt < 90) return;
    this.lastStepAt = now;

    const { ctx, master, noise } = audio;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = 0.85 + Math.random() * 0.35;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = sprinting ? 780 : 520;
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    const peak = sprinting ? 0.32 : 0.2;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + 0.14);
  }

  jump(): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, master } = audio;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.16);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  land(intensity: number): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const t = ctx.currentTime;
    const amount = Math.min(1, Math.max(0.2, intensity));

    const source = ctx.createBufferSource();
    source.buffer = noise;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 240 + amount * 220;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.34 * amount, t + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    source.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(master);
    source.start(t);
    source.stop(t + 0.2);

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    thumpGain.gain.setValueAtTime(0.0001, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.3 * amount, t + 0.012);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    thump.connect(thumpGain);
    thumpGain.connect(master);
    thump.start(t);
    thump.stop(t + 0.22);
  }

  teleport(): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, master } = audio;
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, index) => {
      const t = t0 + index * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  ui(): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, master } = audio;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}
