# ARENA//FORGE

Bancada PWA tática mobile-first (`100vw × 100dvh`) em **React, TypeScript, Vite e Tailwind CSS** projetada para acelerar a criação de jogos e apps no GitHub com agentes de IA — funcionando **100% offline** com migração de dados via JSON.

## Módulos

1. **Estúdio de Assets em Código Puro (`src/generators/`)**
   - `sfxSynthesizer.ts` — Sintetizador procedural WebAudio com osciloscópio em tempo real, presets táticos (*Laser, Explosão, Moeda, Alerta de Radar, Clique UI, Motor/Zumbido*), exportação `.wav` (PCM 16-bit) e geração de função TypeScript autônoma `playSfx()`.
   - `svgSpriteForge.ts` — Editor vetorial/pixel (`16×16` e `32×32`) com ferramentas geométricas (linha, retângulo, círculo, balde, simetria X/Y), paletas táticas/neon e exportação para `.png`, `.svg`, componente **React TSX** e código **Canvas 2D puro**.

2. **Extrator de Vídeo para Storyboard & Inspetor Visual (`src/vision/`)**
   - `videoStoryboarder.ts` — Carrega vídeos locais (`.mp4`, `.webm`), seleciona automática ou manualmente de 4 a 9 quadros-chave e renderiza uma única grade numerada (`2×2` ou `3×3`) comprimida em **WebP** ou **JPEG** leve.
   - `paletteAndPromptExtractor.ts` — Extrai as 6 cores predominantes em HEX (quantização K-Means++ com preservação de acentos + pipeta por pixel) e gera especificação técnica de UI/estilo em **Markdown** pronta para colar no prompt.

3. **Mapeador de Contexto & Biblioteca de Módulos (`src/repo/`)**
   - `contextBuilder.ts` — Escaneia pastas (`webkitdirectory` / File System Access API) ou múltiplos arquivos, ignora `node_modules` e `.git`, gera árvore Unicode de pastas e extrai assinaturas de `interface`, `type`, `export function`, `class` e `enum` em Markdown.
   - `snippetVault.ts` — Cofre persistido em **IndexedDB** com exportação/importação JSON e módulos pré-carregados (`vite-plugin-pwa`, Joystick Multi-Touch `PointerEvent`, Driver `WebBluetooth`, Layout `100dvh`, Game Loop Fixed-Timestep e WebAudio Mobile Unlock).

4. **Ponte Rápida Celular ↔ PC (`src/transfer/qrBridge.ts`)**
   - Gerador/leitor de QR Code offline (`qrcode` + `BarcodeDetector`/`jsQR`) e transferência direta via **WebRTC DataChannel** (com troca manual de código/QR compactado e sinalização local `BroadcastChannel`) para enviar prompts, códigos e storyboards sem nuvem.

## Scripts

```bash
npm install
npm run dev        # Servidor de desenvolvimento
npm run typecheck  # Checagem estrita TypeScript
npm test           # Testes unitários (Vitest)
npm run build      # Build de produção + Service Worker PWA offline
```
