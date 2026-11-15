import QRCode from 'qrcode';
import jsQR from 'jsqr';

export type BridgeConnectionState =
  | 'idle'
  | 'gathering'
  | 'waiting-answer'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error';

export type BridgePayloadKind = 'text' | 'code' | 'markdown' | 'image' | 'json';

export interface BridgeTransferItem {
  id: string;
  direction: 'sent' | 'received';
  kind: BridgePayloadKind;
  title: string;
  mimeType: string;
  text?: string;
  dataUrl?: string;
  byteSize: number;
  timestamp: number;
}

export interface SignalingEnvelope {
  t: 'offer' | 'answer';
  sdp: string;
}

export interface DirectQrEnvelope {
  kind: BridgePayloadKind;
  title: string;
  text: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Compress UTF-8 string into compact URL-safe token (AFZ1: = deflate-raw, AFU1: = plain base64url). */
export async function compressCompactToken(raw: string): Promise<string> {
  const inputBytes = new TextEncoder().encode(raw);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      await writer.write(inputBytes);
      await writer.close();
      const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      if (compressed.length < inputBytes.length) {
        return `AFZ1:${bytesToBase64Url(compressed)}`;
      }
    } catch {
      // Fall back to plain base64url
    }
  }
  return `AFU1:${bytesToBase64Url(inputBytes)}`;
}

/** Decompress a compact token produced by compressCompactToken. */
export async function decompressCompactToken(token: string): Promise<string> {
  const trimmed = token.trim();
  if (trimmed.startsWith('AFZ1:')) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não suporta DecompressionStream para decodificar o código.');
    }
    const bytes = base64UrlToBytes(trimmed.slice(5));
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    await writer.write(bytes as BufferSource);
    await writer.close();
    const out = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    return new TextDecoder().decode(out);
  }
  if (trimmed.startsWith('AFU1:')) {
    const bytes = base64UrlToBytes(trimmed.slice(5));
    return new TextDecoder().decode(bytes);
  }
  return trimmed;
}

/** Strip redundant SDP attributes to keep WebRTC QR codes small and fast to scan. */
export function minifySdp(sdp: string): string {
  const lines = sdp
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.trim()) return false;
      // Keep essential session, ICE, DTLS, SCTP, and host/srflx candidates
      if (line.startsWith('a=extmap-allow-mixed')) return false;
      if (line.startsWith('a=msid-semantic')) return false;
      return true;
    });
  return lines.join('\r\n') + '\r\n';
}

export async function encodeSignalEnvelope(env: SignalingEnvelope): Promise<string> {
  const json = JSON.stringify({ t: env.t, sdp: minifySdp(env.sdp) });
  return `SIG:${await compressCompactToken(json)}`;
}

export async function decodeSignalEnvelope(code: string): Promise<SignalingEnvelope> {
  const trimmed = code.trim();
  const body = trimmed.startsWith('SIG:') ? trimmed.slice(4) : trimmed;
  const decoded = await decompressCompactToken(body);
  const parsed = JSON.parse(decoded) as Partial<SignalingEnvelope>;
  if ((parsed.t !== 'offer' && parsed.t !== 'answer') || typeof parsed.sdp !== 'string') {
    throw new Error('Código de sinalização WebRTC inválido.');
  }
  return { t: parsed.t, sdp: parsed.sdp };
}

export async function encodeDirectQrPayload(payload: DirectQrEnvelope): Promise<string> {
  const json = JSON.stringify(payload);
  return `PAY:${await compressCompactToken(json)}`;
}

export async function decodeScannedQrContent(
  raw: string
): Promise<
  | { mode: 'signal'; envelope: SignalingEnvelope }
  | { mode: 'payload'; payload: DirectQrEnvelope }
  | { mode: 'raw'; text: string }
> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('SIG:')) {
    return { mode: 'signal', envelope: await decodeSignalEnvelope(trimmed) };
  }
  if (trimmed.startsWith('PAY:')) {
    const json = await decompressCompactToken(trimmed.slice(4));
    const parsed = JSON.parse(json) as Partial<DirectQrEnvelope>;
    if (typeof parsed.text === 'string') {
      return {
        mode: 'payload',
        payload: {
          kind: parsed.kind ?? 'text',
          title: parsed.title ?? 'Payload QR',
          text: parsed.text,
        },
      };
    }
  }
  return { mode: 'raw', text: trimmed };
}

