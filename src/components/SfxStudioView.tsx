import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Download,
  Copy,
  Check,
  Shuffle,
  Save,
  Trash2,
  SlidersHorizontal,
  Volume2,
  Sparkles,
} from 'lucide-react';
import {
  SFX_PRESETS,
  computeWaveformPreview,
  exportSfxToWavBlob,
  generateSfxTypeScriptCode,
  playSfxLive,
  type SfxParams,
  type SfxWaveform,
} from '../generators/sfxSynthesizer';
import {
  deleteCustomSfxPreset,
  loadCustomSfxPresets,
  saveCustomSfxPreset,
} from '../repo/snippetVault';
import { copyToClipboard, triggerBlobDownload } from '../utils/ioHelpers';
import { CodeOutputPanel } from './CodeOutputPanel';

interface SfxStudioViewProps {
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
  onSendToBridge: (payload: {
    title: string;
    content: string;
    kind: 'code' | 'markdown' | 'json';
  }) => void;
  onSaveToVault: (title: string, code: string) => void;
}

const WAVEFORMS: Array<{ id: SfxWaveform; label: string; svgPath: string }> = [
  { id: 'sine', label: 'Sine', svgPath: 'M2 12 C6 2, 10 2, 12 12 C14 22, 18 22, 22 12' },
  { id: 'square', label: 'Square', svgPath: 'M2 16 V6 H12 V18 H22 V8' },
  { id: 'sawtooth', label: 'Saw', svgPath: 'M2 17 L12 6 V17 L22 6' },
  { id: 'triangle', label: 'Triangle', svgPath: 'M2 12 L7 5 L17 19 L22 12' },
];

