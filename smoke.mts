/* Smoke test headless: física + mapa + rig + animador (sem render, com stub de DOM). */
/* Stub mínimo de DOM antes dos imports que usam canvas. */
const gradientStub = { addColorStop: () => undefined };
const ctxStub = new Proxy(
  {},
  {
    get: (_target, prop: string) => {
      if (prop === 'canvas') return canvasStub;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => gradientStub;
      }
      return () => undefined;
    },
    set: () => true,
  },
);
const canvasStub = {
  width: 0,
  height: 0,
  getContext: () => ctxStub,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
(globalThis as { document?: unknown }).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return canvasStub;
    throw new Error(`createElement(${tag}) não suportado no smoke test`);
  },
};

const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
const THREE = await import('three');
const { PhysicsWorld, PLAYER_FOOT_OFFSET } = await import('./src/physics/PhysicsWorld');
const { buildLobbyMap } = await import('./src/world/LobbyMap');
const { buildRobloxRig } = await import('./src/character/RobloxRigBuilder');
const { ProceduralAnimator } = await import('./src/character/ProceduralAnimator');
const { ParticleSystem } = await import('./src/game/ParticleSystem');
const { SPAWN, PLAYER_TUNING } = await import('./src/game/types');

await RAPIER.init();

const physics = await PhysicsWorld.create({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, PLAYER_TUNING.gravity);
const lobby = buildLobbyMap(physics);
const rig = buildRobloxRig();
const animator = new ProceduralAnimator();
const particles = new ParticleSystem(100);

console.log('portals:', lobby.portals.map((p) => ({ pos: p.position, target: p.target })));

// Simula: parado 1s, pula, anda, aterrissa.
let time = 0;
let landed = false;
for (let frame = 0; frame < 360; frame += 1) {
  const dt = 1 / 60;
  time += dt;

  const grounded = physics.isGrounded();
  const vel = physics.getPlayerVelocity();
  let vx = 0;
  let vy = vel.y;
  const vz = 0;

  if (time > 1 && time < 3) vx = PLAYER_TUNING.walkSpeed;
  if (Math.abs(time - 1.5) < dt / 2) vy = PLAYER_TUNING.jumpSpeed;
  if (grounded && time > 3) vy = 0;

  physics.setPlayerVelocity(vx, vy, vz);
  lobby.preStep(time);
  physics.step(dt);

  const pos = physics.getPlayerPosition();
  const nowGrounded = physics.isGrounded();
  if (!landed && nowGrounded && time > 2 && pos.y > 1) {
    landed = true;
    console.log(`aterrissou em t=${time.toFixed(2)} y=${pos.y.toFixed(3)}`);
    animator.onLand(0.8);
    particles.burst(new THREE.Vector3(pos.x, pos.y - PLAYER_FOOT_OFFSET, pos.z), { count: 10 });
  }

  animator.update(rig, {
    dt,
    time,
    speed: Math.hypot(vx, vz),
    sprinting: false,
    grounded: nowGrounded,
    verticalVelocity: physics.getPlayerVelocity().y,
  });
  lobby.update(dt, time, particles);
  particles.update(dt);

  if (frame % 60 === 0) {
    console.log(
      `t=${time.toFixed(1)} pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) grounded=${nowGrounded}`,
    );
  }
}

if (!landed) throw new Error('nunca aterrissou após o pulo');

// Teleporte ao portal ciano
const portal = lobby.portals[0];
physics.teleport(portal.target.x, portal.target.y, portal.target.z);
const after = physics.getPlayerPosition();
console.log('após teleporte:', after);
if (Math.abs(after.x - portal.target.x) > 0.01) throw new Error('teleporte falhou');

// Queda fora do mapa
physics.teleport(0, -30, 0);
physics.step(1 / 60);
console.log('fora do mapa y=', physics.getPlayerPosition().y.toFixed(1));

// raycast da câmera (retorna toi ou null)
const toi = physics.castRay({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 20, true);
console.log('raycast down from (0,5,0):', toi !== null ? `hit toi=${toi.toFixed(3)}` : 'MISS');
if (toi === null) throw new Error('raycast não achou o chão');

console.log('SMOKE OK');
