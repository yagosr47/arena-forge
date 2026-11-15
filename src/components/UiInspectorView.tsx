import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Sparkles,
  Check,
  Copy,
  Pipette,
  Image as ImageIcon,
  Palette,
} from 'lucide-react';
import {
  contrastRatio,
  generateSampleReferenceDataUrl,
  generateUiSpecMarkdown,
  inspectReferenceImage,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  type ExtractedSwatch,
  type UiInspectionResult,
} from '../vision/paletteAndPromptExtractor';
import { copyToClipboard } from '../utils/ioHelpers';
import { CodeOutputPanel } from './CodeOutputPanel';

interface UiInspectorViewProps {
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
  onSendToBridge: (payload: {
    title: string;
    content: string;
    kind: 'code' | 'markdown' | 'json';
  }) => void;
  onSaveToVault: (title: string, code: string) => void;
}

export function UiInspectorView({
  onNotify,
  onSendToBridge,
  onSaveToVault,
}: UiInspectorViewProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [inspection, setInspection] = useState<UiInspectionResult | null>(null);
  const [projectGoal, setProjectGoal] = useState<string>('Jogo / HUD Tático Mobile-First');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [eyedropperSlot, setEyedropperSlot] = useState<number | null>(null);
  const [sampledHex, setSampledHex] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const processDataUrl = (dataUrl: string, name: string) => {
    setImageDataUrl(dataUrl);
    const img = new Image();
    img.onload = () => {
      try {
        const res = inspectReferenceImage(img, name);
        setInspection(res);
        setEyedropperSlot(null);
        setSampledHex(null);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'Erro ao inspecionar imagem.', 'warning');
      }
    };
    img.onerror = () => onNotify('Não foi possível decodificar a imagem.', 'warning');
    img.src = dataUrl;
  };

  const handleImageFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('Selecione uma imagem PNG, JPG ou WebP.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        processDataUrl(reader.result, file.name);
        onNotify(`Paleta de 6 cores extraída de "${file.name}".`, 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  // Support Ctrl+V / Cmd+V screenshot paste anywhere while tab is open
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            handleImageFile(new File([blob], `clipboard-${Date.now()}.png`, { type: blob.type }));
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadSample = () => {
    const url = generateSampleReferenceDataUrl();
    processDataUrl(url, 'mech-ops-hud-ref.png');
    onNotify('Print de referência tático carregado e analisado.', 'info');
  };

  const handleCopyHex = async (hex: string) => {
    const ok = await copyToClipboard(hex);
    if (ok) {
      setCopiedHex(hex);
      onNotify(`Cor ${hex} copiada!`, 'success');
      window.setTimeout(() => setCopiedHex((cur) => (cur === hex ? null : cur)), 1400);
    }
  };

  const handleCopyAllHex = async () => {
    if (!inspection) return;
    const line = inspection.palette.map((c) => `${c.hex} (${c.role})`).join(' · ');
    if (await copyToClipboard(line)) {
      onNotify('Todas as 6 cores HEX copiadas.', 'success');
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img || !inspection) return;
    const rect = img.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const px = Math.max(0, Math.min(img.naturalWidth - 1, Math.floor(rx * img.naturalWidth)));
    const py = Math.max(0, Math.min(img.naturalHeight - 1, Math.floor(ry * img.naturalHeight)));

    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(px, py, 1, 1).data;
    const rgb: [number, number, number] = [data[0], data[1], data[2]];
    const hex = rgbToHex(...rgb);
    setSampledHex(hex);

    if (eyedropperSlot !== null) {
      const lum = relativeLuminance(...rgb);
      const nextPalette: ExtractedSwatch[] = inspection.palette.map((sw, idx) =>
        idx === eyedropperSlot
          ? {
              ...sw,
              hex,
              rgb,
              hsl: rgbToHsl(...rgb),
              luminance: Number(lum.toFixed(3)),
              contrastWhite: contrastRatio(lum, 1),
              contrastBlack: contrastRatio(lum, 0),
            }
          : sw
      );
      setInspection({ ...inspection, palette: nextPalette });
      onNotify(`Slot "${inspection.palette[eyedropperSlot].role}" atualizado para ${hex}.`, 'success');
      setEyedropperSlot(null);
    } else {
      void handleCopyHex(hex);
    }
  };

  const markdownSpec = useMemo(() => {
    if (!inspection) return '';
    return generateUiSpecMarkdown(inspection, projectGoal || 'Novo Projeto');
  }, [inspection, projectGoal]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-cyan-300">
              MOD-02B
            </span>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100 sm:text-base">
              Inspetor UI · Extrator de Paleta (6 HEX) & Spec Markdown
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Carregue ou cole (Ctrl+V) um print de jogo/UI para extrair as 6 cores predominantes e gerar o prompt de direção visual em Markdown.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImageFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded border border-cyan-400/60 bg-cyan-400 px-3 py-1.5 font-mono text-xs font-bold text-[#051017] transition hover:bg-cyan-300"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Carregar Print UI</span>
          </button>
          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 rounded border border-amber-400/45 bg-amber-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Referência Demo</span>
          </button>
        </div>
      </div>

      {/* Main Split */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: Reference Image + 6 Swatches */}
        <div className="flex flex-col gap-3 lg:col-span-6">
          {/* Upload / Interactive Eyedropper Surface */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleImageFile(e.dataTransfer.files?.[0]);
            }}
            className="tactical-panel flex flex-col gap-2.5 p-3"
          >
            {imageDataUrl ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="text-slate-300">
                    {eyedropperSlot !== null
                      ? `Pipeta ativa: clique na imagem para substituir "${inspection?.palette[eyedropperSlot]?.role}"`
                      : 'Clique em qualquer pixel da imagem para copiar sua cor HEX'}
                  </span>
                  {sampledHex && (
                    <span className="inline-flex items-center gap-1.5 rounded border border-[#2a3f57] bg-[#090f17] px-2 py-0.5 text-cyan-200">
                      <span
                        className="h-3 w-3 rounded-xs border border-white/25"
                        style={{ backgroundColor: sampledHex }}
                      />
                      <span>{sampledHex}</span>
                    </span>
                  )}
                </div>

                <div className="bg-tactical-grid flex items-center justify-center overflow-hidden rounded border border-[#23354a] p-2">
                  <img
                    ref={imgRef}
                    src={imageDataUrl}
                    alt="Referência UI"
                    onClick={handleImageClick}
                    className={`max-h-72 w-auto rounded ${
                      eyedropperSlot !== null ? 'cursor-crosshair ring-2 ring-amber-400' : 'cursor-pointer'
                    }`}
                  />
                </div>

                {inspection && (
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px]">
                    <span className="rounded border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-cyan-200">
                      TEMA: {inspection.themeMode.toUpperCase()}
                    </span>
                    <span className="rounded border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                      {inspection.contrastProfile.toUpperCase()}
                    </span>
                    <span className="rounded border border-[#2a3f57] bg-[#121c29] px-2 py-0.5 text-slate-300">
                      {inspection.saturationProfile.toUpperCase()}
                    </span>
                    <span className="rounded border border-[#2a3f57] bg-[#121c29] px-2 py-0.5 text-slate-400">
                      {inspection.imageWidth}×{inspection.imageHeight}px
                    </span>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-tactical-grid flex flex-col items-center justify-center gap-2 rounded border border-dashed border-[#2b425c] px-4 py-10 text-center transition hover:border-cyan-400/60 hover:bg-[#0e1622]"
              >
                <ImageIcon className="h-9 w-9 text-cyan-400/80" />
                <div className="font-mono text-xs font-semibold text-slate-200">
                  Arraste um print, clique para carregar ou pressione Ctrl+V
                </div>
                <p className="max-w-sm text-[11px] text-slate-400">
                  Quantização K-Means++ local com preservação de acentos neon e análise de contraste WCAG.
                </p>
              </button>
            )}
          </div>

          {/* 6 Dominant Colors Grid */}
          <div className="tactical-panel flex flex-col gap-2.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                <Palette className="h-3.5 w-3.5 text-cyan-400" />
                <span>6 Cores Predominantes (Clique para Copiar HEX)</span>
              </div>
              {inspection && (
                <button
                  type="button"
                  onClick={() => void handleCopyAllHex()}
                  className="inline-flex items-center gap-1 rounded border border-[#293d54] bg-[#131e2c] px-2 py-1 font-mono text-[10.5px] text-slate-200 hover:border-cyan-400/50"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copiar Todas</span>
                </button>
              )}
            </div>

            {inspection ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {inspection.palette.map((swatch, idx) => {
                  const isCopied = copiedHex === swatch.hex;
                  const isPicking = eyedropperSlot === idx;
                  return (
                    <div
                      key={`${swatch.cssVar}-${idx}`}
                      className={`flex flex-col overflow-hidden rounded border transition ${
                        isPicking
                          ? 'border-amber-400 ring-1 ring-amber-400/60'
                          : 'border-[#233448] bg-[#0a0f17]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void handleCopyHex(swatch.hex)}
                        style={{ backgroundColor: swatch.hex }}
                        className="group relative flex h-16 w-full items-end justify-between p-2 text-left"
                        title={`Copiar ${swatch.hex}`}
                      >
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            swatch.luminance > 0.45
                              ? 'bg-black/65 text-white'
                              : 'bg-white/15 text-white backdrop-blur-xs'
                          }`}
                        >
                          {swatch.hex}
                        </span>
                        <span className="rounded bg-black/60 p-1 text-white opacity-85 group-hover:opacity-100">
                          {isCopied ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </span>
                      </button>

                      <div className="flex items-center justify-between gap-1 px-2 py-1.5 font-mono text-[10px]">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-200">{swatch.role}</div>
                          <div className="truncate text-[9.5px] text-slate-400">
                            {swatch.cssVar} · W {swatch.contrastWhite}:1
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEyedropperSlot(isPicking ? null : idx)}
                          className={`shrink-0 rounded border p-1 ${
                            isPicking
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                              : 'border-[#223246] text-slate-400 hover:text-cyan-200'
                          }`}
                          title="Capturar cor da imagem com pipeta"
                        >
                          <Pipette className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded border border-[#1a2736] bg-[#080d14] p-4 text-center font-mono text-[11px] text-slate-500">
                As 6 cores extraídas aparecerão aqui com cópia em 1 clique e tokens semânticos.
              </p>
            )}
          </div>
        </div>

        {/* Right: Project Goal + Markdown Technical UI Spec */}
        <div className="flex flex-col gap-3 lg:col-span-6">
          <div className="tactical-panel flex flex-col gap-2 p-3">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-slate-400">
              Alvo / Tipo de Projeto (injeta no prompt Markdown)
            </label>
            <input
              type="text"
              value={projectGoal}
              onChange={(e) => setProjectGoal(e.target.value)}
              className="w-full rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Ex: Dashboard SaaS, Shooter Arcade PWA, App Finanças..."
            />
          </div>

          {inspection ? (
            <CodeOutputPanel
              title="ui-style-spec.md — Bloco de Especificação para IA"
              subtitle={`6 tokens semânticos · Tema ${inspection.themeMode} · Pronto para colar no prompt`}
              code={markdownSpec}
              filename={`ui-spec-${inspection.sourceName.replace(/\.[^.]+$/, '')}.md`}
              copyLabel="Copiar Markdown"
              maxHeightClass="max-h-[430px] lg:max-h-[490px]"
              onNotify={onNotify}
              onSendToBridge={onSendToBridge}
              onSaveToVault={(title, code) => onSaveToVault(`UI Spec: ${projectGoal} (${title})`, code)}
              bridgeKind="markdown"
            />
          ) : (
            <div className="tactical-panel flex min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center">
              <Palette className="h-8 w-8 text-slate-600" />
              <p className="max-w-sm font-mono text-xs text-slate-400">
                Carregue um print ou clique em &ldquo;Referência Demo&rdquo; para gerar o bloco completo de especificação técnica UI/estilo em Markdown.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
