import type { SfxParams } from '../generators/sfxSynthesizer';

export type SnippetCategory =
  | 'PWA & Build'
  | 'Input & Touch'
  | 'Hardware & APIs'
  | 'Layout & UI'
  | 'Game Loop & Áudio'
  | 'Custom';

export interface VaultSnippet {
  id: string;
  title: string;
  category: SnippetCategory;
  language: 'ts' | 'tsx' | 'css' | 'json' | 'md';
  tags: string[];
  description: string;
  code: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ArenaForgeBackupPayload {
  schema: 'arena-forge-backup-v1';
  exportedAt: string;
  snippets: VaultSnippet[];
  customSfxPresets?: SfxParams[];
}

const DB_NAME = 'arena-forge-vault-db';
const DB_VERSION = 1;
const STORE_NAME = 'snippets';
const FALLBACK_LS_KEY = 'arena-forge-vault-fallback-v1';
const CUSTOM_SFX_LS_KEY = 'arena-forge-custom-sfx-v1';

export const DEFAULT_SNIPPETS: VaultSnippet[] = [
  {
    id: 'seed-vite-pwa',
    title: 'vite-plugin-pwa — Offline-First Completo',
    category: 'PWA & Build',
    language: 'ts',
    tags: ['vite', 'pwa', 'offline', 'workbox'],
    description:
      'Configuração Vite + Workbox para cache 100% offline, autoUpdate e manifesto standalone mobile.',
    pinned: true,
    createdAt: 1700000001000,
    updatedAt: 1700000001000,
    code: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Meu App Offline',
        short_name: 'MeuApp',
        theme_color: '#06090e',
        background_color: '#06090e',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});`,
  },
  {
    id: 'seed-multitouch-joystick',
    title: 'Joystick Multi-Touch (PointerEvent)',
    category: 'Input & Touch',
    language: 'ts',
    tags: ['mobile', 'pointerevent', 'joystick', 'game'],
    description:
      'Controlador analógico multi-touch com setPointerCapture, deadzone e vetor normalizado [-1..1].',
    pinned: true,
    createdAt: 1700000002000,
    updatedAt: 1700000002000,
    code: `export interface JoystickVector {
  x: number; // -1..1
  y: number; // -1..1
  magnitude: number; // 0..1
  angle: number; // radianos
  active: boolean;
}

export function attachVirtualJoystick(
  zoneEl: HTMLElement,
  maxRadius = 56,
  deadzone = 0.12,
  onChange?: (vec: JoystickVector) => void
): () => void {
  zoneEl.style.touchAction = 'none';
  let activePointerId: number | null = null;
  let originX = 0;
  let originY = 0;

  const emit = (x: number, y: number, active: boolean) => {
    const rawMag = Math.min(1, Math.hypot(x, y));
    const mag = rawMag < deadzone ? 0 : (rawMag - deadzone) / (1 - deadzone);
    const angle = Math.atan2(y, x);
    onChange?.({
      x: mag > 0 ? Math.cos(angle) * mag : 0,
      y: mag > 0 ? Math.sin(angle) * mag : 0,
      magnitude: mag,
      angle,
      active,
    });
  };

  const onDown = (e: PointerEvent) => {
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    zoneEl.setPointerCapture(e.pointerId);
    emit(0, 0, true);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    const dx = (e.clientX - originX) / maxRadius;
    const dy = (e.clientY - originY) / maxRadius;
    const len = Math.hypot(dx, dy);
    const scale = len > 1 ? 1 / len : 1;
    emit(dx * scale, dy * scale, true);
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    emit(0, 0, false);
  };

  zoneEl.addEventListener('pointerdown', onDown);
  zoneEl.addEventListener('pointermove', onMove);
  zoneEl.addEventListener('pointerup', onUp);
  zoneEl.addEventListener('pointercancel', onUp);

  return () => {
    zoneEl.removeEventListener('pointerdown', onDown);
    zoneEl.removeEventListener('pointermove', onMove);
    zoneEl.removeEventListener('pointerup', onUp);
    zoneEl.removeEventListener('pointercancel', onUp);
  };
}`,
  },
  {
    id: 'seed-webbluetooth',
    title: 'Driver WebBluetooth GATT (BLE)',
    category: 'Hardware & APIs',
    language: 'ts',
    tags: ['bluetooth', 'ble', 'iot', 'hardware', 'esp32'],
    description:
      'Conexão BLE GATT completa para sensores, robôs ESP32 ou gamepads customizados com notificações e escrita.',
    pinned: true,
    createdAt: 1700000003000,
    updatedAt: 1700000003000,
    code: `export interface BleLink {
  deviceName: string;
  write: (payload: Uint8Array | string) => Promise<void>;
  disconnect: () => void;
}

export async function connectBleUart(
  serviceUuid: string,
  txCharUuid: string,
  rxCharUuid: string,
  onData: (bytes: Uint8Array) => void
): Promise<BleLink> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (opts: unknown) => Promise<{
        name?: string;
        gatt?: {
          connect: () => Promise<{
            disconnect: () => void;
            getPrimaryService: (uuid: string) => Promise<{
              getCharacteristic: (uuid: string) => Promise<{
                writeValue: (v: BufferSource) => Promise<void>;
                startNotifications: () => Promise<void>;
                addEventListener: (ev: string, fn: (e: Event) => void) => void;
              }>;
            }>;
          }>;
        };
      }>;
    };
  };

  if (!nav.bluetooth) throw new Error('WebBluetooth indisponível neste navegador.');

  const device = await nav.bluetooth.requestDevice({
    filters: [{ services: [serviceUuid] }],
  });
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(serviceUuid);
  const txChar = await service.getCharacteristic(txCharUuid);
  const rxChar = await service.getCharacteristic(rxCharUuid);

  await rxChar.startNotifications();
  rxChar.addEventListener('characteristicvaluechanged', (ev: Event) => {
    const value = (ev.target as unknown as { value?: DataView }).value;
    if (value) onData(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  });

  const encoder = new TextEncoder();
  return {
    deviceName: device.name ?? 'Dispositivo BLE',
    async write(payload) {
      const bytes = typeof payload === 'string' ? encoder.encode(payload) : payload;
      await txChar.writeValue(bytes);
    },
    disconnect() {
      server.disconnect();
    },
  };
}`,
  },
  {
    id: 'seed-layout-100dvh',
    title: 'Layout Mobile-First 100vw × 100dvh',
    category: 'Layout & UI',
    language: 'css',
    tags: ['100dvh', 'mobile', 'safe-area', 'tailwind'],
    description:
      'Viewport travado sem rubber-band no iOS/Android com suporte a notch (safe-area-inset) e scroll interno.',
    pinned: true,
    createdAt: 1700000004000,
    updatedAt: 1700000004000,
    code: `:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

