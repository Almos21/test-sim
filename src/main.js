import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';

const PARTICLE_COUNT = 131072; 

async function main() {
  const mount = document.querySelector('#app');
  if (!WebGPU.isAvailable()) { mount.appendChild(WebGPU.getErrorMessage()); return; }

  const clock = new THREE.Clock();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030405'); // Fondo un poco más oscuro

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(0, 0, 11);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const params = createParameters();
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  // Controles
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  // Raycaster y Atractor
  addEventListener('pointermove', (event) => {
    pointerNdc.x = (event.clientX / innerWidth) * 2 - 1;
    pointerNdc.y = -(event.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(interactionPlane, hit)) {
      params.attractor.value.copy(hit);
      params.beamOrigin.value.copy(hit);
      if (hit.lengthSq() > 0.001) params.beamDirection.value.copy(hit).normalize();
    }
  });

  // Gatillo Láser (Mantiene la función original)
  addEventListener('pointerdown', (e) => { if (e.button === 0 && params.beamEnabled.value > 0) params.beamFiring.value = 1; });
  addEventListener('pointerup', () => { params.beamFiring.value = 0; });

  // ==========================================
  // MOTOR DE VJ PERFORMANCE (TECLADO)
  // ==========================================
  
  // Mapa de configuración (Velocidad de ajuste por segundo para ser muy suave)
  const perfMap = {
    'Digit1': { 
      name: 'RADIAL (ATRACCIÓN/REPULSIÓN)', toggle: params.radialEnabled, 
      keys: { 
        'KeyQ': { label: 'Fuerza', target: params.radialStrength, step: 8.0, min: -15, max: 15 },
        'KeyW': { label: 'Radio', target: params.radialRadius, step: 5.0, min: 0.1, max: 20 },
        'KeyE': { label: 'Suavidad', target: params.softening, step: 1.0, min: 0.01, max: 2.0 }
      } 
    },
    'Digit2': { 
      name: 'VÓRTICE', toggle: params.vortexEnabled, 
      keys: { 'KeyQ': { label: 'Fuerza Vórtice', target: params.vortexStrength, step: 4.0, min: -8, max: 8 } } 
    },
    'Digit3': { 
      name: 'VIENTO', toggle: params.windEnabled, 
      keys: { 
        'KeyQ': { label: 'Viento X', target: params.wind, vector: 'x', step: 5.0, min: -10, max: 10 },
        'KeyW': { label: 'Viento Y', target: params.wind, vector: 'y', step: 5.0, min: -10, max: 10 }
      } 
    },
    'Digit4': { 
      name: 'ONDAS BPM', toggle: params.waveEnabled, 
      keys: { 
        'KeyQ': { label: 'Fuerza', target: params.waveStrength, step: 15.0, min: -20, max: 20 },
        'KeyW': { label: 'Frecuencia', target: params.waveFrequency, step: 2.0, min: 0.1, max: 10 },
        'KeyE': { label: 'BPM', target: params.waveBPM, step: 40.0, min: 30, max: 240 },
        'KeyR': { label: 'Radio', target: params.waveRadius, step: 6.0, min: 0.5, max: 15 }
      } 
    },
    'Digit5': { 
      name: 'CAÑÓN (Dispara con Clic)', toggle: params.beamEnabled, 
      keys: { 
        'KeyQ': { label: 'Poder', target: params.beamStrength, step: 150.0, min: 10, max: 500 },
        'KeyW': { label: 'Grosor', target: params.beamRadius, step: 1.0, min: 0.05, max: 3.0 }
      } 
    },
    'Digit6': { 
      name: 'GLOBAL (Entorno)', toggle: params.dragEnabled, 
      keys: { 
        'KeyQ': { label: 'TimeScale', target: params.timeScale, step: 1.0, min: 0.0, max: 3.0 },
        'KeyW': { label: 'Fricción (Drag)', target: params.dragCoefficient, step: 0.5, min: 0.0, max: 1.0 },
        'KeyE': { label: 'Max Speed', target: params.maxSpeed, step: 15.0, min: 0.1, max: 100.0 },
        'KeyR': { label: 'Tamaño Partícula', target: params.particleSize, step: 0.05, min: 0.001, max: 0.1 }
      } 
    },
    'Digit8': { 
      name: 'CAOS BINARIO', toggle: params.binaryEnabled, 
      keys: { 
        'KeyQ': { label: 'Gravedad', target: params.binaryGravity, step: 5.0, min: 0.1, max: 20.0 },
        'KeyW': { label: 'Prob. Choque %', target: params.repulsionChance, step: 2.0, min: 0.0, max: 10.0 },
        'KeyE': { label: 'Violencia (Repulsión)', target: params.repulsionStrength, step: 200.0, min: 0.0, max: 800.0 }
      } 
    }
  };

  let activeChannel = 'Digit1'; // Canal activo por defecto
  const keysDown = new Set();

  // Creación del HUD en pantalla
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed; top:20px; left:20px; color:#fff; font-family:monospace; font-size:13px; pointer-events:none; z-index:100; text-shadow: 1px 1px 2px #000; background: rgba(0,0,0,0.6); padding: 15px; border-radius: 8px; border: 1px solid #333;';
  document.body.appendChild(hud);

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keysDown.add(e.code);
    
    // Cambiar de canal y Togglear (Prender/Apagar)
    if (perfMap[e.code]) {
      activeChannel = e.code;
      const toggleUniform = perfMap[e.code].toggle;
      toggleUniform.value = toggleUniform.value > 0 ? 0 : 1; 
    }

    // Resetear todo rápido con barra espaciadora
    if (e.code === 'Space') simulation.reset();
  });

  addEventListener('keyup', (e) => { keysDown.delete(e.code); });

  // Función para actualizar el texto del HUD (Optimizado)
  function updateHUD() {
    let html = `<div style="margin-bottom:10px; color:#aaa;"><strong>PERFORMANCE MODE</strong> | [Space]: Reset Particles</div>`;
    
    for (const [digitCode, config] of Object.entries(perfMap)) {
      const isAct = digitCode === activeChannel;
      const isOn = config.toggle.value > 0;
      const num = digitCode.replace('Digit', '');
      
      html += `<div style="margin-bottom: 5px; ${isAct ? 'color: #00ffcc;' : (isOn ? 'color: #fff;' : 'color: #555;')}">`;
      html += `[${num}] ${config.name} ${isOn ? '<b>[ON]</b>' : '[OFF]'}`;
      
      if (isAct) {
        html += `<br><span style="color:#aaa; font-size:11px;">MANTÉN LETRA + FLECHA ARRIBA/ABAJO:</span><br>`;
        for (const [keyCode, paramDef] of Object.entries(config.keys)) {
          const letter = keyCode.replace('Key', '');
          let val = paramDef.vector ? paramDef.target.value[paramDef.vector] : paramDef.target.value;
          html += `&nbsp;&nbsp;<b>${letter}</b>: ${paramDef.label} = ${val.toFixed(2)}<br>`;
        }
      }
      html += `</div>`;
    }
    hud.innerHTML = html;
  }

  // ==========================================
  // LOOP PRINCIPAL
  // ==========================================

  simulation.reset();

  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    params.time.value += delta;

    // Lógica del Teclado Contínuo
    let dir = (keysDown.has('ArrowUp') ? 1 : 0) - (keysDown.has('ArrowDown') ? 1 : 0);
    
    if (dir !== 0 && perfMap[activeChannel]) {
      const activeKeys = perfMap[activeChannel].keys;
      for (const [keyCode, paramDef] of Object.entries(activeKeys)) {
        if (keysDown.has(keyCode)) {
          const change = dir * paramDef.step * delta;
          if (paramDef.vector) {
            paramDef.target.value[paramDef.vector] += change;
            paramDef.target.value[paramDef.vector] = Math.max(paramDef.min, Math.min(paramDef.max, paramDef.target.value[paramDef.vector]));
          } else {
            paramDef.target.value += change;
            paramDef.target.value = Math.max(paramDef.min, Math.min(paramDef.max, paramDef.target.value));
          }
        }
      }
    }

    updateHUD();

    simulation.stepSimulation();
    renderer.render(scene, camera);
  });
}

main().catch((error) => {
  console.error(error);
});