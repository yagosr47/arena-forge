export type SfxWaveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface SfxParams {
  id?: string;
  name: string;
  waveform: SfxWaveform;
  startFreq: number;
  endFreq: number;
  attack: number;
  decay: number;
  noiseMix: number;
  volume: number;
  freqCurve: 'exponential' | 'linear';
  filterFreq: number;
  vibratoRate: number;
  vibratoDepth: number;
}

export interface SfxPreset extends SfxParams {
  id: string;
  badge: string;
  description: string;
}

export const SFX_PRESETS: SfxPreset[] = [
  {
    id: 'laser',
    name: 'Laser',
    badge: 'ARMAMENTO',
    description: 'Disparo de plasma rápido com queda exponencial aguda.',
    waveform: 'sawtooth',
    startFreq: 1480,
    endFreq: 135,
    attack: 0.004,
    decay: 0.24,
    noiseMix: 0.08,
    volume: 0.72,
    freqCurve: 'exponential',
    filterFreq: 6800,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  {
    id: 'explosion',
    name: 'Explosão',
    badge: 'IMPACTO',
    description: 'Detonação densa com ruído branco filtrado e sub-grave.',
    waveform: 'sawtooth',
    startFreq: 185,
    endFreq: 32,
    attack: 0.006,
    decay: 0.68,
    noiseMix: 0.88,
    volume: 0.85,
    freqCurve: 'exponential',
    filterFreq: 960,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  {
    id: 'coin',
    name: 'Moeda',
    badge: 'COLETA',
    description: 'Sinal retrô ascendente 8-bit em onda quadrada limpa.',
    waveform: 'square',
    startFreq: 988,
    endFreq: 1480,
    attack: 0.003,
    decay: 0.28,
    noiseMix: 0,
    volume: 0.58,
    freqCurve: 'linear',
    filterFreq: 12000,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  {
    id: 'radar',
    name: 'Alerta de Radar',
    badge: 'HUD/ALERTA',
    description: 'Ping tático pulsante com modulação LFO de emergência.',
    waveform: 'sine',
    startFreq: 1180,
    endFreq: 1120,
    attack: 0.012,
    decay: 0.58,
    noiseMix: 0.02,
    volume: 0.65,
    freqCurve: 'linear',
    filterFreq: 9000,
    vibratoRate: 12,
    vibratoDepth: 110,
  },
  {
    id: 'ui-click',
    name: 'Clique UI',
    badge: 'INTERFACE',
    description: 'Confirmação tátil mecânica ultracurta para botões e menus.',
    waveform: 'triangle',
    startFreq: 1850,
    endFreq: 560,
    attack: 0.002,
    decay: 0.048,
    noiseMix: 0.06,
    volume: 0.62,
    freqCurve: 'exponential',
    filterFreq: 10500,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  {
    id: 'engine',
    name: 'Motor/Zumbido',
    badge: 'TURBINA',
    description: 'Zumbido industrial grave com vibração mecânica contínua.',
    waveform: 'sawtooth',
    startFreq: 86,
    endFreq: 124,
    attack: 0.09,
    decay: 0.92,
    noiseMix: 0.24,
    volume: 0.72,
    freqCurve: 'linear',
    filterFreq: 740,
    vibratoRate: 20,
    vibratoDepth: 18,
  },
];

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

/** Deterministic PRNG so live playback, WAV export, and waveform preview stay aligned. */
function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createWhiteNoiseBuffer(ctx: BaseAudioContext, duration: number, seed = 4201): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);
  const rng = createMulberry32(seed);
  for (let i = 0; i < length; i++) {
    channel[i] = rng() * 2 - 1;
  }
  return buffer;
}

function scheduleSfxGraph(ctx: BaseAudioContext, params: SfxParams, startTime: number): number {
  const safeStartFreq = Math.max(20, params.startFreq);
  const safeEndFreq = Math.max(20, params.endFreq);
  const safeAttack = Math.max(0.001, params.attack);
  const safeDecay = Math.max(0.015, params.decay);
  const totalDuration = safeAttack + safeDecay;
  const peakTime = startTime + safeAttack;
  const endTime = startTime + totalDuration;
  const clampedNoise = Math.min(1, Math.max(0, params.noiseMix));
  const clampedVolume = Math.min(1, Math.max(0, params.volume));
  if (clampedVolume <= 0.0005) {
    return totalDuration;
  }

  // Master lowpass filter + master envelope
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.max(120, Math.min(20000, params.filterFreq)), startTime);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, startTime);
  masterGain.gain.linearRampToValueAtTime(clampedVolume, peakTime);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Oscillator voice
  const oscMix = 1 - clampedNoise * 0.7;
  if (oscMix > 0.01) {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = params.waveform;
    osc.frequency.setValueAtTime(safeStartFreq, startTime);

    if (params.freqCurve === 'exponential') {
      osc.frequency.exponentialRampToValueAtTime(safeEndFreq, endTime);
    } else {
      osc.frequency.linearRampToValueAtTime(safeEndFreq, endTime);
    }

    if (params.vibratoRate > 0.1 && params.vibratoDepth > 0.5) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(params.vibratoRate, startTime);
      lfoGain.gain.setValueAtTime(params.vibratoDepth, startTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(startTime);
      lfo.stop(endTime + 0.02);
    }

    oscGain.gain.setValueAtTime(oscMix, startTime);
    osc.connect(oscGain);
    oscGain.connect(filter);
    osc.start(startTime);
    osc.stop(endTime + 0.02);
  }

  // White noise layer
  if (clampedNoise > 0.005) {
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = createWhiteNoiseBuffer(ctx, totalDuration + 0.05);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(clampedNoise, startTime);
    noiseSource.connect(noiseGain);
    noiseGain.connect(filter);
    noiseSource.start(startTime);
    noiseSource.stop(endTime + 0.02);
  }

  return totalDuration;
}

