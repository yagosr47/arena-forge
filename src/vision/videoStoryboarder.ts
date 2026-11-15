export type StoryboardGridPreset = '2x2' | '3x3' | 'auto';
export type StoryboardFormat = 'image/webp' | 'image/jpeg';

export interface StoryboardFrame {
  id: string;
  timestamp: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface StoryboardComposeOptions {
  layout: StoryboardGridPreset;
  maxWidth: number;
  format: StoryboardFormat;
  quality: number; // 0.35 - 0.95
  showHeader: boolean;
  showTimestamps: boolean;
  sourceLabel: string;
}

export interface StoryboardResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
  cols: number;
  rows: number;
  frameCount: number;
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds - Math.floor(seconds)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function computeGridDimensions(
  frameCount: number,
  layout: StoryboardGridPreset
): { cols: number; rows: number } {
  const safeCount = Math.max(1, Math.min(9, frameCount));
  if (layout === '2x2') return { cols: 2, rows: 2 };
  if (layout === '3x3') return { cols: 3, rows: 3 };
  if (safeCount <= 4) return { cols: 2, rows: 2 };
  if (safeCount <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

/** Seek a video element safely to an exact timestamp and wait until decoded. */
export function seekVideoElement(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = Number.isFinite(video.duration) ? video.duration : targetTime;
    const clamped = Math.max(0, Math.min(Math.max(0, duration - 0.02), targetTime));

    if (Math.abs(video.currentTime - clamped) < 0.015 && video.readyState >= 2) {
      resolve();
      return;
    }

    let settled = false;
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      window.clearTimeout(timer);
    };

    const onSeeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Erro ao posicionar quadro no vídeo.'));
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, 3500);

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = clamped;
  });
}

/** Capture the currently visible frame of an HTMLVideoElement. */
export function captureFrameFromVideo(
  video: HTMLVideoElement,
  maxThumbWidth = 720
): StoryboardFrame {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 360;
  const scale = Math.min(1, maxThumbWidth / vw);
  const w = Math.max(16, Math.round(vw * scale));
  const h = Math.max(16, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto Canvas 2D indisponível.');
  ctx.drawImage(video, 0, 0, w, h);

  return {
    id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: video.currentTime,
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    width: w,
    height: h,
  };
}

/** Extract N evenly distributed keyframes (4..9) automatically from a loaded video. */
export async function extractKeyframesAutomatically(
  video: HTMLVideoElement,
  count: number,
  rangeStart = 0,
  rangeEnd?: number,
  onProgress?: (current: number, total: number) => void
): Promise<StoryboardFrame[]> {
  const clampedCount = Math.max(4, Math.min(9, Math.round(count)));
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
  const start = Math.max(0, Math.min(rangeStart, duration));
  const end = Math.max(start + 0.05, Math.min(rangeEnd ?? duration, duration));
  const span = Math.max(0.05, end - start);

  const wasPlaying = !video.paused;
  if (wasPlaying) video.pause();

  const frames: StoryboardFrame[] = [];
  for (let i = 0; i < clampedCount; i++) {
    // Slightly inset endpoints so first/last frame aren't pure black fades
    const ratio = clampedCount === 1 ? 0.5 : (i + 0.35) / (clampedCount - 0.3);
    const t = Math.min(end - 0.02, start + span * Math.min(0.98, Math.max(0.02, ratio)));
    await seekVideoElement(video, t);
    frames.push(captureFrameFromVideo(video));
    onProgress?.(i + 1, clampedCount);
  }
  return frames;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao decodificar quadro do storyboard.'));
    img.src = src;
  });
}

