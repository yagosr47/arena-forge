import * as THREE from 'three';
import { PhysicsWorld, PLAYER_FOOT_OFFSET } from '../physics/PhysicsWorld';
import { buildRobloxRig, type RigParts } from '../character/RobloxRigBuilder';
import { ProceduralAnimator } from '../character/ProceduralAnimator';
import { CameraRig } from '../controls/CameraRig';
import { InputController } from '../controls/InputController';
import { buildLobbyMap, type LobbyMapResult } from '../world/LobbyMap';
import { ParticleSystem } from './ParticleSystem';
import { SfxSynth } from '../audio/SfxSynth';
import { PLAYER_TUNING, SPAWN, type FrameStats, type GameSettings } from './types';

export class Game {
  private readonly container: HTMLElement;
  private readonly input: InputController;
  private readonly onStats: (stats: FrameStats) => void;
  private settings: GameSettings;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private physics!: PhysicsWorld;
  private rig!: RigParts;
  private animator!: ProceduralAnimator;
  private cameraRig!: CameraRig;
  private lobby!: LobbyMapResult;
  private particles!: ParticleSystem;
  private sfx!: SfxSynth;

  private raf = 0;
  private lastTime = 0;
  private lastRenderTime = 0;
  private elapsed = 0;
  private disposed = false;

  private wasGrounded = true;
  private lastGroundedAt = -1;
  private fallSpeed = 0;
  private facing = 0;
  private stepTimer = 0;
  private portalCooldown = 0;
  private fpsEma = 60;
  private msEma = 16.7;
  private statsTimer = 0;

  private readonly onResize = (): void => this.resize();

  private constructor(
    container: HTMLElement,
    input: InputController,
    settings: GameSettings,
    onStats: (stats: FrameStats) => void,
  ) {
    this.container = container;
    this.input = input;
    this.settings = settings;
    this.onStats = onStats;
  }

  static async create(
    container: HTMLElement,
    input: InputController,
    settings: GameSettings,
    onStats: (stats: FrameStats) => void,
  ): Promise<Game> {
    const game = new Game(container, input, settings, onStats);
    await game.init();
    return game;
  }

