import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';

const PARTICLE_COUNT = 131072; 

async function main() {
  const mount = document.querySelector('#app');

  if (!WebGPU.isAvailable()) {
    mount.appendChild(WebGPU.getErrorMessage());
    throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
  }

  const clock = new THREE.Clock();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050607');

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(0, 0, 11);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);

  const params = createParameters();
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  const attractorHelper = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );
  scene.add(attractorHelper);
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  // El movimiento del mouse actualiza la posición del cañón pero NO dispara por sí solo
  addEventListener('pointermove', (event) => {
    pointerNdc.x = (event.clientX / innerWidth) * 2 - 1;
    pointerNdc.y = -(event.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(interactionPlane, hit)) {
      params.attractor.value.copy(hit);
      attractorHelper.position.copy(hit);
      
      params.beamOrigin.value.copy(hit);
      if (hit.lengthSq() > 0.001) {
        params.beamDirection.value.copy(hit).normalize();
      }
    }
  });

  let paused = false;
  let mode = 'LAB';
  let panel;

  // Gatillo exclusivo: el disparo solo se activa al presionar el clic izquierdo
  addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || mode !== 'LAB') return; 
    if (params.beamEnabled.value > 0) {
      params.beamFiring.value = 1;
    }
  });

  addEventListener('pointerup', () => {
    params.beamFiring.value = 0;
  });

  const applyPreset = (id) => {
    params.windEnabled.value = 0;
    params.radialEnabled.value = 0;
    params.vortexEnabled.value = 0;
    params.dragEnabled.value = 0;
    params.waveEnabled.value = 0;
    params.beamEnabled.value = 0;
    params.beamFiring.value = 0;
    params.noiseEnabled.value = 0;
    params.wind.value.set(0, 0, 0);
    params.initialSpeed.value = 0;

    if (id === 'inertia') {
      params.initialSpeed.value = 0.8;
    } else if (id === 'wind') {
      params.windEnabled.value = 1;
      params.wind.value.set(1.5, 0, 0);
    } else if (id === 'attract') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 3.0;
    } else if (id === 'repel') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = -3.0;
    } else if (id === 'vortex') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 1.0;
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 3.0;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.08;
    } else if (id === 'waves') {
      params.waveEnabled.value = 1;
      params.waveStrength.value = 5.0; 
      params.waveFrequency.value = 2.0; 
      params.waveBPM.value = 120.0;
      params.waveRadius.value = 8.0; 
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.2;
    } else if (id === 'beam') {
      params.beamEnabled.value = 1;
      params.beamStrength.value = 150.0;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.15;
    } else if (id === 'noise') {
      params.noiseEnabled.value = 1;
      params.noiseStrength.value = 2.5;
      params.noiseFrequency.value = 1.5;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.1;
    }
    simulation.reset();
    panel?.refresh();
  };

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    axes.visible = lab;
    attractorHelper.visible = lab;
    orbit.enabled = lab;
    hud.innerHTML = lab
      ? '<strong>LAB</strong> · Mantén Clic Izq: Disparar Láser · R: reset · 1–8: pruebas aisladas'
      : '<strong>PERFORMANCE</strong> · P: lab · espacio: invertir radial · puntero: atractor';
  };

  panel = createLabPanel({
    params,
    onReset: () => simulation.reset(),
    onPreset: applyPreset,
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => paused = !paused
  });

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);
  setMode('LAB');

  let savedRadialStrength = params.radialStrength.value;
  addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') simulation.reset();
    if (event.code === 'Digit1') applyPreset('inertia');
    if (event.code === 'Digit2') applyPreset('wind');
    if (event.code === 'Digit3') applyPreset('attract');
    if (event.code === 'Digit4') applyPreset('repel');
    if (event.code === 'Digit5') applyPreset('vortex');
    if (event.code === 'Digit6') applyPreset('waves');
    if (event.code === 'Digit7') applyPreset('beam');
    if (event.code === 'Digit8') applyPreset('noise');

    if (event.code === 'Space') {
      event.preventDefault();
      savedRadialStrength = params.radialStrength.value || 2.0;
      params.radialEnabled.value = 1;
      params.radialStrength.value = -savedRadialStrength;
    }
  });

  addEventListener('keyup', (event) => {
    if (event.code === 'Space') params.radialStrength.value = savedRadialStrength;
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  simulation.reset();

  renderer.setAnimationLoop(() => {
    params.time.value = clock.getElapsedTime();
    if (!paused) simulation.stepSimulation();
    orbit.update();
    renderer.render(scene, camera);
  });
}

main().catch((error) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:16px;white-space:pre-wrap;color:#fff;z-index:50';
  pre.textContent = String(error?.stack || error);
  document.body.append(pre);
});