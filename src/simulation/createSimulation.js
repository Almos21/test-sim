import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  color,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  mod,
  step,
  uint,
  uv,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072 }) {
  // STATE -----------------------------------------------------------------
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');

  // INITIALIZATION --------------------------------------------------------
  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(37)));
    const r4 = hash(i.add(uint(53)));
    const r5 = hash(i.add(uint(71)));
    const r6 = hash(i.add(uint(89)));

    p.assign(vec3(r1, r2, r3).sub(0.5).mul(params.boundsSize.mul(0.45)));
    v.assign(vec3(r4, r5, r6).sub(0.5).mul(params.initialSpeed));
  })().compute(count).setName('Initialize Particles');

  // UPDATE / COMPUTE SHADER ----------------------------------------------
  const updateParticles = Fn(() => {
    const p = positionBuffer.element(instanceIndex);
    const v = velocityBuffer.element(instanceIndex);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    // 1) CONSTANT / WIND FORCE
    force.addAssign(params.wind.mul(params.windEnabled));

    // Vector compartido para fuerzas que usan el cursor (Attractor y Ondas)
    const toCursor = params.attractor.sub(p);
    const distanceToCursor = max(toCursor.length(), params.softening);
    const dirCursor = toCursor.div(distanceToCursor);

    // 2) RADIAL FORCE
    const radialForce = dirCursor
      .mul(params.radialStrength)
      .div(distanceToCursor.pow(2))
      .mul(params.radialEnabled);
    force.addAssign(radialForce);

    // 3) VORTEX FORCE
    const zAxis = vec3(0.0, 0.0, 1.0);
    const tangent = zAxis.cross(dirCursor);
    force.addAssign(tangent.mul(params.vortexStrength).mul(params.vortexEnabled));

    // 4) WAVE FORCE (NUEVA FUERZA)
    // Ecuación: sin(distancia * frecuencia - tiempo * velocidad)
    const wavePhase = distanceToCursor.mul(params.waveFrequency).sub(params.time.mul(params.waveSpeed));
    const waveOscillation = wavePhase.sin(); 
    
    // Máscara de límite: devuelve 1.0 si distanceToCursor < waveRadius, de lo contrario 0.0
    const insideLimit = step(distanceToCursor, params.waveRadius);

    const waveForce = dirCursor
      .mul(waveOscillation)
      .mul(params.waveStrength)
      .mul(insideLimit)
      .mul(params.waveEnabled);
    
    force.addAssign(waveForce);

    // 5) LINEAR DRAG: F = -c v
    force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(-1.0));

    // INTEGRATION ---------------------------------------------------------
    v.addAssign(force.mul(dt));

    const speed = v.length();
    If(speed.greaterThan(params.maxSpeed), () => {
      v.assign(v.normalize().mul(params.maxSpeed));
    });

    p.addAssign(v.mul(dt));

    // Periodic boundary conditions
    const half = params.boundsSize.mul(0.5);
    p.assign(mod(p.add(half), params.boundsSize).sub(half));
  })().compute(count).setName('Update Particles');

  // RENDER ---------------------------------------------------------------
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  material.positionNode = positionBuffer.toAttribute();
  material.scaleNode = params.particleSize;

  material.colorNode = Fn(() => {
    const speed = velocityBuffer.toAttribute().length();
    const t = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const slow = color('#46a6ff');
    const fast = color('#ffb35a');
    return vec4(mix(slow, fast, t), 1.0);
  })();

  material.opacityNode = step(uv().xy.sub(0.5).length(), 0.5);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function reset() {
    renderer.compute(initParticles);
  }

  function stepSimulation() {
    renderer.compute(updateParticles);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return {
    count,
    positionBuffer,
    velocityBuffer,
    reset,
    stepSimulation,
    dispose
  };
}