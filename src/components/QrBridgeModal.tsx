import { useEffect, useRef, useState } from 'react';
import {
  QrCode,
  Radio,
  Camera,
  Copy,
  Send,
  Download,
  Upload,
  Link2,
  Unlink2,
  BookmarkPlus,
  X,
  Check,
  Wifi,
  Smartphone,
} from 'lucide-react';
import {
  WebRtcQrBridge,
  decodeQrFromCanvas,
  decodeQrFromImageFile,
  decodeScannedQrContent,
  encodeDirectQrPayload,
  generateQrCodeDataUrl,
  type BridgeConnectionState,
  type BridgePayloadKind,
  type BridgeTransferItem,
} from '../transfer/qrBridge';
import { formatBytes } from '../vision/videoStoryboarder';
import { copyToClipboard, triggerTextDownload } from '../utils/ioHelpers';

export interface OutgoingBridgeDraft {
  title: string;
  kind: BridgePayloadKind;
  mimeType: string;
  content: string;
  isBinary?: boolean;
}

interface QrBridgeViewProps {
  draft: OutgoingBridgeDraft | null;
  onClearDraft: () => void;
  bridgeState: BridgeConnectionState;
  bridgeDetail: string;
  bridgeRef: React.MutableRefObject<WebRtcQrBridge | null>;
  transfers: BridgeTransferItem[];
  onAppendTransfer: (item: BridgeTransferItem) => void;
  transferProgress: { percent: number; label: string } | null;
  onNotify: (message: string, tone?: 'success' | 'warning' | 'info' | 'bridge') => void;
  onSaveToVault: (title: string, code: string) => void;
}

type BridgeTab = 'webrtc' | 'direct-qr' | 'scanner';

