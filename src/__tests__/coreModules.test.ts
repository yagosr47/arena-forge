import { describe, expect, it } from 'vitest';
import {
  SFX_PRESETS,
  computeWaveformPreview,
  encodePcmToWavBuffer,
  generateSfxTypeScriptCode,
} from '../generators/sfxSynthesizer';
import {
  SPRITE_TEMPLATES,
  computeCirclePoints,
  computeLinePoints,
  createEmptyGrid,
  exportSpriteToCanvas2D,
  exportSpriteToReactTsx,
  exportSpriteToSvg,
  floodFillGrid,
  mergeGridToRects,
  resizeGrid,
  setPixelWithSymmetry,
} from '../generators/svgSpriteForge';
import {
  computeGridDimensions,
  formatBytes,
  formatTimestamp,
} from '../vision/videoStoryboarder';
import {
  extractDominantPaletteFromPixels,
  generateUiSpecMarkdown,
  type UiInspectionResult,
} from '../vision/paletteAndPromptExtractor';
import {
  DEMO_REPO_FILES,
  buildDirectoryTree,
  buildRepoContextMarkdown,
  extractSignaturesFromSource,
  shouldIgnorePath,
} from '../repo/contextBuilder';
import {
  DEFAULT_SNIPPETS,
  exportArenaForgeBackupJson,
  importArenaForgeBackupJson,
} from '../repo/snippetVault';
import {
  decodeScannedQrContent,
  decodeSignalEnvelope,
  encodeDirectQrPayload,
  encodeSignalEnvelope,
  generateQrCodeDataUrl,
} from '../transfer/qrBridge';

describe('MOD-01A: sfxSynthesizer', () => {
  it('provides all 6 tactical presets and generates valid standalone playSfx() TS code', () => {
    expect(SFX_PRESETS).toHaveLength(6);
    const names = SFX_PRESETS.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Laser',
        'Explosão',
        'Moeda',
        'Alerta de Radar',
        'Clique UI',
        'Motor/Zumbido',
      ])
    );

    const code = generateSfxTypeScriptCode(SFX_PRESETS[1]); // Explosão (with white noise)
    expect(code).toContain('export function playSfx(');
    expect(code).toContain("osc.type = 'sawtooth'");
    expect(code).toContain('ctx.createBuffer(1, noiseLen, ctx.sampleRate)');
  });

  it('encodes valid RIFF/WAVE 16-bit PCM buffers and computes bounded preview samples', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const wav = encodePcmToWavBuffer(samples, 44100);
    expect(wav.byteLength).toBe(44 + samples.length * 2);
    const header = new TextDecoder().decode(new Uint8Array(wav, 0, 12));
    expect(header).toBe('RIFF\x2e\x00\x00\x00WAVE');

    const preview = computeWaveformPreview(SFX_PRESETS[0], 128);
    expect(preview).toHaveLength(128);
    expect(preview.every((v) => v >= -1 && v <= 1)).toBe(true);
  });
});

describe('MOD-01B: svgSpriteForge', () => {
  it('supports 16x16 & 32x32 grids, mirror symmetry, flood fill, geometry, and code exports', () => {
    let grid = createEmptyGrid(16);
    grid = setPixelWithSymmetry(grid, 2, 3, '#22d3ee', true, false);
    expect(grid[3][2]).toBe('#22d3ee');
    expect(grid[3][13]).toBe('#22d3ee');

    const line = computeLinePoints(0, 0, 4, 4);
    expect(line).toHaveLength(5);

    const circle = computeCirclePoints(2, 2, 10, 10, true);
    expect(circle.length).toBeGreaterThan(20);

    const filled = floodFillGrid(createEmptyGrid(16), 0, 0, '#f59e0b');
    expect(filled[15][15]).toBe('#f59e0b');

    const upscaled = resizeGrid(SPRITE_TEMPLATES[0].grid, 32);
    expect(upscaled).toHaveLength(32);
    expect(upscaled[0]).toHaveLength(32);

    const rects = mergeGridToRects(SPRITE_TEMPLATES[0].grid);
    expect(rects.length).toBeGreaterThan(0);

    const svg = exportSpriteToSvg(SPRITE_TEMPLATES[0].grid);
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain('shape-rendering="crispEdges"');

    const tsx = exportSpriteToReactTsx(SPRITE_TEMPLATES[0].grid, 'NaveInterceptor');
    expect(tsx).toContain('export function NaveInterceptor(');

    const canvasCode = exportSpriteToCanvas2D(SPRITE_TEMPLATES[0].grid, 'NaveInterceptor');
    expect(canvasCode).toContain('export function drawNaveInterceptor(');
    expect(canvasCode).toContain('ctx.fillRect(');
  });
});

