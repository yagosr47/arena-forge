import { useMemo, useRef, useState } from 'react';
import {
  Pencil,
  Eraser,
  PaintBucket,
  Minus,
  Square,
  Circle,
  Pipette,
  Undo2,
  Redo2,
  Trash2,
  FlipHorizontal2,
  FlipVertical2,
  Download,
  Grid3X3,
} from 'lucide-react';
import {
  SPRITE_TEMPLATES,
  TACTICAL_PALETTES,
  applyShapePoints,
  cloneGrid,
  computeCirclePoints,
  computeLinePoints,
  computeRectPoints,
  countFilledPixels,
  createEmptyGrid,
  exportSpriteToCanvas2D,
  exportSpriteToPngBlob,
  exportSpriteToReactTsx,
  exportSpriteToSvg,
  floodFillGrid,
  mergeGridToRects,
  resizeGrid,
  setPixelWithSymmetry,
  type GridSize,
  type PixelGrid,
  type SpriteTool,
} from '../generators/svgSpriteForge';
import { triggerBlobDownload, triggerTextDownload } from '../utils/ioHelpers';
import { CodeOutputPanel } from './CodeOutputPanel';

interface SpriteForgeViewProps {
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
  onSendToBridge: (payload: {
    title: string;
    content: string;
    kind: 'code' | 'markdown' | 'json';
  }) => void;
  onSaveToVault: (title: string, code: string) => void;
}

type ExportTab = 'tsx' | 'canvas' | 'svg';

const TOOLS: Array<{ id: SpriteTool; label: string; icon: typeof Pencil }> = [
  { id: 'pencil', label: 'Lápis', icon: Pencil },
  { id: 'eraser', label: 'Borracha', icon: Eraser },
  { id: 'fill', label: 'Balde', icon: PaintBucket },
  { id: 'line', label: 'Linha', icon: Minus },
  { id: 'rect', label: 'Retâng.', icon: Square },
  { id: 'circle', label: 'Círculo', icon: Circle },
  { id: 'eyedropper', label: 'Pipeta', icon: Pipette },
];

