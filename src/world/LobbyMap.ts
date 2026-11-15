import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ParticleSystem } from '../game/ParticleSystem';

export interface Portal {
  position: THREE.Vector3;
  target: THREE.Vector3;
  group: THREE.Group;
  ringMaterial: THREE.MeshStandardMaterial;
  discMaterial: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  particleColor: number;
  particleColor2: number;
}

export interface JumpPad {
  position: THREE.Vector3;
  radius: number;
  power: number;
}

export interface LobbyMapResult {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  portals: Portal[];
  jumpPads: JumpPad[];
  spawn: THREE.Vector3;
  /** Avança plataformas kinematic (móveis/giratórias) — chamado antes do step físico. */
  preStep: (time: number) => void;
  update: (dt: number, time: number, particles: ParticleSystem | null) => void;
}

function quatFromEuler(x: number, y: number, z: number): { x: number; y: number; z: number; w: number } {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function createCheckerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cells = 8;
    const size = 512 / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        ctx.fillStyle = (row + column) % 2 === 0 ? '#1c2b41' : '#243a56';
        ctx.fillRect(column * size, row * size, size, size);
      }
    }
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.16)';
    ctx.lineWidth = 4;
    for (let index = 0; index <= cells; index += 1) {
      ctx.beginPath();
      ctx.moveTo(index * size, 0);
      ctx.lineTo(index * size, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, index * size);
      ctx.lineTo(512, index * size);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(150, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x1b4f9c) },
      uMid: { value: new THREE.Color(0x5fa8e0) },
      uBottom: { value: new THREE.Color(0xcfe8f7) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBottom;
      varying vec3 vDirection;
      void main() {
        float height = vDirection.y;
        vec3 upper = mix(uMid, uTop, smoothstep(0.06, 0.65, height));
        vec3 color = mix(uBottom, upper, smoothstep(-0.12, 0.08, height));

        // Sol: disco + halo alinhados à direção da luz (30, 44, 20).
        vec3 sunDir = normalize(vec3(30.0, 44.0, 20.0));
        float sunAmount = max(dot(vDirection, sunDir), 0.0);
        color += vec3(1.0, 0.92, 0.72) * pow(sunAmount, 900.0) * 1.4;
        color += vec3(1.0, 0.85, 0.55) * pow(sunAmount, 24.0) * 0.22;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'sky-dome';
  return sky;
}

/** Mapa Lobby estilo Roblox com colisores físicos reais no Rapier3D. */
export function buildLobbyMap(physics: PhysicsWorld): LobbyMapResult {
  const group = new THREE.Group();
  group.name = 'lobby-map';

  const portals: Portal[] = [];
  const jumpPads: JumpPad[] = [];
  const animated: { object: THREE.Object3D; spin: number; bob: number; baseY: number }[] = [];
  const clouds: { object: THREE.Object3D; speed: number }[] = [];

  // ---------- Materiais ----------
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: createCheckerTexture(),
    roughness: 0.75,
    metalness: 0.05,
  });
  const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x2b4266, roughness: 0.6, metalness: 0.12 });
  const platformTopMaterial = new THREE.MeshStandardMaterial({ color: 0x35547f, roughness: 0.5, metalness: 0.15 });
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x3a5178, roughness: 0.55, metalness: 0.2 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x22344e, roughness: 0.7, metalness: 0.1 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x3fae6a, roughness: 0.75, flatShading: true });
  const leafMaterial2 = new THREE.MeshStandardMaterial({ color: 0x2f8f57, roughness: 0.75, flatShading: true });
  const glowCyan = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 1.6,
    roughness: 0.3,
    metalness: 0.3,
  });
  const glowMagenta = new THREE.MeshStandardMaterial({
    color: 0xf472b6,
    emissive: 0xec4899,
    emissiveIntensity: 1.4,
    roughness: 0.3,
    metalness: 0.3,
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.9,
    roughness: 0.3,
    metalness: 0.55,
  });

  const addBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material | THREE.Material[],
    options: { rotate?: { x?: number; y?: number; z?: number }; collide?: boolean; receive?: boolean } = {},
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    if (options.rotate) {
      mesh.rotation.set(options.rotate.x ?? 0, options.rotate.y ?? 0, options.rotate.z ?? 0);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = options.receive ?? true;
    group.add(mesh);

    if (options.collide !== false) {
      const desc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2).setTranslation(x, y, z);
      if (options.rotate) {
        desc.setRotation(quatFromEuler(options.rotate.x ?? 0, options.rotate.y ?? 0, options.rotate.z ?? 0));
      }
      desc.setFriction(0.65);
      physics.attachCollider(desc);
    }
    return mesh;
  };

  const addCylinder = (
    radiusTop: number,
    radiusBottom: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    options: { radialSegments?: number; collide?: boolean } = {},
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, options.radialSegments ?? 20),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (options.collide !== false) {
      physics.attachCollider(
        RAPIER.ColliderDesc.cylinder(height / 2, Math.max(radiusTop, radiusBottom))
          .setTranslation(x, y, z)
          .setFriction(0.7),
      );
    }
    return mesh;
  };

  // ---------- Batching de estáticos (1 draw call por material) ----------
  // Geometrias decorativas sem colisor são agrupadas por material e fundidas
  // em uma única malha no final da construção — menos draw calls, menos lag.
  const batch = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const batchGeometry = (geometry: THREE.BufferGeometry, material: THREE.Material): void => {
    const list = batch.get(material);
    if (list) list.push(geometry);
    else batch.set(material, [geometry]);
  };
  const batchBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): void => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(x, y, z);
    batchGeometry(geometry, material);
  };
  const batchCone = (
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    radialSegments = 6,
  ): void => {
    const geometry = new THREE.ConeGeometry(radius, height, radialSegments);
    geometry.translate(x, y, z);
    batchGeometry(geometry, material);
  };
  const batchPlane = (
    width: number,
    height: number,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    material: THREE.Material,
  ): void => {
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.rotateY(rotationY);
    geometry.translate(x, y, z);
    batchGeometry(geometry, material);
  };
  const flushBatch = (): void => {
    for (const [material, geometries] of batch) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      for (const geometry of geometries) geometry.dispose();
    }
    batch.clear();
  };

  // ---------- Chão ----------
  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), groundMaterial);
  ground.position.set(0, -0.5, 0);
  ground.receiveShadow = true;
  group.add(ground);
  physics.attachCollider(
    RAPIER.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0).setFriction(0.8),
  );

  // ---------- Plataforma central de spawn ----------
  const spawnPlatform = addCylinder(5, 5.5, 0.4, 0, 0.2, 0, platformMaterial, { radialSegments: 48 });
  spawnPlatform.receiveShadow = true;
  const spawnTop = new THREE.Mesh(new THREE.CircleGeometry(4.8, 48), platformTopMaterial);
  spawnTop.rotation.x = -Math.PI / 2;
  spawnTop.position.set(0, 0.405, 0);
  spawnTop.receiveShadow = true;
  group.add(spawnTop);

  const spawnRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.08, 12, 72), glowCyan);
  spawnRing.rotation.x = -Math.PI / 2;
  spawnRing.position.set(0, 0.44, 0);
  group.add(spawnRing);
  animated.push({ object: spawnRing, spin: 0.25, bob: 0, baseY: 0.44 });

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.05, 10, 64), glowCyan);
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.set(0, 0.44, 0);
  group.add(innerRing);
  animated.push({ object: innerRing, spin: -0.4, bob: 0, baseY: 0.44 });

  // Feixe de luz vertical marcando o spawn
  const spawnBeamMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const spawnBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.15, 26, 20, 1, true), spawnBeamMaterial);
  spawnBeam.position.set(0, 13.4, 0);
  group.add(spawnBeam);

  // ---------- Escadarias ----------
  const stepCount = 6;
  const stepRise = 1.4 / stepCount;
  for (let index = 0; index < stepCount; index += 1) {
    const topY = stepRise * (index + 1);
    batchBox(3, topY, 0.62, 0, topY / 2, 10.9 + index * 0.62, platformMaterial);
  }
  // Colisor rampa invisível alinhado ao alinhamento dos topos dos degraus —
  // o jogador sobe suave, sem tropeçar, e os pés acompanham o visual (±12 cm).
  const stairRun = 3.72;
  const stairRise = 1.4;
  const stairAngle = Math.atan2(stairRise, stairRun);
  const stairHalf = Math.hypot(stairRun, stairRise) / 2;
  physics.attachCollider(
    RAPIER.ColliderDesc.cuboid(1.5, 0.15, stairHalf)
      .setTranslation(0, stairRise / 2 - 0.15 * Math.cos(stairAngle), 12.14 + 0.15 * Math.sin(stairAngle))
      .setRotation(quatFromEuler(-stairAngle, 0, 0))
      .setFriction(0.8),
  );

  // ---------- Rampa ----------
  const rampLength = 3.6;
  const rampAngle = Math.atan2(1.4, 3.3);
  addBox(rampLength, 0.3, 2.4, -3.85, 0.55, 16, platformTopMaterial, {
    rotate: { z: rampAngle },
  });
  addBox(0.16, 0.5, 2.4, -2.35, 1.55, 16, glowCyan, { collide: false });

  // ---------- Plataforma A ----------
  // Frente em z=14.3, encaixando exatamente no topo da rampa das escadas (sem degrau).
  addBox(4, 0.4, 4, 0, 1.2, 16.3, platformTopMaterial);
  batchBox(4.3, 0.12, 4.3, 0, 1.44, 16.3, glowCyan);

  // Setas luminosas apontando para o mini-obby
  for (let index = 0; index < 3; index += 1) {
    const chevronGeometry = new THREE.ConeGeometry(0.42, 0.9, 4);
    chevronGeometry.rotateX(Math.PI / 2);
    const chevron = new THREE.Mesh(chevronGeometry, glowCyan);
    chevron.scale.set(1, 0.3, 1);
    chevron.position.set(0, 1.52, 15.1 + index * 1.15);
    group.add(chevron);
  }

  // ---------- Mini-obby (nível difícil) ----------
  // Rota: Plataforma A → estática → plataforma móvel → plataforma que some →
  // viga de equilíbrio → estática → recompensa (com varredura giratória no fim).
  addBox(2.4, 0.4, 2.4, 2.2, 1.2, 19.8, platformTopMaterial);
  batchBox(2.5, 0.1, 2.5, 2.2, 1.42, 19.8, glowCyan);

  // Plataforma móvel (eixo X, corpo kinematic)
  const mover = physics.createKinematicBox(2.2, 0.4, 2.2, { x: 6.2, y: 1.9, z: 23.2 });
  const moverMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.2), platformTopMaterial);
  moverMesh.position.set(6.2, 1.9, 23.2);
  moverMesh.castShadow = true;
  moverMesh.receiveShadow = true;
  group.add(moverMesh);
  const moverTrim = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 2.3), glowMagenta);
  moverTrim.position.set(6.2, 2.12, 23.2);
  group.add(moverTrim);

  // Plataforma que some e reaparece (colisor liga/desliga)
  const blinker = physics.createKinematicBox(2.0, 0.4, 2.0, { x: 4.0, y: 2.6, z: 27.4 });
  const blinkerMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 2.0), platformTopMaterial);
  blinkerMesh.position.set(4.0, 2.6, 27.4);
  blinkerMesh.castShadow = true;
  blinkerMesh.receiveShadow = true;
  group.add(blinkerMesh);
  const blinkerTrim = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 2.1), glowCyan);
  blinkerTrim.position.set(4.0, 2.82, 27.4);
  group.add(blinkerTrim);
  let blinkerOn = true;

  // Viga estreita de equilíbrio (atravessa em X)
  addBox(4.4, 0.3, 0.9, -1.5, 3.3, 27.0, platformTopMaterial);
  batchBox(4.5, 0.08, 1.0, -1.5, 3.47, 27.0, glowMagenta);

  // Estática antes da recompensa
  addBox(2.4, 0.4, 2.4, -6.2, 3.7, 24.6, platformTopMaterial);
  batchBox(2.5, 0.1, 2.5, -6.2, 3.92, 24.6, glowCyan);

  // Varrredura giratória guardando a aproximação da recompensa
  addCylinder(0.3, 0.4, 3.6, -5.8, 1.8, 22.4, pillarMaterial);
  const sweeper = physics.createKinematicBox(4.4, 0.3, 0.5, { x: -5.8, y: 4.35, z: 22.4 });
  const sweeperMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 0.5), glowMagenta);
  sweeperMesh.position.set(-5.8, 4.35, 22.4);
  sweeperMesh.castShadow = true;
  group.add(sweeperMesh);

  // ---------- Torre de pulo (zigzag, 5 degraus) ----------
  const jumpTower: [number, number, number][] = [
    [-14, 0.9, -11],
    [-12.2, 1.8, -14.5],
    [-14, 2.7, -18],
    [-15.8, 3.6, -21.5],
    [-14, 4.5, -25],
  ];
  jumpTower.forEach(([x, y, z], index) => {
    addBox(2.0, 0.4, 2.0, x, y, z, platformTopMaterial);
    batchBox(2.1, 0.1, 2.1, x, y + 0.22, z, index % 2 === 0 ? glowCyan : glowMagenta);
  });

  // ---------- Jump pad + plataforma alta ----------
  addCylinder(1.1, 1.3, 0.5, 10, 0.25, -14, platformMaterial);
  const padMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 24), glowCyan);
  padMesh.position.set(10, 0.56, -14);
  group.add(padMesh);
  animated.push({ object: padMesh, spin: 0, bob: 0.04, baseY: 0.56 });
  jumpPads.push({ position: new THREE.Vector3(10, 0.6, -14), radius: 1.15, power: 16.5 });

  addBox(2.6, 0.4, 2.6, 10, 5.0, -18, platformTopMaterial);
  batchBox(2.7, 0.1, 2.7, 10, 5.22, -18, goldMaterial);
  const highReward = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), goldMaterial);
  highReward.position.set(10, 6.1, -18);
  highReward.castShadow = true;
  group.add(highReward);
  animated.push({ object: highReward, spin: 1.4, bob: 0.35, baseY: 6.1 });

  // ---------- Plataforma final (recompensa) ----------
  addBox(5, 0.4, 5, -8.5, 4.0, 22, platformMaterial);
  addBox(5.2, 0.12, 5.2, -8.5, 4.24, 22, goldMaterial, { collide: false });
  const reward = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), goldMaterial);
  reward.position.set(-8.5, 5.2, 22);
  reward.castShadow = true;
  group.add(reward);
  animated.push({ object: reward, spin: 1.4, bob: 0.35, baseY: 5.2 });

  // ---------- Pilares ----------
  const bannerMaterialCyan = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.55,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const bannerMaterialMagenta = new THREE.MeshStandardMaterial({
    color: 0xf472b6,
    emissive: 0xec4899,
    emissiveIntensity: 0.55,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * 8.6;
    const z = Math.sin(angle) * 8.6;
    addCylinder(0.42, 0.55, 5, x, 2.5, z, pillarMaterial);
    batchBox(1.3, 0.3, 1.3, x, 5.1, z, platformMaterial);
    batchBox(1.1, 0.14, 1.1, x, 5.32, z, glowCyan);
    // Banner pendurado, voltado para o centro do lobby
    batchPlane(0.9, 2.2, x, 3.85, z, -angle + Math.PI / 2, index % 2 === 0 ? bannerMaterialCyan : bannerMaterialMagenta);
  }

  // ---------- Árvores low-poly ----------
  const treePositions: [number, number][] = [
    [10, 10],
    [-10, -10],
    [16, 2],
    [-16, -2],
    [8, -14],
    [-8, 14],
    [18, -12],
    [-18, 12],
  ];
  treePositions.forEach(([x, z], index) => {
    addCylinder(0.18, 0.28, 2.4, x, 1.2, z, trunkMaterial);
    const foliage = new THREE.Group();
    foliage.position.set(x, 3.1, z);
    const layerCount = 3;
    for (let layer = 0; layer < layerCount; layer += 1) {
      const radius = 1.5 - layer * 0.38;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, 1.5, 7),
        layer % 2 === 0 ? leafMaterial : leafMaterial2,
      );
      cone.position.y = layer * 0.85;
      cone.castShadow = true;
      cone.receiveShadow = true;
      foliage.add(cone);
    }
    group.add(foliage);
    animated.push({ object: foliage, spin: 0.15 + index * 0.02, bob: 0.05, baseY: 3.1 });
  });

  // ---------- Muros de limite ----------
  addBox(0.6, 2.4, 60, -29, 1.2, 0, wallMaterial);
  addBox(0.6, 2.4, 60, 29, 1.2, 0, wallMaterial);
  addBox(60, 2.4, 0.6, 0, 1.2, -29, wallMaterial);
  addBox(60, 2.4, 0.6, 0, 1.2, 29, wallMaterial);
  batchBox(0.7, 0.16, 60, -29, 2.48, 0, glowCyan);
  batchBox(0.7, 0.16, 60, 29, 2.48, 0, glowCyan);
  batchBox(60, 0.16, 0.7, 0, 2.48, -29, glowCyan);
  batchBox(60, 0.16, 0.7, 0, 2.48, 29, glowCyan);

  // ---------- Cubos flutuantes decorativos ----------
  const floatingCubes: [number, number, number][] = [
    [6, 6.5, 12],
    [-7, 7.5, 6],
    [12, 8.5, -12],
    [-12, 6.8, -6],
    [2, 9.5, -18],
    [-4, 8.2, 18],
  ];
  floatingCubes.forEach(([x, y, z], index) => {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      index % 2 === 0 ? platformTopMaterial : glowCyan,
    );
    cube.position.set(x, y, z);
    cube.castShadow = true;
    group.add(cube);
    animated.push({ object: cube, spin: 0.6 + index * 0.1, bob: 0.5, baseY: y });
  });

  // ---------- Portais de teletransporte ----------
  const buildPortal = (
    x: number,
    z: number,
    platformTop: number,
    ringColor: number,
    emissive: number,
    target: THREE.Vector3,
    particleColor: number,
    particleColor2: number,
  ): void => {
    addBox(3, 0.4, 3, x, platformTop - 0.2, z, platformMaterial);

    const portalGroup = new THREE.Group();
    portalGroup.position.set(x, platformTop + 1.5, z);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: ringColor,
      emissive,
      emissiveIntensity: 1.5,
      roughness: 0.25,
      metalness: 0.4,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.11, 14, 48), ringMaterial);
    ring.castShadow = true;
    portalGroup.add(ring);

    const discMaterial = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.18, 40), discMaterial);
    portalGroup.add(disc);

    const light = new THREE.PointLight(emissive, 14, 11, 1.8);
    light.position.set(0, 0.4, 0);
    portalGroup.add(light);

    group.add(portalGroup);
    animated.push({ object: portalGroup, spin: 0, bob: 0.12, baseY: portalGroup.position.y });

    portals.push({
      position: new THREE.Vector3(x, platformTop + 1.5, z),
      target,
      group: portalGroup,
      ringMaterial,
      discMaterial,
      light,
      particleColor,
      particleColor2,
    });
  };

  buildPortal(13, -6, 0.4, 0x22d3ee, 0x22d3ee, new THREE.Vector3(-13, 1.5, 4.6), 0x22d3ee, 0x9be8ff);
  buildPortal(-13, 6, 0.4, 0xec4899, 0xec4899, new THREE.Vector3(13, 1.5, -4.6), 0xec4899, 0xf9a8d4);
  buildPortal(-8.5, 22, 4.2, 0xf59e0b, 0xf59e0b, new THREE.Vector3(0, 1.6, 0), 0xfbbf24, 0xfff3c4);

  // ---------- Cenário distante: disco externo, montanhas e nuvens ----------
  const outerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(140, 48),
    new THREE.MeshStandardMaterial({ color: 0x1d3350, roughness: 0.95 }),
  );
  outerDisc.rotation.x = -Math.PI / 2;
  outerDisc.position.y = -0.9;
  group.add(outerDisc);

  const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x2b4a73, roughness: 0.9, flatShading: true });
  const mountainMaterial2 = new THREE.MeshStandardMaterial({ color: 0x3a5f8f, roughness: 0.9, flatShading: true });
  const mountainCount = 12;
  for (let index = 0; index < mountainCount; index += 1) {
    const angle = (index / mountainCount) * Math.PI * 2 + (index % 3) * 0.17;
    const radius = 68 + (index % 4) * 11;
    const height = 26 + ((index * 7) % 5) * 6;
    const mountainRadius = 16 + ((index * 5) % 4) * 5;
    batchCone(
      mountainRadius,
      height,
      Math.cos(angle) * radius,
      height / 2 - 2,
      Math.sin(angle) * radius,
      index % 2 === 0 ? mountainMaterial : mountainMaterial2,
      5 + (index % 2),
    );
  }

  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xdceeff,
    emissiveIntensity: 0.35,
    roughness: 1,
    flatShading: true,
  });
  const cloudPositions: [number, number, number][] = [
    [-40, 34, -30],
    [45, 38, 20],
    [-20, 42, 55],
    [30, 36, -55],
    [0, 44, -70],
    [-55, 40, 35],
  ];
  cloudPositions.forEach(([x, y, z], index) => {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);
    const puffCount = 3 + (index % 2);
    const puffGeometries: THREE.BufferGeometry[] = [];
    for (let puff = 0; puff < puffCount; puff += 1) {
      const puffGeometry = new THREE.SphereGeometry(2.6 + puff * 0.7, 10, 8);
      puffGeometry.scale(1.5, 0.55, 1);
      puffGeometry.translate(puff * 3.4 - puffCount * 1.6, (puff % 2) * 0.5, (puff % 3) * 0.8);
      puffGeometries.push(puffGeometry);
    }
    const mergedPuffs = mergeGeometries(puffGeometries, false);
    if (mergedPuffs) {
      const cloudMesh = new THREE.Mesh(mergedPuffs, cloudMaterial);
      cloud.add(cloudMesh);
    }
    group.add(cloud);
    clouds.push({ object: cloud, speed: 0.5 + index * 0.12 });
  });

  // ---------- Iluminação ----------
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x33463a, 0.95);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(30, 44, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);

  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.5);
  fill.position.set(-24, 20, -18);
  group.add(fill);

  group.add(createSky());

  // Funde todos os estáticos agrupados por material (1 draw call por material).
  flushBatch();

  // ---------- Plataformas kinematic (antes do step físico) ----------
  const preStep = (time: number): void => {
    // Plataforma móvel no eixo X
    const moverX = 6.2 + Math.sin(time * 0.7) * 2.0;
    physics.setKinematicTranslation(mover.body, moverX, 1.9, 23.2);
    moverMesh.position.x = moverX;
    moverTrim.position.x = moverX;

    // Plataforma que some: 1.7s ligada, 0.9s desligada
    const blinkOnNow = time % 2.6 < 1.7;
    if (blinkOnNow !== blinkerOn) {
      blinkerOn = blinkOnNow;
      blinker.collider.setEnabled(blinkOnNow);
      blinkerMesh.visible = blinkOnNow;
      blinkerTrim.visible = blinkOnNow;
    }

    // Varrredura giratória
    const sweeperAngle = time * 0.55;
    physics.setKinematicRotation(sweeper.body, 0, Math.sin(sweeperAngle / 2), 0, Math.cos(sweeperAngle / 2));
    sweeperMesh.rotation.y = sweeperAngle;
  };

  // ---------- Atualização ----------
  let particleTimer = 0;
  const update = (dt: number, time: number, particles: ParticleSystem | null): void => {
    for (const item of animated) {
      item.object.rotation.y += dt * item.spin;
      if (item.bob > 0) {
        item.object.position.y = item.baseY + Math.sin(time * 1.4 + item.spin * 10) * item.bob;
      }
    }

    // Nuvens derivando pelo céu
    for (const cloud of clouds) {
      cloud.object.position.x += dt * cloud.speed;
      if (cloud.object.position.x > 110) cloud.object.position.x = -110;
    }

    // Pulso do feixe de spawn
    spawnBeamMaterial.opacity = 0.08 + Math.sin(time * 1.8) * 0.035;

    for (const portal of portals) {
      portal.ringMaterial.emissiveIntensity = 1.3 + Math.sin(time * 2.4) * 0.45;
      portal.discMaterial.opacity = 0.34 + Math.sin(time * 3.1) * 0.12;
      portal.light.intensity = 12 + Math.sin(time * 2.4) * 4;
    }

    if (particles) {
      particleTimer += dt;
      if (particleTimer >= 0.14) {
        particleTimer = 0;
        for (const portal of portals) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 0.6 + Math.random() * 0.9;
          const origin = new THREE.Vector3(
            portal.position.x + Math.cos(angle) * radius,
            portal.position.y + (Math.random() - 0.5) * 1.4,
            portal.position.z + Math.sin(angle) * radius,
          );
          particles.burst(origin, {
            count: 2,
            color: portal.particleColor,
            color2: portal.particleColor2,
            speed: 0.35,
            up: 0.5,
            size: 0.9,
            life: 1.3,
            gravity: -0.5,
          });
        }
      }
    }
  };

  return {
    group,
    sun,
    hemi,
    portals,
    jumpPads,
    spawn: new THREE.Vector3(0, 1.45, 0),
    preStep,
    update,
  };
}