/** Generate high-contrast offline QR code DataURL suitable for dark UI & camera scanning. */
export async function generateQrCodeDataUrl(
  data: string,
  width = 300
): Promise<string> {
  return QRCode.toDataURL(data, {
    width,
    margin: 2,
    errorCorrectionLevel: data.length > 900 ? 'L' : 'M',
    color: {
      dark: '#06090e',
      light: '#f8fafc',
    },
  });
}

/** Decode QR code from a Canvas image using native BarcodeDetector or jsQR fallback. */
export async function decodeQrFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  if (typeof BarcodeDetector !== 'undefined') {
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const results = await detector.detect(canvas);
      if (results.length > 0 && results[0].rawValue) {
        return results[0].rawValue;
      }
    } catch {
      // Fallback to jsQR
    }
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const found = jsQR(imgData.data, imgData.width, imgData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return found?.data ?? null;
}

/** Decode a QR code from an uploaded screenshot / image file. */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Imagem inválida.'));
      el.src = url;
    });
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(16, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(16, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await decodeQrFromCanvas(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface WireMetaPacket {
  __af: 'meta';
  id: string;
  kind: BridgePayloadKind;
  title: string;
  mimeType: string;
  byteSize: number;
  totalChunks: number;
  isBinary: boolean;
}

interface WireChunkPacket {
  __af: 'chunk';
  id: string;
  seq: number;
  data: string;
}

interface WireDonePacket {
  __af: 'done';
  id: string;
}

type WirePacket = WireMetaPacket | WireChunkPacket | WireDonePacket;

export interface BridgeCallbacks {
  onStateChange: (state: BridgeConnectionState, detail?: string) => void;
  onItemReceived: (item: BridgeTransferItem) => void;
  onProgress?: (percent: number, label: string) => void;
}

const CHUNK_CHAR_SIZE = 14_000;
const LOCAL_SIGNAL_CHANNEL = 'arena-forge-webrtc-local-signal-v1';

/** Direct WebRTC DataChannel peer bridge supporting manual QR/text signaling & BroadcastChannel local pairing. */
export class WebRtcQrBridge {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private callbacks: BridgeCallbacks;
  private incoming = new Map<
    string,
    { meta: WireMetaPacket; chunks: string[]; received: number }
  >();
  private broadcast: BroadcastChannel | null = null;
  private localPeerId = `peer-${Math.random().toString(36).slice(2, 8)}`;

  constructor(callbacks: BridgeCallbacks) {
    this.callbacks = callbacks;
  }

  private createPeerConnection(usePublicStun: boolean): RTCPeerConnection {
    this.disposePeerOnly();
    const iceServers: RTCIceServer[] = usePublicStun
      ? [{ urls: 'stun:stun.l.google.com:19302' }]
      : [];
    const pc = new RTCPeerConnection({ iceServers });

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') {
        if (this.dc?.readyState === 'open') {
          this.callbacks.onStateChange('connected', 'Canal WebRTC P2P ativo');
        }
      } else if (s === 'disconnected' || s === 'failed') {
        this.callbacks.onStateChange('error', `ICE ${s} — verifique se ambos estão na mesma rede.`);
      } else if (s === 'closed') {
        this.callbacks.onStateChange('closed', 'Conexão encerrada.');
      }
    };

    pc.ondatachannel = (ev) => {
      this.bindDataChannel(ev.channel);
    };

    this.pc = pc;
    return pc;
  }

  private bindDataChannel(channel: RTCDataChannel): void {
    this.dc = channel;
    channel.onopen = () => {
      this.callbacks.onStateChange('connected', 'DataChannel P2P pronto para envio');
    };
    channel.onclose = () => {
      this.callbacks.onStateChange('closed', 'Canal P2P fechado');
    };
    channel.onerror = () => {
      this.callbacks.onStateChange('error', 'Erro no canal de dados WebRTC');
    };
    channel.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        this.handleWireMessage(ev.data);
      }
    };
  }

  private handleWireMessage(raw: string): void {
    try {
      const pkt = JSON.parse(raw) as WirePacket;
      if (pkt.__af === 'meta') {
        this.incoming.set(pkt.id, {
          meta: pkt,
          chunks: new Array<string>(pkt.totalChunks),
          received: 0,
        });
        this.callbacks.onProgress?.(5, `Recebendo ${pkt.title}...`);
      } else if (pkt.__af === 'chunk') {
        const entry = this.incoming.get(pkt.id);
        if (!entry) return;
        entry.chunks[pkt.seq] = pkt.data;
        entry.received++;
        const pct = Math.min(99, Math.round((entry.received / entry.meta.totalChunks) * 100));
        this.callbacks.onProgress?.(pct, `Recebendo ${entry.meta.title} (${pct}%)`);
      } else if (pkt.__af === 'done') {
        const entry = this.incoming.get(pkt.id);
        if (!entry) return;
        const full = entry.chunks.join('');
        this.incoming.delete(pkt.id);
        this.callbacks.onProgress?.(100, `Recebido: ${entry.meta.title}`);

        const item: BridgeTransferItem = {
          id: entry.meta.id,
          direction: 'received',
          kind: entry.meta.kind,
          title: entry.meta.title,
          mimeType: entry.meta.mimeType,
          byteSize: entry.meta.byteSize,
          timestamp: Date.now(),
          ...(entry.meta.isBinary ? { dataUrl: full } : { text: full }),
        };
        this.callbacks.onItemReceived(item);
      }
    } catch {
      // Ignore malformed wire packet
    }
  }

  private waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 2600): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pc.removeEventListener('icegatheringstatechange', onState);
        pc.removeEventListener('icecandidate', onCand);
        window.clearTimeout(timer);
        resolve();
      };
      const onState = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      const onCand = (ev: RTCPeerConnectionIceEvent) => {
        if (!ev.candidate) finish();
      };
      const timer = window.setTimeout(finish, timeoutMs);
      pc.addEventListener('icegatheringstatechange', onState);
      pc.addEventListener('icecandidate', onCand);
    });
  }

  /** Step 1 (Host): Create Offer + ICE candidates encoded as compact signal string. */
  async createOfferSignal(usePublicStun = false): Promise<string> {
    this.callbacks.onStateChange('gathering', 'Coletando candidatos ICE locais...');
    const pc = this.createPeerConnection(usePublicStun);
    const dc = pc.createDataChannel('arena-forge-p2p', { ordered: true });
    this.bindDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIceGathering(pc);

    if (!pc.localDescription?.sdp) {
      throw new Error('Falha ao gerar SDP da Oferta.');
    }

    const token = await encodeSignalEnvelope({ t: 'offer', sdp: pc.localDescription.sdp });
    this.callbacks.onStateChange('waiting-answer', 'Aguardando código/QR de Resposta do outro dispositivo');
    return token;
  }

  /** Step 2 (Peer): Accept Host Offer and generate Answer signal string. */
  async acceptOfferAndCreateAnswer(offerToken: string, usePublicStun = false): Promise<string> {
    const env = await decodeSignalEnvelope(offerToken);
    if (env.t !== 'offer') {
      throw new Error('O código fornecido não é uma Oferta P2P.');
    }

    this.callbacks.onStateChange('gathering', 'Processando Oferta e gerando Resposta ICE...');
    const pc = this.createPeerConnection(usePublicStun);
    await pc.setRemoteDescription({ type: 'offer', sdp: env.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIceGathering(pc);

    if (!pc.localDescription?.sdp) {
      throw new Error('Falha ao gerar SDP da Resposta.');
    }

    const token = await encodeSignalEnvelope({ t: 'answer', sdp: pc.localDescription.sdp });
    this.callbacks.onStateChange('connecting', 'Resposta gerada — escaneie no Dispositivo Host');
    return token;
  }

  /** Step 3 (Host): Accept Peer Answer to open WebRTC DataChannel. */
  async acceptAnswerSignal(answerToken: string): Promise<void> {
    if (!this.pc) {
      throw new Error('Crie uma Oferta P2P antes de aplicar a Resposta.');
    }
    const env = await decodeSignalEnvelope(answerToken);
    if (env.t !== 'answer') {
      throw new Error('O código fornecido não é uma Resposta P2P.');
    }
    this.callbacks.onStateChange('connecting', 'Estabelecendo túnel WebRTC DataChannel...');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: env.sdp });
  }

  /** Local same-browser tab signaling via BroadcastChannel for instant zero-scan testing. */
  startLocalTabPairing(): void {
    this.stopLocalChannel();
    if (typeof BroadcastChannel === 'undefined') {
      this.callbacks.onStateChange('error', 'BroadcastChannel indisponível neste navegador.');
      return;
    }

    const ch = new BroadcastChannel(LOCAL_SIGNAL_CHANNEL);
    this.broadcast = ch;
    this.callbacks.onStateChange('gathering', 'Procurando outra aba ARENA//FORGE aberta...');

    ch.onmessage = async (ev: MessageEvent) => {
      const msg = ev.data as { from?: string; type?: string; token?: string };
      if (!msg || msg.from === this.localPeerId) return;

      try {
        if (msg.type === 'hello') {
          const offerToken = await this.createOfferSignal(false);
          ch.postMessage({ from: this.localPeerId, type: 'offer', token: offerToken });
        } else if (msg.type === 'offer' && msg.token) {
          const answerToken = await this.acceptOfferAndCreateAnswer(msg.token, false);
          ch.postMessage({ from: this.localPeerId, type: 'answer', token: answerToken });
        } else if (msg.type === 'answer' && msg.token) {
          await this.acceptAnswerSignal(msg.token);
        }
      } catch (err) {
        this.callbacks.onStateChange(
          'error',
          err instanceof Error ? err.message : 'Erro no pareamento local.'
        );
      }
    };

    ch.postMessage({ from: this.localPeerId, type: 'hello' });
  }

  isConnected(): boolean {
    return this.dc?.readyState === 'open';
  }

  /** Send text, code, Markdown, JSON, or DataURL binary payload in reliable chunks over WebRTC. */
  async sendPayload(params: {
    kind: BridgePayloadKind;
    title: string;
    mimeType: string;
    content: string;
    isBinary?: boolean;
  }): Promise<BridgeTransferItem> {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('Canal P2P não conectado. Realize o pareamento primeiro.');
    }

    const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const content = params.content;
    const totalChunks = Math.max(1, Math.ceil(content.length / CHUNK_CHAR_SIZE));
    const byteSize = new TextEncoder().encode(content).length;

    const meta: WireMetaPacket = {
      __af: 'meta',
      id,
      kind: params.kind,
      title: params.title,
      mimeType: params.mimeType,
      byteSize,
      totalChunks,
      isBinary: Boolean(params.isBinary),
    };

    this.dc.send(JSON.stringify(meta));

    for (let seq = 0; seq < totalChunks; seq++) {
      // Backpressure guard for large storyboards
      while (this.dc.bufferedAmount > 512_000) {
        await new Promise((r) => window.setTimeout(r, 25));
      }
      const slice = content.slice(seq * CHUNK_CHAR_SIZE, (seq + 1) * CHUNK_CHAR_SIZE);
      const pkt: WireChunkPacket = { __af: 'chunk', id, seq, data: slice };
      this.dc.send(JSON.stringify(pkt));
      const pct = Math.min(99, Math.round(((seq + 1) / totalChunks) * 100));
      this.callbacks.onProgress?.(pct, `Enviando ${params.title} (${pct}%)`);
    }

    const donePkt: WireDonePacket = { __af: 'done', id };
    this.dc.send(JSON.stringify(donePkt));
    this.callbacks.onProgress?.(100, `Enviado: ${params.title}`);

    return {
      id,
      direction: 'sent',
      kind: params.kind,
      title: params.title,
      mimeType: params.mimeType,
      byteSize,
      timestamp: Date.now(),
      ...(params.isBinary ? { dataUrl: content } : { text: content }),
    };
  }

  private stopLocalChannel(): void {
    if (this.broadcast) {
      this.broadcast.close();
      this.broadcast = null;
    }
  }

  private disposePeerOnly(): void {
    if (this.dc) {
      try {
        this.dc.close();
      } catch {
        // Ignore
      }
      this.dc = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // Ignore
      }
      this.pc = null;
    }
    this.incoming.clear();
  }

  close(): void {
    this.stopLocalChannel();
    this.disposePeerOnly();
    this.callbacks.onStateChange('idle', 'Desconectado');
  }
}
