# Arena Forge Obby — Mundo 3D estilo Roblox

Aplicação web 3D multi-arquivos em **React + TypeScript + Vite + Tailwind CSS + Three.js + Rapier3D**: um lobby/obby estilo **Roblox (R15/blocky moderno)** com iluminação maximizada, animações procedurais, controles mobile/PC e painel de configurações de performance.

## Rodando

```bash
npm install
npm run dev        # servidor dev em 0.0.0.0:5173
npm run build      # typecheck + build de produção
npm run typecheck  # só verificação de tipos
```

## Stack

| Área | Lib |
| --- | --- |
| Renderização 3D (sombra PCFSoft, ACES tone mapping, FogExp2, céu procedural) | `three` + `@types/three` |
| Física e colisão (cápsula do jogador, raycast de chão, coyote time, jump buffer) | `@dimforge/rapier3d-compat` |
| Ícones do HUD | `lucide-react` |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) |

## Estrutura

```
src/
├── App.tsx                  # orquestra boot, HUD, modal e Settings
├── main.tsx
├── index.css                # Tailwind + tokens + .glass-panel/.hud-button
├── audio/SfxSynth.ts        # SFX procedural via WebAudio (sem arquivos externos)
├── character/
│   ├── RobloxRigBuilder.ts  # rig articulado R15 com pivôs, rosto/visor, capa, aura
│   └── ProceduralAnimator.ts# idle/walk/run/jump/fall + squash & stretch
├── controls/
│   ├── InputController.ts   # WASD/setas/Espaço/Shift + joystick multi-touch
│   └── CameraRig.ts         # 3ª pessoa orbital, zoom, colisão de câmera
├── game/
│   ├── Game.ts              # loop principal: física → animação → render
│   ├── ParticleSystem.ts    # partículas GPU (burst, poeira, portais)
│   ├── settings.ts          # presets + persistência localStorage
│   └── types.ts             # GameSettings, QUALITY_PRESETS, tuning
├── physics/PhysicsWorld.ts  # mundo Rapier, passo fixo 1/60, raycasts
├── ui/
│   ├── Hud.tsx              # overlay: stats, engrenagem, dicas/controles
│   ├── Joystick.tsx         # joystick virtual flutuante (pointerId único)
│   ├── TouchButtons.tsx     # botões Pular / Correr
│   ├── PerformanceOverlay.tsx # FPS + latência de frame
│   └── SettingsModal.tsx    # gráficos, tela/câmera, controles/áudio
└── world/LobbyMap.ts        # spawn xadrez, escadas, rampa, mini-obby, portais
```

## Configurações (persistidas em `localStorage`)

- **Gráficos:** qualidade Baixo/Médio/Alto/Ultra, pixel ratio 0.5x–2.0x, sombras dinâmicas, partículas, limitador de FPS (30/60/livre).
- **Tela & câmera:** tela cheia (Fullscreen API), FOV 60–100°, sensibilidade, contador de FPS/ms.
- **Controles & áudio:** volume dos SFX, tamanho e opacidade dos botões on-screen.

## Controles

- **PC:** `WASD`/setas mover · `Espaço` pular · `Shift` correr · arrastar com o mouse girar a câmera · roda = zoom.
- **Mobile:** joystick flutuante à esquerda (multi-touch) · arrastar na metade direita para a câmera · pinça para zoom · botões **Pular** e **Correr** à direita.
