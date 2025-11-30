/**
 * MeshAdapter - Converts SolidType Mesh to THREE.BufferGeometry
 * 
 * This adapter bridges the gap between the core tessellation output
 * and three.js rendering infrastructure.
 */

import * as THREE from 'three';
import type { Mesh } from '@solidtype/core';

/**
 * Convert a SolidType Mesh to a THREE.BufferGeometry
 * 
 * @param mesh The SolidType mesh (positions, normals, indices)
 * @returns A THREE.BufferGeometry ready for rendering
 */
export function meshToBufferGeometry(mesh: Mesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  // Set position attribute (convert Float32Array to buffer attribute)
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(mesh.positions, 3)
  );
  
  // Set normal attribute
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(mesh.normals, 3)
  );
  
  // Set index buffer
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  
  // Compute bounding box and sphere for frustum culling
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  
  return geometry;
}

/**
 * Create a THREE.Mesh from a SolidType Mesh with default material
 * 
 * @param mesh The SolidType mesh
 * @param material Optional THREE.Material (defaults to MeshStandardMaterial)
 * @returns A THREE.Mesh ready to add to a scene
 */
export function createThreeMesh(
  mesh: Mesh,
  material?: THREE.Material
): THREE.Mesh {
  const geometry = meshToBufferGeometry(mesh);
  
  const defaultMaterial = material ?? new THREE.MeshStandardMaterial({
    color: 0x4a90e2,
    metalness: 0.3,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  
  return new THREE.Mesh(geometry, defaultMaterial);
}

/**
 * Update an existing THREE.Mesh with new geometry from a SolidType Mesh
 * 
 * This is useful when the model changes and we want to update the display
 * without creating a new THREE.Mesh.
 * 
 * @param threeMesh The THREE.Mesh to update
 * @param mesh The new SolidType mesh data
 */
export function updateThreeMesh(threeMesh: THREE.Mesh, mesh: Mesh): void {
  // Dispose old geometry
  threeMesh.geometry.dispose();
  
  // Create and assign new geometry
  threeMesh.geometry = meshToBufferGeometry(mesh);
}