html,
body,
#root {
  width: 100vw;
  height: 100dvh;
  margin: 0;
  overflow: hidden;
  overscroll-behavior: none;
  background: #06090e;
  color: #e6edf6;
}

.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding-top: var(--safe-top);
  padding-bottom: var(--safe-bottom);
}

.app-scroll-pane {
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}`,
  },
  {
    id: 'seed-gameloop-hidpi',
    title: 'Game Loop Fixed-Timestep + Canvas HiDPI',
    category: 'Game Loop & Áudio',
    language: 'ts',
    tags: ['canvas', 'raf', 'timestep', 'dpr'],
    description:
      'Loop determinístico a 60Hz com acumulador de delta clampado e escala automática de devicePixelRatio.',
    pinned: false,
    createdAt: 1700000005000,
    updatedAt: 1700000005000,
    code: `export function startFixedGameLoop(
  canvas: HTMLCanvasElement,
  update: (fixedDt: number) => void,
  render: (ctx: CanvasRenderingContext2D, alpha: number, w: number, h: number) => void,
  fixedStep = 1 / 60
): () => void {
  const ctx = canvas.getContext('2d')!;
  let rafId = 0;
  let last = performance.now();
  let acc = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  window.addEventListener('resize', resize);

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= fixedStep) {
      update(fixedStep);
      acc -= fixedStep;
    }
    const rect = canvas.getBoundingClientRect();
    render(ctx, acc / fixedStep, rect.width, rect.height);
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
  };
}`,
  },
  {
    id: 'seed-webaudio-unlock',
    title: 'WebAudio iOS/Mobile Unlock Helper',
    category: 'Game Loop & Áudio',
    language: 'ts',
    tags: ['webaudio', 'ios', 'mobile', 'sfx'],
    description:
      'Desbloqueia o AudioContext no primeiro toque do usuário em Safari/iOS e Chrome Mobile sem falhas.',
    pinned: false,
    createdAt: 1700000006000,
    updatedAt: 1700000006000,
    code: `let ctx: AudioContext | null = null;

