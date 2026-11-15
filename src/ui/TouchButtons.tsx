import { useRef } from 'react';
import { ArrowBigUp, Zap } from 'lucide-react';
import type { InputController } from '../controls/InputController';

interface TouchButtonsProps {
  input: InputController;
}

/** Botões táteis de Pular e Correr (lado direito da tela). */
export function TouchButtons({ input }: TouchButtonsProps) {
  const sprintRef = useRef<HTMLButtonElement>(null);

  const releaseSprint = () => {
    input.setSprintButton(false);
    sprintRef.current?.setAttribute('aria-pressed', 'false');
  };

  return (
    <div className="pointer-events-auto fixed bottom-7 right-5 z-30 flex items-end gap-4">
      <button
        ref={sprintRef}
        type="button"
        aria-label="Correr"
        aria-pressed="false"
        className="hud-button flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-300/35 bg-amber-400/25 text-amber-200 backdrop-blur-md"
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          input.setSprintButton(true);
          event.currentTarget.setAttribute('aria-pressed', 'true');
        }}
        onPointerUp={releaseSprint}
        onPointerLeave={releaseSprint}
        onPointerCancel={releaseSprint}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Zap size={30} strokeWidth={2.2} />
      </button>

      <button
        type="button"
        aria-label="Pular"
        className="hud-button flex h-20 w-20 items-center justify-center rounded-full border-2 border-cyan-300/40 bg-cyan-400/30 text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.35)] backdrop-blur-md"
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          input.pressJump();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <ArrowBigUp size={38} strokeWidth={2.2} />
      </button>
    </div>
  );
}
