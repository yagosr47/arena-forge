import * as THREE from 'three';
import type { PhysicsWorld, Vec3Like } from '../physics/PhysicsWorld';

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Câmera em terceira pessoa estilo Roblox: órbita suave, zoom por roda/pinça e
 * colisão para não atravessar paredes.
 */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.34;
  distance = 7.4;
  sensitivity = 1;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly dom: HTMLElement;
  private readonly physics: PhysicsWorld;
  private readonly smoothedFocus = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private currentDistance = 7.4;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private lastPinchDistance = 0;
  private initialized = false;

  private readonly onPointerDown = (event: PointerEvent): void => {
    // No mobile, a metade esquerda pertence ao joystick.
    if (event.pointerType === 'touch' && event.clientX < window.innerWidth * 0.45) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.lastPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;

    if (this.pointers.size === 1) {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      this.yaw -= dx * 0.0055 * this.sensitivity;
      this.pitch = clamp(this.pitch + dy * 0.0055 * this.sensitivity, -0.15, 1.25);
      previous.x = event.clientX;
      previous.y = event.clientY;
    } else if (this.pointers.size === 2) {
      previous.x = event.clientX;
      previous.y = event.clientY;
      const [a, b] = [...this.pointers.values()];
      const pinch = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.lastPinchDistance > 0 && pinch > 0) {
        this.distance = clamp(
          this.distance * (this.lastPinchDistance / pinch),
          3,
          15,
        );
      }
      this.lastPinchDistance = pinch;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.lastPinchDistance = 0;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.distance = clamp(this.distance + event.deltaY * 0.012, 3, 15);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, physics: PhysicsWorld) {
    this.camera = camera;
    this.dom = dom;
    this.physics = physics;
  }

  attach(): void {
    this.dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.dom.addEventListener('wheel', this.onWheel, { passive: false });
    this.dom.addEventListener('contextmenu', this.onContextMenu);
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.dom.removeEventListener('wheel', this.onWheel);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
  }

  update(dt: number, target: Vec3Like): void {
    this.focus.set(target.x, target.y + 1.45, target.z);

    if (!this.initialized) {
      this.smoothedFocus.copy(this.focus);
      this.initialized = true;
    } else {
      const lambda = 1 - Math.exp(-11 * dt);
      this.smoothedFocus.lerp(this.focus, lambda);
    }

    const cosPitch = Math.cos(this.pitch);
    const direction = new THREE.Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    );

    let desiredDistance = this.distance;
    const hit = this.physics.castRay(
      { x: this.smoothedFocus.x, y: this.smoothedFocus.y, z: this.smoothedFocus.z },
      { x: direction.x, y: direction.y, z: direction.z },
      desiredDistance + 0.4,
      true,
    );
    if (hit !== null && hit < desiredDistance) {
      desiredDistance = Math.max(1.15, hit - 0.28);
    }
    this.currentDistance = damp(this.currentDistance, desiredDistance, 10, dt);

    const position = this.smoothedFocus.clone().addScaledVector(direction, this.currentDistance);
    if (position.y < 0.35) position.y = 0.35;

    this.camera.position.copy(position);
    this.camera.lookAt(this.smoothedFocus.x, this.smoothedFocus.y + 0.08, this.smoothedFocus.z);
  }
}