/** Play SFX live using WebAudio API immediately. */
export async function playSfxLive(params: SfxParams): Promise<number> {
  const ctx = getSharedAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return scheduleSfxGraph(ctx, params, ctx.currentTime + 0.005);
}

/** Render SFX offline into an AudioBuffer for WAV export. */
export async function renderSfxAudioBuffer(
  params: SfxParams,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const duration = Math.max(0.05, params.attack + params.decay + 0.04);
  const frameCount = Math.ceil(sampleRate * duration);
  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  scheduleSfxGraph(offline, params, 0);
  return offline.startRendering();
}

/** Encode PCM float samples into a standard 16-bit WAV ArrayBuffer. */
export function encodePcmToWavBuffer(samples: Float32Array, sampleRate = 44100): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataByteLength = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

/** Export current SFX parameters directly to a downloadable audio/wav Blob. */
export async function exportSfxToWavBlob(params: SfxParams, sampleRate = 44100): Promise<Blob> {
  const audioBuffer = await renderSfxAudioBuffer(params, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  const wavBuffer = encodePcmToWavBuffer(channelData, audioBuffer.sampleRate);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/** Fast deterministic math preview of the waveform for real-time oscilloscope rendering. */
export function computeWaveformPreview(params: SfxParams, pointCount = 320): number[] {
  const points: number[] = new Array(pointCount);
  const attack = Math.max(0.001, params.attack);
  const decay = Math.max(0.015, params.decay);
  const total = attack + decay;
  const startFreq = Math.max(20, params.startFreq);
  const endFreq = Math.max(20, params.endFreq);
  const noiseMix = Math.min(1, Math.max(0, params.noiseMix));
  const oscMix = 1 - noiseMix * 0.7;
  const rng = createMulberry32(9137);

  let phase = 0;
  const dt = total / pointCount;
  // Scale down visual frequency slightly if extremely high so the wave reads cleanly on small canvases
  const visualFreqScale = Math.min(1, 320 / Math.max(startFreq, endFreq));

  for (let i = 0; i < pointCount; i++) {
    const t = i * dt;
    const progress = t / total;

    // Envelope
    let env: number;
    if (t < attack) {
      env = t / attack;
    } else {
      const decayProgress = (t - attack) / decay;
      env = Math.pow(0.0005, decayProgress);
    }

    // Frequency interpolation + vibrato
    let freq =
      params.freqCurve === 'exponential'
        ? startFreq * Math.pow(endFreq / startFreq, progress)
        : startFreq + (endFreq - startFreq) * progress;

    if (params.vibratoRate > 0.1 && params.vibratoDepth > 0.5) {
      freq += Math.sin(2 * Math.PI * params.vibratoRate * t) * params.vibratoDepth;
    }

    phase += 2 * Math.PI * Math.max(20, freq) * visualFreqScale * dt;
    const normPhase = ((phase / (2 * Math.PI)) % 1 + 1) % 1;

    let oscSample = 0;
    switch (params.waveform) {
      case 'sine':
        oscSample = Math.sin(phase);
        break;
      case 'square':
        oscSample = normPhase < 0.5 ? 1 : -1;
        break;
      case 'sawtooth':
        oscSample = 2 * normPhase - 1;
        break;
      case 'triangle':
        oscSample = 1 - 4 * Math.abs(Math.round(normPhase - 0.25) - (normPhase - 0.25));
        break;
    }

    const noiseSample = rng() * 2 - 1;
    const sample = (oscSample * oscMix + noiseSample * noiseMix) * env * params.volume;
    points[i] = Math.max(-1, Math.min(1, sample));
  }

  return points;
}

/** Generate a completely self-contained, zero-dependency TypeScript playSfx() function. */
export function generateSfxTypeScriptCode(params: SfxParams): string {
  const safeName = params.name.replace(/[^a-zA-Z0-9À-ÿ _/-]/g, '').trim() || 'Custom SFX';
  const startFreq = Math.round(params.startFreq);
  const endFreq = Math.round(params.endFreq);
  const attack = Number(params.attack.toFixed(4));
  const decay = Number(params.decay.toFixed(4));
  const noiseMix = Number(params.noiseMix.toFixed(3));
  const volume = Number(params.volume.toFixed(2));
  const filterFreq = Math.round(params.filterFreq);
  const vibratoRate = Number(params.vibratoRate.toFixed(2));
  const vibratoDepth = Math.round(params.vibratoDepth);

  const lines: string[] = [
    `// Gerado por ARENA//FORGE — Preset: ${safeName}`,
    `// 100% WebAudio procedural — zero arquivos externos`,
    ``,
    `let _arenaAudioCtx: AudioContext | null = null;`,
    ``,
    `export function playSfx(volume = ${volume}): void {`,
    `  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;`,
    `  const ctx = (_arenaAudioCtx ??= new AudioCtx());`,
    `  if (ctx.state === 'suspended') void ctx.resume();`,
    ``,
    `  const now = ctx.currentTime;`,
    `  const attack = ${attack};`,
    `  const decay = ${decay};`,
    `  const endTime = now + attack + decay;`,
    ``,
    `  const filter = ctx.createBiquadFilter();`,
    `  filter.type = 'lowpass';`,
    `  filter.frequency.setValueAtTime(${filterFreq}, now);`,
    ``,
    `  const master = ctx.createGain();`,
    `  master.gain.setValueAtTime(0.0001, now);`,
    `  master.gain.linearRampToValueAtTime(Math.max(0.01, Math.min(1, volume)), now + attack);`,
    `  master.gain.exponentialRampToValueAtTime(0.0001, endTime);`,
    `  filter.connect(master);`,
    `  master.connect(ctx.destination);`,
  ];

  const oscMix = Number((1 - noiseMix * 0.7).toFixed(3));
  if (oscMix > 0.01) {
    lines.push(
      ``,
      `  const osc = ctx.createOscillator();`,
      `  const oscGain = ctx.createGain();`,
      `  osc.type = '${params.waveform}';`,
      `  osc.frequency.setValueAtTime(${startFreq}, now);`,
      params.freqCurve === 'exponential'
        ? `  osc.frequency.exponentialRampToValueAtTime(${Math.max(20, endFreq)}, endTime);`
        : `  osc.frequency.linearRampToValueAtTime(${Math.max(20, endFreq)}, endTime);`
    );

    if (vibratoRate > 0.1 && vibratoDepth > 0.5) {
      lines.push(
        `  const lfo = ctx.createOscillator();`,
        `  const lfoGain = ctx.createGain();`,
        `  lfo.frequency.setValueAtTime(${vibratoRate}, now);`,
        `  lfoGain.gain.setValueAtTime(${vibratoDepth}, now);`,
        `  lfo.connect(lfoGain);`,
        `  lfoGain.connect(osc.frequency);`,
        `  lfo.start(now);`,
        `  lfo.stop(endTime + 0.02);`
      );
    }

    lines.push(
      `  oscGain.gain.setValueAtTime(${oscMix}, now);`,
      `  osc.connect(oscGain);`,
      `  oscGain.connect(filter);`,
      `  osc.start(now);`,
      `  osc.stop(endTime + 0.02);`
    );
  }

  if (noiseMix > 0.005) {
    lines.push(
      ``,
      `  const noiseLen = Math.ceil(ctx.sampleRate * (attack + decay + 0.04));`,
      `  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);`,
      `  const data = noiseBuf.getChannelData(0);`,
      `  for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;`,
      `  const noise = ctx.createBufferSource();`,
      `  const noiseGain = ctx.createGain();`,
      `  noise.buffer = noiseBuf;`,
      `  noiseGain.gain.setValueAtTime(${noiseMix}, now);`,
      `  noise.connect(noiseGain);`,
      `  noiseGain.connect(filter);`,
      `  noise.start(now);`,
      `  noise.stop(endTime + 0.02);`
    );
  }

  lines.push(`}`);
  return lines.join('\n');
}
