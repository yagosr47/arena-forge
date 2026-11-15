import { PLAYER_TUNING } from '../game/types';

/**
 * Entrada híbrida automática:
 *  - PC: WASD/setas, Espaço (pulo), Shift (correr)
 *  - Mobile: joystick virtual (esquerda) + botões de pular/correr (direita)
 */
export class InputController {
  /** Eixo horizontal -1..1 (direita positivo) */
  moveX = 0;
  /** Eixo vertical -1..1 (frente positivo) */
  moveY = 0;
  sprint = false;

  private readonly keys = new Set<string>();
  private joystickX = 0;
  private joystickY = 0;
  private joystickActive = false;
  private sprintButton = false;
  private jumpBufferUntil = -1;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space' || event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
    if (event.code === 'Space') {
      if (!event.repeat) this.pressJump();
      return;
    }
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.sprintButton = false;
    this.joystickActive = false;
    this.joystickX = 0;
    this.joystickY = 0;
  };

  private attached = false;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  setJoystick(x: number, y: number, active: boolean): void {
    this.joystickX = x;
    this.joystickY = y;
    this.joystickActive = active;
  }

  pressJump(): void {
    this.jumpBufferUntil = performance.now() / 1000 + PLAYER_TUNING.jumpBuffer;
  }

  /** Retorna true uma única vez quando o pulo foi solicitado (buffered). */
  consumeJump(): boolean {
    const now = performance.now() / 1000;
    if (this.jumpBufferUntil >= 0 && now <= this.jumpBufferUntil) {
      this.jumpBufferUntil = -1;
      return true;
    }
    return false;
  }

  setSprintButton(active: boolean): void {
    this.sprintButton = active;
  }

  update(): void {
    let x = 0;
    let y = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;

    if (this.joystickActive) {
      x += this.joystickX;
      y += this.joystickY;
    }

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }

    this.moveX = x;
    this.moveY = y;
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintButton;
  }
}
