import { useState } from 'react';
import { Settings } from 'lucide-react';
import type { InputController } from '../controls/InputController';
import type { FrameStats, GameSettings } from '../game/types';
import { Joystick } from './Joystick';
import { TouchButtons } from './TouchButtons';
import { PerformanceOverlay } from './PerformanceOverlay';

interface HudProps {
  settings: GameSettings;
  stats: FrameStats;
  input: InputController;
  onOpenSettings: () => void;
}

export function Hud({ settings, stats, input, onOpenSettings }: HudProps) {
  const [isTouch] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  });

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none">
      {settings.showStats ? <PerformanceOverlay stats={stats} /> : null}

      <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-cyan-300/15 bg-slate-950/45 px-4 py-1.5 text-center backdrop-blur-md">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300/90">
          Arena Forge <span className="text-slate-400">//</span> Obby
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Abrir configurações"
        className="hud-button pointer-events-auto absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-slate-950/55 text-cyan-200 backdrop-blur-md hover:border-cyan-300/60 hover:text-cyan-100"
      >
        <Settings size={19} />
      </button>

      {!isTouch ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/5 bg-slate-950/40 px-4 py-1.5 text-[11px] text-slate-400 backdrop-blur-md">
          WASD mover · Espaço pular · Shift correr · arraste para câmera · roda para zoom
        </div>
      ) : (
        <>
          <Joystick input={input} />
          <TouchButtons input={input} />
        </>
      )}
    </div>
  );
}
