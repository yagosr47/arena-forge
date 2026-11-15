import { useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  FileCode2,
  Database,
  Plus,
  Search,
  Copy,
  Check,
  Pin,
  Trash2,
  Edit3,
  Download,
  Upload,
  Radio,
  Sparkles,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  DEFAULT_IGNORE_DIRS,
  DEMO_REPO_FILES,
  buildRepoContextMarkdown,
  collectFilesFromDirectoryHandle,
  collectFilesFromFileList,
  type ContextBuildOptions,
  type ScannedSourceFile,
} from '../repo/contextBuilder';
import {
  deleteVaultSnippet,
  exportArenaForgeBackupJson,
  importArenaForgeBackupJson,
  restoreDefaultSnippets,
  upsertVaultSnippet,
  type SnippetCategory,
  type VaultSnippet,
} from '../repo/snippetVault';
import { copyToClipboard, triggerTextDownload } from '../utils/ioHelpers';
import { CodeOutputPanel } from './CodeOutputPanel';

interface ContextVaultViewProps {
  snippets: VaultSnippet[];
  onSnippetsChange: (next: VaultSnippet[]) => void;
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
  onSendToBridge: (payload: {
    title: string;
    content: string;
    kind: 'code' | 'markdown' | 'json';
  }) => void;
  onSaveToVault: (title: string, code: string) => void;
}

type SubView = 'context' | 'vault';

const CATEGORIES: Array<SnippetCategory | 'Todos'> = [
  'Todos',
  'PWA & Build',
  'Input & Touch',
  'Hardware & APIs',
  'Layout & UI',
  'Game Loop & Áudio',
  'Custom',
];

