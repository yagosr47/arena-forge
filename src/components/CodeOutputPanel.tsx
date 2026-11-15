import { useState } from 'react';
import { Check, Copy, Download, Radio, BookmarkPlus } from 'lucide-react';
import { copyToClipboard, triggerTextDownload } from '../utils/ioHelpers';

interface CodeOutputPanelProps {
  title: string;
  subtitle?: string;
  code: string;
  filename: string;
  copyLabel?: string;
  maxHeightClass?: string;
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
  onSendToBridge?: (payload: { title: string; content: string; kind: 'code' | 'markdown' | 'json' }) => void;
  onSaveToVault?: (title: string, code: string) => void;
  bridgeKind?: 'code' | 'markdown' | 'json';
}

export function CodeOutputPanel({
  title,
  subtitle,
  code,
  filename,
  copyLabel = 'Copiar Código',
  maxHeightClass = 'max-h-72',
  onNotify,
  onSendToBridge,
  onSaveToVault,
  bridgeKind = 'code',
}: CodeOutputPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      onNotify(`${title} copiado para a área de transferência.`, 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      onNotify('Não foi possível copiar automaticamente.', 'warning');
    }
  };

  return (
    <div className="tactical-panel flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2e40] bg-[#0e151f] px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-xs bg-cyan-400" />
            <span className="truncate font-mono text-xs font-semibold uppercase tracking-wider text-slate-100">
              {title}
            </span>
          </div>
          {subtitle && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{subtitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded border border-cyan-400/50 bg-cyan-500/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25 active:scale-[0.98]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copiado!' : copyLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerTextDownload(code, filename);
              onNotify(`Arquivo ${filename} exportado.`, 'success');
            }}
            className="inline-flex items-center gap-1 rounded border border-[#293d54] bg-[#141f2d] px-2 py-1.5 font-mono text-[11px] text-slate-200 transition hover:border-slate-500 hover:bg-[#1a283a]"
            title={`Baixar ${filename}`}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Baixar</span>
          </button>

          {onSaveToVault && (
            <button
              type="button"
              onClick={() => onSaveToVault(title, code)}
              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 font-mono text-[11px] text-amber-200 transition hover:bg-amber-500/20"
              title="Salvar no Cofre IndexedDB"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cofre</span>
            </button>
          )}

          {onSendToBridge && (
            <button
              type="button"
              onClick={() => onSendToBridge({ title, content: code, kind: bridgeKind })}
              className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 font-mono text-[11px] text-emerald-200 transition hover:bg-emerald-500/20"
              title="Enviar via Ponte QR / WebRTC"
            >
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ponte</span>
            </button>
          )}
        </div>
      </div>

      <pre
        className={`forge-scroll overflow-auto bg-[#070b11] p-3 font-mono text-[11.5px] leading-relaxed text-slate-200 ${maxHeightClass}`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
