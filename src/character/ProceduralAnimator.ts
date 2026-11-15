import * as THREE from 'three';
import type { RigParts } from './RobloxRigBuilder';

export interface AnimState {
  dt: number;
  time: number;
  /** Velocidade horizontal real (m/s) */
  speed: number;
  sprinting: boolean;
  grounded: boolean;
  verticalVelocity: number;
}

const MAX_SPEED = 7.6;

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/**
 * Animação procedural: curvas senoidais, lerp amortecido e tilt dinâmico.
 * Cobre idle (respiração), walk/run (balanço oposto + bobbing), jump/fall
 * (pose de impulsão e braços erguidos) e squash & stretch na aterrissagem.
 */
export class ProceduralAnimator {
  private walkPhase = 0;
  private landTimer = 0;
  private landIntensity = 0;
  private landingPending = false;
  private capeSway = 0;

  /** Chamado pelo Game quando detecta o impacto da aterrissagem. */
  onLand(intensity: number): void {
    this.landTimer = 0.32;
    this.landIntensity = Math.min(1, Math.max(0.25, intensity));
    this.landingPending = true;
  }

  /** Consome o evento de aterrissagem (retorna a intensidade ou 0). */
  consumeLanding(): number {
    if (!this.landingPending) return 0;
    this.landingPending = false;
    return this.landIntensity;
  }

  update(rig: RigParts, state: AnimState): void {
    const { dt, time, speed, sprinting, grounded, verticalVelocity } = state;
    const speedRatio = Math.min(1, speed / MAX_SPEED);
    const strideFrequency = 2.4 + speed * 1.35;

    if (speed > 0.2) {
      this.walkPhase += dt * strideFrequency;
    }

    const swing = Math.sin(this.walkPhase);
    const counterSwing = Math.sin(this.walkPhase + Math.PI);
    const legAmplitude = 0.82 * speedRatio;
    const armAmplitude = (sprinting ? 0.85 : 0.62) * speedRatio;

    // ----- Alvos por membro -----
    let leftLegTarget = swing * legAmplitude;
    let rightLegTarget = counterSwing * legAmplitude;
    let leftArmTarget = counterSwing * armAmplitude;
    let rightArmTarget = swing * armAmplitude;
    let leftArmZ = 0.08;
    let rightArmZ = -0.08;
    let torsoLean = 0.16 * speedRatio;

    if (!grounded) {
      if (verticalVelocity > 1.2) {
        // Subida: pernas recolhidas e braços erguidos
        leftLegTarget = 0.62;
        rightLegTarget = -0.4;
        leftArmTarget = -0.55;
        rightArmTarget = -0.55;
        leftArmZ = 0.65;
        rightArmZ = -0.65;
        torsoLean = -0.06;
      } else {
        // Queda: braços abertos e pernas soltas
        leftLegTarget = 0.2;
        rightLegTarget = -0.16;
        leftArmTarget = -0.35;
        rightArmTarget = -0.35;
        leftArmZ = 1.15;
        rightArmZ = -1.15;
        torsoLean = 0.08;
      }
    } else if (speed < 0.2) {
      // Idle: braços relaxados com balanço sutil
      const breathe = Math.sin(time * 1.9);
      leftArmZ = 0.09 + breathe * 0.025;
      rightArmZ = -0.09 - breathe * 0.025;
      leftArmTarget = breathe * 0.04;
      rightArmTarget = -breathe * 0.04;
    }

    const lambda = grounded ? 14 : 9;
    rig.leftLeg.rotation.x = damp(rig.leftLeg.rotation.x, leftLegTarget, lambda, dt);
    rig.rightLeg.rotation.x = damp(rig.rightLeg.rotation.x, rightLegTarget, lambda, dt);
    rig.leftArm.rotation.x = damp(rig.leftArm.rotation.x, leftArmTarget, lambda, dt);
    rig.rightArm.rotation.x = damp(rig.rightArm.rotation.x, rightArmTarget, lambda, dt);
    rig.leftArm.rotation.z = damp(rig.leftArm.rotation.z, leftArmZ, lambda, dt);
    rig.rightArm.rotation.z = damp(rig.rightArm.rotation.z, rightArmZ, lambda, dt);

    // ----- Tronco: tilt de corrida + respiração -----
    rig.torso.rotation.x = damp(rig.torso.rotation.x, torsoLean, 8, dt);
    const breath = grounded && speed < 0.2 ? Math.sin(time * 2.2) * 0.018 : 0;
    rig.torso.scale.y = 1 + breath;

    // ----- Cabeça: olhar natural (idle) / focado (movimento) -----
    const headYawTarget = speed < 0.2 ? Math.sin(time * 0.55) * 0.2 : 0;
    const headPitchTarget = !grounded && verticalVelocity < -3 ? -0.12 : Math.sin(time * 0.9) * 0.04;
    rig.head.rotation.y = damp(rig.head.rotation.y, headYawTarget, 6, dt);
    rig.head.rotation.x = damp(rig.head.rotation.x, headPitchTarget, 6, dt);

    // ----- Bobbing vertical a cada passo -----
    const bobTarget = grounded ? Math.abs(Math.sin(this.walkPhase)) * 0.055 * speedRatio : 0;
    rig.body.position.y = damp(rig.body.position.y, bobTarget, 12, dt);

    // ----- Squash & stretch -----
    if (this.landTimer > 0) {
      this.landTimer = Math.max(0, this.landTimer - dt);
      const progress = 1 - this.landTimer / 0.32;
      const envelope = Math.sin(Math.min(1, progress) * Math.PI);
      const squash = envelope * 0.3 * this.landIntensity;
      rig.body.scale.set(1 + squash * 0.7, 1 - squash, 1 + squash * 0.7);
    } else if (!grounded) {
      const stretch = THREE.MathUtils.clamp(verticalVelocity / 14, -0.1, 0.16);
      rig.body.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    } else {
      rig.body.scale.x = damp(rig.body.scale.x, 1, 12, dt);
      rig.body.scale.y = damp(rig.body.scale.y, 1, 12, dt);
      rig.body.scale.z = damp(rig.body.scale.z, 1, 12, dt);
    }

    // ----- Capa -----
    this.capeSway += dt * (2.2 + speedRatio * 5);
    rig.cape.rotation.x = 0.12 + speedRatio * 0.4 + Math.sin(this.capeSway) * 0.06 + (grounded ? 0 : 0.45);
    rig.cape.rotation.z = Math.sin(this.capeSway * 0.7) * 0.05;

    // ----- Aura de movimento -----
    rig.aura.rotation.z += dt * (0.5 + speedRatio * 3.2);
    const auraMaterial = rig.aura.material as THREE.MeshBasicMaterial;
    auraMaterial.opacity = 0.35 + Math.sin(time * 4) * 0.12 + speedRatio * 0.25;
    const auraScale = 1 + speedRatio * 0.3;
    rig.aura.scale.setScalar(damp(rig.aura.scale.x, auraScale, 8, dt));

    // ----- Brilho do visor -----
    const visorMaterial = rig.visor.material as THREE.MeshStandardMaterial;
    visorMaterial.emissiveIntensity = 0.55 + Math.sin(time * 3.1) * 0.2;
  }
}
