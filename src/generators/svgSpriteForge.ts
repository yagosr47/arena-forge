export type GridSize = 16 | 32;
export type PixelGrid = (string | null)[][];
export type SpriteTool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'circle' | 'eyedropper';

export interface TacticalPalette {
  id: string;
  name: string;
  colors: string[];
}

export interface MergedRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface SpriteTemplate {
  id: string;
  name: string;
  size: GridSize;
  grid: PixelGrid;
}

export const TACTICAL_PALETTES: TacticalPalette[] = [
  {
    id: 'neon-tactical',
    name: 'Tático Neon',
    colors: [
      '#22d3ee',
      '#0284c7',
      '#f59e0b',
      '#10b981',
      '#f43f5e',
      '#e2e8f0',
      '#64748b',
      '#0f172a',
    ],
  },
  {
    id: 'phosphor',
    name: 'Fósforo Terminal',
    colors: [
      '#34d399',
      '#10b981',
      '#059669',
      '#a3e635',
      '#fbbf24',
      '#ecfdf5',
      '#1e293b',
      '#052e16',
    ],
  },
  {
    id: 'cyber-synth',
    name: 'Cyber Synth',
    colors: [
      '#ec4899',
      '#a855f7',
      '#06b6d4',
      '#facc15',
      '#fb7185',
      '#e0f2fe',
      '#312e81',
      '#090517',
    ],
  },
  {
    id: 'mech-industrial',
    name: 'Mech Industrial',
    colors: [
      '#f97316',
      '#eab308',
      '#38bdf8',
      '#ef4444',
      '#cbd5e1',
      '#64748b',
      '#334155',
      '#0f172a',
    ],
  },
];

export function createEmptyGrid(size: GridSize): PixelGrid {
  return Array.from({ length: size }, () => Array<string | null>(size).fill(null));
}

export function cloneGrid(grid: PixelGrid): PixelGrid {
  return grid.map((row) => [...row]);
}

/** Resize between 16x16 and 32x32 cleanly (nearest-neighbor scale up or center-sample down). */
export function resizeGrid(grid: PixelGrid, targetSize: GridSize): PixelGrid {
  const srcSize = grid.length;
  if (srcSize === targetSize) return cloneGrid(grid);
  const next = createEmptyGrid(targetSize);
  const ratio = srcSize / targetSize;
  for (let y = 0; y < targetSize; y++) {
    const sy = Math.min(srcSize - 1, Math.floor(y * ratio));
    for (let x = 0; x < targetSize; x++) {
      const sx = Math.min(srcSize - 1, Math.floor(x * ratio));
      next[y][x] = grid[sy][sx];
    }
  }
  return next;
}

export function setPixelWithSymmetry(
  grid: PixelGrid,
  x: number,
  y: number,
  color: string | null,
  mirrorX = false,
  mirrorY = false
): PixelGrid {
  const size = grid.length;
  const next = cloneGrid(grid);
  const apply = (px: number, py: number) => {
    if (px >= 0 && px < size && py >= 0 && py < size) {
      next[py][px] = color;
    }
  };
  apply(x, y);
  if (mirrorX) apply(size - 1 - x, y);
  if (mirrorY) apply(x, size - 1 - y);
  if (mirrorX && mirrorY) apply(size - 1 - x, size - 1 - y);
  return next;
}

export function floodFillGrid(
  grid: PixelGrid,
  startX: number,
  startY: number,
  fillColor: string | null
): PixelGrid {
  const size = grid.length;
  if (startX < 0 || startX >= size || startY < 0 || startY >= size) return grid;
  const targetColor = grid[startY][startX];
  if (targetColor === fillColor) return grid;

  const next = cloneGrid(grid);
  const stack: Array<[number, number]> = [[startX, startY]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cx >= size || cy < 0 || cy >= size) continue;
    if (next[cy][cx] !== targetColor) continue;
    next[cy][cx] = fillColor;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return next;
}

export function computeLinePoints(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    pts.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return pts;
}

export function computeRectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean
): Array<[number, number]> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const pts: Array<[number, number]> = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) {
        pts.push([x, y]);
      }
    }
  }
  return pts;
}

export function computeCirclePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean
): Array<[number, number]> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(0.5, (maxX - minX) / 2 + 0.25);
  const ry = Math.max(0.5, (maxY - minY) / 2 + 0.25);
  const pts: Array<[number, number]> = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const norm = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
      if (filled) {
        if (norm <= 1.05) pts.push([x, y]);
      } else {
        const innerRx = Math.max(0.1, rx - 1.15);
        const innerRy = Math.max(0.1, ry - 1.15);
        const innerNorm =
          ((x - cx) * (x - cx)) / (innerRx * innerRx) + ((y - cy) * (y - cy)) / (innerRy * innerRy);
        if (norm <= 1.08 && innerNorm >= 0.85) {
          pts.push([x, y]);
        }
      }
    }
  }
  return pts;
}

