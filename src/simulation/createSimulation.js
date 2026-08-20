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
  // 1) ESTADO -------------------------------------------------------------
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');

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

  // 2) FUERZAS -----------------------------------------------------------
  const updateParticles = Fn(() => {
    const p = positionBuffer.element(instanceIndex);
    const v = velocityBuffer.element(instanceIndex);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    force.addAssign(params.wind.mul(params.windEnabled));

    const toCursor = params.attractor.sub(p);
    const distanceToCursor = max(toCursor.length(), params.softening);
    const dirCursor = toCursor.div(distanceToCursor);

    // MODIFICADO: Decaimiento lineal (1.0 en el centro, 0.0 en el límite del radio)
    const falloff = max(params.radialRadius.sub(distanceToCursor), 0.0).div(params.radialRadius);
    const radialForce = dirCursor
      .mul(params.radialStrength)
      .mul(falloff)
      .mul(params.radialEnabled);
    force.addAssign(radialForce);

    const zAxis = vec3(0.0, 0.0, 1.0);
    const tangent = zAxis.cross(dirCursor);
    force.addAssign(tangent.mul(params.vortexStrength).mul(params.vortexEnabled));

    const beatsPerSecond = params.waveBPM.div(60.0);
    const angularVelocity = beatsPerSecond.mul(Math.PI * 2.0);
    const wavePhase = distanceToCursor.mul(params.waveFrequency).sub(params.time.mul(angularVelocity));
    const waveOscillation = wavePhase.sin(); 
    const insideLimit = step(distanceToCursor, params.waveRadius);

    const waveForce = dirCursor
      .mul(waveOscillation)
      .mul(params.waveStrength)
      .mul(insideLimit)
      .mul(params.waveEnabled);
    force.addAssign(waveForce);

    force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(-1.0));

    // 3) INTEGRACIÓN ------------------------------------------------------
    v.addAssign(force.mul(dt));

    const speed = v.length();
    If(speed.greaterThan(params.maxSpeed), () => {
      v.assign(v.normalize().mul(params.maxSpeed));
    });

    p.addAssign(v.mul(dt));

    const half = params.boundsSize.mul(0.5);
    p.assign(mod(p.add(half), params.boundsSize).sub(half));
  })().compute(count).setName('Update Particles');

  // 4) RENDER -------------------------------------------------------------
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  material.positionNode = positionBuffer.toAttribute();
  
  // Las partículas disparadas irán tan rápido que se estirarán solas visualmente
  material.scaleNode = params.particleSize;

  material.colorNode = Fn(() => {
    const speed = velocityBuffer.toAttribute().length();
    const t = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    
    // MODIFICADO: Ampliación del rango de color (5 etapas)
    const c1 = color('#0011ff'); // Azul profundo (Lento)
    const c2 = color('#00ffff'); // Cian
    const c3 = color('#11ff00'); // Verde
    const c4 = color('#ff006a'); // Rojo
    const c5 = color('#ff00dd'); // Rosa (Disparo/Pistola)
    
    // Mezcla segmentada
    const step1 = t.mul(4.0).clamp(0.0, 1.0);
    const mix1 = mix(c1, c2, step1);
    
    const step2 = t.sub(0.25).mul(4.0).clamp(0.0, 1.0);
    const mix2 = mix(mix1, c3, step2);
    
    const step3 = t.sub(0.5).mul(4.0).clamp(0.0, 1.0);
    const mix3 = mix(mix2, c4, step3);
    
    const step4 = t.sub(0.75).mul(4.0).clamp(0.0, 1.0);
    const finalColor = mix(mix3, c5, step4);

    return vec4(finalColor, 1.0);
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