import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0), 
    initialSpeed: uniform(0.0), // Inicia totalmente quieto
    maxSpeed: uniform(30.0),
    boundsSize: uniform(20.0,30.0),
    particleSize: uniform(0.035),

    windEnabled: uniform(0.0),
    wind: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),

    radialEnabled: uniform(0.0), // Apagado
    attractor: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    radialStrength: uniform(2.2),
    radialRadius: uniform(8.0),
    softening: uniform(0.35),

    vortexEnabled: uniform(0.0), // Apagado
    vortexStrength: uniform(1.4),

    dragEnabled: uniform(1.0), // Fricción activa para estabilizar partículas
    dragCoefficient: uniform(0.12),

    waveEnabled: uniform(0.0), // Apagado
    waveStrength: uniform(5.0),
    waveFrequency: uniform(2.0),
    waveBPM: uniform(130.0), 
    waveRadius: uniform(4.0),

    beamEnabled: uniform(0.0), // Apagado
    beamFiring: uniform(0.0),
    beamOrigin: uniform(new THREE.Vector3(0, 0, 0)),
    beamDirection: uniform(new THREE.Vector3(0, 1, 0)),
    beamStrength: uniform(130.0),
    beamRadius: uniform(0.3),

    binaryEnabled: uniform(0.0), // Apagado
    binaryGravity: uniform(3.0),
    repulsionChance: uniform(0), 
    repulsionStrength: uniform(0) 
  };
}