describe('MOD-02A: videoStoryboarder helpers', () => {
  it('computes 2x2 and 3x3 layouts and formats timestamps/sizes cleanly', () => {
    expect(computeGridDimensions(4, '2x2')).toEqual({ cols: 2, rows: 2 });
    expect(computeGridDimensions(9, '3x3')).toEqual({ cols: 3, rows: 3 });
    expect(computeGridDimensions(6, 'auto')).toEqual({ cols: 3, rows: 2 });
    expect(formatTimestamp(65.43)).toBe('01:05.43');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});

describe('MOD-02B: paletteAndPromptExtractor', () => {
  it('extracts 6 predominant HEX colors including vibrant accents and builds Markdown UI spec', () => {
    // Synthetic 20x20 RGBA image with dark background, cyan accent, amber highlight, light text
    const pixels = new Uint8ClampedArray(20 * 20 * 4);
    const colors: Array<[number, number, number]> = [
      [8, 13, 22], // dark bg (majority)
      [18, 28, 42], // surface
      [34, 211, 238], // cyan accent
      [245, 158, 11], // amber accent
      [230, 237, 246], // light text
      [100, 116, 139], // muted
    ];
    for (let i = 0; i < 400; i++) {
      const c = i < 200 ? colors[0] : colors[1 + (i % 5)];
      pixels[i * 4] = c[0];
      pixels[i * 4 + 1] = c[1];
      pixels[i * 4 + 2] = c[2];
      pixels[i * 4 + 3] = 255;
    }

    const palette = extractDominantPaletteFromPixels(pixels, 6);
    expect(palette).toHaveLength(6);
    expect(palette.every((s) => /^#[0-9A-F]{6}$/.test(s.hex))).toBe(true);

    const inspection: UiInspectionResult = {
      sourceName: 'hud-ref.png',
      imageWidth: 1280,
      imageHeight: 720,
      themeMode: 'dark',
      contrastProfile: 'alto contraste',
      saturationProfile: 'neon / alta saturação',
      layoutOrientation: 'desktop-widescreen',
      palette,
    };
    const md = generateUiSpecMarkdown(inspection, 'Orbital HUD');
    expect(md).toContain('Especificação Técnica de UI');
    expect(md).toContain(':root {');
    expect(md).toContain('@theme {');
    expect(md).toContain(palette[0].hex);
  });
});

describe('MOD-03: contextBuilder & snippetVault', () => {
  it('ignores node_modules/.git, renders folder tree, and extracts interface/type/export function', () => {
    expect(shouldIgnorePath('app/node_modules/react/index.js')).toBe(true);
    expect(shouldIgnorePath('.git/HEAD')).toBe(true);
    expect(shouldIgnorePath('src/engine/physics.ts')).toBe(false);

    const tree = buildDirectoryTree(['src/index.ts', 'src/engine/physics.ts', 'package.json'], 'demo');
    expect(tree).toContain('demo/');
    expect(tree).toContain('├── src/');
    expect(tree).toContain('physics.ts');

    const syms = extractSignaturesFromSource(DEMO_REPO_FILES[1].content + '\n' + DEMO_REPO_FILES[2].content);
    const names = syms.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(['EntityFaction', 'Vec2', 'CombatEntity', 'integrateMotion', 'checkCircleCollision'])
    );

    const ctxRes = buildRepoContextMarkdown(DEMO_REPO_FILES, 'orbital-raider-pwa', 120, {
      ignoreDirs: ['node_modules', '.git'],
      includePackageJson: true,
      includeTypesAndInterfaces: true,
      includeFunctions: true,
      includeClassesAndEnums: true,
      maxInterfaceLines: 14,
    });
    expect(ctxRes.markdown).toContain('## Árvore de Pastas');
    expect(ctxRes.markdown).toContain('export function integrateMotion');
    expect(ctxRes.totalSymbols).toBeGreaterThanOrEqual(7);
  });

  it('ships required pre-seeded vault modules and round-trips JSON migration backup', async () => {
    const titles = DEFAULT_SNIPPETS.map((s) => s.title).join(' | ');
    expect(titles).toContain('vite-plugin-pwa');
    expect(titles).toContain('PointerEvent');
    expect(titles).toContain('WebBluetooth');
    expect(titles).toContain('100dvh');

    const backup = await exportArenaForgeBackupJson();
    expect(backup).toContain('arena-forge-backup-v1');
    const imported = await importArenaForgeBackupJson(backup, 'merge');
    expect(imported.importedSnippets).toBeGreaterThanOrEqual(6);
  });
});

describe('MOD-04: qrBridge codec & offline QR generator', () => {
  it('round-trips compressed WebRTC signaling tokens, direct QR payloads, and generates QR data URLs', async () => {
    const sampleSdp = 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
    const encodedSig = await encodeSignalEnvelope({ t: 'offer', sdp: sampleSdp });
    expect(encodedSig.startsWith('SIG:')).toBe(true);
    const decodedSig = await decodeSignalEnvelope(encodedSig);
    expect(decodedSig.t).toBe('offer');
    expect(decodedSig.sdp).toContain('v=0');

    const encodedPay = await encodeDirectQrPayload({
      kind: 'code',
      title: 'playSfx.ts',
      text: 'export function playSfx() {}',
    });
    const scanned = await decodeScannedQrContent(encodedPay);
    expect(scanned.mode).toBe('payload');
    if (scanned.mode === 'payload') {
      expect(scanned.payload.title).toBe('playSfx.ts');
      expect(scanned.payload.text).toBe('export function playSfx() {}');
    }

    const qrDataUrl = await generateQrCodeDataUrl(encodedPay, 200);
    expect(qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