/** Compose numbered Storyboard grid canvas and compress to lightweight WebP or JPEG. */
export async function composeStoryboardImage(
  frames: StoryboardFrame[],
  options: StoryboardComposeOptions
): Promise<StoryboardResult> {
  if (frames.length === 0) {
    throw new Error('Nenhum quadro selecionado para montar o storyboard.');
  }

  const { cols, rows } = computeGridDimensions(frames.length, options.layout);
  const maxSlots = cols * rows;
  const usedFrames = frames.slice(0, maxSlots);

  const loadedImages = await Promise.all(usedFrames.map((f) => loadImage(f.dataUrl)));
  const refW = usedFrames[0].width || 640;
  const refH = usedFrames[0].height || 360;
  const aspect = refH / refW;

  const padding = 14;
  const gap = 10;
  const headerHeight = options.showHeader ? 40 : 0;

  const targetWidth = Math.max(480, Math.min(2048, options.maxWidth));
  const cellWidth = Math.floor((targetWidth - padding * 2 - gap * (cols - 1)) / cols);
  const cellHeight = Math.max(90, Math.round(cellWidth * aspect));
  const canvasWidth = padding * 2 + cols * cellWidth + (cols - 1) * gap;
  const canvasHeight = headerHeight + padding * 2 + rows * cellHeight + (rows - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto Canvas 2D indisponível.');

  // Tactical background
  ctx.fillStyle = '#070b11';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Subtle outer frame
  ctx.strokeStyle = '#1e2e42';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvasWidth - 2, canvasHeight - 2);

  // Header strip
  if (options.showHeader) {
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(2, 2, canvasWidth - 4, headerHeight - 2);
    ctx.strokeStyle = '#1f3045';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, headerHeight);
    ctx.lineTo(canvasWidth - 2, headerHeight);
    ctx.stroke();

    // Cyan accent bar
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(padding, 12, 4, 16);

    ctx.fillStyle = '#e6edf6';
    ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    const title = `ARENA//FORGE STORYBOARD [${cols}x${rows}] — ${options.sourceLabel.slice(0, 38)}`;
    ctx.fillText(title, padding + 12, headerHeight / 2 + 1);

    const meta = `${usedFrames.length} QUADROS · ${canvasWidth}×${canvasHeight}px`;
    ctx.fillStyle = '#8fa3ba';
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    const metaW = ctx.measureText(meta).width;
    if (canvasWidth - metaW - padding > 320) {
      ctx.fillText(meta, canvasWidth - padding - metaW, headerHeight / 2 + 1);
    }
  }

  // Draw each grid cell
  for (let idx = 0; idx < maxSlots; idx++) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = padding + col * (cellWidth + gap);
    const y = headerHeight + padding + row * (cellHeight + gap);

    ctx.fillStyle = '#0d141e';
    ctx.fillRect(x, y, cellWidth, cellHeight);

    const frame = usedFrames[idx];
    const img = loadedImages[idx];

    if (frame && img) {
      // Aspect-fit / cover cleanly
      const imgAspect = img.width / img.height;
      const cellAspect = cellWidth / cellHeight;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;

      if (imgAspect > cellAspect) {
        sw = img.height * cellAspect;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / cellAspect;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, x, y, cellWidth, cellHeight);

      // Frame border
      ctx.strokeStyle = '#253a52';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);

      // Frame index badge (#01)
      const badgeLabel = `#${String(idx + 1).padStart(2, '0')}`;
      ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace';
      const badgeW = ctx.measureText(badgeLabel).width + 14;
      ctx.fillStyle = 'rgba(6, 9, 14, 0.86)';
      ctx.fillRect(x + 6, y + 6, badgeW, 22);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 6.5, y + 6.5, badgeW - 1, 21);
      ctx.fillStyle = '#22d3ee';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeLabel, x + 13, y + 17);

      // Timestamp pill
      if (options.showTimestamps) {
        const tsText = formatTimestamp(frame.timestamp);
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        const tsW = ctx.measureText(tsText).width + 12;
        const tsX = x + cellWidth - tsW - 6;
        const tsY = y + cellHeight - 26;
        ctx.fillStyle = 'rgba(6, 9, 14, 0.84)';
        ctx.fillRect(tsX, tsY, tsW, 20);
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(tsText, tsX + 6, tsY + 10.5);
      }
    } else {
      // Empty slot placeholder
      ctx.strokeStyle = '#1b2838';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = '#475b70';
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'middle';
      const emptyLabel = `SLOT #${String(idx + 1).padStart(2, '0')} VAZIO`;
      const tw = ctx.measureText(emptyLabel).width;
      ctx.fillText(emptyLabel, x + (cellWidth - tw) / 2, y + cellHeight / 2);
    }
  }

  // Export compressed Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Falha ao comprimir storyboard.'));
      },
      options.format,
      Math.max(0.3, Math.min(0.98, options.quality))
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Falha ao ler storyboard gerado.'));
    reader.readAsDataURL(blob);
  });

  return {
    blob,
    dataUrl,
    width: canvasWidth,
    height: canvasHeight,
    byteSize: blob.size,
    mimeType: blob.type || options.format,
    cols,
    rows,
    frameCount: usedFrames.length,
  };
}

/** Generate synthetic tactical gameplay animation frames so users can test immediately without a video file. */
export function generateDemoGameplayFrames(count = 9): StoryboardFrame[] {
  const safeCount = Math.max(4, Math.min(9, count));
  const w = 480;
  const h = 270;
  const frames: StoryboardFrame[] = [];

  for (let i = 0; i < safeCount; i++) {
    const progress = i / (safeCount - 1);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Space/Arena tactical grid
    ctx.fillStyle = '#070c14';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(34,211,238,0.12)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 30) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 30) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Player ship moving & firing laser toward target drone
    const shipX = 56 + progress * 110;
    const shipY = 140 + Math.sin(progress * Math.PI * 2) * 34;
    const targetX = 390 - progress * 35;
    const targetY = 135 - Math.cos(progress * Math.PI * 1.5) * 28;

    // Thruster trail
    ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.beginPath();
    ctx.moveTo(shipX - 14, shipY);
    ctx.lineTo(shipX - 38 - progress * 12, shipY - 8);
    ctx.lineTo(shipX - 38 - progress * 12, shipY + 8);
    ctx.closePath();
    ctx.fill();

    // Ship body
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(shipX + 22, shipY);
    ctx.lineTo(shipX - 16, shipY - 14);
    ctx.lineTo(shipX - 10, shipY);
    ctx.lineTo(shipX - 16, shipY + 14);
    ctx.closePath();
    ctx.fill();

    // Laser beam / projectile
    const boltProgress = (progress * 1.6) % 1;
    const boltX = shipX + 24 + boltProgress * (targetX - shipX - 44);
    const boltY = shipY + boltProgress * (targetY - shipY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(boltX - 24, boltY);
    ctx.lineTo(boltX + 12, boltY);
    ctx.stroke();

    // Enemy drone + hit flash on later frames
    const hit = progress > 0.65;
    ctx.fillStyle = hit ? '#f43f5e' : '#f59e0b';
    ctx.fillRect(targetX - 18, targetY - 18, 36, 36);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(targetX - 18, targetY - 18, 36, 36);

    if (hit) {
      const r = (progress - 0.65) * 145;
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(targetX, targetY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Mini HUD bar inside frame
    ctx.fillStyle = 'rgba(12, 18, 28, 0.82)';
    ctx.fillRect(10, 10, 195, 22);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(14, 15, Math.max(12, 120 * (1 - progress * 0.45)), 12);
    ctx.fillStyle = '#e6edf6';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`HP ${Math.round(100 - progress * 45)}% · F${i + 1}`, 142, 24);

    frames.push({
      id: `demo-${i + 1}`,
      timestamp: Number((progress * 3.6).toFixed(2)),
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
      width: w,
      height: h,
    });
  }

  return frames;
}
