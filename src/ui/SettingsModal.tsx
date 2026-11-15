import { useEffect, useState, type ReactNode } from 'react';
import {
  Camera,
  Gamepad2,
  Gauge,
  Monitor,
  RotateCcw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import type { GameSettings, QualityLevel } from '../game/types';
import { DEFAULT_SETTINGS, QUALITY_LABELS } from '../game/types';
import { applyQualityPreset } from '../game/settings';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <header className="mb-3 flex items-center gap-2 text-cyan-300">
        {icon}
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em]">{title}</h3>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-200">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-cyan-400/80' : 'bg-slate-600/70'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm text-slate-200">
      <span className="mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-xs text-cyan-300">{format(value)}</span>
      </span>
      <input
        type="range"
        className="range-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="text-sm text-slate-200">
      {label ? <div className="mb-1.5">{label}</div> : null}
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-900/70 p-1">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              value === option.value
                ? 'bg-cyan-400/85 text-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.35)]'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsModal({ open, settings, onChange, onClose }: SettingsModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  if (!open) return null;

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* fullscreen indisponível neste contexto */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <button
        type="button"
        aria-label="Fechar configurações"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <div className="glass-panel scrollbar-thin relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl sm:h-full sm:max-h-none sm:rounded-none sm:border-y-0 sm:border-r-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-slate-950/70 px-5 py-4 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <Settings size={18} className="text-cyan-300" />
            <div>
              <h2 className="text-sm font-semibold tracking-wide">Configurações &amp; Otimização</h2>
              <p className="text-[11px] text-slate-400">Persistidas automaticamente</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full border border-white/10 p-2 text-slate-300 transition-colors hover:border-cyan-300/40 hover:text-cyan-200"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <Section icon={<Gauge size={15} />} title="Gráficos & Otimização">
            <Segmented<QualityLevel>
              label="Qualidade"
              value={settings.quality}
              onChange={(quality) => onChange(applyQualityPreset(settings, quality))}
              options={(Object.keys(QUALITY_LABELS) as QualityLevel[]).map((key) => ({
                value: key,
                label: QUALITY_LABELS[key],
              }))}
            />
            <Slider
              label="Escala de resolução (Pixel Ratio)"
              value={settings.pixelRatio}
              min={0.5}
              max={2}
              step={0.1}
              format={(value) => `${value.toFixed(1)}x`}
              onChange={(pixelRatio) => onChange({ ...settings, pixelRatio })}
            />
            <Toggle
              label="Sombras dinâmicas"
              checked={settings.shadows}
              onChange={(shadows) => onChange({ ...settings, shadows })}
            />
            <Toggle
              label="Partículas"
              checked={settings.particles}
              onChange={(particles) => onChange({ ...settings, particles })}
            />
            <Segmented<number>
              label="Limitador de FPS"
              value={settings.fpsLimit}
              onChange={(fpsLimit) => onChange({ ...settings, fpsLimit })}
              options={[
                { value: 30, label: '30' },
                { value: 60, label: '60' },
                { value: 0, label: 'Livre' },
              ]}
            />
          </Section>

          <Section icon={<Camera size={15} />} title="Tela & Câmera">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex w-full items-center justify-between rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2.5 text-sm text-cyan-100 transition-colors hover:bg-cyan-400/20"
            >
              <span className="flex items-center gap-2">
                <Monitor size={16} />
                Tela Cheia
              </span>
              <span className="font-mono text-xs text-cyan-300">{isFullscreen ? 'Ativado' : 'Desativado'}</span>
            </button>
            <Slider
              label="Campo de visão (FOV)"
              value={settings.fov}
              min={60}
              max={100}
              step={1}
              format={(value) => `${value}°`}
              onChange={(fov) => onChange({ ...settings, fov })}
            />
            <Slider
              label="Sensibilidade da câmera"
              value={settings.sensitivity}
              min={0.3}
              max={2.5}
              step={0.05}
              format={(value) => `${value.toFixed(2)}x`}
              onChange={(sensitivity) => onChange({ ...settings, sensitivity })}
            />
            <Toggle
              label="Contador de FPS e latência"
              checked={settings.showStats}
              onChange={(showStats) => onChange({ ...settings, showStats })}
            />
          </Section>

          <Section icon={<Gamepad2 size={15} />} title="Controles & Áudio">
            <Slider
              label="Volume dos efeitos sonoros"
              value={settings.volume}
              min={0}
              max={1}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={(volume) => onChange({ ...settings, volume })}
            />
            <Slider
              label="Tamanho dos botões na tela"
              value={settings.buttonScale}
              min={0.7}
              max={1.5}
              step={0.05}
              format={(value) => `${value.toFixed(2)}x`}
              onChange={(buttonScale) => onChange({ ...settings, buttonScale })}
            />
            <Slider
              label="Opacidade dos botões"
              value={settings.buttonOpacity}
              min={0.3}
              max={1}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={(buttonOpacity) => onChange({ ...settings, buttonOpacity })}
            />
          </Section>

          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_SETTINGS })}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-200 transition-colors hover:bg-rose-400/20"
          >
            <RotateCcw size={15} />
            Restaurar padrões
          </button>

          <p className="flex items-center justify-center gap-2 pb-2 text-center text-[11px] text-slate-500">
            <Sparkles size={12} className="text-cyan-400/60" />
            Arena Forge Obby · Three.js + Rapier3D
          </p>
        </div>

      </div>
    </div>
  );
}
