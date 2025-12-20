/**
 * @solidtype/viewer - SolidType WebGL Viewer
 * 
 * Demonstrates tessellation of BREP bodies using three.js.
 * 
 * Phase 9: Added Web Worker support for off-main-thread modeling.
 * The viewer can run in two modes:
 * - Direct mode: Uses @solidtype/core directly (faster startup)
 * - Worker mode: Uses kernel worker for off-main-thread modeling
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createNumericContext,
  TopoModel,
  createBox,
  tessellateBody,
} from '@solidtype/core';
import { createThreeMesh } from './MeshAdapter.js';
import { KernelClient, type SerializedMesh } from './worker/index.js';

// ============================================================================
// Configuration
// ============================================================================

/** Whether to use the worker for modeling */
const USE_WORKER = true;

// ============================================================================
// Scene Setup
// ============================================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// Camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(3, 3, 3);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ 
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app')!.appendChild(renderer.domElement);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1;
controls.maxDistance = 20;

// ============================================================================
// Lighting
// ============================================================================

// Ambient light for overall illumination
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Main directional light (sun-like)
const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
mainLight.position.set(5, 10, 7);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = 2048;
mainLight.shadow.mapSize.height = 2048;
mainLight.shadow.camera.near = 0.5;
mainLight.shadow.camera.far = 50;
mainLight.shadow.camera.left = -10;
mainLight.shadow.camera.right = 10;
mainLight.shadow.camera.top = 10;
mainLight.shadow.camera.bottom = -10;
scene.add(mainLight);

// Fill light from opposite side
const fillLight = new THREE.DirectionalLight(0x8899aa, 0.3);
fillLight.position.set(-5, 3, -5);
scene.add(fillLight);

// Rim light for edge definition
const rimLight = new THREE.DirectionalLight(0xaaccff, 0.2);
rimLight.position.set(0, -5, -5);
scene.add(rimLight);

// ============================================================================
// Grid and Axes Helpers
// ============================================================================

const gridHelper = new THREE.GridHelper(10, 10, 0x444466, 0x333344);
gridHelper.position.y = -1;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(2);
axesHelper.position.set(-4, -1, -4);
scene.add(axesHelper);

// ============================================================================
// Material
// ============================================================================

const material = new THREE.MeshStandardMaterial({
  color: 0x4a90e2,
  metalness: 0.4,
  roughness: 0.3,
  flatShading: false,
});

// ============================================================================
// Model Building Functions
// ============================================================================

/**
 * Build demo model directly using core (no worker)
 */
function buildDemoModelDirect(): THREE.Mesh {
  // Create numeric context with tolerances
  const ctx = createNumericContext();
  
  // Create empty topology model
  const model = new TopoModel(ctx);
  
  // Create a box primitive
  const bodyId = createBox(model, {
    width: 2,
    depth: 1.5,
    height: 1,
    center: [0, 0, 0],
  });
  
  // Tessellate the body to get a triangle mesh
  const mesh = tessellateBody(model, bodyId);
  
  console.log('SolidType Model Created (Direct):');
  console.log(`  Vertices: ${mesh.positions.length / 3}`);
  console.log(`  Triangles: ${mesh.indices.length / 3}`);
  
  // Create THREE.Mesh with a nice material
  const threeMesh = createThreeMesh(mesh, material);
  threeMesh.castShadow = true;
  threeMesh.receiveShadow = true;
  
  return threeMesh;
}

/**
 * Build demo model using the kernel worker
 */