export function SpriteForgeView({
  onNotify,
  onSendToBridge,
  onSaveToVault,
}: SpriteForgeViewProps) {
  const [gridSize, setGridSize] = useState<GridSize>(16);
  const [grid, setGrid] = useState<PixelGrid>(() => cloneGrid(SPRITE_TEMPLATES[0].grid));
  const [spriteName, setSpriteName] = useState<string>('NaveInterceptor');
  const [tool, setTool] = useState<SpriteTool>('pencil');
  const [paletteId, setPaletteId] = useState<string>(TACTICAL_PALETTES[0].id);
  const [activeColor, setActiveColor] = useState<string>(TACTICAL_PALETTES[0].colors[0]);
  const [mirrorX, setMirrorX] = useState<boolean>(true);
  const [mirrorY, setMirrorY] = useState<boolean>(false);
  const [fillShapes, setFillShapes] = useState<boolean>(false);
  const [showGridLines, setShowGridLines] = useState<boolean>(true);
  const [exportTab, setExportTab] = useState<ExportTab>('tsx');
  const [pngScale, setPngScale] = useState<number>(16);

  const [history, setHistory] = useState<PixelGrid[]>([]);
  const [redoStack, setRedoStack] = useState<PixelGrid[]>([]);

  // Pointer drag state for smooth touch/mouse stroke & geometric shape preview
  const isDrawingRef = useRef(false);
  const dragStartRef = useRef<[number, number] | null>(null);
  const baseGridRef = useRef<PixelGrid | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);

  const activePalette = useMemo(
    () => TACTICAL_PALETTES.find((p) => p.id === paletteId) ?? TACTICAL_PALETTES[0],
    [paletteId]
  );

  const svgMarkup = useMemo(() => exportSpriteToSvg(grid), [grid]);
  const reactCode = useMemo(() => exportSpriteToReactTsx(grid, spriteName), [grid, spriteName]);
  const canvasCode = useMemo(() => exportSpriteToCanvas2D(grid, spriteName), [grid, spriteName]);
  const filledPixels = useMemo(() => countFilledPixels(grid), [grid]);
  const mergedRectCount = useMemo(() => mergeGridToRects(grid).length, [grid]);

  const pushHistory = (prev: PixelGrid) => {
    setHistory((h) => [...h.slice(-24), cloneGrid(prev)]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [...r, cloneGrid(grid)]);
    setHistory((h) => h.slice(0, -1));
    setGrid(prev);
    setGridSize(prev.length === 32 ? 32 : 16);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((h) => [...h, cloneGrid(grid)]);
    setRedoStack((r) => r.slice(0, -1));
    setGrid(next);
    setGridSize(next.length === 32 ? 32 : 16);
  };

  const handleChangeGridSize = (nextSize: GridSize) => {
    if (nextSize === gridSize) return;
    pushHistory(grid);
    setGrid((prev) => resizeGrid(prev, nextSize));
    setGridSize(nextSize);
    onNotify(`Grade ajustada para ${nextSize}×${nextSize}.`, 'info');
  };

  const handleLoadTemplate = (templateId: string) => {
    const tpl = SPRITE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    pushHistory(grid);
    const loaded = tpl.size === gridSize ? cloneGrid(tpl.grid) : resizeGrid(tpl.grid, gridSize);
    setGrid(loaded);
    setSpriteName(tpl.name.replace(/\s+/g, ''));
  };

  const getCellFromPointer = (clientX: number, clientY: number): [number, number] | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * gridSize);
    const y = Math.floor(((clientY - rect.top) / rect.height) * gridSize);
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return null;
    return [x, y];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    const [x, y] = cell;
    setHoverCell(cell);

    if (tool === 'eyedropper') {
      const picked = grid[y][x];
      if (picked) {
        setActiveColor(picked);
        setTool('pencil');
        onNotify(`Cor capturada: ${picked}`, 'info');
      }
      return;
    }

    if (tool === 'fill') {
      pushHistory(grid);
      setGrid((prev) => floodFillGrid(prev, x, y, activeColor));
      return;
    }

    pushHistory(grid);
    isDrawingRef.current = true;
    dragStartRef.current = [x, y];
    baseGridRef.current = cloneGrid(grid);

    if (tool === 'pencil' || tool === 'eraser') {
      const color = tool === 'eraser' ? null : activeColor;
      setGrid((prev) => setPixelWithSymmetry(prev, x, y, color, mirrorX, mirrorY));
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const cell = getCellFromPointer(e.clientX, e.clientY);
    setHoverCell(cell);
    if (!isDrawingRef.current || !cell) return;
    const [x, y] = cell;

    if (tool === 'pencil' || tool === 'eraser') {
      const color = tool === 'eraser' ? null : activeColor;
      setGrid((prev) => setPixelWithSymmetry(prev, x, y, color, mirrorX, mirrorY));
      return;
    }

    if (dragStartRef.current && baseGridRef.current) {
      const [sx, sy] = dragStartRef.current;
      let pts: Array<[number, number]> = [];
      if (tool === 'line') pts = computeLinePoints(sx, sy, x, y);
      else if (tool === 'rect') pts = computeRectPoints(sx, sy, x, y, fillShapes);
      else if (tool === 'circle') pts = computeCirclePoints(sx, sy, x, y, fillShapes);

      setGrid(applyShapePoints(baseGridRef.current, pts, activeColor, mirrorX, mirrorY));
    }
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
    dragStartRef.current = null;
    baseGridRef.current = null;
  };

  const handleExportPng = async () => {
    try {
      const blob = await exportSpriteToPngBlob(grid, pngScale);
      const slug = spriteName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sprite';
      triggerBlobDownload(blob, `${slug}-${gridSize * pngScale}px.png`);
      onNotify(`PNG ${gridSize * pngScale}×${gridSize * pngScale}px exportado.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao exportar PNG.', 'warning');
    }
  };

  const currentCode =
    exportTab === 'tsx' ? reactCode : exportTab === 'canvas' ? canvasCode : svgMarkup;
  const currentFilename =
    exportTab === 'tsx'
      ? `${spriteName || 'ArenaSprite'}.tsx`
      : exportTab === 'canvas'
        ? `draw${spriteName || 'ArenaSprite'}.ts`
        : `${spriteName || 'arena-sprite'}.svg`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-cyan-300">
              MOD-01B
            </span>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100 sm:text-base">
              Sprite / SVG Forge · Vetorial & Pixel Grid
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Desenhe sprites 16×16 ou 32×32 com simetria e formas geométricas e exporte para PNG, React TSX ou Canvas 2D puro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded border border-[#24364b] bg-[#0b1119]">
            {([16, 32] as GridSize[]).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => handleChangeGridSize(sz)}
                className={`px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                  gridSize === sz
                    ? 'bg-cyan-400 text-[#051017]'
                    : 'text-slate-300 hover:bg-[#141f2e]'
                }`}
              >
                {sz}×{sz}
              </button>
            ))}
          </div>

          <select
            value={pngScale}
            onChange={(e) => setPngScale(Number(e.target.value))}
            className="rounded border border-[#24364b] bg-[#0b1119] px-2 py-1.5 font-mono text-xs text-slate-200 outline-none"
            title="Escala de exportação PNG"
          >
            <option value={1}>PNG 1x ({gridSize}px)</option>
            <option value={8}>PNG 8x ({gridSize * 8}px)</option>
            <option value={16}>PNG 16x ({gridSize * 16}px)</option>
          </select>

          <button
            type="button"
            onClick={() => void handleExportPng()}
            className="inline-flex items-center gap-1.5 rounded border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar .PNG</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerTextDownload(svgMarkup, `${spriteName || 'sprite'}.svg`, 'image/svg+xml');
              onNotify('Arquivo .SVG exportado.', 'success');
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[#2c415a] bg-[#131e2c] px-3 py-1.5 font-mono text-xs text-slate-200 transition hover:bg-[#1a293c]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>.SVG</span>
          </button>
        </div>
      </div>

      {/* Main Editor + Code Output */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left/Center Canvas & Toolbelt */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          {/* Templates & Name Row */}
          <div className="tactical-panel flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Base:
                </span>
                {SPRITE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleLoadTemplate(tpl.id)}
                    className="rounded border border-[#223246] bg-[#0e1621] px-2 py-1 font-mono text-[11px] text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={spriteName}
                onChange={(e) => setSpriteName(e.target.value)}
                className="w-full rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400 sm:w-44"
                placeholder="NomeComponente"
                title="Nome do componente React / função Canvas"
              />
            </div>

            {/* Drawing Tools Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1c2a3a] pt-2.5">
              <div className="flex flex-wrap items-center gap-1">
                {TOOLS.map((t) => {
                  const Icon = t.icon;
                  const active = tool === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTool(t.id)}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 font-mono text-[11px] transition ${
                        active
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-[#213144] bg-[#0d141e] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {(tool === 'rect' || tool === 'circle') && (
                  <button
                    type="button"
                    onClick={() => setFillShapes((f) => !f)}
                    className={`rounded border px-2 py-1.5 font-mono text-[11px] ${
                      fillShapes
                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                        : 'border-[#213144] bg-[#0d141e] text-slate-400'
                    }`}
                  >
                    {fillShapes ? 'Sólido' : 'Borda'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setMirrorX((m) => !m)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 font-mono text-[11px] ${
                    mirrorX
                      ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200'
                      : 'border-[#213144] bg-[#0d141e] text-slate-400'
                  }`}
                  title="Espelhar Horizontal (Simetria X)"
                >
                  <FlipHorizontal2 className="h-3.5 w-3.5" />
                  <span>X</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMirrorY((m) => !m)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 font-mono text-[11px] ${
                    mirrorY
                      ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200'
                      : 'border-[#213144] bg-[#0d141e] text-slate-400'
                  }`}
                  title="Espelhar Vertical (Simetria Y)"
                >
                  <FlipVertical2 className="h-3.5 w-3.5" />
                  <span>Y</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGridLines((s) => !s)}
                  className={`rounded border p-1.5 ${
                    showGridLines
                      ? 'border-slate-500 bg-[#172333] text-slate-200'
                      : 'border-[#213144] bg-[#0d141e] text-slate-500'
                  }`}
                  title="Mostrar/ocultar grade"
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="rounded border border-[#213144] bg-[#0d141e] p-1.5 text-slate-300 hover:bg-[#172333] disabled:opacity-35"
                  title="Desfazer"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="rounded border border-[#213144] bg-[#0d141e] p-1.5 text-slate-300 hover:bg-[#172333] disabled:opacity-35"
                  title="Refazer"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pushHistory(grid);
                    setGrid(createEmptyGrid(gridSize));
                  }}
                  className="rounded border border-rose-500/35 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20"
                  title="Limpar grade"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Pixel Canvas + Side Palette/Previews */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            {/* Drawing Board */}
            <div className="tactical-panel flex flex-col items-center justify-center p-3 sm:col-span-8">
              <div
                ref={boardRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={() => setHoverCell(null)}
                style={{
                  touchAction: 'none',
                  gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                }}
                className="bg-checkerboard relative grid aspect-square w-full max-w-[380px] cursor-crosshair select-none overflow-hidden rounded border border-[#2a3f57]"
              >
                {grid.map((row, y) =>
                  row.map((cellColor, x) => {
                    const isHover = hoverCell && hoverCell[0] === x && hoverCell[1] === y;
                    return (
                      <div
                        key={`${x}-${y}`}
                        style={{ backgroundColor: cellColor ?? 'transparent' }}
                        className={`${
                          showGridLines ? 'border-r border-b border-white/[0.045]' : ''
                        } ${isHover ? 'ring-1 ring-inset ring-cyan-300' : ''}`}
                      />
                    );
                  })
                )}

                {/* Symmetry center guide lines */}
                {mirrorX && (
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-cyan-400/40" />
                )}
                {mirrorY && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-cyan-400/40" />
                )}
              </div>

              <div className="mt-2 flex w-full max-w-[380px] items-center justify-between font-mono text-[10.5px] text-slate-400">
                <span>
                  POS:{' '}
                  <strong className="text-cyan-300">
                    {hoverCell ? `${hoverCell[0]},${hoverCell[1]}` : '--,--'}
                  </strong>
                </span>
                <span>
                  PIXELS: <strong className="text-slate-200">{filledPixels}</strong> · RECTS:{' '}
                  <strong className="text-amber-300">{mergedRectCount}</strong>
                </span>
              </div>
            </div>

            {/* Palettes + Live Scale Previews */}
            <div className="flex flex-col gap-3 sm:col-span-4">
              <div className="tactical-panel flex flex-col gap-2.5 p-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Paleta Tática / Neon
                </span>

                <select
                  value={paletteId}
                  onChange={(e) => {
                    const next = TACTICAL_PALETTES.find((p) => p.id === e.target.value);
                    setPaletteId(e.target.value);
                    if (next) setActiveColor(next.colors[0]);
                  }}
                  className="w-full rounded border border-[#24364b] bg-[#080d14] px-2 py-1.5 font-mono text-xs text-slate-200 outline-none"
                >
                  {TACTICAL_PALETTES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-4 gap-1.5">
                  {activePalette.colors.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => {
                        setActiveColor(hex);
                        if (tool === 'eraser') setTool('pencil');
                      }}
                      style={{ backgroundColor: hex }}
                      className={`h-8 rounded border transition ${
                        activeColor.toLowerCase() === hex.toLowerCase()
                          ? 'scale-105 border-white ring-2 ring-cyan-400'
                          : 'border-white/15 hover:scale-105'
                      }`}
                      title={hex}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2 border-t border-[#1c2a3a] pt-2">
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => {
                      setActiveColor(e.target.value);
                      if (tool === 'eraser') setTool('pencil');
                    }}
                    className="h-8 w-10 cursor-pointer rounded border border-[#2a3e56] bg-transparent"
                  />
                  <div className="flex-1 font-mono text-[11px]">
                    <div className="text-slate-400">Cor Ativa</div>
                    <div className="font-bold uppercase text-cyan-200">{activeColor}</div>
                  </div>
                </div>
              </div>

              {/* Multi-scale live sprite preview */}
              <div className="tactical-panel flex flex-col gap-2 p-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Preview Vetorial Real
                </span>
                <div className="bg-checkerboard flex items-end justify-around rounded border border-[#1f2f42] p-3">
                  {[24, 48, 72].map((px) => (
                    <div key={px} className="flex flex-col items-center gap-1">
                      <div
                        style={{ width: px, height: px }}
                        dangerouslySetInnerHTML={{ __html: svgMarkup }}
                      />
                      <span className="font-mono text-[9px] text-slate-400">{px}px</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Code Export Panel (React TSX / Canvas 2D / SVG) */}
        <div className="flex flex-col gap-2.5 lg:col-span-5">
          <div className="grid grid-cols-3 gap-1.5 rounded border border-[#1f2e40] bg-[#0b1018] p-1">
            {(
              [
                { id: 'tsx', label: 'React TSX' },
                { id: 'canvas', label: 'Canvas 2D' },
                { id: 'svg', label: 'SVG Puro' },
              ] as Array<{ id: ExportTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setExportTab(tab.id)}
                className={`rounded py-1.5 font-mono text-xs font-semibold transition ${
                  exportTab === tab.id
                    ? 'bg-cyan-400/20 text-cyan-200 ring-1 ring-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <CodeOutputPanel
            title={
              exportTab === 'tsx'
                ? `${spriteName || 'ArenaSprite'}.tsx`
                : exportTab === 'canvas'
                  ? `draw${spriteName || 'ArenaSprite'}.ts`
                  : `${spriteName || 'sprite'}.svg`
            }
            subtitle={`Otimizado por merge horizontal (${mergedRectCount} retângulos · ${gridSize}×${gridSize})`}
            code={currentCode}
            filename={currentFilename}
            copyLabel={
              exportTab === 'tsx'
                ? 'Copiar TSX'
                : exportTab === 'canvas'
                  ? 'Copiar Canvas 2D'
                  : 'Copiar SVG'
            }
            maxHeightClass="max-h-[450px] lg:max-h-[520px]"
            onNotify={onNotify}
            onSendToBridge={onSendToBridge}
            onSaveToVault={(title, code) => onSaveToVault(`Sprite: ${title}`, code)}
            bridgeKind="code"
          />
        </div>
      </div>
    </div>
  );
}
