export interface ExtractedSwatch {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  ratio: number; // 0..1 coverage weight
  luminance: number; // 0..1 WCAG relative luminance
  contrastWhite: number;
  contrastBlack: number;
  role: string;
  cssVar: string;
}

export interface UiInspectionResult {
  sourceName: string;
  imageWidth: number;
  imageHeight: number;
  themeMode: 'dark' | 'light';
  contrastProfile: 'alto contraste' | 'contraste equilibrado' | 'baixo contraste';
  saturationProfile: 'neon / alta saturação' | 'saturação equilibrada' | 'tática / sóbria';
  layoutOrientation: 'mobile-vertical' | 'desktop-widescreen' | 'quadrado';
  palette: ExtractedSwatch[];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(lumA: number, lumB: number): number {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function rgbDistSq(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Deterministic k-means++ color quantization over raw RGBA pixels.
 * Preserves high-chroma UI accent colors so neon highlights aren't lost to dark backgrounds.
 */
export function extractDominantPaletteFromPixels(
  rgba: Uint8ClampedArray,
  count = 6
): ExtractedSwatch[] {
  const samples: Array<[number, number, number]> = [];
  const totalPixels = Math.floor(rgba.length / 4);
  const stride = Math.max(1, Math.floor(totalPixels / 3200));

  for (let i = 0; i < totalPixels; i += stride) {
    const off = i * 4;
    const alpha = rgba[off + 3];
    if (alpha < 128) continue;
    samples.push([rgba[off], rgba[off + 1], rgba[off + 2]]);
  }

  if (samples.length === 0) {
    const fallback: Array<[number, number, number]> = [
      [10, 15, 24],
      [20, 30, 46],
      [34, 211, 238],
      [245, 158, 11],
      [148, 163, 184],
      [230, 237, 246],
    ];
    return assignSemanticRoles(
      fallback.map((rgb) => ({ rgb, weight: 1 / fallback.length })),
      'dark'
    );
  }

  // Deterministic k-means++ initialization (farthest-point + chroma bias)
  const k = Math.min(count + 2, samples.length);
  const centroids: Array<[number, number, number]> = [samples[0]];

  while (centroids.length < k) {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let minD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = rgbDistSq(s, centroids[c]);
        if (d < minD) minD = d;
      }
      // Subtle chroma boost so crisp UI accents win a centroid slot
      const chroma = Math.max(s[0], s[1], s[2]) - Math.min(s[0], s[1], s[2]);
      const score = minD * (1 + (chroma / 255) * 0.45);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    centroids.push([...samples[bestIdx]]);
  }

  // Run 10 k-means iterations
  const assignments = new Int32Array(samples.length);
  for (let iter = 0; iter < 10; iter++) {
    const sums = Array.from({ length: centroids.length }, () => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = rgbDistSq(s, centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      assignments[i] = bestC;
      sums[bestC][0] += s[0];
      sums[bestC][1] += s[1];
      sums[bestC][2] += s[2];
      sums[bestC][3] += 1;
    }

    for (let c = 0; c < centroids.length; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3]),
        ];
      }
    }
  }

  // Gather weighted clusters and deduplicate near-identical colors
  const counts = new Array<number>(centroids.length).fill(0);
  for (let i = 0; i < assignments.length; i++) {
    counts[assignments[i]]++;
  }

  const rawClusters = centroids
    .map((rgb, idx) => ({
      rgb,
      weight: counts[idx] / samples.length,
      chroma: Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]),
    }))
    .filter((c) => c.weight > 0.002)
    .sort((a, b) => b.weight + b.chroma / 800 - (a.weight + a.chroma / 800));

  const distinct: Array<{ rgb: [number, number, number]; weight: number }> = [];
  for (const cluster of rawClusters) {
    const tooClose = distinct.some((d) => Math.sqrt(rgbDistSq(d.rgb, cluster.rgb)) < 26);
    if (!tooClose) {
      distinct.push({ rgb: cluster.rgb, weight: cluster.weight });
    }
    if (distinct.length >= count) break;
  }

  // If image had very few colors, fill remaining slots cleanly from next clusters or tint steps
  for (const cluster of rawClusters) {
    if (distinct.length >= count) break;
    if (!distinct.some((d) => rgbToHex(...d.rgb) === rgbToHex(...cluster.rgb))) {
      distinct.push({ rgb: cluster.rgb, weight: cluster.weight });
    }
  }

  while (distinct.length < count) {
    const base = distinct[0]?.rgb ?? [16, 24, 38];
    const step = (distinct.length + 1) * 28;
    const derived: [number, number, number] = [
      Math.min(255, base[0] + step),
      Math.min(255, base[1] + step),
      Math.min(255, base[2] + step),
    ];
    distinct.push({ rgb: derived, weight: 0.02 });
  }

  // Determine overall background polarity from highest-coverage cluster
  const dominant = [...distinct].sort((a, b) => b.weight - a.weight)[0];
  const dominantLum = relativeLuminance(...dominant.rgb);
  const themeMode: 'dark' | 'light' = dominantLum < 0.36 ? 'dark' : 'light';

  return assignSemanticRoles(distinct.slice(0, count), themeMode);
}