export function getUnlockedAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function bindFirstGestureAudioUnlock(): () => void {
  const unlock = () => {
    const audio = getUnlockedAudioContext();
    const buf = audio.createBuffer(1, 1, 22050);
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(audio.destination);
    src.start(0);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}`,
  },
];

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir IndexedDB.'));
  });
}

function readFallback(): VaultSnippet[] {
  try {
    const raw = localStorage.getItem(FALLBACK_LS_KEY);
    if (!raw) return [...DEFAULT_SNIPPETS];
    const parsed = JSON.parse(raw) as VaultSnippet[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_SNIPPETS];
  } catch {
    return [...DEFAULT_SNIPPETS];
  }
}

function writeFallback(snippets: VaultSnippet[]): void {
  try {
    localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(snippets));
  } catch {
    // Ignore storage quota errors
  }
}

export async function listVaultSnippets(): Promise<VaultSnippet[]> {
  if (!isIndexedDbAvailable()) {
    return sortSnippets(readFallback());
  }

  try {
    const db = await openVaultDb();
    const items = await new Promise<VaultSnippet[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as VaultSnippet[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    if (items.length === 0) {
      await seedDefaultSnippets(db);
      db.close();
      return sortSnippets([...DEFAULT_SNIPPETS]);
    }
    db.close();
    return sortSnippets(items);
  } catch {
    return sortSnippets(readFallback());
  }
}

async function seedDefaultSnippets(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const s of DEFAULT_SNIPPETS) {
      store.put(s);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function sortSnippets(list: VaultSnippet[]): VaultSnippet[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function upsertVaultSnippet(snippet: VaultSnippet): Promise<VaultSnippet[]> {
  const stamped: VaultSnippet = {
    ...snippet,
    updatedAt: Date.now(),
    createdAt: snippet.createdAt || Date.now(),
  };

  if (!isIndexedDbAvailable()) {
    const current = readFallback();
    const idx = current.findIndex((s) => s.id === stamped.id);
    if (idx >= 0) current[idx] = stamped;
    else current.push(stamped);
    writeFallback(current);
    return sortSnippets(current);
  }

  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(stamped);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return listVaultSnippets();
  } catch {
    const current = readFallback();
    const idx = current.findIndex((s) => s.id === stamped.id);
    if (idx >= 0) current[idx] = stamped;
    else current.push(stamped);
    writeFallback(current);
    return sortSnippets(current);
  }
}

export async function deleteVaultSnippet(id: string): Promise<VaultSnippet[]> {
  if (!isIndexedDbAvailable()) {
    const next = readFallback().filter((s) => s.id !== id);
    writeFallback(next);
    return sortSnippets(next);
  }

  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const dbItems = await listVaultSnippetsRaw();
    return sortSnippets(dbItems);
  } catch {
    const next = readFallback().filter((s) => s.id !== id);
    writeFallback(next);
    return sortSnippets(next);
  }
}

async function listVaultSnippetsRaw(): Promise<VaultSnippet[]> {
  const db = await openVaultDb();
  const items = await new Promise<VaultSnippet[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as VaultSnippet[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

export async function restoreDefaultSnippets(): Promise<VaultSnippet[]> {
  if (!isIndexedDbAvailable()) {
    const current = readFallback();
    const byId = new Map(current.map((s) => [s.id, s]));
    for (const def of DEFAULT_SNIPPETS) byId.set(def.id, def);
    const merged = Array.from(byId.values());
    writeFallback(merged);
    return sortSnippets(merged);
  }
  const db = await openVaultDb();
  await seedDefaultSnippets(db);
  db.close();
  return listVaultSnippets();
}

export function loadCustomSfxPresets(): SfxParams[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SFX_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SfxParams[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomSfxPreset(preset: SfxParams): SfxParams[] {
  const current = loadCustomSfxPresets();
  const stamped: SfxParams = {
    ...preset,
    id: preset.id || `custom-sfx-${Date.now()}`,
  };
  const idx = current.findIndex((p) => p.id === stamped.id);
  if (idx >= 0) current[idx] = stamped;
  else current.unshift(stamped);
  try {
    localStorage.setItem(CUSTOM_SFX_LS_KEY, JSON.stringify(current));
  } catch {
    // Ignore
  }
  return current;
}

export function deleteCustomSfxPreset(id: string): SfxParams[] {
  const next = loadCustomSfxPresets().filter((p) => p.id !== id);
  try {
    localStorage.setItem(CUSTOM_SFX_LS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

/** Export complete Arena//Forge backup (IndexedDB Snippet Vault + custom SFX presets) as JSON. */
export async function exportArenaForgeBackupJson(): Promise<string> {
  const snippets = await listVaultSnippets();
  const customSfxPresets = loadCustomSfxPresets();
  const payload: ArenaForgeBackupPayload = {
    schema: 'arena-forge-backup-v1',
    exportedAt: new Date().toISOString(),
    snippets,
    customSfxPresets,
  };
  return JSON.stringify(payload, null, 2);
}

/** Validate & import a JSON backup (supports full Arena//Forge envelope or plain VaultSnippet[] array). */
export async function importArenaForgeBackupJson(
  jsonText: string,
  mode: 'merge' | 'replace' = 'merge'
): Promise<{ importedSnippets: number; importedSfx: number; snippets: VaultSnippet[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('JSON inválido: verifique o arquivo selecionado.');
  }

  let incomingSnippets: VaultSnippet[] = [];
  let incomingSfx: SfxParams[] = [];

  if (Array.isArray(parsed)) {
    incomingSnippets = parsed as VaultSnippet[];
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Partial<ArenaForgeBackupPayload>;
    if (Array.isArray(obj.snippets)) incomingSnippets = obj.snippets;
    if (Array.isArray(obj.customSfxPresets)) incomingSfx = obj.customSfxPresets;
  }

  const validSnippets = incomingSnippets
    .filter((s) => s && typeof s.title === 'string' && typeof s.code === 'string')
    .map((s, idx) => ({
      id: typeof s.id === 'string' && s.id ? s.id : `imported-${Date.now()}-${idx}`,
      title: s.title,
      category: (s.category as SnippetCategory) || 'Custom',
      language: s.language || 'ts',
      tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
      description: typeof s.description === 'string' ? s.description : '',
      code: s.code,
      pinned: Boolean(s.pinned),
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
      updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
    }));

  if (validSnippets.length === 0 && incomingSfx.length === 0) {
    throw new Error('Nenhum snippet ou preset válido encontrado no JSON.');
  }

  if (isIndexedDbAvailable()) {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (mode === 'replace') store.clear();
      for (const s of validSnippets) store.put(s);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } else {
    const base = mode === 'replace' ? [] : readFallback();
    const byId = new Map(base.map((s) => [s.id, s]));
    for (const s of validSnippets) byId.set(s.id, s);
    writeFallback(Array.from(byId.values()));
  }

  if (incomingSfx.length > 0) {
    const baseSfx = mode === 'replace' ? [] : loadCustomSfxPresets();
    const sfxMap = new Map(baseSfx.map((p) => [p.id || p.name, p]));
    for (const p of incomingSfx) {
      if (p && typeof p.name === 'string') {
        sfxMap.set(p.id || p.name, p);
      }
    }
    try {
      localStorage.setItem(CUSTOM_SFX_LS_KEY, JSON.stringify(Array.from(sfxMap.values())));
    } catch {
      // Ignore
    }
  }

  const finalSnippets = await listVaultSnippets();
  return {
    importedSnippets: validSnippets.length,
    importedSfx: incomingSfx.length,
    snippets: finalSnippets,
  };
}
