import RAPIER from '@dimforge/rapier3d-compat';

export const PLAYER_RADIUS = 0.36;
export const PLAYER_HALF_HEIGHT = 0.56;
export const PLAYER_HEIGHT = (PLAYER_HALF_HEIGHT + PLAYER_RADIUS) * 2;
/** Distância do centro da cápsula até os pés. */
export const PLAYER_FOOT_OFFSET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export class PhysicsWorld {
  private readonly world: RAPIER.World;
  private readonly player: RAPIER.RigidBody;
  private accumulator = 0;
  private readonly fixedStep = 1 / 60;

  private constructor(world: RAPIER.World, player: RAPIER.RigidBody) {
    this.world = world;
    this.player = player;
  }

  static async create(spawn: Vec3Like, gravity: number): Promise<PhysicsWorld> {
    await RAPIER.init();

    const world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .lockRotations()
      .setLinearDamping(0.05)
      .setCanSleep(false)
      .setCcdEnabled(true);
    const player = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
      .setFriction(0.4)
      .setRestitution(0)
      .setDensity(1.4);
    world.createCollider(colliderDesc, player);

    return new PhysicsWorld(world, player);
  }

  /** Anexa um colisor estático (chão, paredes, rampas, plataformas) ao mundo. */
  attachCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    return this.world.createCollider(desc);
  }

  /**
   * Cria uma plataforma kinematic (móvel/giratória) com colisor de caixa.
   * Retorna corpo e colisor para animação e ativação/desativação.
   */
  createKinematicBox(
    width: number,
    height: number,
    depth: number,
    position: Vec3Like,
    friction = 0.4,
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2).setFriction(friction),
      body,
    );
    return { body, collider };
  }

  /** Define a próxima posição de uma plataforma kinematic (chamado antes do step). */
  setKinematicTranslation(body: RAPIER.RigidBody, x: number, y: number, z: number): void {
    body.setNextKinematicTranslation({ x, y, z });
  }

  /** Define a próxima rotação de uma plataforma kinematic (chamado antes do step). */
  setKinematicRotation(body: RAPIER.RigidBody, x: number, y: number, z: number, w: number): void {
    body.setNextKinematicRotation({ x, y, z, w });
  }

  /** Passo fixo determinístico com acumulador — estável em qualquer FPS. */
  step(dt: number): void {
    this.accumulator = Math.min(this.accumulator + dt, this.fixedStep * 8);
    this.world.timestep = this.fixedStep;
    while (this.accumulator >= this.fixedStep) {
      this.world.step();
      this.accumulator -= this.fixedStep;
    }
  }

  getPlayerPosition(): Vec3Like {
    const t = this.player.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  getPlayerVelocity(): Vec3Like {
    const v = this.player.linvel();
    return { x: v.x, y: v.y, z: v.z };
  }

  setPlayerVelocity(x: number, y: number, z: number): void {
    this.player.setLinvel({ x, y, z }, true);
  }

  teleport(x: number, y: number, z: number): void {
    this.player.setTranslation({ x, y, z }, true);
    this.player.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Raycast para o chão (cápsula do jogador ignorada). */
  isGrounded(): boolean {
    const position = this.player.translation();
    const ray = new RAPIER.Ray({ x: position.x, y: position.y, z: position.z }, { x: 0, y: -1, z: 0 });
    const maxToi = PLAYER_FOOT_OFFSET + 0.18;
    const hit = this.world.castRay(ray, maxToi, true, undefined, undefined, undefined, this.player);
    return hit !== null;
  }

  /**
   * Raycast genérico. Retorna a distância do impacto (time-of-impact) ou null.
   * Usado para a colisão da câmera.
   */
  castRay(from: Vec3Like, dir: Vec3Like, maxToi: number, excludePlayer = true): number | null {
    const ray = new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRay(
      ray,
      maxToi,
      true,
      undefined,
      undefined,
      undefined,
      excludePlayer ? this.player : undefined,
    );
    return hit ? hit.timeOfImpact : null;
  }

  dispose(): void {
    this.world.free();
  }
}