function assignSemanticRoles(
  items: Array<{ rgb: [number, number, number]; weight: number }>,
  themeMode: 'dark' | 'light'
): ExtractedSwatch[] {
  const enriched = items.map((item) => {
    const [r, g, b] = item.rgb;
    const hsl = rgbToHsl(r, g, b);
    const lum = relativeLuminance(r, g, b);
    return {
      hex: rgbToHex(r, g, b),
      rgb: item.rgb,
      hsl,
      ratio: Number(item.weight.toFixed(3)),
      luminance: Number(lum.toFixed(3)),
      contrastWhite: contrastRatio(lum, 1),
      contrastBlack: contrastRatio(lum, 0),
      role: '',
      cssVar: '',
    };
  });

  // Sort to assign meaningful UI roles
  const remaining = new Set(enriched.map((_, idx) => idx));
  const pick = (scorer: (idx: number) => number): number | null => {
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const idx of remaining) {
      const score = scorer(idx);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    }
    if (best !== null) remaining.delete(best);
    return best;
  };

  const ordered: ExtractedSwatch[] = [];

  // 1. Background (most dominant + darkest on dark theme or lightest on light theme)
  const bgIdx = pick((i) => {
    const c = enriched[i];
    const lumBias = themeMode === 'dark' ? 1 - c.luminance : c.luminance;
    return c.ratio * 2.2 + lumBias * 1.4 - (c.hsl[1] / 100) * 0.4;
  });
  if (bgIdx !== null) {
    ordered.push({ ...enriched[bgIdx], role: 'Background Base', cssVar: '--ui-bg' });
  }

  // 2. Primary Accent (highest saturation + balanced lightness)
  const accent1Idx = pick((i) => {
    const c = enriched[i];
    const lBalance = 1 - Math.abs(c.hsl[2] - 54) / 60;
    return (c.hsl[1] / 100) * 2.5 + lBalance * 0.8 + c.ratio * 0.3;
  });
  if (accent1Idx !== null) {
    ordered.push({ ...enriched[accent1Idx], role: 'Acento Primário', cssVar: '--ui-accent' });
  }

  // 3. Secondary Accent (next most chromatic / distinct hue)
  const accent2Idx = pick((i) => {
    const c = enriched[i];
    const lBalance = 1 - Math.abs(c.hsl[2] - 54) / 65;
    return (c.hsl[1] / 100) * 2.1 + lBalance * 0.7;
  });
  if (accent2Idx !== null) {
    ordered.push({
      ...enriched[accent2Idx],
      role: 'Acento Secundário',
      cssVar: '--ui-accent-alt',
    });
  }

  // 4. Text / Highlight (highest contrast vs background)
  const textIdx = pick((i) => {
    const c = enriched[i];
    return themeMode === 'dark' ? c.luminance * 2.2 : (1 - c.luminance) * 2.2;
  });
  if (textIdx !== null) {
    ordered.push({ ...enriched[textIdx], role: 'Texto / Destaque', cssVar: '--ui-text' });
  }

  // 5. Surface / Card (close to background luminance)
  const surfIdx = pick((i) => {
    const c = enriched[i];
    const lumBias = themeMode === 'dark' ? 1 - Math.abs(c.luminance - 0.08) : 1 - Math.abs(c.luminance - 0.88);
    return lumBias + c.ratio;
  });
  if (surfIdx !== null) {
    ordered.push({ ...enriched[surfIdx], role: 'Superfície / Painel', cssVar: '--ui-surface' });
  }

  // 6. Remaining slot(s) -> Border / Muted
  for (const idx of remaining) {
    ordered.push({ ...enriched[idx], role: 'Borda / Neutro', cssVar: '--ui-muted' });
  }

  // Present in logical UI token order: Background, Surface, Border, Accent 1, Accent 2, Text
  const roleOrder = [
    '--ui-bg',
    '--ui-surface',
    '--ui-muted',
    '--ui-accent',
    '--ui-accent-alt',
    '--ui-text',
  ];
  return ordered.sort((a, b) => roleOrder.indexOf(a.cssVar) - roleOrder.indexOf(b.cssVar));
}

