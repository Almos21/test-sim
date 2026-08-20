import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0), 
    initialSpeed: uniform(0.35),
    maxSpeed: uniform(15.0), // Aumentado para que el disparo alcance mayor velocidad visual
    boundsSize: uniform(10.0),
    particleSize: uniform(0.035),

    windEnabled: uniform(0.0),
    wind: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),

    radialEnabled: uniform(1.0),
    attractor: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    radialStrength: uniform(2.2),
    radialRadius: uniform(8.0), // NUEVO: Límite del radio para el decaimiento lineal
    softening: uniform(0.35),

    vortexEnabled: uniform(1.0),
    vortexStrength: uniform(1.4),

    dragEnabled: uniform(1.0),
    dragCoefficient: uniform(0.12),

    // FUERZA: ONDAS SINCRONIZADAS
    waveEnabled: uniform(0.0),
    waveStrength: uniform(5.0),
    waveFrequency: uniform(2.0),
    waveBPM: uniform(120.0), 
    waveRadius: uniform(4.0)
  };
}