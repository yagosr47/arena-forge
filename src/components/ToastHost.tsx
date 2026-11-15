import { CheckCircle2, AlertTriangle, Info, Radio } from 'lucide-react';

export type ToastTone = 'success' | 'warning' | 'info' | 'bridge';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastHostProps {
  toasts: ToastItem[];
}

export function ToastHost({ toasts }: ToastHostProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 top-14 z-50 flex max-w-[calc(100vw-24px)] flex-col gap-2 sm:right-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const toneClasses =
          toast.tone === 'success'
            ? 'border-emerald-500/50 bg-[#0b1615]/95 text-emerald-200'
            : toast.tone === 'warning'
              ? 'border-amber-500/50 bg-[#18130a]/95 text-amber-200'
              : toast.tone === 'bridge'
                ? 'border-cyan-400/60 bg-[#08161d]/95 text-cyan-100'
                : 'border-slate-600/60 bg-[#0d141f]/95 text-slate-200';

        const Icon =
          toast.tone === 'success'
            ? CheckCircle2
            : toast.tone === 'warning'
              ? AlertTriangle
              : toast.tone === 'bridge'
                ? Radio
                : Info;

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded border px-3 py-2 font-mono text-xs shadow-lg backdrop-blur ${toneClasses}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="leading-snug">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