export function applyShapePoints(
  grid: PixelGrid,
  points: Array<[number, number]>,
  color: string | null,
  mirrorX = false,
  mirrorY = false
): PixelGrid {
  const size = grid.length;
  const next = cloneGrid(grid);
  const plot = (px: number, py: number) => {
    if (px >= 0 && px < size && py >= 0 && py < size) {
      next[py][px] = color;
    }
  };
  for (const [x, y] of points) {
    plot(x, y);
    if (mirrorX) plot(size - 1 - x, y);
    if (mirrorY) plot(x, size - 1 - y);
    if (mirrorX && mirrorY) plot(size - 1 - x, size - 1 - y);
  }
  return next;
}

/** Merge contiguous horizontal pixels of the same color into compact rectangles. */
export function mergeGridToRects(grid: PixelGrid): MergedRect[] {
  const rects: MergedRect[] = [];
  const size = grid.length;
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      const color = grid[y][x];
      if (!color) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < size && grid[y][x + w] === color) {
        w++;
      }
      rects.push({ x, y, w, h: 1, color });
      x += w;
    }
  }
  return rects;
}

export function countFilledPixels(grid: PixelGrid): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell) count++;
    }
  }
  return count;
}

export function sanitizeIdentifier(raw: string, fallback: string, pascalCase = true): string {
  const words = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return fallback;
  const built = words
    .map((w, idx) =>
      idx === 0 && !pascalCase
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join('');
  return /^[0-9]/.test(built) ? `${fallback}${built}` : built;
}

/** Generate optimized standalone SVG markup. */
export function exportSpriteToSvg(grid: PixelGrid): string {
  const size = grid.length;
  const rects = mergeGridToRects(grid);
  const body = rects
    .map((r) => `  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.color}" />`)
    .join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    body,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Generate clean, typed React TSX component. */
export function exportSpriteToReactTsx(grid: PixelGrid, spriteName = 'ArenaSprite'): string {
  const size = grid.length;
  const compName = sanitizeIdentifier(spriteName, 'ArenaSprite', true);
  const rects = mergeGridToRects(grid);
  const rectLines = rects
    .map(
      (r) => `      <rect x={${r.x}} y={${r.y}} width={${r.w}} height={${r.h}} fill="${r.color}" />`
    )
    .join('\n');

  return [
    `// Gerado por ARENA//FORGE — Sprite Vetorial ${size}x${size}`,
    `import type { SVGProps } from 'react';`,
    ``,
    `export interface ${compName}Props extends SVGProps<SVGSVGElement> {`,
    `  size?: number | string;`,
    `}`,
    ``,
    `export function ${compName}({ size = ${size * 4}, className = '', ...props }: ${compName}Props) {`,
    `  return (`,
    `    <svg`,
    `      xmlns="http://www.w3.org/2000/svg"`,
    `      viewBox="0 0 ${size} ${size}"`,
    `      width={size}`,
    `      height={size}`,
    `      shapeRendering="crispEdges"`,
    `      className={className}`,
    `      {...props}`,
    `    >`,
    rectLines || `      {/* Sprite vazio */}`,
    `    </svg>`,
    `  );`,
    `}`,
  ].join('\n');
}

/** Generate pure Canvas 2D TypeScript drawing code with palette index compression. */
export function exportSpriteToCanvas2D(grid: PixelGrid, spriteName = 'ArenaSprite'): string {
  const size = grid.length;
  const fnName = `draw${sanitizeIdentifier(spriteName, 'ArenaSprite', true)}`;
  const rects = mergeGridToRects(grid);
  const palette: string[] = [];
  const paletteMap = new Map<string, number>();

  const encoded = rects.map((r) => {
    let idx = paletteMap.get(r.color);
    if (idx === undefined) {
      idx = palette.length;
      palette.push(r.color);
      paletteMap.set(r.color, idx);
    }
    return [r.x, r.y, r.w, r.h, idx];
  });

  return [
    `// Gerado por ARENA//FORGE — Canvas 2D Pure Code (${size}x${size})`,
    `const PALETTE = ${JSON.stringify(palette)} as const;`,
    `// [x, y, width, height, paletteIndex]`,
    `const RECTS: ReadonlyArray<readonly [number, number, number, number, number]> = [`,
    ...encoded.map((row) => `  [${row.join(', ')}],`),
    `];`,
    ``,
    `export function ${fnName}(`,
    `  ctx: CanvasRenderingContext2D,`,
    `  originX = 0,`,
    `  originY = 0,`,
    `  pixelSize = 4`,
    `): void {`,
    `  ctx.save();`,
    `  for (let i = 0; i < RECTS.length; i++) {`,
    `    const [x, y, w, h, cIdx] = RECTS[i];`,
    `    ctx.fillStyle = PALETTE[cIdx];`,
    `    ctx.fillRect(`,
    `      originX + x * pixelSize,`,
    `      originY + y * pixelSize,`,
    `      w * pixelSize,`,
    `      h * pixelSize`,
    `    );`,
    `  }`,
    `  ctx.restore();`,
    `}`,
  ].join('\n');
}

/** Render crisp pixel art onto an offscreen canvas and export PNG Blob. */
export async function exportSpriteToPngBlob(grid: PixelGrid, scale = 16): Promise<Blob> {
  const size = grid.length;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D não disponível.');
  ctx.imageSmoothingEnabled = false;

  const rects = mergeGridToRects(grid);
  for (const r of rects) {
    ctx.fillStyle = r.color;
    ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao codificar PNG.'));
    }, 'image/png');
  });
}

