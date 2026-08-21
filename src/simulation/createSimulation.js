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

    // -- Viento
    force.addAssign(params.wind.mul(params.windEnabled));

    // -- Radial
    const toCursor = params.attractor.sub(p);
    const distanceToCursor = max(toCursor.length(), params.softening);
    const dirCursor = toCursor.div(distanceToCursor);
    const falloff = max(params.radialRadius.sub(distanceToCursor), 0.0).div(params.radialRadius);
    const radialForce = dirCursor
      .mul(params.radialStrength)
      .mul(falloff)
      .mul(params.radialEnabled);
    force.addAssign(radialForce);

    // -- Vórtice
    const zAxis = vec3(0.0, 0.0, 1.0);
    const tangent = zAxis.cross(dirCursor);
    force.addAssign(tangent.mul(params.vortexStrength).mul(params.vortexEnabled));

    // -- Ondas BPM
    const beatsPerSecond = params.waveBPM.div(60.0);
    const angularVelocity = beatsPerSecond.mul(Math.PI * 2.0);
    const wavePhase = distanceToCursor.mul(params.waveFrequency).sub(params.time.mul(angularVelocity));
    const waveOscillation = wavePhase.sin(); 
    const insideWaveLimit = step(distanceToCursor, params.waveRadius);
    const waveForce = dirCursor
      .mul(waveOscillation)
      .mul(params.waveStrength)
      .mul(insideWaveLimit)
      .mul(params.waveEnabled);
    force.addAssign(waveForce);

    // -- Rayo / Cañón (Solo aplica si beamEnabled Y beamFiring están activos)
    const toParticleBeam = p.sub(params.beamOrigin);
    const projection = toParticleBeam.dot(params.beamDirection); 
    const closestPointOnLine = params.beamDirection.mul(projection);
    const orthoVector = toParticleBeam.sub(closestPointOnLine);
    const distanceToBeam = orthoVector.length();

    const inFront = step(0.0, projection);
    const beamFalloff = max(params.beamRadius.sub(distanceToBeam), 0.0).div(params.beamRadius);
    
    const beamForce = params.beamDirection
      .mul(params.beamStrength)
      .mul(beamFalloff)
      .mul(inFront)
      .mul(params.beamEnabled)
      .mul(params.beamFiring); 
    force.addAssign(beamForce);

    // -- NUEVO: GRAVEDAD BINARIA Y CHOQUES (Estilo Particle Life)
    // 1. Gravedad 50/50 asignada por el ID único de la partícula
    const isUp = step(0.5, hash(instanceIndex.add(uint(777)))); 
    const yDir = isUp.mul(2.0).sub(1.0); // 1.0 (Sube) o -1.0 (Baja)
    const gravityForce = vec3(0.0, yDir, 0.0).mul(params.binaryGravity);

    // 2. Micro-colisiones probabilísticas (Motor de Falsa Colisión)
    // Creamos una semilla aleatoria que cambia con el tiempo
    const timeUint = uint(params.time.mul(60.0));
    const randomSeed = instanceIndex.add(timeUint);
    const chanceVal = hash(randomSeed);
    
    // Evaluamos si ocurre el choque (ej: 0.5% de probabilidad = mayor a 0.995)
    const threshold = params.repulsionChance.div(100.0).mul(-1.0).add(1.0);
    const isCollision = step(threshold, chanceVal);
    
    // Calculamos un vector de repulsión esférica aleatorio súper violento
    const burstDir = vec3(
      hash(randomSeed.add(uint(1))),
      hash(randomSeed.add(uint(2))),
      hash(randomSeed.add(uint(3)))
    ).sub(0.5).normalize();
    
    const burstForce = burstDir.mul(params.repulsionStrength).mul(isCollision);
    
    // Sumamos la gravedad constante y el estallido repentino
    const binaryLifeForce = gravityForce.add(burstForce).mul(params.binaryEnabled);
    force.addAssign(binaryLifeForce);

    // -- Drag / Fricción
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

  // 4) RENDER (Rango de color de 5 etapas) -------------------------------
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
    
    const c1 = color('#0011ff'); // Azul
    const c2 = color('#00ffff'); // Cian
    const c3 = color('#11ff00'); // Verde
    const c4 = color('#ffcc00'); // Amarillo
    const c5 = color('#ff0000'); // Rojo
    
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

  function reset() { renderer.compute(initParticles); }
  function stepSimulation() { renderer.compute(updateParticles); }
  function dispose() {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return { count, positionBuffer, velocityBuffer, reset, stepSimulation, dispose };
}