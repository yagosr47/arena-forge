import {
  DEFAULT_SETTINGS,
  QUALITY_PRESETS,
  type GameSettings,
  type QualityLevel,
} from './types';

const STORAGE_KEY = 'arena-forge-obby:settings:v1';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(raw: unknown): GameSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const defaults = DEFAULT_SETTINGS;

  const quality = (
    ['low', 'medium', 'high', 'ultra'].includes(source.quality as string)
      ? source.quality
      : defaults.quality
  ) as QualityLevel;

  return {
    quality,
    pixelRatio: clamp(Number(source.pixelRatio ?? defaults.pixelRatio) || defaults.pixelRatio, 0.5, 2),
    shadows: typeof source.shadows === 'boolean' ? source.shadows : defaults.shadows,
    particles: typeof source.particles === 'boolean' ? source.particles : defaults.particles,
    fpsLimit: [0, 30, 60].includes(Number(source.fpsLimit)) ? Number(source.fpsLimit) : defaults.fpsLimit,
    fov: clamp(Number(source.fov ?? defaults.fov) || defaults.fov, 60, 100),
    sensitivity: clamp(Number(source.sensitivity ?? defaults.sensitivity) || defaults.sensitivity, 0.3, 2.5),
    showStats: typeof source.showStats === 'boolean' ? source.showStats : defaults.showStats,
    volume: clamp(Number(source.volume ?? defaults.volume) || 0, 0, 1),
    buttonScale: clamp(Number(source.buttonScale ?? defaults.buttonScale) || defaults.buttonScale, 0.7, 1.5),
    buttonOpacity: clamp(
      Number(source.buttonOpacity ?? defaults.buttonOpacity) ?? defaults.buttonOpacity,
      0.3,
      1,
    ),
  };
}

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* armazenamento indisponível — segue sem persistir */
  }
}

/** Aplica o preset de qualidade atualizando pixel ratio, sombras e partículas. */
export function applyQualityPreset(settings: GameSettings, quality: QualityLevel): GameSettings {
  const preset = QUALITY_PRESETS[quality];
  return {
    ...settings,
    quality,
    pixelRatio: preset.pixelRatio,
    shadows: preset.shadows,
    particles: preset.particles,
  };
}
