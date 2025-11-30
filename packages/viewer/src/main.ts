/**
 * @solidtype/viewer - SolidType WebGL Viewer
 * 
 * Demonstrates tessellation of BREP bodies using three.js.
 * This viewer shows a box primitive created by createBox and
 * tessellated using the mesh module.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createNumericContext,
  createEmptyModel,
  createBox,
  tessellateBody,
} from '@solidtype/core';
import { createThreeMesh } from './MeshAdapter.js';

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
// SolidType Model Creation and Tessellation
// ============================================================================

/**
 * Build and tessellate a demo box using SolidType
 */
function buildDemoModel(): THREE.Mesh {
  // Create numeric context with tolerances
  const ctx = createNumericContext();
  
  // Create empty topology model
  const model = createEmptyModel(ctx);
  
  // Create a box primitive
  const bodyId = createBox(model, {
    width: 2,
    depth: 1.5,
    height: 1,
    center: [0, 0, 0],
  });
  
  // Tessellate the body to get a triangle mesh
  const mesh = tessellateBody(model, bodyId);
  
  console.log('SolidType Model Created:');
  console.log(`  Vertices: ${mesh.positions.length / 3}`);
  console.log(`  Triangles: ${mesh.indices.length / 3}`);
  
  // Create THREE.Mesh with a nice material
  const material = new THREE.MeshStandardMaterial({
    color: 0x4a90e2,
    metalness: 0.4,
    roughness: 0.3,
    flatShading: false,
  });
  
  const threeMesh = createThreeMesh(mesh, material);
  threeMesh.castShadow = true;
  threeMesh.receiveShadow = true;
  
  return threeMesh;
}

// Create and add the demo model
const demoMesh = buildDemoModel();
scene.add(demoMesh);

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
  <div style="color: #888;">Phase 4 Demo</div>
  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0;">
  <div><span style="color: #6c6;">✓</span> BREP Box Primitive</div>
  <div><span style="color: #6c6;">✓</span> Planar Face Tessellation</div>
  <div><span style="color: #6c6;">✓</span> three.js Integration</div>
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

function animate() {
  requestAnimationFrame(animate);
  
  // Update orbit controls
  controls.update();
  
  // Gentle rotation of the demo mesh
  demoMesh.rotation.y += 0.002;
  
  renderer.render(scene, camera);
}

animate();