/** Analyze a loaded HTMLImageElement into a full 6-color UI inspection report. */
export function inspectReferenceImage(
  img: HTMLImageElement,
  sourceName: string
): UiInspectionResult {
  const maxDim = 160;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(8, Math.round((img.naturalWidth || 160) * scale));
  const h = Math.max(8, Math.round((img.naturalHeight || 160) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D indisponível.');
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const palette = extractDominantPaletteFromPixels(imageData.data, 6);

  const bg = palette.find((p) => p.cssVar === '--ui-bg') ?? palette[0];
  const text = palette.find((p) => p.cssVar === '--ui-text') ?? palette[palette.length - 1];
  const themeMode: 'dark' | 'light' = bg.luminance < 0.36 ? 'dark' : 'light';

  const maxContrast = contrastRatio(bg.luminance, text.luminance);
  const contrastProfile: UiInspectionResult['contrastProfile'] =
    maxContrast >= 7 ? 'alto contraste' : maxContrast >= 4.2 ? 'contraste equilibrado' : 'baixo contraste';

  const maxSat = Math.max(...palette.map((p) => p.hsl[1]));
  const saturationProfile: UiInspectionResult['saturationProfile'] =
    maxSat >= 72
      ? 'neon / alta saturação'
      : maxSat >= 38
        ? 'saturação equilibrada'
        : 'tática / sóbria';

  const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  const layoutOrientation: UiInspectionResult['layoutOrientation'] =
    ratio < 0.85 ? 'mobile-vertical' : ratio > 1.25 ? 'desktop-widescreen' : 'quadrado';

  return {
    sourceName,
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
    themeMode,
    contrastProfile,
    saturationProfile,
    layoutOrientation,
    palette,
  };
}

/** Generate copy-ready Markdown technical UI & style specification block for AI prompts. */
export function generateUiSpecMarkdown(
  inspection: UiInspectionResult,
  projectGoal = 'Aplicação Web / Jogo Mobile-First'
): string {
  const rows = inspection.palette
    .map(
      (c) =>
        `| **${c.role}** | \`${c.hex}\` | \`rgb(${c.rgb.join(', ')})\` | \`${c.cssVar}\` | ${c.contrastWhite}:1 / ${c.contrastBlack}:1 |`
    )
    .join('\n');

  const cssVars = inspection.palette.map((c) => `  ${c.cssVar}: ${c.hex};`).join('\n');
  const tailwindTheme = inspection.palette
    .map((c) => `  --color-${c.cssVar.replace('--', '')}: ${c.hex};`)
    .join('\n');

  const bg = inspection.palette[0]?.hex ?? '#06090E';
  const accent = inspection.palette.find((p) => p.cssVar === '--ui-accent')?.hex ?? '#22D3EE';
  const text = inspection.palette.find((p) => p.cssVar === '--ui-text')?.hex ?? '#E6EDF6';

  return [
    `## Especificação Técnica de UI & Direção Visual — ${projectGoal}`,
    ``,
    `> Extraído via **ARENA//FORGE** a partir de \`${inspection.sourceName}\` (${inspection.imageWidth}×${inspection.imageHeight}px)`,
    ``,
    `### 1. Perfil Estético Detectado`,
    `- **Polaridade:** Tema ${inspection.themeMode === 'dark' ? 'Escuro (Dark Mode)' : 'Claro (Light Mode)'}`,
    `- **Contraste:** ${inspection.contrastProfile}`,
    `- **Saturação:** ${inspection.saturationProfile}`,
    `- **Formato de Referência:** \`${inspection.layoutOrientation}\``,
    ``,
    `### 2. Paleta Semântica (6 Cores Predominantes)`,
    `| Papel UI | HEX | RGB | Token CSS | Contraste (Branco / Preto) |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    rows,
    ``,
    `### 3. Tokens CSS / Tailwind v4`,
    '```css',
    `:root {`,
    cssVars,
    `}`,
    ``,
    `@theme {`,
    tailwindTheme,
    `}`,
    '```',
    ``,
    `### 4. Diretrizes de Implementação para Agente de IA`,
    `- Use \`${bg}\` como fundo principal e mantenha superfícies elevadas separadas por bordas finas de \`1px\` sem sombras difusas pesadas.`,
    `- Reserve \`${accent}\` exclusivamente para ações primárias, estados ativos, foco e telemetria crítica.`,
    `- Garanta contraste legível utilizando \`${text}\` para textos principais e tipografia monospace (\`tabular-nums\`) em contadores, coordenadas e métricas.`,
    `- Projete o layout responsivo mobile-first em \`100vw × 100dvh\` com áreas clicáveis mínimas de \`44px\` e zero rolagem horizontal acidental.`,
  ].join('\n');
}

/** Generate a sleek tactical UI reference screenshot on canvas for instant 1-click testing. */
export function generateSampleReferenceDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d')!;

  // Deep obsidian background
  ctx.fillStyle = '#080D16';
  ctx.fillRect(0, 0, 960, 540);

  // Header panel
  ctx.fillStyle = '#111A29';
  ctx.fillRect(24, 24, 912, 64);
  ctx.strokeStyle = '#24364E';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 912, 64);

  // Cyan emblem + title
  ctx.fillStyle = '#22D3EE';
  ctx.fillRect(44, 42, 12, 28);
  ctx.fillStyle = '#E6EDF6';
  ctx.font = 'bold 24px ui-monospace, monospace';
  ctx.fillText('MECH-OPS // TACTICAL HUD v4.2', 72, 64);

  // Amber alert badge
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(760, 40, 152, 32);
  ctx.fillStyle = '#080D16';
  ctx.font = 'bold 14px ui-monospace, monospace';
  ctx.fillText('SECTOR: ACTIVE', 776, 61);

  // Left radar module
  ctx.fillStyle = '#111A29';
  ctx.fillRect(24, 108, 430, 408);
  ctx.strokeStyle = '#24364E';
  ctx.strokeRect(24, 108, 430, 408);

  // Radar rings
  ctx.strokeStyle = '#22D3EE';
  ctx.lineWidth = 2;
  for (const r of [55, 110, 160]) {
    ctx.beginPath();
    ctx.arc(239, 312, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#F43F5E';
  ctx.beginPath();
  ctx.arc(305, 250, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(195, 345, 8, 0, Math.PI * 2);
  ctx.fill();

  // Right telemetry cards
  ctx.fillStyle = '#111A29';
  ctx.fillRect(474, 108, 462, 194);
  ctx.strokeStyle = '#24364E';
  ctx.strokeRect(474, 108, 462, 194);

  ctx.fillStyle = '#E6EDF6';
  ctx.font = 'bold 18px ui-monospace, monospace';
  ctx.fillText('REACTOR OUTPUT', 498, 146);
  ctx.fillStyle = '#22D3EE';
  ctx.fillRect(498, 168, 360, 26);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(498, 214, 240, 26);
  ctx.fillStyle = '#F43F5E';
  ctx.fillRect(498, 260, 140, 22);

  // Bottom action dock
  ctx.fillStyle = '#111A29';
  ctx.fillRect(474, 322, 462, 194);
  ctx.strokeStyle = '#24364E';
  ctx.strokeRect(474, 322, 462, 194);

  ctx.fillStyle = '#22D3EE';
  ctx.fillRect(498, 356, 200, 56);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(712, 356, 200, 56);
  ctx.fillStyle = '#1E2D40';
  ctx.fillRect(498, 428, 414, 58);

  ctx.fillStyle = '#080D16';
  ctx.font = 'bold 16px ui-monospace, monospace';
  ctx.fillText('ENGAGE SHIELD', 526, 390);
  ctx.fillText('LAUNCH DRONE', 748, 390);
  ctx.fillStyle = '#E6EDF6';
  ctx.fillText('TELEMETRY LINK: 12ms · 60 FPS', 536, 463);

  return canvas.toDataURL('image/png');
}
