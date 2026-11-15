import { useEffect, useRef } from 'react';
import type { InputController } from '../controls/InputController';

interface JoystickProps {
  input: InputController;
}

/** Joystick virtual flutuante multi-touch (pointerId independente). */
export function Joystick({ input }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;

    const maxRadius = () => base.getBoundingClientRect().width / 2;

    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const update = (event: PointerEvent) => {
      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      let dx = event.clientX - centerX;
      let dy = event.clientY - centerY;
      const distance = Math.hypot(dx, dy);
      const max = maxRadius();
      if (distance > max) {
        dx = (dx / distance) * max;
        dy = (dy / distance) * max;
      }
      setKnob(dx, dy);
      input.setJoystick(dx / max, -dy / max, true);
    };

    const onDown = (event: PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      pointerIdRef.current = event.pointerId;
      base.setPointerCapture(event.pointerId);
      update(event);
    };

    const onMove = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      event.stopPropagation();
      update(event);
    };

    const onUp = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;
      input.setJoystick(0, 0, false);
      setKnob(0, 0);
    };

    base.addEventListener('pointerdown', onDown);
    base.addEventListener('pointermove', onMove);
    base.addEventListener('pointerup', onUp);
    base.addEventListener('pointercancel', onUp);
    return () => {
      base.removeEventListener('pointerdown', onDown);
      base.removeEventListener('pointermove', onMove);
      base.removeEventListener('pointerup', onUp);
      base.removeEventListener('pointercancel', onUp);
    };
  }, [input]);

  return (
    <div
      className="hud-button pointer-events-auto fixed bottom-7 left-5 z-30 h-[136px] w-[136px]"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={baseRef}
        className="relative h-full w-full rounded-full border-2 border-cyan-300/25 bg-slate-950/45 shadow-[inset_0_0_24px_rgba(34,211,238,0.12)] backdrop-blur-md"
      >
        <div className="absolute inset-3 rounded-full border border-cyan-300/10" />
        <div
          ref={knobRef}
          className="absolute left-1/2 top-1/2 -ml-7 -mt-7 h-14 w-14 rounded-full border border-cyan-200/60 bg-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.55)]"
        />
      </div>
    </div>
  );
}
