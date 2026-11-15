import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
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

export interface LobbyMapResult {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  portals: Portal[];
  spawn: THREE.Vector3;
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
  const animated: { object: THREE.Object3D; spin: number; bob: number; baseY: number }[] = [];

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

  // ---------- Escadarias ----------
  const stepCount = 6;
  const stepRise = 1.4 / stepCount;
  for (let index = 0; index < stepCount; index += 1) {
    const topY = stepRise * (index + 1);
    addBox(3, topY, 0.62, 0, topY / 2, 10.9 + index * 0.62, platformMaterial, { collide: false });
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
  addBox(4.3, 0.12, 4.3, 0, 1.44, 16.3, glowCyan, { collide: false });

  // ---------- Mini-obby ----------
  const obbyPlatforms: [number, number, number][] = [
    [3.2, 1.2, 21.0],
    [7.4, 1.9, 24.6],
    [4.6, 2.6, 28.8],
    [-0.6, 3.3, 30.6],
    [-5.4, 4.0, 27.4],
  ];
  obbyPlatforms.forEach(([x, y, z], index) => {
    addBox(2.6, 0.4, 2.6, x, y, z, platformTopMaterial);
    addBox(2.7, 0.1, 2.7, x, y + 0.22, z, index % 2 === 0 ? glowCyan : glowMagenta, { collide: false });
  });

  // Torre de teste de pulo
  const jumpTower: [number, number, number][] = [
    [-14, 0.9, -11],
    [-14, 1.8, -15],
    [-14, 2.7, -19],
  ];
  jumpTower.forEach(([x, y, z]) => {
    addBox(2.4, 0.4, 2.4, x, y, z, platformTopMaterial);
    addBox(2.5, 0.1, 2.5, x, y + 0.22, z, glowCyan, { collide: false });
  });

  // ---------- Plataforma final (recompensa) ----------
  addBox(5, 0.4, 5, -8.5, 4.0, 22, platformMaterial);
  addBox(5.2, 0.12, 5.2, -8.5, 4.24, 22, goldMaterial, { collide: false });
  const reward = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), goldMaterial);
  reward.position.set(-8.5, 5.2, 22);
  reward.castShadow = true;
  group.add(reward);
  animated.push({ object: reward, spin: 1.4, bob: 0.35, baseY: 5.2 });

  // ---------- Pilares ----------
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * 8.6;
    const z = Math.sin(angle) * 8.6;
    addCylinder(0.42, 0.55, 5, x, 2.5, z, pillarMaterial);
    addBox(1.3, 0.3, 1.3, x, 5.1, z, platformMaterial);
    addBox(1.1, 0.14, 1.1, x, 5.32, z, glowCyan, { collide: false });
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
  addBox(0.7, 0.16, 60, -29, 2.48, 0, glowCyan, { collide: false });
  addBox(0.7, 0.16, 60, 29, 2.48, 0, glowCyan, { collide: false });
  addBox(60, 0.16, 0.7, 0, 2.48, -29, glowCyan, { collide: false });
  addBox(60, 0.16, 0.7, 0, 2.48, 29, glowCyan, { collide: false });

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

  // ---------- Atualização ----------
  let particleTimer = 0;
  const update = (dt: number, time: number, particles: ParticleSystem | null): void => {
    for (const item of animated) {
      item.object.rotation.y += dt * item.spin;
      if (item.bob > 0) {
        item.object.position.y = item.baseY + Math.sin(time * 1.4 + item.spin * 10) * item.bob;
      }
    }

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
    spawn: new THREE.Vector3(0, 1.45, 0),
    update,
  };
}
