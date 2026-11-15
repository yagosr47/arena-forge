export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface GameSettings {
  quality: QualityLevel;
  /** Multiplicador de pixel ratio (0.5x – 2.0x) */
  pixelRatio: number;
  shadows: boolean;
  particles: boolean;
  /** 0 = ilimitado, 30 ou 60 */
  fpsLimit: number;
  /** Campo de visão em graus (60 – 100) */
  fov: number;
  /** Sensibilidade da câmera (0.3 – 2.5) */
  sensitivity: number;
  showStats: boolean;
  /** Volume dos efeitos sonoros (0 – 1) */
  volume: number;
  /** Escala dos botões de toque (0.7 – 1.5) */
  buttonScale: number;
  /** Opacidade dos botões de toque (0.3 – 1) */
  buttonOpacity: number;
}

export interface FrameStats {
  fps: number;
  frameMs: number;
}

export interface QualityPreset {
  pixelRatio: number;
  shadows: boolean;
  particles: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { pixelRatio: 0.6, shadows: false, particles: false },
  medium: { pixelRatio: 1.0, shadows: true, particles: true },
  high: { pixelRatio: 1.5, shadows: true, particles: true },
  ultra: { pixelRatio: 2.0, shadows: true, particles: true },
};

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  ultra: 'Ultra',
};

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'high',
  pixelRatio: 1.5,
  shadows: true,
  particles: true,
  fpsLimit: 0,
  fov: 75,
  sensitivity: 1,
  showStats: true,
  volume: 0.7,
  buttonScale: 1,
  buttonOpacity: 0.85,
};

export const SPAWN = { x: 0, y: 1.6, z: 0 };

export const PLAYER_TUNING = {
  walkSpeed: 4.4,
  sprintSpeed: 7.6,
  acceleration: 14,
  jumpSpeed: 9.2,
  gravity: 24,
  coyoteTime: 0.12,
  jumpBuffer: 0.15,
};