export function SfxStudioView({
  onNotify,
  onSendToBridge,
  onSaveToVault,
}: SfxStudioViewProps) {
  const [params, setParams] = useState<SfxParams>({ ...SFX_PRESETS[0] });
  const [activePresetId, setActivePresetId] = useState<string>(SFX_PRESETS[0].id);
  const [customPresets, setCustomPresets] = useState<SfxParams[]>(() => loadCustomSfxPresets());
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [copiedQuick, setCopiedQuick] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playPulse, setPlayPulse] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const waveformSamples = useMemo(() => computeWaveformPreview(params, 300), [params]);
  const tsCode = useMemo(() => generateSfxTypeScriptCode(params), [params]);
  const totalMs = Math.round((params.attack + params.decay) * 1000);

  // Render live oscilloscope waveform & envelope curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(240, Math.round(rect.width));
    const h = Math.max(100, Math.round(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background + engineering grid
    ctx.fillStyle = '#060a10';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    // Center axis
    const midY = h / 2;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Attack/Decay divider marker
    const attackRatio = params.attack / Math.max(0.002, params.attack + params.decay);
    const attackX = Math.max(8, Math.min(w - 8, attackRatio * w));
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(attackX, 8);
    ctx.lineTo(attackX, h - 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Waveform filled shadow
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < waveformSamples.length; i++) {
      const x = (i / (waveformSamples.length - 1)) * w;
      const y = midY - waveformSamples[i] * (h * 0.41);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, midY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(34, 211, 238, 0.25)');
    grad.addColorStop(0.5, 'rgba(34, 211, 238, 0.05)');
    grad.addColorStop(1, 'rgba(34, 211, 238, 0.25)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp waveform line
    ctx.beginPath();
    for (let i = 0; i < waveformSamples.length; i++) {
      const x = (i / (waveformSamples.length - 1)) * w;
      const y = midY - waveformSamples[i] * (h * 0.41);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = playPulse > 0 ? '#67e8f9' : '#22d3ee';
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // Telemetry corner labels
    ctx.fillStyle = '#8fa3ba';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`WAVE: ${params.waveform.toUpperCase()}`, 8, 14);
    ctx.fillText(`${Math.round(params.startFreq)}Hz → ${Math.round(params.endFreq)}Hz`, 8, h - 8);
    ctx.fillStyle = '#f59e0b';
    const durLabel = `${totalMs}ms · NOISE ${Math.round(params.noiseMix * 100)}%`;
    const mW = ctx.measureText(durLabel).width;
    ctx.fillText(durLabel, w - mW - 8, 14);
  }, [waveformSamples, params, totalMs, playPulse]);

  const handlePlay = async (overrideParams?: SfxParams) => {
    try {
      const target = overrideParams ?? params;
      await playSfxLive(target);
      setPlayPulse((p) => p + 1);
      window.setTimeout(() => setPlayPulse(0), 220);
    } catch {
      onNotify('Falha ao inicializar WebAudio neste dispositivo.', 'warning');
    }
  };

  const handleSelectPreset = (preset: SfxParams) => {
    setParams({ ...preset });
    setActivePresetId(preset.id ?? preset.name);
    void handlePlay(preset);
  };

  const handleExportWav = async () => {
    setIsExportingWav(true);
    try {
      const blob = await exportSfxToWavBlob(params, 44100);
      const slug = params.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      triggerBlobDownload(blob, `${slug || 'arena-sfx'}.wav`);
      onNotify(`Áudio .wav (${(blob.size / 1024).toFixed(1)} KB) exportado.`, 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Erro ao renderizar arquivo WAV.',
        'warning'
      );
    } finally {
      setIsExportingWav(false);
    }
  };

  const handleCopyTs = async () => {
    const ok = await copyToClipboard(tsCode);
    if (ok) {
      setCopiedQuick(true);
      onNotify('Função autônoma playSfx() copiada em TypeScript!', 'success');
      window.setTimeout(() => setCopiedQuick(false), 1800);
    }
  };

  const handleRandomize = () => {
    const waves: SfxWaveform[] = ['sine', 'square', 'sawtooth', 'triangle'];
    const randomParams: SfxParams = {
      name: `Mutação #${Math.floor(100 + Math.random() * 900)}`,
      waveform: waves[Math.floor(Math.random() * waves.length)],
      startFreq: Math.round(90 + Math.random() * 1900),
      endFreq: Math.round(45 + Math.random() * 1600),
      attack: Number((0.002 + Math.random() * 0.06).toFixed(3)),
      decay: Number((0.06 + Math.random() * 0.65).toFixed(2)),
      noiseMix: Math.random() > 0.55 ? Number((Math.random() * 0.8).toFixed(2)) : 0,
      volume: 0.72,
      freqCurve: Math.random() > 0.4 ? 'exponential' : 'linear',
      filterFreq: Math.round(900 + Math.random() * 11000),
      vibratoRate: Math.random() > 0.65 ? Math.round(6 + Math.random() * 20) : 0,
      vibratoDepth: Math.random() > 0.65 ? Math.round(25 + Math.random() * 120) : 0,
    };
    setActivePresetId('custom');
    setParams(randomParams);
    void handlePlay(randomParams);
  };

  const handleSaveCustomPreset = () => {
    const saved = saveCustomSfxPreset({
      ...params,
      id: `custom-${Date.now()}`,
      name: params.name.trim() || 'Meu SFX',
    });
    setCustomPresets(saved);
    onNotify(`Preset "${params.name}" salvo localmente.`, 'success');
  };

  const updateParam = <K extends keyof SfxParams>(key: K, value: SfxParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setActivePresetId('custom');
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-4">
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-cyan-300">
              MOD-01A
            </span>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100 sm:text-base">
              SFX Studio · Sintetizador WebAudio Procedural
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Sintetize efeitos em tempo real e exporte como WAV ou função TypeScript autônoma sem assets externos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handlePlay()}
            className="inline-flex items-center gap-1.5 rounded border border-cyan-300/70 bg-cyan-400 px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#041017] shadow-[0_0_16px_rgba(34,211,238,0.28)] transition hover:bg-cyan-300 active:scale-[0.98]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Testar Som</span>
          </button>

          <button
            type="button"
            onClick={() => void handleExportWav()}
            disabled={isExportingWav}
            className="inline-flex items-center gap-1.5 rounded border border-amber-400/50 bg-amber-500/15 px-3 py-2 font-mono text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExportingWav ? 'Renderizando...' : 'Exportar .WAV'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyTs()}
            className="inline-flex items-center gap-1.5 rounded border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 font-mono text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
          >
            {copiedQuick ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedQuick ? 'Copiado!' : 'Copiar Código TypeScript'}</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Split Grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: Presets + Oscilloscope + Synth Sliders */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          {/* Presets Grid */}
          <div className="tactical-panel p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Presets Táticos Prontos
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRandomize}
                  className="inline-flex items-center gap-1 rounded border border-[#2a3f57] bg-[#131d2a] px-2 py-1 font-mono text-[11px] text-cyan-200 transition hover:border-cyan-400/50 hover:bg-[#192638]"
                >
                  <Shuffle className="h-3 w-3" />
                  <span>Mutar</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomPreset}
                  className="inline-flex items-center gap-1 rounded border border-[#2a3f57] bg-[#131d2a] px-2 py-1 font-mono text-[11px] text-amber-200 transition hover:border-amber-400/50 hover:bg-[#192638]"
                  title="Salvar ajuste atual como preset pessoal"
                >
                  <Save className="h-3 w-3" />
                  <span>Salvar</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SFX_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`group flex flex-col items-start rounded border px-2.5 py-2 text-left transition ${
                      isActive
                        ? 'border-cyan-400 bg-cyan-500/15 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]'
                        : 'border-[#1f2f42] bg-[#0f1620] hover:border-[#324b69] hover:bg-[#141f2d]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span
                        className={`font-mono text-xs font-bold ${
                          isActive ? 'text-cyan-200' : 'text-slate-100'
                        }`}
                      >
                        {preset.name}
                      </span>
                      <Volume2
                        className={`h-3 w-3 ${
                          isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                        }`}
                      />
                    </div>
                    <span className="mt-0.5 font-mono text-[9.5px] tracking-wider text-amber-400/90">
                      {preset.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {customPresets.length > 0 && (
              <div className="mt-2.5 border-t border-[#1c2939] pt-2">
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  <span>Meus Presets Salvos ({customPresets.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {customPresets.map((cp) => (
                    <div
                      key={cp.id || cp.name}
                      className="inline-flex items-center overflow-hidden rounded border border-amber-500/35 bg-[#151b24]"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(cp)}
                        className="px-2 py-1 font-mono text-[11px] text-amber-200 hover:bg-amber-500/15"
                      >
                        {cp.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomPresets(deleteCustomSfxPreset(cp.id || ''));
                          onNotify('Preset personalizado removido.', 'info');
                        }}
                        className="border-l border-amber-500/25 px-1.5 py-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                        title="Excluir preset"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Oscilloscope Canvas */}
          <div className="tactical-panel overflow-hidden">
            <canvas
              ref={canvasRef}
              onClick={() => void handlePlay()}
              className="h-32 w-full cursor-pointer sm:h-36"
              title="Clique para disparar o som"
            />
          </div>

          {/* Controls & Sliders */}
          <div className="tactical-panel flex flex-col gap-3 p-3">
            {/* Name + Waveform Selector */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Nome do Efeito
                </label>
                <input
                  type="text"
                  value={params.name}
                  onChange={(e) => updateParam('name', e.target.value)}
                  className="w-full rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
                  placeholder="Ex: Disparo Plasma"
                />
              </div>

              <div className="sm:col-span-7">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Tipo de Onda (OscillatorType)
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {WAVEFORMS.map((w) => {
                    const selected = params.waveform === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => updateParam('waveform', w.id)}
                        className={`flex flex-col items-center justify-center rounded border py-1.5 transition ${
                          selected
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                            : 'border-[#223246] bg-[#0b1119] text-slate-400 hover:border-slate-500 hover:text-slate-200'
                        }`}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-5 stroke-current" fill="none" strokeWidth="2">
                          <path d={w.svgPath} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="mt-0.5 font-mono text-[10px]">{w.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Core 5 Sliders required by prompt */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SliderRow
                label="Frequência Inicial"
                valueDisplay={`${Math.round(params.startFreq)} Hz`}
                min={25}
                max={3200}
                step={5}
                value={params.startFreq}
                onChange={(v) => updateParam('startFreq', v)}
              />
              <SliderRow
                label="Frequência Final"
                valueDisplay={`${Math.round(params.endFreq)} Hz`}
                min={25}
                max={3200}
                step={5}
                value={params.endFreq}
                onChange={(v) => updateParam('endFreq', v)}
              />
              <SliderRow
                label="Ataque (Attack)"
                valueDisplay={`${Math.round(params.attack * 1000)} ms`}
                min={0.001}
                max={0.4}
                step={0.001}
                value={params.attack}
                onChange={(v) => updateParam('attack', v)}
              />
              <SliderRow
                label="Decaimento (Decay)"
                valueDisplay={`${Math.round(params.decay * 1000)} ms`}
                min={0.02}
                max={1.8}
                step={0.01}
                value={params.decay}
                onChange={(v) => updateParam('decay', v)}
              />
              <SliderRow
                label="Ruído Branco (White Noise)"
                valueDisplay={`${Math.round(params.noiseMix * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={params.noiseMix}
                amber
                onChange={(v) => updateParam('noiseMix', v)}
              />
              <SliderRow
                label="Ganho / Volume"
                valueDisplay={`${Math.round(params.volume * 100)}%`}
                min={0.1}
                max={1}
                step={0.01}
                value={params.volume}
                onChange={(v) => updateParam('volume', v)}
              />
            </div>

            {/* Optional Advanced Sculpture Accordion */}
            <div className="border-t border-[#1c2939] pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((s) => !s)}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400 transition hover:text-cyan-300"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>
                  {showAdvanced
                    ? 'Ocultar Modulação & Filtro (LFO / Low-Pass)'
                    : 'Ajuste Fino: Filtro Low-Pass, LFO Vibrato & Curva'}
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SliderRow
                    label="Corte Low-Pass"
                    valueDisplay={`${Math.round(params.filterFreq)} Hz`}
                    min={200}
                    max={16000}
                    step={50}
                    value={params.filterFreq}
                    amber
                    onChange={(v) => updateParam('filterFreq', v)}
                  />
                  <div className="flex flex-col justify-between">
                    <span className="font-mono text-[11px] text-slate-300">Curva de Frequência</span>
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      {(['exponential', 'linear'] as const).map((curve) => (
                        <button
                          key={curve}
                          type="button"
                          onClick={() => updateParam('freqCurve', curve)}
                          className={`rounded border py-1 font-mono text-[11px] uppercase ${
                            params.freqCurve === curve
                              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                              : 'border-[#24364b] bg-[#090e15] text-slate-400'
                          }`}
                        >
                          {curve === 'exponential' ? 'Exponencial' : 'Linear'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <SliderRow
                    label="Vibrato LFO (Taxa)"
                    valueDisplay={`${params.vibratoRate.toFixed(1)} Hz`}
                    min={0}
                    max={30}
                    step={0.5}
                    value={params.vibratoRate}
                    onChange={(v) => updateParam('vibratoRate', v)}
                  />
                  <SliderRow
                    label="Vibrato LFO (Profundidade)"
                    valueDisplay={`${Math.round(params.vibratoDepth)} Hz`}
                    min={0}
                    max={220}
                    step={2}
                    value={params.vibratoDepth}
                    onChange={(v) => updateParam('vibratoDepth', v)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Standalone TypeScript playSfx() Code Output */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <CodeOutputPanel
            title="playSfx.ts — Código Autônomo"
            subtitle={`Preset "${params.name}" · ${totalMs}ms · Zero dependências externas`}
            code={tsCode}
            filename={`playSfx-${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'custom'}.ts`}
            copyLabel="Copiar TS"
            maxHeightClass="max-h-[460px] lg:max-h-[540px]"
            onNotify={onNotify}
            onSendToBridge={onSendToBridge}
            onSaveToVault={(title, code) => onSaveToVault(`SFX: ${params.name} (${title})`, code)}
            bridgeKind="code"
          />
        </div>
      </div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  valueDisplay: string;
  min: number;
  max: number;
  step: number;
  value: number;
  amber?: boolean;
  onChange: (v: number) => void;
}

function SliderRow({
  label,
  valueDisplay,
  min,
  max,
  step,
  value,
  amber = false,
  onChange,
}: SliderRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span className="text-slate-300">{label}</span>
        <span className={`font-semibold tabular-nums ${amber ? 'text-amber-300' : 'text-cyan-300'}`}>
          {valueDisplay}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`forge-slider ${amber ? 'forge-slider-amber' : ''}`}
      />
    </div>
  );
}
