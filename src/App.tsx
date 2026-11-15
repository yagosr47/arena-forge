import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioWaveform,
  Grid2x2,
  Film,
  Palette,
  FolderCode,
  Radio,
  HardDriveDownload,
  WifiOff,
  Download,
} from 'lucide-react';
import { SfxStudioView } from './components/SfxStudioView';
import { SpriteForgeView } from './components/SpriteForgeView';
import { StoryboardView } from './components/StoryboardView';
import { UiInspectorView } from './components/UiInspectorView';
import { ContextVaultView } from './components/ContextVaultView';
import { QrBridgeView, type OutgoingBridgeDraft } from './components/QrBridgeModal';
import { MigrationModal } from './components/MigrationModal';
import { ToastHost, type ToastItem, type ToastTone } from './components/ToastHost';
import {
  listVaultSnippets,
  upsertVaultSnippet,
  type VaultSnippet,
} from './repo/snippetVault';
import {
  WebRtcQrBridge,
  type BridgeConnectionState,
  type BridgeTransferItem,
} from './transfer/qrBridge';

type AppTab = 'sfx' | 'sprite' | 'storyboard' | 'inspector' | 'context' | 'bridge';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const NAV_TABS: Array<{
  id: AppTab;
  label: string;
  shortLabel: string;
  icon: typeof AudioWaveform;
}> = [
  { id: 'sfx', label: 'SFX Studio', shortLabel: 'SFX', icon: AudioWaveform },
  { id: 'sprite', label: 'Sprite/SVG', shortLabel: 'Sprite', icon: Grid2x2 },
  { id: 'storyboard', label: 'Vídeo→Storyboard', shortLabel: 'Vídeo', icon: Film },
  { id: 'inspector', label: 'Inspetor UI', shortLabel: 'UI', icon: Palette },
  { id: 'context', label: 'Contexto & Cofre', shortLabel: 'Cofre', icon: FolderCode },
  { id: 'bridge', label: 'Ponte QR/P2P', shortLabel: 'Ponte', icon: Radio },
];

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('sfx');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [snippets, setSnippets] = useState<VaultSnippet[]>([]);
  const [migrationOpen, setMigrationOpen] = useState<boolean>(false);

  // Connectivity & PWA install state
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swOfflineReady, setSwOfflineReady] = useState<boolean>(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Persistent WebRTC Bridge state across tabs
  const bridgeRef = useRef<WebRtcQrBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeConnectionState>('idle');
  const [bridgeDetail, setBridgeDetail] = useState<string>('Desconectado');
  const [bridgeDraft, setBridgeDraft] = useState<OutgoingBridgeDraft | null>(null);
  const [transfers, setTransfers] = useState<BridgeTransferItem[]>([]);
  const [transferProgress, setTransferProgress] = useState<{
    percent: number;
    label: string;
  } | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Load IndexedDB Snippet Vault on startup
  useEffect(() => {
    let active = true;
    listVaultSnippets()
      .then((list) => {
        if (active) setSnippets(list);
      })
      .catch(() => {
        // Fallback already handled inside snippetVault
      });
    return () => {
      active = false;
    };
  }, []);

  // Online/offline + PWA events
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => {
      setIsOnline(false);
      notify('Modo Offline ativo — todos os estúdios continuam operando localmente.', 'warning');
    };
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onSwReady = () => setSwOfflineReady(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('arena-forge-offline-ready', onSwReady);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('arena-forge-offline-ready', onSwReady);
    };
  }, [notify]);

  // Initialize persistent WebRTC bridge instance
  useEffect(() => {
    const bridge = new WebRtcQrBridge({
      onStateChange: (state, detail) => {
        setBridgeState(state);
        setBridgeDetail(detail || state);
        if (state === 'connected') {
          notify('Ponte WebRTC DataChannel conectada!', 'bridge');
        }
      },
      onItemReceived: (item) => {
        setTransfers((prev) => [item, ...prev]);
        notify(`Recebido via Ponte P2P: ${item.title}`, 'bridge');
      },
      onProgress: (percent, label) => {
        setTransferProgress({ percent, label });
        if (percent >= 100) {
          window.setTimeout(() => setTransferProgress(null), 1600);
        }
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.close();
      bridgeRef.current = null;
    };
  }, [notify]);

  const handleSaveToVault = useCallback(
    async (title: string, code: string) => {
      try {
        const next = await upsertVaultSnippet({
          id: `saved-${Date.now()}`,
          title,
          category: 'Custom',
          language: title.endsWith('.md') ? 'md' : 'ts',
          tags: ['arena-forge', 'gerado'],
          description: 'Gerado e salvo diretamente pela bancada ARENA//FORGE.',
          code,
          pinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        setSnippets(next);
        notify(`"${title}" salvo no Cofre IndexedDB!`, 'success');
      } catch {
        notify('Não foi possível salvar no Cofre.', 'warning');
      }
    },
    [notify]
  );

  const handleSendTextToBridge = useCallback(
    (payload: { title: string; content: string; kind: 'code' | 'markdown' | 'json' }) => {
      setBridgeDraft({
        title: payload.title,
        kind: payload.kind,
        mimeType: payload.kind === 'json' ? 'application/json' : 'text/plain',
        content: payload.content,
        isBinary: false,
      });
      setActiveTab('bridge');
      notify(`"${payload.title}" pronto na Ponte QR / WebRTC.`, 'bridge');
    },
    [notify]
  );

  const handleSendImageToBridge = useCallback(
    (payload: { title: string; dataUrl: string; mimeType: string }) => {
      setBridgeDraft({
        title: payload.title,
        kind: 'image',
        mimeType: payload.mimeType,
        content: payload.dataUrl,
        isBinary: true,
      });
      setActiveTab('bridge');
      notify(`Storyboard "${payload.title}" na fila da Ponte P2P.`, 'bridge');
    },
    [notify]
  );

  const handleTriggerInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const res = await installPrompt.userChoice;
    if (res.outcome === 'accepted') {
      notify('ARENA//FORGE instalado como PWA!', 'success');
    }
    setInstallPrompt(null);
  };

  return (
    <div className="safe-pt flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#06090e] text-[#e6edf6]">
      <ToastHost toasts={toasts} />

      {/* Top Tactical Command Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[#1c2a3a] bg-[#0a0f17] px-3 sm:px-4">
        {/* Brand Emblem */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-cyan-400/50 bg-[#0d1824] font-mono text-xs font-black tracking-tighter">
            <span className="text-cyan-400">/</span>
            <span className="text-amber-400">/</span>
          </div>
          <div className="leading-none">
            <div className="flex items-center gap-1.5 font-mono text-xs font-black tracking-widest text-slate-100 sm:text-sm">
              <span>ARENA</span>
              <span className="text-cyan-400">//</span>
              <span className="text-amber-400">FORGE</span>
            </div>
            <div className="hidden font-mono text-[9px] tracking-widest text-slate-500 sm:block">
              TACTICAL CODE-ASSET &amp; CONTEXT WORKBENCH
            </div>
          </div>
        </div>

        {/* Desktop Primary Tabs */}
        <nav
          aria-label="Navegação Principal"
          className="hidden items-center gap-1 md:flex"
        >
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const isBridge = tab.id === 'bridge';
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[11px] font-semibold transition ${
                  active
                    ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
                    : 'border-transparent text-slate-400 hover:border-[#1f2e40] hover:bg-[#111924] hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {isBridge && bridgeState === 'connected' && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Utility Telemetry Buttons */}
        <div className="flex items-center gap-1.5">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/45 bg-amber-500/15 px-2 py-1 font-mono text-[10px] font-bold text-amber-200">
              <WifiOff className="h-3 w-3" />
              <span className="hidden sm:inline">OFFLINE</span>
            </span>
          )}

          {installPrompt && (
            <button
              type="button"
              onClick={() => void handleTriggerInstall()}
              className="inline-flex items-center gap-1 rounded border border-cyan-400/50 bg-cyan-500/15 px-2 py-1 font-mono text-[10.5px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
              title="Instalar PWA no dispositivo"
            >
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Instalar</span>
            </button>
          )}

          {/* Quick P2P status pill on mobile */}
          <button
            type="button"
            onClick={() => setActiveTab('bridge')}
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] md:hidden ${
              bridgeState === 'connected'
                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                : 'border-[#24364b] bg-[#111924] text-slate-300'
            }`}
            title="Ponte QR / WebRTC"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                bridgeState === 'connected' ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'
              }`}
            />
            <span>P2P</span>
          </button>

          <button
            type="button"
            onClick={() => setMigrationOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#24364b] bg-[#111924] px-2.5 py-1 font-mono text-[10.5px] text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200"
            title="Status Offline PWA & Migração Backup JSON"
          >
            <HardDriveDownload className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden lg:inline">Backup JSON</span>
          </button>
        </div>
      </header>

      {/* Main Internal Scroll Workspace */}
      <main className="forge-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#06090e]">
        {activeTab === 'sfx' && (
          <SfxStudioView
            onNotify={notify}
            onSendToBridge={handleSendTextToBridge}
            onSaveToVault={(title, code) => void handleSaveToVault(title, code)}
          />
        )}
        {activeTab === 'sprite' && (
          <SpriteForgeView
            onNotify={notify}
            onSendToBridge={handleSendTextToBridge}
            onSaveToVault={(title, code) => void handleSaveToVault(title, code)}
          />
        )}
        {activeTab === 'storyboard' && (
          <StoryboardView
            onNotify={notify}
            onSendImageToBridge={handleSendImageToBridge}
          />
        )}
        {activeTab === 'inspector' && (
          <UiInspectorView
            onNotify={notify}
            onSendToBridge={handleSendTextToBridge}
            onSaveToVault={(title, code) => void handleSaveToVault(title, code)}
          />
        )}
        {activeTab === 'context' && (
          <ContextVaultView
            snippets={snippets}
            onSnippetsChange={setSnippets}
            onNotify={notify}
            onSendToBridge={handleSendTextToBridge}
            onSaveToVault={(title, code) => void handleSaveToVault(title, code)}
          />
        )}
        {activeTab === 'bridge' && (
          <QrBridgeView
            draft={bridgeDraft}
            onClearDraft={() => setBridgeDraft(null)}
            bridgeState={bridgeState}
            bridgeDetail={bridgeDetail}
            bridgeRef={bridgeRef}
            transfers={transfers}
            onAppendTransfer={(item) => setTransfers((prev) => [item, ...prev])}
            transferProgress={transferProgress}
            onNotify={notify}
            onSaveToVault={(title, code) => void handleSaveToVault(title, code)}
          />
        )}
      </main>

      {/* Mobile Bottom Ergonomic Tab Bar */}
      <nav
        aria-label="Navegação Mobile"
        className="safe-pb grid shrink-0 grid-cols-6 border-t border-[#1c2a3a] bg-[#0a0f17] px-1 pt-1 md:hidden"
      >
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded py-1.5 font-mono text-[9.5px] font-semibold transition ${
                active
                  ? 'bg-cyan-400/15 text-cyan-300'
                  : 'text-slate-400 active:bg-[#131d2b]'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{tab.shortLabel}</span>
              {tab.id === 'bridge' && bridgeState === 'connected' && (
                <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* PWA & Full Device Migration Modal */}
      <MigrationModal
        open={migrationOpen}
        onClose={() => setMigrationOpen(false)}
        isOnline={isOnline}
        swOfflineReady={swOfflineReady}
        snippetCount={snippets.length}
        onSnippetsImported={setSnippets}
        onSendBackupToBridge={(json) =>
          handleSendTextToBridge({
            title: `arena-forge-backup-${new Date().toISOString().slice(0, 10)}.json`,
            content: json,
            kind: 'json',
          })
        }
        onNotify={notify}
      />
    </div>
  );
}

export default App;
