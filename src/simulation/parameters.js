import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

// Uniforms are CPU-side values that TSL exposes to the GPU.
// Changing .value does not rebuild the compute shader.
export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0), // NUEVO: Tiempo continuo para animar la onda
    initialSpeed: uniform(0.35),
    maxSpeed: uniform(5.0),
    boundsSize: uniform(10.0),
    particleSize: uniform(0.035),

    windEnabled: uniform(0.0),
    wind: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),

    radialEnabled: uniform(1.0),
    attractor: uniform(new THREE.Vector3(0.0, 0.0, 0.0)), // Usaremos este como posición del cursor
    radialStrength: uniform(2.2),
    softening: uniform(0.35),

    vortexEnabled: uniform(1.0),
    vortexStrength: uniform(1.4),

    dragEnabled: uniform(1.0),
    dragCoefficient: uniform(0.12),

    // NUEVA FUERZA: ONDAS
    waveEnabled: uniform(0.0), // Apagado por defecto para aislar
    waveStrength: uniform(5.0), // Magnitud y Signo
    waveFrequency: uniform(2.0), // Qué tan juntas están las ondas
    waveSpeed: uniform(15.0), // Velocidad de expansión
    waveRadius: uniform(4.0) // Límite de influencia
  };
}