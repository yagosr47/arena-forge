import type { FrameStats } from '../game/types';

interface PerformanceOverlayProps {
  stats: FrameStats;
}

/** Contador de FPS e latência de frame em tempo real. */
export function PerformanceOverlay({ stats }: PerformanceOverlayProps) {
  const fps = Math.max(0, Math.min(999, stats.fps));
  const tone = fps >= 50 ? 'text-emerald-300' : fps >= 28 ? 'text-amber-300' : 'text-rose-300';

  return (
    <div className="pointer-events-none fixed left-4 top-4 z-30 rounded-xl border border-cyan-300/15 bg-slate-950/55 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${fps >= 50 ? 'bg-emerald-400' : fps >= 28 ? 'bg-amber-400' : 'bg-rose-400'}`} />
        <span className={tone}>{fps} FPS</span>
      </div>
      <div className="text-slate-400">{stats.frameMs.toFixed(1)} ms / frame</div>
    </div>
  );
}