function parseAsciiSprite(rows: string[], legend: Record<string, string>): PixelGrid {
  return rows.map((row) =>
    row.split('').map((ch) => (ch in legend ? legend[ch] : null))
  );
}

export const SPRITE_TEMPLATES: SpriteTemplate[] = [
  {
    id: 'interceptor',
    name: 'Nave Interceptor',
    size: 16,
    grid: parseAsciiSprite(
      [
        '.......CC.......',
        '.......CC.......',
        '......CCCC......',
        '......CWWC......',
        '.....CCWWCC.....',
        '.....CBBBBC.....',
        '....CCBBBBCC....',
        '...CC.CCCC.CC...',
        '..CC..CCCC..CC..',
        '.CC..CCBBCC..CC.',
        '.C..CCBBBBCC..C.',
        '.C.CC.CCCC.CC.C.',
        '...C..A..A..C...',
        '......A..A......',
        '......R..R......',
        '................',
      ],
      { C: '#22d3ee', W: '#e2e8f0', B: '#0284c7', A: '#f59e0b', R: '#f43f5e' }
    ),
  },
  {
    id: 'shield',
    name: 'Escudo Tático',
    size: 16,
    grid: parseAsciiSprite(
      [
        '................',
        '....CCCCCCCC....',
        '..CCBBBBBBBBCC..',
        '..CBSSSSSSSSBC..',
        '..CBSCCCCCCSCB..',
        '..CBSCSWWCSCSB..',
        '..CBSCSWWCSCSB..',
        '..CBSCCCCCCSCB..',
        '...CBSSSSSSBC...',
        '...CCBBBBBBCC...',
        '....CCBBBBCC....',
        '.....CCBBCC.....',
        '......CCCC......',
        '.......CC.......',
        '................',
        '................',
      ],
      { C: '#22d3ee', B: '#0284c7', S: '#0f172a', W: '#e2e8f0' }
    ),
  },
  {
    id: 'reticle',
    name: 'Mira Radar',
    size: 16,
    grid: parseAsciiSprite(
      [
        '.......C........',
        '....CC.C.CC.....',
        '...C...C...C....',
        '..C....C....C...',
        '.C..........C...',
        '.C....AAA....C..',
        '.....A...A......',
        'CCCC.A.R.A.CCCC.',
        '.....A...A......',
        '.C....AAA....C..',
        '.C..........C...',
        '..C....C....C...',
        '...C...C...C....',
        '....CC.C.CC.....',
        '.......C........',
        '................',
      ],
      { C: '#10b981', A: '#f59e0b', R: '#f43f5e' }
    ),
  },
  {
    id: 'bolt',
    name: 'Núcleo Raio',
    size: 16,
    grid: parseAsciiSprite(
      [
        '........AAA.....',
        '.......AAWA.....',
        '......AAWAA.....',
        '.....AAWAA......',
        '....AAWAA.......',
        '...AAWAAAAAA....',
        '..AAWWWWWWAA....',
        '..AAAAAAAAA.....',
        '.......AAWA.....',
        '......AAWAA.....',
        '.....AAWAA......',
        '....AAWAA.......',
        '...AAWAA........',
        '...AAAA.........',
        '...AA...........',
        '................',
      ],
      { A: '#f59e0b', W: '#fef3c7' }
    ),
  },
  {
    id: 'heart',
    name: 'Coração HP',
    size: 16,
    grid: parseAsciiSprite(
      [
        '................',
        '................',
        '...RRR....RRR...',
        '..RRRRR..RRRRR..',
        '.RRWWRRRRRRRRRR.',
        '.RRWRRRRRRRRRRR.',
        '.RRRRRRRRRRRRDR.',
        '..RRRRRRRRRRDR..',
        '...RRRRRRRRDR...',
        '....RRRRRRDR....',
        '.....RRRRDR.....',
        '......RRDR......',
        '.......RR.......',
        '................',
        '................',
        '................',
      ],
      { R: '#f43f5e', W: '#fecdd3', D: '#be123c' }
    ),
  },
  {
    id: 'drone',
    name: 'Drone Boss',
    size: 16,
    grid: parseAsciiSprite(
      [
        '................',
        '.....GGGGGG.....',
        '...GGSSSSSSGG...',
        '..GSSCCCCCCSSG..',
        '.GSSCWWSSWWCSSG.',
        '.GSSCRRSSRRCSG..',
        '.GSSSSSSSSSSSSG.',
        '..GGSSAAAASSGG..',
        '...GGSSSSSSGG...',
        '..C..GGGGGG..C..',
        '.CC..G....G..CC.',
        '.C..GG....GG..C.',
        '....G......G....',
        '...AA......AA...',
        '................',
        '................',
      ],
      { G: '#64748b', S: '#1e293b', C: '#22d3ee', W: '#e2e8f0', R: '#f43f5e', A: '#f59e0b' }
    ),
  },
];