export function QrBridgeView({
  draft,
  onClearDraft,
  bridgeState,
  bridgeDetail,
  bridgeRef,
  transfers,
  onAppendTransfer,
  transferProgress,
  onNotify,
  onSaveToVault,
}: QrBridgeViewProps) {
  const [mode, setMode] = useState<BridgeTab>('webrtc');
  const [usePublicStun, setUsePublicStun] = useState<boolean>(false);

  // WebRTC manual signaling UI state
  const [localSignalCode, setLocalSignalCode] = useState<string>('');
  const [localSignalQrUrl, setLocalSignalQrUrl] = useState<string>('');
  const [localSignalLabel, setLocalSignalLabel] = useState<string>('');
  const [remoteSignalInput, setRemoteSignalInput] = useState<string>('');
  const [isBusySignal, setIsBusySignal] = useState<boolean>(false);

  // Direct QR payload state
  const [directTitle, setDirectTitle] = useState<string>('Prompt / Código Rápido');
  const [directText, setDirectText] = useState<string>(
    'Crie um componente HUD tático escuro em React + Tailwind com 100dvh.'
  );
  const [directQrUrl, setDirectQrUrl] = useState<string>('');
  const [directQrError, setDirectQrError] = useState<string>('');

  // Quick P2P send composer
  const [p2pTitle, setP2pTitle] = useState<string>('');
  const [p2pText, setP2pText] = useState<string>('');
  const [copiedTransferId, setCopiedTransferId] = useState<string | null>(null);

  // Camera scanner state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [scannerStatus, setScannerStatus] = useState<string>(
    'Aponte a câmera para um QR Code ARENA//FORGE ou carregue uma imagem.'
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const qrImgInputRef = useRef<HTMLInputElement | null>(null);
  const p2pFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync incoming draft from any tool (SFX, Sprite, Storyboard, UI Inspector, Context)
  useEffect(() => {
    if (!draft) return;
    setP2pTitle(draft.title);
    if (!draft.isBinary) {
      setP2pText(draft.content);
      setDirectTitle(draft.title);
      setDirectText(draft.content);
    }
  }, [draft]);

  // Render QR code for signaling token automatically
  useEffect(() => {
    if (!localSignalCode) {
      setLocalSignalQrUrl('');
      return;
    }
    let cancelled = false;
    generateQrCodeDataUrl(localSignalCode, 300)
      .then((url) => {
        if (!cancelled) setLocalSignalQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLocalSignalQrUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [localSignalCode]);

  // Render Direct QR Code live
  useEffect(() => {
    if (mode !== 'direct-qr') return;
    if (!directText.trim()) {
      setDirectQrUrl('');
      setDirectQrError('');
      return;
    }
    let cancelled = false;
    encodeDirectQrPayload({
      kind: 'text',
      title: directTitle.trim() || 'Payload QR',
      text: directText,
    })
      .then((encoded) => {
        if (encoded.length > 2600) {
          if (!cancelled) {
            setDirectQrUrl('');
            setDirectQrError(
              `Texto muito grande para QR único (${encoded.length} chars compactados). Use a aba WebRTC DataChannel para transferências ilimitadas!`
            );
          }
          return;
        }
        setDirectQrError('');
        return generateQrCodeDataUrl(encoded, 300).then((url) => {
          if (!cancelled) setDirectQrUrl(url);
        });
      })
      .catch(() => {
        if (!cancelled) setDirectQrError('Não foi possível gerar o QR Code.');
      });
    return () => {
      cancelled = true;
    };
  }, [mode, directTitle, directText]);

  // Stop camera cleanly on unmount or tab switch
  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (mode !== 'scanner') stopCamera();
    return () => stopCamera();
  }, [mode]);

  const handleCreateOffer = async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setIsBusySignal(true);
    try {
      const code = await bridge.createOfferSignal(usePublicStun);
      setLocalSignalCode(code);
      setLocalSignalLabel('OFERTA P2P (Mostre no Dispositivo B)');
      onNotify('Oferta WebRTC gerada! Escaneie o QR ou copie o código no outro dispositivo.', 'bridge');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao criar Oferta WebRTC.', 'warning');
    } finally {
      setIsBusySignal(false);
    }
  };

  const handleApplyRemoteSignal = async (codeOverride?: string) => {
    const bridge = bridgeRef.current;
    const raw = (codeOverride ?? remoteSignalInput).trim();
    if (!bridge || !raw) {
      onNotify('Cole ou escaneie um código de Oferta ou Resposta primeiro.', 'warning');
      return;
    }

    setIsBusySignal(true);
    try {
      const parsed = await decodeScannedQrContent(raw);
      if (parsed.mode === 'signal') {
        if (parsed.envelope.t === 'offer') {
          const answerCode = await bridge.acceptOfferAndCreateAnswer(raw, usePublicStun);
          setLocalSignalCode(answerCode);
          setLocalSignalLabel('RESPOSTA P2P (Escaneie de volta no Host)');
          setRemoteSignalInput('');
          onNotify('Resposta gerada! Escaneie este QR no dispositivo Host para conectar.', 'bridge');
        } else {
          await bridge.acceptAnswerSignal(raw);
          setRemoteSignalInput('');
          onNotify('Resposta aplicada! Conectando DataChannel P2P...', 'success');
        }
      } else {
        onNotify('O código não contém sinalização WebRTC (SIG:).', 'warning');
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Código de sinalização inválido.', 'warning');
    } finally {
      setIsBusySignal(false);
    }
  };

  const handleScannedRawText = async (raw: string) => {
    stopCamera();
    try {
      const decoded = await decodeScannedQrContent(raw);
      if (decoded.mode === 'signal') {
        setMode('webrtc');
        setRemoteSignalInput(raw);
        await handleApplyRemoteSignal(raw);
      } else if (decoded.mode === 'payload') {
        const item: BridgeTransferItem = {
          id: `qr-${Date.now()}`,
          direction: 'received',
          kind: decoded.payload.kind,
          title: decoded.payload.title,
          mimeType: 'text/plain',
          text: decoded.payload.text,
          byteSize: new TextEncoder().encode(decoded.payload.text).length,
          timestamp: Date.now(),
        };
        onAppendTransfer(item);
        setMode('webrtc');
        onNotify(`QR lido com sucesso: "${item.title}"`, 'success');
      } else {
        const item: BridgeTransferItem = {
          id: `qr-raw-${Date.now()}`,
          direction: 'received',
          kind: 'text',
          title: 'QR Code Lido',
          mimeType: 'text/plain',
          text: decoded.text,
          byteSize: new TextEncoder().encode(decoded.text).length,
          timestamp: Date.now(),
        };
        onAppendTransfer(item);
        setMode('webrtc');
        onNotify('QR Code lido e salvo no histórico da Ponte.', 'success');
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Falha ao processar QR lido.', 'warning');
    }
  };

  const startCameraScanner = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerStatus('Câmera não disponível neste navegador. Use "Ler QR de Imagem".');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setScannerStatus('Escaneando QR Code ao vivo...');

      window.setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();

        let lastScan = 0;
        const tick = async (ts: number) => {
          if (!streamRef.current) return;
          if (ts - lastScan > 220 && video.readyState >= 2) {
            lastScan = ts;
            const canvas = scanCanvasRef.current;
            if (canvas) {
              canvas.width = video.videoWidth || 480;
              canvas.height = video.videoHeight || 480;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const found = await decodeQrFromCanvas(canvas);
                if (found) {
                  void handleScannedRawText(found);
                  return;
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }, 60);
    } catch {
      setScannerStatus('Permissão de câmera negada ou indisponível. Carregue uma imagem de QR abaixo.');
    }
  };

  const handleDecodeQrImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await decodeQrFromImageFile(file);
      if (text) {
        await handleScannedRawText(text);
      } else {
        onNotify('Nenhum QR Code encontrado nessa imagem.', 'warning');
      }
    } catch {
      onNotify('Falha ao ler QR da imagem.', 'warning');
    }
  };

  const handleSendDraftOverP2P = async () => {
    const bridge = bridgeRef.current;
    if (!bridge || !bridge.isConnected()) {
      onNotify('Conecte o túnel WebRTC P2P antes de enviar (ou use QR Direto para textos curtos).', 'warning');
      return;
    }

    try {
      if (draft) {
        const sent = await bridge.sendPayload({
          kind: draft.kind,
          title: draft.title,
          mimeType: draft.mimeType,
          content: draft.content,
          isBinary: draft.isBinary,
        });
        onAppendTransfer(sent);
        onClearDraft();
        onNotify(`"${draft.title}" enviado via WebRTC DataChannel!`, 'bridge');
        return;
      }

      if (!p2pText.trim()) {
        onNotify('Digite um prompt/código ou anexe uma imagem para enviar.', 'warning');
        return;
      }
      const sent = await bridge.sendPayload({
        kind: 'text',
        title: p2pTitle.trim() || 'Mensagem P2P',
        mimeType: 'text/plain',
        content: p2pText,
        isBinary: false,
      });
      onAppendTransfer(sent);
      setP2pText('');
      onNotify('Enviado pelo canal P2P!', 'bridge');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro no envio WebRTC.', 'warning');
    }
  };

  const handleSendFileOverP2P = async (file: File | undefined) => {
    if (!file) return;
    const bridge = bridgeRef.current;
    if (!bridge || !bridge.isConnected()) {
      onNotify('Conecte a Ponte WebRTC primeiro para transferir arquivos.', 'warning');
      return;
    }
    const isImage = file.type.startsWith('image/');
    try {
      const content = isImage
        ? await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = rej;
            r.readAsDataURL(file);
          })
        : await file.text();

      const sent = await bridge.sendPayload({
        kind: isImage ? 'image' : file.name.endsWith('.json') ? 'json' : 'code',
        title: file.name,
        mimeType: file.type || 'text/plain',
        content,
        isBinary: isImage,
      });
      onAppendTransfer(sent);
      onNotify(`Arquivo "${file.name}" enviado via WebRTC!`, 'bridge');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao enviar arquivo.', 'warning');
    }
  };

  const isConnected = bridgeState === 'connected';

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-300">
              MOD-04
            </span>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100 sm:text-base">
              Ponte Celular ↔ PC · QR Code &amp; WebRTC DataChannel
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Envie prompts, códigos gerados e storyboards WebP direto entre celular e PC sem servidor em nuvem.
          </p>
        </div>

        {/* Status Pill */}
        <div
          className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-xs ${
            isConnected
              ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
              : bridgeState === 'error'
                ? 'border-rose-400/50 bg-rose-500/15 text-rose-200'
                : 'border-[#24364b] bg-[#0c131d] text-slate-300'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected
                ? 'animate-pulse bg-emerald-400'
                : bridgeState === 'gathering' || bridgeState === 'connecting'
                  ? 'animate-pulse bg-amber-400'
                  : bridgeState === 'error'
                    ? 'bg-rose-400'
                    : 'bg-slate-500'
            }`}
          />
          <span>{bridgeDetail || 'Aguardando pareamento P2P'}</span>
        </div>
      </div>

      {/* Queued Asset Banner from another studio tab */}
      {draft && (
        <div className="tactical-panel flex flex-wrap items-center justify-between gap-2 border-cyan-400/50 bg-cyan-500/10 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            {draft.isBinary && draft.kind === 'image' ? (
              <img
                src={draft.content}
                alt={draft.title}
                className="h-10 w-14 rounded border border-cyan-400/40 object-cover"
              />
            ) : (
              <Smartphone className="h-5 w-5 text-cyan-300" />
            )}
            <div>
              <div className="font-mono text-xs font-bold text-cyan-100">
                Asset na Fila: {draft.title}
              </div>
              <div className="font-mono text-[10.5px] text-cyan-300/80">
                {draft.kind.toUpperCase()} · {formatBytes(new TextEncoder().encode(draft.content).length)}
                {draft.isBinary ? ' · Requer túnel WebRTC P2P conectado' : ' · Pronto para WebRTC ou QR Direto'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isConnected && (
              <button
                type="button"
                onClick={() => void handleSendDraftOverP2P()}
                className="inline-flex items-center gap-1.5 rounded border border-emerald-400 bg-emerald-400 px-3 py-1.5 font-mono text-xs font-bold text-[#04140d]"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Enviar Agora</span>
              </button>
            )}
            {!draft.isBinary && (
              <button
                type="button"
                onClick={() => setMode('direct-qr')}
                className="inline-flex items-center gap-1 rounded border border-cyan-400/50 bg-[#0b1520] px-2.5 py-1.5 font-mono text-[11px] text-cyan-200"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>Gerar QR Direto</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClearDraft}
              className="rounded p-1.5 text-slate-400 hover:bg-black/30 hover:text-white"
              title="Descartar fila"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mode Selector */}
      <div className="grid grid-cols-3 gap-1.5 rounded border border-[#1f2e40] bg-[#0a0f17] p-1">
        {(
          [
            { id: 'webrtc', label: 'WebRTC P2P', icon: Radio },
            { id: 'direct-qr', label: 'QR Direto', icon: QrCode },
            { id: 'scanner', label: 'Leitor QR', icon: Camera },
          ] as Array<{ id: BridgeTab; label: string; icon: typeof Radio }>
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded py-2 font-mono text-xs font-semibold transition ${
                mode === t.id
                  ? 'bg-cyan-400/20 text-cyan-200 ring-1 ring-cyan-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: Active Bridge Mode Panel */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          {mode === 'webrtc' && (
            <>
              {/* Pairing Controls */}
              <div className="tactical-panel flex flex-col gap-3 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    1. Pareamento WebRTC DataChannel (Sem Nuvem)
                  </span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[10.5px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={usePublicStun}
                      onChange={(e) => setUsePublicStun(e.target.checked)}
                      className="accent-cyan-400"
                    />
                    <span>Usar STUN (redes diferentes)</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusySignal}
                    onClick={() => void handleCreateOffer()}
                    className="inline-flex items-center gap-1.5 rounded border border-cyan-400/60 bg-cyan-400 px-3 py-1.5 font-mono text-xs font-bold text-[#051017] transition hover:bg-cyan-300 disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Criar Oferta P2P (Host)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('scanner')}
                    className="inline-flex items-center gap-1.5 rounded border border-amber-400/45 bg-amber-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Escanear QR do Outro Dispositivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => bridgeRef.current?.startLocalTabPairing()}
                    className="inline-flex items-center gap-1.5 rounded border border-[#2a3f57] bg-[#131e2c] px-2.5 py-1.5 font-mono text-[11px] text-slate-200 hover:bg-[#1a293c]"
                    title="Pareia automaticamente com outra aba aberta neste mesmo navegador via BroadcastChannel"
                  >
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Parear Aba Local</span>
                  </button>

                  {bridgeState !== 'idle' && (
                    <button
                      type="button"
                      onClick={() => {
                        bridgeRef.current?.close();
                        setLocalSignalCode('');
                        setLocalSignalQrUrl('');
                      }}
                      className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 font-mono text-[11px] text-rose-300 hover:bg-rose-500/20"
                    >
                      <Unlink2 className="h-3.5 w-3.5" />
                      <span>Reiniciar</span>
                    </button>
                  )}
                </div>

                {/* Generated Signal QR + Copyable Code */}
                {localSignalCode && !isConnected && (
                  <div className="grid grid-cols-1 gap-3 rounded border border-[#22354a] bg-[#080d14] p-3 sm:grid-cols-12">
                    <div className="flex flex-col items-center justify-center sm:col-span-5">
                      {localSignalQrUrl ? (
                        <img
                          src={localSignalQrUrl}
                          alt="QR Sinalização WebRTC"
                          className="h-44 w-44 rounded border-4 border-white bg-white"
                        />
                      ) : (
                        <div className="flex h-44 w-44 items-center justify-center rounded border border-[#24364b] font-mono text-[10px] text-slate-400">
                          Código longo — use Copiar
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-between gap-2 sm:col-span-7">
                      <div>
                        <div className="font-mono text-[11px] font-bold text-cyan-300">
                          {localSignalLabel}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Escaneie o QR no outro aparelho ou copie o token compactado abaixo ({localSignalCode.length} chars).
                        </p>
                      </div>
                      <textarea
                        readOnly
                        rows={3}
                        value={localSignalCode}
                        className="forge-scroll w-full rounded border border-[#24364b] bg-[#06090e] p-2 font-mono text-[10px] text-slate-300"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (await copyToClipboard(localSignalCode)) {
                            onNotify('Token de sinalização copiado!', 'success');
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded border border-cyan-400/50 bg-cyan-500/15 py-1.5 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar Token de Conexão</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Paste Remote Offer / Answer */}
                {!isConnected && (
                  <div className="flex flex-col gap-1.5 border-t border-[#1c2a3a] pt-2.5">
                    <label className="font-mono text-[10.5px] uppercase tracking-wider text-slate-400">
                      Colar Código de Oferta (Dispositivo B) ou Resposta (Host A)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={remoteSignalInput}
                        onChange={(e) => setRemoteSignalInput(e.target.value)}
                        placeholder="Cole SIG:AFZ1:... recebido do outro dispositivo"
                        className="flex-1 rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        disabled={isBusySignal || !remoteSignalInput.trim()}
                        onClick={() => void handleApplyRemoteSignal()}
                        className="rounded border border-emerald-400/60 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Active P2P Transfer Composer */}
              <div className="tactical-panel flex flex-col gap-2.5 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    2. Transmitir pelo Túnel DataChannel
                  </span>
                  <input
                    ref={p2pFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      void handleSendFileOverP2P(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={!isConnected}
                    onClick={() => p2pFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded border border-[#2a3f57] bg-[#131e2c] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:bg-[#1a293c] disabled:opacity-40"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Enviar Imagem / Arquivo</span>
                  </button>
                </div>

                {transferProgress && (
                  <div className="rounded border border-cyan-400/35 bg-[#08121a] p-2">
                    <div className="flex justify-between font-mono text-[10.5px] text-cyan-200">
                      <span>{transferProgress.label}</span>
                      <span>{transferProgress.percent}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-[#142333]">
                      <div
                        className="h-full bg-cyan-400 transition-all"
                        style={{ width: `${transferProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                <input
                  type="text"
                  value={p2pTitle}
                  onChange={(e) => setP2pTitle(e.target.value)}
                  placeholder="Título opcional (ex: Prompt UI, playSfx.ts, Bug HUD)"
                  className="rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
                />
                <textarea
                  rows={4}
                  value={p2pText}
                  onChange={(e) => setP2pText(e.target.value)}
                  placeholder="Digite ou cole prompt, código TypeScript ou Markdown para enviar ao outro aparelho..."
                  className="forge-scroll rounded border border-[#24364b] bg-[#070b11] p-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!isConnected}
                    onClick={() => void handleSendDraftOverP2P()}
                    className="inline-flex items-center gap-1.5 rounded border border-emerald-400/60 bg-emerald-400 px-4 py-1.5 font-mono text-xs font-bold text-[#04140d] transition hover:bg-emerald-300 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Enviar via WebRTC</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === 'direct-qr' && (
            <div className="tactical-panel flex flex-col gap-3 p-3">
              <div>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  QR Direto Instantâneo (Zero Handshake)
                </span>
                <p className="mt-0.5 text-xs text-slate-400">
                  Compacta automaticamente com Deflate para transferir prompts, paletas ou funções pequenas apenas apontando a câmera.
                </p>
              </div>

              <input
                type="text"
                value={directTitle}
                onChange={(e) => setDirectTitle(e.target.value)}
                placeholder="Título do pacote QR"
                className="rounded border border-[#24364b] bg-[#080d14] px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
              />
              <textarea
                rows={4}
                value={directText}
                onChange={(e) => setDirectText(e.target.value)}
                placeholder="Cole um prompt, comando ou trecho de código..."
                className="forge-scroll rounded border border-[#24364b] bg-[#070b11] p-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
              />

              {directQrError ? (
                <div className="rounded border border-amber-500/45 bg-amber-500/10 p-3 font-mono text-xs text-amber-200">
                  {directQrError}
                </div>
              ) : (
                directQrUrl && (
                  <div className="flex flex-col items-center gap-2 rounded border border-[#1f2f42] bg-[#070b11] p-4">
                    <img
                      src={directQrUrl}
                      alt="QR Direto"
                      className="h-60 w-60 rounded border-4 border-white bg-white"
                    />
                    <a
                      href={directQrUrl}
                      download={`arena-forge-qr-${Date.now()}.png`}
                      className="inline-flex items-center gap-1.5 rounded border border-cyan-400/50 bg-cyan-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Baixar PNG do QR</span>
                    </a>
                  </div>
                )
              )}
            </div>
          )}

          {mode === 'scanner' && (
            <div className="tactical-panel flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Leitor de QR Code (Offline · BarcodeDetector + jsQR)
                </span>
                <div className="flex items-center gap-1.5">
                  {!cameraActive ? (
                    <button
                      type="button"
                      onClick={() => void startCameraScanner()}
                      className="inline-flex items-center gap-1.5 rounded border border-cyan-400/60 bg-cyan-400 px-3 py-1.5 font-mono text-xs font-bold text-[#051017]"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Abrir Câmera</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex items-center gap-1 rounded border border-rose-400/50 bg-rose-500/15 px-3 py-1.5 font-mono text-xs text-rose-200"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Parar</span>
                    </button>
                  )}

                  <input
                    ref={qrImgInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleDecodeQrImage(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => qrImgInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded border border-amber-400/45 bg-amber-500/15 px-2.5 py-1.5 font-mono text-xs text-amber-200"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Ler de Imagem</span>
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden rounded border border-[#24364b] bg-[#06090e]">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={cameraActive ? 'max-h-80 w-full object-cover' : 'hidden'}
                />
                <canvas ref={scanCanvasRef} className="hidden" />

                {cameraActive ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-48 w-48 rounded border-2 border-cyan-400 shadow-[0_0_0_9999px_rgba(6,9,14,0.45)]" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <QrCode className="h-10 w-10 text-cyan-400/70" />
                    <p className="max-w-xs font-mono text-xs text-slate-400">{scannerStatus}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Transfer History (Sent & Received) */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="tactical-panel flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#1f2e40] bg-[#0e151f] px-3 py-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                Histórico da Ponte ({transfers.length})
              </span>
              <span className="font-mono text-[10px] text-slate-400">LOCAL / P2P</span>
            </div>

            <div className="forge-scroll flex max-h-[520px] flex-col gap-2 overflow-y-auto p-3">
              {transfers.length === 0 ? (
                <p className="py-10 text-center font-mono text-xs text-slate-500">
                  Itens enviados ou recebidos via WebRTC DataChannel e Leitor QR aparecerão aqui com cópia e download rápidos.
                </p>
              ) : (
                transfers.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded border p-2.5 ${
                      item.direction === 'received'
                        ? 'border-emerald-500/35 bg-[#091614]'
                        : 'border-cyan-500/30 bg-[#0b131d]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span
                          className={`mr-1.5 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase ${
                            item.direction === 'received'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-cyan-500/20 text-cyan-300'
                          }`}
                        >
                          {item.direction === 'received' ? 'RECEBIDO' : 'ENVIADO'}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-100">
                          {item.title}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400">
                        {formatBytes(item.byteSize)}
                      </span>
                    </div>

                    {item.dataUrl ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <img
                          src={item.dataUrl}
                          alt={item.title}
                          className="max-h-44 w-auto rounded border border-[#24364b] object-contain"
                        />
                        <a
                          href={item.dataUrl}
                          download={`${item.title.replace(/[^a-zA-Z0-9_-]+/g, '-')}.webp`}
                          className="inline-flex w-fit items-center gap-1 rounded border border-amber-400/45 bg-amber-500/15 px-2.5 py-1 font-mono text-[11px] text-amber-200"
                        >
                          <Download className="h-3 w-3" />
                          <span>Baixar Imagem</span>
                        </a>
                      </div>
                    ) : (
                      item.text && (
                        <>
                          <pre className="forge-scroll mt-2 max-h-28 overflow-auto rounded bg-[#06090e] p-2 font-mono text-[10.5px] text-slate-300">
                            {item.text}
                          </pre>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                if (await copyToClipboard(item.text || '')) {
                                  setCopiedTransferId(item.id);
                                  onNotify('Conteúdo copiado!', 'success');
                                  window.setTimeout(() => setCopiedTransferId(null), 1500);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded border border-cyan-400/45 bg-cyan-500/15 px-2 py-1 font-mono text-[10.5px] text-cyan-200"
                            >
                              {copiedTransferId === item.id ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span>Copiar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                triggerTextDownload(
                                  item.text || '',
                                  `${item.title.replace(/[^a-zA-Z0-9_-]+/g, '-')}.txt`
                                )
                              }
                              className="inline-flex items-center gap-1 rounded border border-[#2a3f57] bg-[#131e2c] px-2 py-1 font-mono text-[10.5px] text-slate-200"
                            >
                              <Download className="h-3 w-3" />
                              <span>Baixar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onSaveToVault(item.title, item.text || '')}
                              className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 font-mono text-[10.5px] text-amber-200"
                            >
                              <BookmarkPlus className="h-3 w-3" />
                              <span>Salvar no Cofre</span>
                            </button>
                          </div>
                        </>
                      )
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
