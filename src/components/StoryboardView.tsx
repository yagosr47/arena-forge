import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Film,
  Upload,
  Wand2,
  Camera,
  Download,
  Trash2,
  Radio,
  Sparkles,
  Copy,
  RefreshCw,
} from 'lucide-react';
import {
  captureFrameFromVideo,
  composeStoryboardImage,
  extractKeyframesAutomatically,
  formatBytes,
  formatTimestamp,
  generateDemoGameplayFrames,
  type StoryboardFormat,
  type StoryboardFrame,
  type StoryboardGridPreset,
  type StoryboardResult,
} from '../vision/videoStoryboarder';
import { triggerBlobDownload } from '../utils/ioHelpers';

interface StoryboardViewProps {
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
  onSendImageToBridge: (payload: {
    title: string;
    dataUrl: string;
    mimeType: string;
  }) => void;
}

export function StoryboardView({ onNotify, onSendImageToBridge }: StoryboardViewProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('gameplay-demo.webm');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);

  const [frameCount, setFrameCount] = useState<number>(9);
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [layout, setLayout] = useState<StoryboardGridPreset>('3x3');
  const [format, setFormat] = useState<StoryboardFormat>('image/webp');
  const [quality, setQuality] = useState<number>(0.78);
  const [maxWidth, setMaxWidth] = useState<number>(1280);
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);

  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractProgress, setExtractProgress] = useState<string>('');
  const [result, setResult] = useState<StoryboardResult | null>(null);
  const [isComposing, setIsComposing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up object URL on change/unmount
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Re-compose Storyboard automatically whenever frames or output settings change
  useEffect(() => {
    if (frames.length === 0) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setIsComposing(true);
    composeStoryboardImage(frames, {
      layout,
      maxWidth,
      format,
      quality,
      showHeader,
      showTimestamps,
      sourceLabel: sourceName,
    })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) {
          onNotify(err instanceof Error ? err.message : 'Erro ao montar grade.', 'warning');
        }
      })
      .finally(() => {
        if (!cancelled) setIsComposing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [frames, layout, maxWidth, format, quality, showHeader, showTimestamps, sourceName, onNotify]);

  const handleVideoFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      onNotify('Selecione um arquivo de vídeo (.mp4, .webm, .mov).', 'warning');
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setSourceName(file.name);
    setFrames([]);
    setResult(null);
    onNotify(`Vídeo "${file.name}" carregado. Extraia automaticamente ou capture quadros.`, 'info');
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    setDuration(dur);
    setTrimStart(0);
    setTrimEnd(dur);
  };

  const handleAutoExtract = async () => {
    const v = videoRef.current;
    if (!v || !videoUrl) {
      onNotify('Carregue um vídeo local primeiro (ou use a Demo Gameplay).', 'warning');
      return;
    }
    setIsExtracting(true);
    setExtractProgress('Preparando...');
    try {
      const extracted = await extractKeyframesAutomatically(
        v,
        frameCount,
        trimStart,
        trimEnd > trimStart ? trimEnd : duration,
        (cur, tot) => setExtractProgress(`Extraindo quadro ${cur}/${tot}...`)
      );
      setFrames(extracted);
      setLayout(extracted.length <= 4 ? '2x2' : '3x3');
      onNotify(`${extracted.length} quadros-chave extraídos com sucesso.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Falha na extração de quadros.', 'warning');
    } finally {
      setIsExtracting(false);
      setExtractProgress('');
    }
  };

  const handleManualCapture = () => {
    const v = videoRef.current;
    if (!v || !videoUrl) {
      onNotify('Carregue um vídeo para capturar quadros manualmente.', 'warning');
      return;
    }
    if (frames.length >= 9) {
      onNotify('Limite de 9 quadros atingido. Remova um quadro para adicionar outro.', 'warning');
      return;
    }
    const frame = captureFrameFromVideo(v);
    setFrames((prev) => {
      const next = [...prev, frame];
      if (next.length > 4 && layout === '2x2') setLayout('3x3');
      return next;
    });
    onNotify(`Quadro capturado em ${formatTimestamp(frame.timestamp)}.`, 'success');
  };

  const handleLoadDemo = () => {
    const demoFrames = generateDemoGameplayFrames(frameCount);
    setSourceName('demo-orbital-combat.webm');
    setFrames(demoFrames);
    setLayout(demoFrames.length <= 4 ? '2x2' : '3x3');
    onNotify(`Storyboard demo gerado (${demoFrames.length} quadros táticos).`, 'info');
  };

  const handleDownloadResult = () => {
    if (!result) return;
    const ext = result.mimeType.includes('webp') ? 'webp' : 'jpg';
    const base = sourceName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
    triggerBlobDownload(result.blob, `storyboard-${base}-${result.cols}x${result.rows}.${ext}`);
    onNotify(`Storyboard salvo (${formatBytes(result.byteSize)}).`, 'success');
  };

  const handleCopyImage = async () => {
    if (!result) return;
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      onNotify('Seu navegador não permite copiar imagens diretas; use Baixar ou Ponte P2P.', 'warning');
      return;
    }
    try {
      // Clipboard API widely supports image/png; convert via canvas if needed
      const img = new Image();
      img.src = result.dataUrl;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const pngBlob = await new Promise<Blob>((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error('Falha PNG'))), 'image/png')
      );
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      onNotify('Imagem do Storyboard copiada! Cole direto no chat da IA.', 'success');
    } catch {
      onNotify('Não foi possível copiar a imagem. Use o botão Baixar.', 'warning');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-cyan-300">
              MOD-02A
            </span>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100 sm:text-base">
              Vídeo → Storyboard · Extrator de Quadros-Chave
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Transforme vídeos de gameplay ou animações em uma única grade 2×2 ou 3×3 numerada e ultraleve (WebP/JPEG) para colar na IA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/*"
            className="hidden"
            onChange={(e) => handleVideoFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded border border-cyan-400/60 bg-cyan-400 px-3 py-1.5 font-mono text-xs font-bold text-[#051017] transition hover:bg-cyan-300"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Carregar Vídeo (.mp4/.webm)</span>
          </button>

          <button
            type="button"
            onClick={handleLoadDemo}
            className="inline-flex items-center gap-1.5 rounded border border-amber-400/45 bg-amber-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Demo Gameplay</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: Video Loader, Scrubber, Manual/Auto Keyframes */}
        <div className="flex flex-col gap-3 lg:col-span-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleVideoFile(e.dataTransfer.files?.[0]);
            }}
            className="tactical-panel flex flex-col gap-3 p-3"
          >
            {videoUrl ? (
              <div className="flex flex-col gap-2">
                <div className="relative overflow-hidden rounded border border-[#24364b] bg-black">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    muted
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                    className="max-h-60 w-full object-contain"
                  />
                </div>

                {/* Scrubber & Trim Range */}
                <div className="grid grid-cols-2 gap-2 rounded border border-[#1d2c3e] bg-[#0a0f17] p-2 font-mono text-[11px]">
                  <div>
                    <div className="flex justify-between text-slate-400">
                      <span>Início Recorte</span>
                      <span className="text-cyan-300">{formatTimestamp(trimStart)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(10, Math.round(duration * 20))}
                      step={1}
                      value={Math.round(trimStart * 20)}
                      style={
                        {
                          '--slider-pct': `${duration > 0 ? Math.min(100, (trimStart / duration) * 100) : 0}%`,
                        } as CSSProperties
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = Number(e.target.value) / 20;
                        setTrimStart(Math.min(val, Math.max(0, trimEnd - 0.1)));
                      }}
                      className="forge-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400">
                      <span>Fim Recorte</span>
                      <span className="text-amber-300">{formatTimestamp(trimEnd)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(10, Math.round(duration * 20))}
                      step={1}
                      value={Math.round(trimEnd * 20)}
                      style={
                        {
                          '--slider-pct': `${duration > 0 ? Math.min(100, (trimEnd / duration) * 100) : 100}%`,
                        } as CSSProperties
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = Number(e.target.value) / 20;
                        setTrimEnd(Math.max(val, Math.min(duration, trimStart + 0.1)));
                      }}
                      className="forge-slider forge-slider-amber"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-tactical-grid flex flex-col items-center justify-center gap-2 rounded border border-dashed border-[#2b425c] px-4 py-8 text-center transition hover:border-cyan-400/60 hover:bg-[#0e1622]"
              >
                <Film className="h-9 w-9 text-cyan-400/80" />
                <div className="font-mono text-xs font-semibold text-slate-200">
                  Arraste um vídeo .MP4 ou .WEBM aqui
                </div>
                <p className="max-w-sm text-[11px] text-slate-400">
                  Processamento 100% local no navegador — nenhum arquivo sai do seu dispositivo.
                </p>
              </button>
            )}

            {/* Extraction Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1c2a3a] pt-2.5">
              <div className="flex items-center gap-2">
                <label className="font-mono text-[11px] text-slate-400">Quadros (4–9):</label>
                <div className="inline-flex overflow-hidden rounded border border-[#24364b] bg-[#080d14]">
                  {[4, 6, 9].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setFrameCount(n);
                        setLayout(n <= 4 ? '2x2' : n === 9 ? '3x3' : 'auto');
                      }}
                      className={`px-2 py-1 font-mono text-xs font-bold ${
                        frameCount === n
                          ? 'bg-cyan-400/20 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={4}
                  max={9}
                  value={frameCount}
                  onChange={(e) => setFrameCount(Math.max(4, Math.min(9, Number(e.target.value) || 4)))}
                  className="w-12 rounded border border-[#24364b] bg-[#080d14] px-1.5 py-1 text-center font-mono text-xs text-cyan-200"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleAutoExtract()}
                  disabled={!videoUrl || isExtracting}
                  className="inline-flex items-center gap-1.5 rounded border border-cyan-400/50 bg-cyan-500/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-40"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>{isExtracting ? extractProgress : `Auto-Extrair (${frameCount})`}</span>
                </button>

                <button
                  type="button"
                  onClick={handleManualCapture}
                  disabled={!videoUrl}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-40"
                  title="Capturar quadro no tempo atual do player"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Capturar ({formatTimestamp(currentTime)})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Captured Keyframe Strip */}
          <div className="tactical-panel flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Quadros Selecionados ({frames.length}/9)
              </span>
              {frames.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFrames([])}
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-rose-300 hover:text-rose-200"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Limpar</span>
                </button>
              )}
            </div>

            {frames.length === 0 ? (
              <p className="rounded border border-[#1a2736] bg-[#080d14] p-4 text-center font-mono text-[11px] text-slate-500">
                Nenhum quadro capturado ainda. Carregue um vídeo ou clique em &ldquo;Demo Gameplay&rdquo;.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {frames.map((frame, idx) => (
                  <div
                    key={frame.id}
                    className="group relative overflow-hidden rounded border border-[#24364b] bg-[#070b11]"
                  >
                    <img
                      src={frame.dataUrl}
                      alt={`Quadro ${idx + 1}`}
                      className="aspect-video w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-[#06090e]/85 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                      #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="absolute bottom-1 left-1 rounded bg-[#06090e]/85 px-1 py-0.5 font-mono text-[9.5px] text-amber-300">
                      {formatTimestamp(frame.timestamp)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFrames((prev) => prev.filter((f) => f.id !== frame.id))}
                      className="absolute right-1 top-1 rounded bg-rose-600/85 p-1 text-white opacity-85 transition hover:opacity-100"
                      title="Remover quadro"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Storyboard Output Settings + Live Compressed Grid Preview */}
        <div className="flex flex-col gap-3 lg:col-span-6">
          <div className="tactical-panel flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Configuração da Grade & Compressão
              </span>

              <div className="flex items-center gap-1.5">
                {(['2x2', '3x3', 'auto'] as StoryboardGridPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLayout(preset)}
                    className={`rounded border px-2 py-1 font-mono text-[11px] font-bold uppercase ${
                      layout === preset
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                        : 'border-[#223246] bg-[#0b1119] text-slate-400'
                    }`}
                  >
                    {preset === 'auto' ? 'Auto' : `Grade ${preset}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-slate-400">
                  Formato Comprimido
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as StoryboardFormat)}
                  className="w-full rounded border border-[#24364b] bg-[#080d14] px-2 py-1.5 font-mono text-xs text-slate-200"
                >
                  <option value="image/webp">WebP (Mais leve)</option>
                  <option value="image/jpeg">JPEG (Universal)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-slate-400">
                  Largura Máx.
                </label>
                <select
                  value={maxWidth}
                  onChange={(e) => setMaxWidth(Number(e.target.value))}
                  className="w-full rounded border border-[#24364b] bg-[#080d14] px-2 py-1.5 font-mono text-xs text-slate-200"
                >
                  <option value={800}>800px (Compacto)</option>
                  <option value={1080}>1080px (Chat IA)</option>
                  <option value={1280}>1280px (HD Padrão)</option>
                  <option value={1600}>1600px (Alta Def.)</option>
                </select>
              </div>

              <div>
                <div className="mb-1 flex justify-between font-mono text-[10px] uppercase">
                  <span className="text-slate-400">Qualidade</span>
                  <span className="font-bold text-amber-300">{Math.round(quality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={95}
                  step={5}
                  value={Math.round(quality * 100)}
                  style={
                    {
                      '--slider-pct': `${((Math.round(quality * 100) - 40) / 55) * 100}%`,
                    } as CSSProperties
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onChange={(e) => setQuality(Number(e.target.value) / 100)}
                  className="forge-slider forge-slider-amber"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-[#1c2a3a] pt-2 font-mono text-[11px] text-slate-300">
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showHeader}
                  onChange={(e) => setShowHeader(e.target.checked)}
                  className="accent-cyan-400"
                />
                <span>Cabeçalho Técnico</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="accent-cyan-400"
                />
                <span>Carimbo de Tempo (s)</span>
              </label>
            </div>
          </div>

          {/* Rendered Storyboard Canvas Output */}
          <div className="tactical-panel flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2e40] bg-[#0e151f] px-3 py-2">
              <div className="font-mono text-[11px]">
                {result ? (
                  <span className="text-emerald-300">
                    PRONTO · {result.width}×{result.height}px ·{' '}
                    <strong>{formatBytes(result.byteSize)}</strong> (
                    {result.mimeType.replace('image/', '').toUpperCase()})
                  </span>
                ) : (
                  <span className="text-slate-400">Preview do Storyboard Final</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={!result}
                  onClick={() => void handleCopyImage()}
                  className="inline-flex items-center gap-1 rounded border border-cyan-400/50 bg-cyan-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-40"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copiar Imagem</span>
                </button>
                <button
                  type="button"
                  disabled={!result}
                  onClick={handleDownloadResult}
                  className="inline-flex items-center gap-1 rounded border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-40"
                >
                  <Download className="h-3 w-3" />
                  <span>Baixar</span>
                </button>
                <button
                  type="button"
                  disabled={!result}
                  onClick={() => {
                    if (!result) return;
                    onSendImageToBridge({
                      title: `Storyboard ${result.cols}x${result.rows} (${sourceName})`,
                      dataUrl: result.dataUrl,
                      mimeType: result.mimeType,
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  <Radio className="h-3 w-3" />
                  <span>Ponte P2P</span>
                </button>
              </div>
            </div>

            <div className="bg-tactical-grid flex min-h-[260px] items-center justify-center p-3">
              {isComposing ? (
                <div className="flex items-center gap-2 font-mono text-xs text-cyan-300">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Renderizando e comprimindo grade...</span>
                </div>
              ) : result ? (
                <img
                  src={result.dataUrl}
                  alt="Storyboard Gerado"
                  className="max-h-[420px] w-auto rounded border border-[#24364b] shadow-xl"
                />
              ) : (
                <p className="max-w-xs text-center font-mono text-xs text-slate-500">
                  A imagem final da grade numerada 2×2 / 3×3 aparecerá aqui pronta para anexar no chat da IA.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
