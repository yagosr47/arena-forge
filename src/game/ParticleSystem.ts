import * as THREE from 'three';

export interface BurstOptions {
  count?: number;
  color?: number;
  color2?: number;
  /** velocidade inicial máxima */
  speed?: number;
  /** impulso vertical extra */
  up?: number;
  size?: number;
  life?: number;
  gravity?: number;
  /** dispersão horizontal (0 = esfera, 1 = anel rasteiro) */
  flat?: number;
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (240.0 / max(0.1, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;
    float mask = smoothstep(0.5, 0.05, dist);
    float core = smoothstep(0.22, 0.0, dist);
    vec3 color = vColor + core * 0.6;
    gl_FragColor = vec4(color, vAlpha * mask);
  }
`;

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly max: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly baseAlpha: Float32Array;
  private cursor = 0;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly colorAttribute: THREE.BufferAttribute;
  private readonly sizeAttribute: THREE.BufferAttribute;
  private readonly alphaAttribute: THREE.BufferAttribute;

  constructor(max = 1400) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.velocities = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);

    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3);
    this.sizeAttribute = new THREE.BufferAttribute(this.sizes, 1);
    this.alphaAttribute = new THREE.BufferAttribute(this.alphas, 1);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aColor', this.colorAttribute);
    this.geometry.setAttribute('aSize', this.sizeAttribute);
    this.geometry.setAttribute('aAlpha', this.alphaAttribute);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  burst(origin: THREE.Vector3, options: BurstOptions = {}): void {
    const count = options.count ?? 24;
    const colorA = new THREE.Color(options.color ?? 0x9be8ff);
    const colorB = new THREE.Color(options.color2 ?? options.color ?? 0xffffff);
    const speed = options.speed ?? 3.2;
    const up = options.up ?? 1.4;
    const size = options.size ?? 1.6;
    const life = options.life ?? 0.7;
    const gravity = options.gravity ?? 5.5;
    const flat = options.flat ?? 0;

    for (let n = 0; n < count; n += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;

      const theta = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.5) * flat;
      const horizontal = Math.cos(theta) * radius * speed;
      const horizontalZ = Math.sin(theta) * radius * speed;
      const vertical = (1 - flat) * (Math.random() * 0.9 + 0.15) * speed * 0.6 + up * Math.random();

      this.positions[index * 3] = origin.x + (Math.random() - 0.5) * 0.2;
      this.positions[index * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.12;
      this.positions[index * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.2;
      this.velocities[index * 3] = horizontal;
      this.velocities[index * 3 + 1] = vertical;
      this.velocities[index * 3 + 2] = horizontalZ;

      const mix = Math.random();
      this.colors[index * 3] = colorA.r + (colorB.r - colorA.r) * mix;
      this.colors[index * 3 + 1] = colorA.g + (colorB.g - colorA.g) * mix;
      this.colors[index * 3 + 2] = colorA.b + (colorB.b - colorA.b) * mix;

      const lifeTime = life * (0.65 + Math.random() * 0.6);
      this.life[index] = lifeTime;
      this.maxLife[index] = lifeTime;
      this.gravity[index] = gravity;
      this.drag[index] = 1.6 + Math.random() * 1.4;
      this.baseAlpha[index] = 0.55 + Math.random() * 0.45;
      this.sizes[index] = size * (0.5 + Math.random() * 0.9);
      this.alphas[index] = this.baseAlpha[index];
    }
  }

  update(dt: number): void {
    const max = this.max;
    for (let index = 0; index < max; index += 1) {
      if (this.life[index] <= 0) {
        if (this.alphas[index] !== 0) this.alphas[index] = 0;
        continue;
      }
      this.life[index] -= dt;
      const dragFactor = Math.max(0, 1 - this.drag[index] * dt);
      this.velocities[index * 3] *= dragFactor;
      this.velocities[index * 3 + 2] *= dragFactor;
      this.velocities[index * 3 + 1] = this.velocities[index * 3 + 1] * dragFactor - this.gravity[index] * dt;

      this.positions[index * 3] += this.velocities[index * 3] * dt;
      this.positions[index * 3 + 1] += this.velocities[index * 3 + 1] * dt;
      this.positions[index * 3 + 2] += this.velocities[index * 3 + 2] * dt;

      const ratio = Math.max(0, this.life[index] / this.maxLife[index]);
      this.alphas[index] = this.baseAlpha[index] * ratio * ratio;
    }
    this.positionAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
  }

  setEnabled(enabled: boolean): void {
    this.points.visible = enabled;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
