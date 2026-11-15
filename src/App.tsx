import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { InputController } from './controls/InputController';
import { loadSettings, saveSettings } from './game/settings';
import type { FrameStats, GameSettings } from './game/types';
import { Hud } from './ui/Hud';
import { SettingsModal } from './ui/SettingsModal';

export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<InputController | null>(null);
  if (inputRef.current === null) {
    inputRef.current = new InputController();
  }

  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [stats, setStats] = useState<FrameStats>({ fps: 0, frameMs: 0 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleStats = useCallback((next: FrameStats) => {
    setStats(next);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const input = inputRef.current;
    if (!container || !input) return;

    let cancelled = false;
    let game: Game | null = null;

    Game.create(container, input, loadSettings(), handleStats)
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        game = created;
        gameRef.current = created;
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
      game?.dispose();
      gameRef.current = null;
    };
  }, [handleStats]);

  useEffect(() => {
    saveSettings(settings);
    // `ready` garante reaplicar quando o jogo termina de carregar (caso o
    // usuário tenha alterado algo durante o boot).
    if (ready) gameRef.current?.applySettings(settings);
    document.documentElement.style.setProperty('--hud-scale', settings.buttonScale.toFixed(2));
    document.documentElement.style.setProperty('--hud-opacity', settings.buttonOpacity.toFixed(2));
  }, [settings, ready]);

  useEffect(() => {
    const resume = () => gameRef.current?.resumeAudio();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);

  const updateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#05080f]">
      <div ref={containerRef} className="absolute inset-0" />

      {!ready && !error ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#05080f]">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-300" />
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/80">
            Forjando mundo 3D…
          </div>
          <div className="max-w-xs text-center text-[11px] leading-relaxed text-slate-500">
            Inicializando física Rapier3D, iluminação dinâmica e o Lobby.
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#05080f] px-6 text-center">
          <div className="text-sm font-semibold text-rose-300">Não foi possível iniciar o mundo 3D</div>
          <div className="max-w-md font-mono text-[11px] text-slate-500">{error}</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {ready && !error ? (
        <Hud
          settings={settings}
          stats={stats}
          input={inputRef.current}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : null}

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={closeSettings}
      />
    </div>
  );
}