export function ContextVaultView({
  snippets,
  onSnippetsChange,
  onNotify,
  onSendToBridge,
  onSaveToVault,
}: ContextVaultViewProps) {
  const [subView, setSubView] = useState<SubView>('context');

  // --- Context Builder state ---
  const [scannedFiles, setScannedFiles] = useState<ScannedSourceFile[]>([]);
  const [projectName, setProjectName] = useState<string>('projeto-local');
  const [ignoredCount, setIgnoredCount] = useState<number>(0);
  const [ignoreInput, setIgnoreInput] = useState<string>(DEFAULT_IGNORE_DIRS.join(', '));
  const [includePackageJson, setIncludePackageJson] = useState<boolean>(true);
  const [includeTypes, setIncludeTypes] = useState<boolean>(true);
  const [includeFunctions, setIncludeFunctions] = useState<boolean>(true);
  const [includeClasses, setIncludeClasses] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const importJsonRef = useRef<HTMLInputElement | null>(null);

  // --- Snippet Vault state ---
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<SnippetCategory | 'Todos'>('Todos');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<VaultSnippet | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(['seed-vite-pwa']));

  const parsedIgnoreDirs = useMemo(
    () =>
      ignoreInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [ignoreInput]
  );

  const contextResult = useMemo(() => {
    if (scannedFiles.length === 0) return null;
    const opts: ContextBuildOptions = {
      ignoreDirs: parsedIgnoreDirs,
      includePackageJson,
      includeTypesAndInterfaces: includeTypes,
      includeFunctions,
      includeClassesAndEnums: includeClasses,
      maxInterfaceLines: 14,
    };
    return buildRepoContextMarkdown(scannedFiles, projectName, ignoredCount, opts);
  }, [
    scannedFiles,
    projectName,
    ignoredCount,
    parsedIgnoreDirs,
    includePackageJson,
    includeTypes,
    includeFunctions,
    includeClasses,
  ]);

  const handleOpenFsPicker = async () => {
    if (typeof window.showDirectoryPicker !== 'function') {
      dirInputRef.current?.click();
      return;
    }
    setIsScanning(true);
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const res = await collectFilesFromDirectoryHandle(handle, parsedIgnoreDirs);
      setScannedFiles(res.files);
      setIgnoredCount(res.ignoredCount);
      setProjectName(res.rootName);
      onNotify(
        `Pasta "${res.rootName}" mapeada (${res.files.length} arquivos, ${res.ignoredCount} ignorados).`,
        'success'
      );
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        onNotify('Use "Selecionar Pasta" caso o navegador bloqueie FS API.', 'warning');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileListSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsScanning(true);
    try {
      const res = await collectFilesFromFileList(fileList, parsedIgnoreDirs);
      setScannedFiles(res.files);
      setIgnoredCount(res.ignoredCount);
      setProjectName(res.rootName);
      onNotify(
        `${res.files.length} arquivos processados (${res.ignoredCount} ignorados).`,
        'success'
      );
    } catch {
      onNotify('Erro ao ler os arquivos selecionados.', 'warning');
    } finally {
      setIsScanning(false);
    }
  };

  const handleLoadDemoRepo = () => {
    setScannedFiles(DEMO_REPO_FILES);
    setProjectName('orbital-raider-pwa');
    setIgnoredCount(482);
    onNotify('Repositório demo carregado com assinaturas TS/TSX.', 'info');
  };

  // --- Vault helpers ---
  const filteredSnippets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return snippets.filter((s) => {
      if (selectedCategory !== 'Todos' && s.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.code.toLowerCase().includes(q)
      );
    });
  }, [snippets, searchQuery, selectedCategory]);

  const handleCopySnippet = async (s: VaultSnippet) => {
    if (await copyToClipboard(s.code)) {
      setCopiedId(s.id);
      onNotify(`Módulo "${s.title}" copiado!`, 'success');
      window.setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1500);
    }
  };

  const handleTogglePin = async (s: VaultSnippet) => {
    const next = await upsertVaultSnippet({ ...s, pinned: !s.pinned });
    onSnippetsChange(next);
  };

  const handleDeleteSnippet = async (s: VaultSnippet) => {
    const next = await deleteVaultSnippet(s.id);
    onSnippetsChange(next);
    onNotify(`Módulo "${s.title}" removido do Cofre.`, 'info');
  };

  const handleOpenNewSnippet = () => {
    setEditingSnippet({
      id: `custom-${Date.now()}`,
      title: '',
      category: 'Custom',
      language: 'ts',
      tags: ['reutilizavel'],
      description: '',
      code: '',
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  const handleSaveEditor = async () => {
    if (!editingSnippet) return;
    if (!editingSnippet.title.trim() || !editingSnippet.code.trim()) {
      onNotify('Preencha pelo menos Título e Código do módulo.', 'warning');
      return;
    }
    const next = await upsertVaultSnippet({
      ...editingSnippet,
      title: editingSnippet.title.trim(),
      description: editingSnippet.description.trim(),
    });
    onSnippetsChange(next);
    setEditingSnippet(null);
    onNotify('Módulo salvo no IndexedDB!', 'success');
  };

  const handleExportVaultJson = async () => {
    const json = await exportArenaForgeBackupJson();
    triggerTextDownload(
      json,
      `arena-forge-vault-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
    onNotify('Cofre exportado em JSON para backup/migração.', 'success');
  };

  const handleImportVaultFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const res = await importArenaForgeBackupJson(text, 'merge');
      onSnippetsChange(res.snippets);
      onNotify(
        `Importados ${res.importedSnippets} módulos${res.importedSfx ? ` e ${res.importedSfx} presets SFX` : ''}.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Falha ao importar JSON.', 'warning');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-4">
      {/* Header + Sub-module Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-cyan-300">
              MOD-03
            </span>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100 sm:text-base">
              Contexto & Cofre · Repo Packer + IndexedDB Vault
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Empacote árvore e assinaturas TypeScript para sessões de IA ou copie módulos reutilizáveis salvos localmente.
          </p>
        </div>

        <div className="inline-flex rounded border border-[#24364b] bg-[#0a0f17] p-1">
          <button
            type="button"
            onClick={() => setSubView('context')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs font-semibold transition ${
              subView === 'context'
                ? 'bg-cyan-400 text-[#051017]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Mapeador Repo</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('vault')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs font-semibold transition ${
              subView === 'vault'
                ? 'bg-amber-400 text-[#120b02]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Cofre IndexedDB ({snippets.length})</span>
          </button>
        </div>
      </div>

      {/* ================= SUB-VIEW 1: REPO CONTEXT BUILDER ================= */}
      {subView === 'context' && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Controls & Ingestion */}
          <div className="flex flex-col gap-3 lg:col-span-5">
            <div className="tactical-panel flex flex-col gap-3 p-3">
              {/* Hidden inputs for webkitdirectory & multi-file */}
              <input
                ref={(el) => {
                  dirInputRef.current = el;
                  if (el) {
                    el.setAttribute('webkitdirectory', '');
                    el.setAttribute('directory', '');
                  }
                }}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFileListSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={filesInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFileListSelected(e.target.files);
                  e.target.value = '';
                }}
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleOpenFsPicker()}
                  disabled={isScanning}
                  className="inline-flex items-center justify-center gap-1.5 rounded border border-cyan-400/60 bg-cyan-400 px-3 py-2 font-mono text-xs font-bold text-[#051017] transition hover:bg-cyan-300 disabled:opacity-50"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>{isScanning ? 'Escaneando...' : 'Abrir Pasta Local'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => dirInputRef.current?.click()}
                  disabled={isScanning}
                  className="inline-flex items-center justify-center gap-1.5 rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 font-mono text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Pasta (webkitdirectory)</span>
                </button>

                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
                  disabled={isScanning}
                  className="inline-flex items-center justify-center gap-1.5 rounded border border-[#2a3f57] bg-[#131e2c] px-3 py-2 font-mono text-xs text-slate-200 transition hover:bg-[#1a293c]"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  <span>Selecionar Arquivos</span>
                </button>

                <button
                  type="button"
                  onClick={handleLoadDemoRepo}
                  className="inline-flex items-center justify-center gap-1.5 rounded border border-amber-400/45 bg-amber-500/15 px-3 py-2 font-mono text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Carregar Projeto Demo</span>
                </button>
              </div>

              {/* Ignore patterns & Filters */}
              <div className="border-t border-[#1c2a3a] pt-2.5">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Pastas Ignoradas Automaticamente (vírgula)
                </label>
                <input
                  type="text"
                  value={ignoreInput}
                  onChange={(e) => setIgnoreInput(e.target.value)}
                  className="w-full rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-300">
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeTypes}
                    onChange={(e) => setIncludeTypes(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>interface &amp; type</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeFunctions}
                    onChange={(e) => setIncludeFunctions(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>export function</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeClasses}
                    onChange={(e) => setIncludeClasses(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>class &amp; enum</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includePackageJson}
                    onChange={(e) => setIncludePackageJson(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Resumo package.json</span>
                </label>
              </div>
            </div>

            {/* Scan Telemetry Stats */}
            {contextResult && (
              <div className="tactical-panel grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-2">
                <StatBox label="Arquivos Úteis" value={String(contextResult.totalFilesScanned)} tone="cyan" />
                <StatBox label="Ignorados" value={String(contextResult.ignoredCount)} tone="slate" />
                <StatBox label="Assinaturas" value={String(contextResult.totalSymbols)} tone="emerald" />
                <StatBox
                  label="Tokens Est."
                  value={`~${contextResult.estimatedTokens.toLocaleString('pt-BR')}`}
                  tone="amber"
                />
              </div>
            )}
          </div>

          {/* Markdown Context Output */}
          <div className="lg:col-span-7">
            {contextResult ? (
              <CodeOutputPanel
                title={`context-${contextResult.projectName}.md`}
                subtitle={`${contextResult.reports.length} módulos com contratos · ~${contextResult.estimatedTokens} tokens`}
                code={contextResult.markdown}
                filename={`context-${contextResult.projectName}.md`}
                copyLabel="Copiar Contexto MD"
                maxHeightClass="max-h-[480px] lg:max-h-[540px]"
                onNotify={onNotify}
                onSendToBridge={onSendToBridge}
                onSaveToVault={(title, code) => onSaveToVault(`Contexto: ${title}`, code)}
                bridgeKind="markdown"
              />
            ) : (
              <div className="tactical-panel bg-tactical-grid flex min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center">
                <FolderOpen className="h-9 w-9 text-cyan-400/70" />
                <div className="font-mono text-xs font-semibold text-slate-200">
                  Selecione uma pasta local ou múltiplos arquivos do seu repositório
                </div>
                <p className="max-w-md text-[11px] text-slate-400">
                  O scanner ignora automaticamente <code className="text-amber-300">node_modules</code> e{' '}
                  <code className="text-amber-300">.git</code>, extraindo a árvore de diretórios e todas as assinaturas de{' '}
                  <code className="text-cyan-300">interface</code>, <code className="text-cyan-300">type</code> e{' '}
                  <code className="text-cyan-300">export function</code>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= SUB-VIEW 2: INDEXEDDB SNIPPET VAULT ================= */}
      {subView === 'vault' && (
        <div className="flex flex-col gap-3">
          {/* Vault Toolbar */}
          <div className="tactical-panel flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar módulo por nome, tag ou código (ex: pwa, joystick, bluetooth, 100dvh)..."
                  className="w-full rounded border border-[#24364b] bg-[#080d14] py-1.5 pl-8 pr-3 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenNewSnippet}
                  className="inline-flex items-center gap-1.5 rounded border border-cyan-400/60 bg-cyan-400 px-3 py-1.5 font-mono text-xs font-bold text-[#051017] transition hover:bg-cyan-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Novo Módulo</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleExportVaultJson()}
                  className="inline-flex items-center gap-1 rounded border border-amber-400/45 bg-amber-500/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Exportar JSON</span>
                </button>

                <input
                  ref={importJsonRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    void handleImportVaultFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => importJsonRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded border border-[#2a3f57] bg-[#131e2c] px-2.5 py-1.5 font-mono text-[11px] text-slate-200 hover:bg-[#1a293c]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Importar JSON</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const restored = await restoreDefaultSnippets();
                    onSnippetsChange(restored);
                    onNotify('Módulos padrão restaurados no IndexedDB.', 'info');
                  }}
                  className="inline-flex items-center gap-1 rounded border border-[#24364b] bg-[#0e1520] px-2 py-1.5 font-mono text-[11px] text-slate-400 hover:text-slate-200"
                  title="Restaurar snippets padrão"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] transition ${
                    selectedCategory === cat
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-[#213144] bg-[#0c121b] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Inline Editor Form when creating/editing */}
          {editingSnippet && (
            <div className="tactical-panel border-cyan-400/50 p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase text-cyan-300">
                  Editor de Módulo (IndexedDB)
                </span>
                <button
                  type="button"
                  onClick={() => setEditingSnippet(null)}
                  className="rounded p-1 text-slate-400 hover:bg-[#172333] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                <input
                  type="text"
                  value={editingSnippet.title}
                  onChange={(e) => setEditingSnippet({ ...editingSnippet, title: e.target.value })}
                  placeholder="Título do módulo (ex: Shader CRT Scanline)"
                  className="rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400 sm:col-span-5"
                />
                <select
                  value={editingSnippet.category}
                  onChange={(e) =>
                    setEditingSnippet({
                      ...editingSnippet,
                      category: e.target.value as SnippetCategory,
                    })
                  }
                  className="rounded border border-[#24364b] bg-[#080d14] px-2 py-1.5 font-mono text-xs text-slate-200 sm:col-span-3"
                >
                  {CATEGORIES.filter((c) => c !== 'Todos').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={editingSnippet.tags.join(', ')}
                  onChange={(e) =>
                    setEditingSnippet({
                      ...editingSnippet,
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="tags separadas por vírgula"
                  className="rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400 sm:col-span-4"
                />
                <input
                  type="text"
                  value={editingSnippet.description}
                  onChange={(e) =>
                    setEditingSnippet({ ...editingSnippet, description: e.target.value })
                  }
                  placeholder="Descrição curta de uso..."
                  className="rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400 sm:col-span-12"
                />
                <textarea
                  rows={8}
                  value={editingSnippet.code}
                  onChange={(e) => setEditingSnippet({ ...editingSnippet, code: e.target.value })}
                  placeholder="Cole aqui o código reutilizável..."
                  className="forge-scroll rounded border border-[#24364b] bg-[#060a10] p-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400 sm:col-span-12"
                />
              </div>

              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSnippet(null)}
                  className="rounded border border-[#24364b] px-3 py-1.5 font-mono text-xs text-slate-300 hover:bg-[#141f2d]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveEditor()}
                  className="rounded border border-cyan-400/60 bg-cyan-400 px-3.5 py-1.5 font-mono text-xs font-bold text-[#051017] hover:bg-cyan-300"
                >
                  Salvar no Cofre
                </button>
              </div>
            </div>
          )}

          {/* Snippet Cards Grid */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filteredSnippets.map((item) => {
              const isCopied = copiedId === item.id;
              const isExpanded = expandedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`tactical-panel flex flex-col overflow-hidden ${
                    item.pinned ? 'border-cyan-400/35' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-[#1d2b3c] bg-[#0e151f] px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded border border-amber-400/35 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-amber-300">
                          {item.category}
                        </span>
                        <h3 className="truncate font-mono text-xs font-bold text-slate-100">
                          {item.title}
                        </h3>
                      </div>
                      {item.description && (
                        <p className="mt-1 text-[11px] text-slate-400">{item.description}</p>
                      )}
                      {item.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-[#162130] px-1.5 py-0.5 font-mono text-[9.5px] text-cyan-300/90"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleCopySnippet(item)}
                        className="inline-flex items-center gap-1 rounded border border-cyan-400/50 bg-cyan-500/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{isCopied ? 'OK' : 'Copiar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onSendToBridge({ title: item.title, content: item.code, kind: 'code' })
                        }
                        className="rounded border border-emerald-500/35 bg-emerald-500/10 p-1.5 text-emerald-300 hover:bg-emerald-500/20"
                        title="Enviar via Ponte QR/WebRTC"
                      >
                        <Radio className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleTogglePin(item)}
                        className={`rounded border p-1.5 ${
                          item.pinned
                            ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                            : 'border-[#233448] text-slate-400 hover:text-slate-200'
                        }`}
                        title="Fixar no topo"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingSnippet({ ...item })}
                        className="rounded border border-[#233448] p-1.5 text-slate-400 hover:text-cyan-200"
                        title="Editar"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteSnippet(item)}
                        className="rounded border border-rose-500/30 p-1.5 text-rose-400 hover:bg-rose-500/15"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#070b11]">
                    <pre
                      className={`forge-scroll overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300 ${
                        isExpanded ? 'max-h-80 overflow-y-auto' : 'max-h-24 overflow-hidden'
                      }`}
                    >
                      <code>{item.code}</code>
                    </pre>
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="w-full border-t border-[#16212f] bg-[#0b1018] py-1 font-mono text-[10px] uppercase tracking-wider text-slate-400 transition hover:text-cyan-300"
                    >
                      {isExpanded
                        ? 'Recolher código'
                        : `Expandir código completo (${item.code.split('\n').length} linhas)`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSnippets.length === 0 && (
            <div className="tactical-panel p-8 text-center font-mono text-xs text-slate-400">
              Nenhum módulo encontrado para o filtro atual.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'cyan' | 'emerald' | 'amber' | 'slate';
}) {
  const color =
    tone === 'cyan'
      ? 'text-cyan-300'
      : tone === 'emerald'
        ? 'text-emerald-300'
        : tone === 'amber'
          ? 'text-amber-300'
          : 'text-slate-300';

  return (
    <div className="rounded border border-[#1d2b3c] bg-[#0a0f17] px-2.5 py-2">
      <div className="font-mono text-[10px] uppercase text-slate-400">{label}</div>
      <div className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
