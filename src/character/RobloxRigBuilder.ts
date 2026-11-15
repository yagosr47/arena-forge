import * as THREE from 'three';

export interface RigParts {
  root: THREE.Group;
  /** Grupo interno onde o animator aplica bob/squash (não move os pés do chão). */
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  cape: THREE.Mesh;
  aura: THREE.Mesh;
  visor: THREE.Mesh;
}

const COLORS = {
  head: 0xffd166,
  torso: 0x2f7df6,
  torsoDark: 0x1d5cc0,
  arm: 0xffd166,
  hand: 0xffe6a3,
  leg: 0x2b3a67,
  shoe: 0x141d31,
  trim: 0x22d3ee,
  backpack: 0x0e7490,
  cape: 0xf43f5e,
  aura: 0x22d3ee,
};

function standard(color: number, options: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.62,
    metalness: options.metalness ?? 0.08,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
  });
}

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(0, 0, 256, 256);

    // Visor escuro
    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.roundRect(34, 62, 188, 96, 26);
    ctx.fill();

    // Brilho do visor
    const gradient = ctx.createLinearGradient(34, 62, 222, 158);
    gradient.addColorStop(0, 'rgba(34, 211, 238, 0.35)');
    gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.05)');
    gradient.addColorStop(1, 'rgba(34, 211, 238, 0.28)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(34, 62, 188, 96, 26);
    ctx.fill();

    // Olhos brilhantes
    ctx.fillStyle = '#7df9ff';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(66, 94, 42, 26, 10);
    ctx.roundRect(148, 94, 42, 26, 10);
    ctx.fill();

    // Sorriso
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#123047';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 196, 34, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Constrói o personagem articulado estilo Roblox (R15/blocky moderno) com
 * hierarquia de pivôs correta: braços e pernas giram a partir do ombro/quadril.
 */
export function buildRobloxRig(): RigParts {
  const legLength = 0.72;
  const torsoHeight = 0.72;
  const torsoWidth = 0.62;
  const torsoDepth = 0.36;
  const headSize = 0.46;
  const armLength = 0.66;
  const armWidth = 0.22;
  const legWidth = 0.26;

  const root = new THREE.Group();
  root.name = 'roblox-rig';
  const body = new THREE.Group();
  body.name = 'rig-body';
  root.add(body);

  const headMaterial = standard(COLORS.head, { roughness: 0.5 });
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: createFaceTexture(),
    roughness: 0.45,
    metalness: 0.05,
  });
  const torsoMaterial = standard(COLORS.torso, { roughness: 0.55 });
  const limbMaterial = standard(COLORS.arm, { roughness: 0.6 });
  const legMaterial = standard(COLORS.leg, { roughness: 0.7 });
  const shoeMaterial = standard(COLORS.shoe, { roughness: 0.45, metalness: 0.15 });
  const trimMaterial = standard(COLORS.trim, {
    roughness: 0.3,
    metalness: 0.4,
    emissive: COLORS.trim,
    emissiveIntensity: 0.9,
  });

  // ----- Pernas (pivô no quadril) -----
  const buildLeg = (side: 1 | -1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set((side * legWidth) / 2, legLength, 0);

    const thigh = box(legWidth, legLength, legWidth * 1.08, legMaterial);
    thigh.position.y = -legLength / 2;
    pivot.add(thigh);

    const shoe = box(legWidth * 1.06, legLength * 0.26, legWidth * 1.5, shoeMaterial);
    shoe.position.set(0, -legLength + legLength * 0.13, legWidth * 0.18);
    pivot.add(shoe);

    body.add(pivot);
    return pivot;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // ----- Tronco -----
  const torso = new THREE.Group();
  torso.position.y = legLength;
  body.add(torso);

  const chest = box(torsoWidth, torsoHeight, torsoDepth, torsoMaterial);
  chest.position.y = torsoHeight / 2;
  torso.add(chest);

  const belly = box(torsoWidth * 0.86, torsoHeight * 0.34, torsoDepth * 1.04, standard(COLORS.torsoDark));
  belly.position.y = torsoHeight * 0.2;
  torso.add(belly);

  const chestTrim = box(torsoWidth * 0.7, torsoHeight * 0.1, torsoDepth * 1.02, trimMaterial);
  chestTrim.position.y = torsoHeight * 0.66;
  torso.add(chestTrim);

  const collar = box(torsoWidth * 0.72, torsoHeight * 0.08, torsoDepth * 1.02, trimMaterial);
  collar.position.y = torsoHeight * 0.94;
  torso.add(collar);

  // ----- Braços (pivô no ombro) -----
  const buildArm = (side: 1 | -1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (torsoWidth / 2 + armWidth / 2 - 0.02), legLength + torsoHeight - 0.1, 0);

    const arm = box(armWidth, armLength, armWidth, limbMaterial);
    arm.position.y = -armLength / 2;
    pivot.add(arm);

    const hand = box(armWidth * 0.94, armLength * 0.2, armWidth * 0.94, standard(COLORS.hand));
    hand.position.y = -armLength + armLength * 0.1;
    pivot.add(hand);

    const shoulderPad = box(armWidth * 1.25, armLength * 0.22, armWidth * 1.25, torsoMaterial);
    shoulderPad.position.y = -armLength * 0.08;
    pivot.add(shoulderPad);

    body.add(pivot);
    return pivot;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // ----- Cabeça (pivô no pescoço) -----
  const head = new THREE.Group();
  head.position.y = legLength + torsoHeight + headSize / 2 + 0.03;
  body.add(head);

  const headMesh = new THREE.Mesh(
    new THREE.BoxGeometry(headSize, headSize, headSize),
    [headMaterial, headMaterial, headMaterial, headMaterial, faceMaterial, headMaterial],
  );
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  head.add(headMesh);

  const hair = box(headSize * 1.08, headSize * 0.42, headSize * 1.08, standard(0x20304e, { roughness: 0.75 }));
  hair.position.y = headSize * 0.42;
  head.add(hair);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(headSize * 0.86, headSize * 0.42, 0.03),
    new THREE.MeshStandardMaterial({
      color: 0x9be8ff,
      transparent: true,
      opacity: 0.24,
      roughness: 0.12,
      metalness: 0.6,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.25,
    }),
  );
  visor.position.set(0, headSize * 0.06, headSize / 2 + 0.02);
  head.add(visor);

  const antenna = box(0.05, 0.22, 0.05, trimMaterial);
  antenna.position.set(headSize * 0.28, headSize * 0.62, 0);
  head.add(antenna);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), trimMaterial);
  antennaTip.position.set(headSize * 0.28, headSize * 0.74, 0);
  antennaTip.castShadow = true;
  head.add(antennaTip);

  // ----- Mochila -----
  const backpack = box(torsoWidth * 0.62, torsoHeight * 0.62, 0.16, standard(COLORS.backpack, { roughness: 0.5 }));
  backpack.position.set(0, torsoHeight * 0.5, -torsoDepth / 2 - 0.1);
  torso.add(backpack);

  const backpackPocket = box(torsoWidth * 0.4, torsoHeight * 0.3, 0.08, standard(0x155e75));
  backpackPocket.position.set(0, torsoHeight * 0.42, -torsoDepth / 2 - 0.2);
  torso.add(backpackPocket);

  // ----- Capa -----
  const capeGeometry = new THREE.PlaneGeometry(torsoWidth * 0.95, torsoHeight * 1.15, 6, 8);
  const cape = new THREE.Mesh(
    capeGeometry,
    new THREE.MeshStandardMaterial({
      color: COLORS.cape,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );
  cape.castShadow = true;
  cape.position.set(0, torsoHeight * 0.92, -torsoDepth / 2 - 0.06);
  cape.rotation.y = Math.PI;
  cape.rotation.x = 0.12;
  torso.add(cape);

  // ----- Aura / anel de movimento -----
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.86, 48),
    new THREE.MeshBasicMaterial({
      color: COLORS.aura,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.04;
  root.add(aura);

  return {
    root,
    body,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    cape,
    aura,
    visor,
  };
}