  private async init(): Promise<void> {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xa8cbe0, 0.011);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, width / height, 0.1, 420);
    this.camera.position.set(0, 5, 10);

    this.physics = await PhysicsWorld.create({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, PLAYER_TUNING.gravity);
    this.lobby = buildLobbyMap(this.physics);
    this.scene.add(this.lobby.group);

    this.rig = buildRobloxRig();
    this.scene.add(this.rig.root);

    this.animator = new ProceduralAnimator();
    this.particles = new ParticleSystem(1500);
    this.scene.add(this.particles.points);

    this.sfx = new SfxSynth();
    this.sfx.setVolume(this.settings.volume);

    this.cameraRig = new CameraRig(this.camera, this.renderer.domElement, this.physics);
    this.cameraRig.attach();
    this.input.attach();

    this.applySettings(this.settings);
    this.resize();

    window.addEventListener('resize', this.onResize);
    this.lastTime = performance.now() / 1000;
    this.raf = requestAnimationFrame(this.tick);
  }

  applySettings(settings: GameSettings): void {
    this.settings = settings;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * settings.pixelRatio;
    this.renderer.setPixelRatio(Math.min(2.5, Math.max(0.5, pixelRatio)));
    this.resize();

    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();

    this.cameraRig.sensitivity = settings.sensitivity;

    this.renderer.shadowMap.enabled = settings.shadows;
    this.lobby.sun.castShadow = settings.shadows;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.needsUpdate = true;
      }
    });

    this.particles.setEnabled(settings.particles);
    this.sfx.setVolume(settings.volume);
  }

  resumeAudio(): void {
    this.sfx.resume();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly tick = (timeMs: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);

    const now = timeMs / 1000;

    // Limitador de FPS: pula o frame SEM consumir o tempo, para que o dt
    // do próximo render acumule o intervalo real (senão o jogo fica lento).
    const limit = this.settings.fpsLimit;
    if (limit > 0 && this.lastRenderTime > 0 && now - this.lastRenderTime < 1 / limit - 0.001) {
      return;
    }

    let dt = this.lastTime > 0 ? now - this.lastTime : 1 / 60;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.lastTime = now;
    this.lastRenderTime = now;

    this.elapsed += dt;
    this.update(dt, this.elapsed);
    this.renderer.render(this.scene, this.camera);

    this.fpsEma = this.fpsEma * 0.92 + (1 / dt) * 0.08;
    this.msEma = this.msEma * 0.92 + dt * 1000 * 0.08;
    this.statsTimer += dt;
    if (this.statsTimer >= 0.5) {
      this.statsTimer = 0;
      this.onStats({ fps: Math.round(this.fpsEma), frameMs: Math.round(this.msEma * 10) / 10 });
    }
  };

  private update(dt: number, time: number): void {
    this.input.update();
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);

    const position = this.physics.getPlayerPosition();
    const velocity = this.physics.getPlayerVelocity();
    const grounded = this.physics.isGrounded();

    if (grounded) {
      this.lastGroundedAt = time;
      this.fallSpeed = 0;
    } else {
      this.fallSpeed = Math.max(this.fallSpeed, -velocity.y);
    }
    const canCoyote = time - this.lastGroundedAt <= PLAYER_TUNING.coyoteTime;

    // ----- Direção relativa à câmera -----
    const yaw = this.cameraRig.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    let dirX = rightX * this.input.moveX + forwardX * this.input.moveY;
    let dirZ = rightZ * this.input.moveX + forwardZ * this.input.moveY;
    const dirLength = Math.hypot(dirX, dirZ);
    if (dirLength > 1) {
      dirX /= dirLength;
      dirZ /= dirLength;
    }

    const speedTarget = this.input.sprint ? PLAYER_TUNING.sprintSpeed : PLAYER_TUNING.walkSpeed;
    const targetVx = dirX * speedTarget;
    const targetVz = dirZ * speedTarget;
    const newVx = THREE.MathUtils.damp(velocity.x, targetVx, PLAYER_TUNING.acceleration, dt);
    const newVz = THREE.MathUtils.damp(velocity.z, targetVz, PLAYER_TUNING.acceleration, dt);

    // ----- Pulo (com coyote time + jump buffering) -----
    let newVy = velocity.y;
    if ((grounded || canCoyote) && this.input.consumeJump()) {
      newVy = PLAYER_TUNING.jumpSpeed;
      this.sfx.jump();
      if (this.settings.particles) {
        this.particles.burst(
          new THREE.Vector3(position.x, position.y - PLAYER_FOOT_OFFSET + 0.1, position.z),
          { count: 14, color: 0x9be8ff, color2: 0x22d3ee, speed: 2.2, up: 0.8, size: 1.2, life: 0.5, gravity: 5 },
        );
      }
    }

    this.physics.setPlayerVelocity(newVx, newVy, newVz);
    this.physics.step(dt);

    const after = this.physics.getPlayerPosition();
    const afterVelocity = this.physics.getPlayerVelocity();
    const afterGrounded = this.physics.isGrounded();

    // ----- Aterrissagem: squash & stretch + poeira + som -----
    if (!this.wasGrounded && afterGrounded && this.fallSpeed > 3) {
      const intensity = THREE.MathUtils.clamp(this.fallSpeed / 13, 0.25, 1);
      this.animator.onLand(intensity);
      this.sfx.land(intensity);
      if (this.settings.particles) {
        this.particles.burst(
          new THREE.Vector3(after.x, after.y - PLAYER_FOOT_OFFSET + 0.08, after.z),
          {
            count: Math.round(18 + intensity * 22),
            color: 0xcfe3ef,
            color2: 0x8fb8d8,
            speed: 2.4 + intensity * 2,
            up: 1.1,
            size: 1.5,
            life: 0.65,
            gravity: 6,
            flat: 0.85,
          },
        );
      }
    }
    this.wasGrounded = afterGrounded;

    // ----- Posição e orientação do personagem -----
    this.rig.root.position.set(after.x, after.y - PLAYER_FOOT_OFFSET, after.z);
    if (dirLength > 0.1) {
      const targetFacing = Math.atan2(dirX, dirZ);
      let delta = targetFacing - this.facing;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.facing += delta * Math.min(1, dt * 12);
    }
    this.rig.root.rotation.y = this.facing;

    const horizontalSpeed = Math.hypot(afterVelocity.x, afterVelocity.z);
    this.animator.update(this.rig, {
      dt,
      time,
      speed: horizontalSpeed,
      sprinting: this.input.sprint && horizontalSpeed > 3,
      grounded: afterGrounded,
      verticalVelocity: afterVelocity.y,
    });
    this.animator.consumeLanding();

    // ----- Passos: som + poeira -----
    if (afterGrounded && horizontalSpeed > 1.4) {
      this.stepTimer -= dt * horizontalSpeed;
      if (this.stepTimer <= 0) {
        this.stepTimer = 2.1;
        this.sfx.step(this.input.sprint);
        if (this.settings.particles) {
          this.particles.burst(
            new THREE.Vector3(after.x, after.y - PLAYER_FOOT_OFFSET + 0.05, after.z),
            {
              count: 4,
              color: 0x9fb8cc,
              color2: 0x6d8aa8,
              speed: 0.9,
              up: 0.5,
              size: 1,
              life: 0.45,
              gravity: 4,
              flat: 0.9,
            },
          );
        }
      }
    } else {
      this.stepTimer = 0.4;
    }

    // ----- Portais de teletransporte -----
    if (this.portalCooldown <= 0) {
      for (const portal of this.lobby.portals) {
        const distance = Math.hypot(
          after.x - portal.position.x,
          after.y - portal.position.y,
          after.z - portal.position.z,
        );
        if (distance < 2.1) {
          this.portalCooldown = 1.4;
          this.sfx.teleport();
          if (this.settings.particles) {
            this.particles.burst(portal.position, {
              count: 30,
              color: portal.particleColor,
              color2: portal.particleColor2,
              speed: 3.4,
              up: 1.6,
              size: 1.7,
              life: 0.8,
              gravity: 3,
            });
          }
          this.physics.teleport(portal.target.x, portal.target.y, portal.target.z);
          if (this.settings.particles) {
            const destination = portal.target;
            this.particles.burst(new THREE.Vector3(destination.x, destination.y - 0.6, destination.z), {
              count: 26,
              color: 0x9be8ff,
              color2: 0xffffff,
              speed: 2.6,
              up: 1.4,
              size: 1.5,
              life: 0.7,
              gravity: 3,
            });
          }
          break;
        }
      }
    }

    // ----- Queda para fora do mapa: volta ao spawn -----
    if (after.y < -18) {
      this.physics.teleport(SPAWN.x, SPAWN.y, SPAWN.z);
      this.fallSpeed = 0;
    }

    // ----- Mundo, partículas e câmera -----
    this.lobby.update(dt, time, this.settings.particles ? this.particles : null);
    this.particles.update(dt);
    this.cameraRig.update(dt, this.rig.root.position);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.cameraRig.dispose();
    this.particles.dispose();
    this.physics.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
