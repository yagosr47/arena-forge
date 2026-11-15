import { useRef, useState } from 'react';
import {
  X,
  Download,
  Upload,
  ShieldCheck,
  Wifi,
  WifiOff,
  HardDriveDownload,
  Radio,
} from 'lucide-react';
import {
  exportArenaForgeBackupJson,
  importArenaForgeBackupJson,
  type VaultSnippet,
} from '../repo/snippetVault';
import { triggerTextDownload } from '../utils/ioHelpers';

interface MigrationModalProps {
  open: boolean;
  onClose: () => void;
  isOnline: boolean;
  swOfflineReady: boolean;
  snippetCount: number;
  onSnippetsImported: (next: VaultSnippet[]) => void;
  onSendBackupToBridge: (json: string) => void;
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
}

export function MigrationModal({
  open,
  onClose,
  isOnline,
  swOfflineReady,
  snippetCount,
  onSnippetsImported,
  onSendBackupToBridge,
  onNotify,
}: MigrationModalProps) {
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleExport = async () => {
    const json = await exportArenaForgeBackupJson();
    triggerTextDownload(
      json,
      `arena-forge-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
    onNotify('Backup completo JSON gerado para migração de dispositivo.', 'success');
  };

  const handleBeamBackup = async () => {
    const json = await exportArenaForgeBackupJson();
    onSendBackupToBridge(json);
    onClose();
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const res = await importArenaForgeBackupJson(text, importMode);
      onSnippetsImported(res.snippets);
      onNotify(
        `Migração concluída: ${res.importedSnippets} módulos${res.importedSfx ? ` + ${res.importedSfx} presets SFX` : ''}.`,
        'success'
      );
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao importar backup JSON.', 'warning');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tactical-panel w-full max-w-lg overflow-hidden border-[#2b415a] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#1f2e40] bg-[#0e151f] px-4 py-3">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="h-4 w-4 text-cyan-400" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
              PWA Offline &amp; Migração JSON de Dispositivo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-[#1a2838] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {/* Status tiles */}
          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="rounded border border-[#1f2f42] bg-[#090e15] p-2.5">
              <div className="flex items-center gap-1.5 text-slate-400">
                {isOnline ? (
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                )}
                <span>Conectividade</span>
              </div>
              <div className="mt-1 font-bold text-slate-100">
                {isOnline ? 'Online (Local-First)' : 'Modo 100% Offline'}
              </div>
            </div>

            <div className="rounded border border-[#1f2f42] bg-[#090e15] p-2.5">
              <div className="flex items-center gap-1.5 text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                <span>Cache PWA / Dados</span>
              </div>
              <div className="mt-1 font-bold text-slate-100">
                {swOfflineReady ? 'SW Ativo' : 'Pronto p/ Build'} · {snippetCount} módulos
              </div>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-300">
            Todos os módulos do Cofre (IndexedDB) e presets personalizados ficam armazenados localmente.
            Exporte um único arquivo <code className="font-mono text-cyan-300">.json</code> para migrar tudo para o próximo celular ou enviar pela Ponte WebRTC.
          </p>

          {/* Export actions */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-cyan-400/60 bg-cyan-400 px-3 py-2 font-mono text-xs font-bold text-[#051017] hover:bg-cyan-300"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar Backup .JSON</span>
            </button>

            <button
              type="button"
              onClick={() => void handleBeamBackup()}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 font-mono text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Enviar via Ponte P2P</span>
            </button>
          </div>

          {/* Import block */}
          <div className="flex flex-col gap-2 border-t border-[#1e2d40] pt-3">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-slate-300">Restaurar / Importar JSON</span>
              <div className="inline-flex overflow-hidden rounded border border-[#24364b] bg-[#080d14]">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`px-2 py-0.5 text-[10px] ${
                    importMode === 'merge' ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-400'
                  }`}
                >
                  Mesclar
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`px-2 py-0.5 text-[10px] ${
                    importMode === 'replace' ? 'bg-amber-400/20 text-amber-200' : 'text-slate-400'
                  }`}
                >
                  Substituir
                </button>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void handleImport(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-amber-400/45 bg-amber-500/15 py-2 font-mono text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Selecionar Arquivo .JSON</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