async function buildDemoModelWorker(): Promise<THREE.Mesh> {
  console.log('Initializing kernel worker...');
  const startTime = performance.now();
  
  // Create and initialize the kernel client
  const client = new KernelClient();
  await client.init();
  
  const initTime = performance.now() - startTime;
  console.log(`Worker initialized in ${initTime.toFixed(2)}ms`);
  
  // Create a box using the worker
  const modelStartTime = performance.now();
  const bodyId = await client.createBox({
    width: 2,
    depth: 1.5,
    height: 1,
    center: [0, 0, 0],
  });
  
  const modelTime = performance.now() - modelStartTime;
  console.log(`Box created in ${modelTime.toFixed(2)}ms`);
  
  // Get the mesh from the worker
  const meshStartTime = performance.now();
  const serializedMesh = await client.getMesh(bodyId);
  const meshTime = performance.now() - meshStartTime;
  console.log(`Mesh retrieved in ${meshTime.toFixed(2)}ms`);
  
  console.log('SolidType Model Created (Worker):');
  console.log(`  Vertices: ${serializedMesh.positions.length / 3}`);
  console.log(`  Triangles: ${serializedMesh.indices.length / 3}`);
  
  // Convert to THREE.Mesh
  const threeMesh = createThreeMeshFromSerialized(serializedMesh, material);
  threeMesh.castShadow = true;
  threeMesh.receiveShadow = true;
  
  // Dispose the worker (we don't need it anymore for this demo)
  // In a real app, you'd keep it alive for parameter updates
  await client.dispose();
  
  return threeMesh;
}

/**
 * Create THREE.Mesh from serialized mesh data
 */
function createThreeMeshFromSerialized(
  mesh: SerializedMesh,
  material: THREE.Material
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  
  return new THREE.Mesh(geometry, material);
}

// ============================================================================
// UI Overlay
// ============================================================================

const infoDiv = document.createElement('div');
infoDiv.style.cssText = `
  position: fixed;
  top: 20px;
  left: 20px;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  border-radius: 8px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  line-height: 1.6;
`;
infoDiv.innerHTML = `
  <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #4a90e2;">
    SolidType Viewer
  </div>
  <div style="color: #888;">Phase 9 Demo</div>
  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0;">
  <div><span style="color: #6c6;">✓</span> BREP Box Primitive</div>
  <div><span style="color: #6c6;">✓</span> Planar Face Tessellation</div>
  <div><span style="color: #6c6;">✓</span> three.js Integration</div>
  <div><span style="color: #f90;">●</span> Web Worker Mode: <span id="worker-mode">Loading...</span></div>
  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0;">
  <div style="color: #888; font-size: 11px;">
    Drag to orbit • Scroll to zoom
  </div>
`;
document.body.appendChild(infoDiv);

// ============================================================================
// Window Resize Handler
// ============================================================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// Animation Loop
// ============================================================================

let demoMesh: THREE.Mesh | null = null;

function animate() {
  requestAnimationFrame(animate);
  
  // Update orbit controls
  controls.update();
  
  // Gentle rotation of the demo mesh
  if (demoMesh) {
    demoMesh.rotation.y += 0.002;
  }
  
  renderer.render(scene, camera);
}

// ============================================================================
// Main Initialization
// ============================================================================

async function init() {
  const workerModeSpan = document.getElementById('worker-mode');
  
  try {
    if (USE_WORKER) {
      demoMesh = await buildDemoModelWorker();
      if (workerModeSpan) {
        workerModeSpan.textContent = 'Enabled';
        workerModeSpan.style.color = '#6c6';
      }
    } else {
      demoMesh = buildDemoModelDirect();
      if (workerModeSpan) {
        workerModeSpan.textContent = 'Disabled (Direct)';
        workerModeSpan.style.color = '#888';
      }
    }
    
    scene.add(demoMesh);
    
    console.log('Demo model added to scene');
  } catch (error) {
    console.error('Failed to build demo model:', error);
    if (workerModeSpan) {
      workerModeSpan.textContent = 'Error';
      workerModeSpan.style.color = '#f44';
    }
    
    // Fall back to direct mode
    console.log('Falling back to direct mode...');
    demoMesh = buildDemoModelDirect();
    scene.add(demoMesh);
    
    if (workerModeSpan) {
      workerModeSpan.textContent = 'Fallback (Direct)';
      workerModeSpan.style.color = '#f90';
    }
  }
}

// Start the animation loop immediately
animate();

// Initialize the model
init();
