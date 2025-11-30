/**
 * Body tessellation
 * 
 * Converts BREP bodies into triangle meshes by tessellating all faces
 * and merging the results.
 */

import type { TopoModel } from '../topo/model.js';
import type { BodyId, ShellId } from '../topo/handles.js';
import {
  getBodyShells,
  getShellFaces,
  isFaceDeleted,
} from '../topo/model.js';
import type { Mesh, TessellationOptions } from './types.js';
import { mergeMeshes, DEFAULT_TESSELLATION_OPTIONS, createEmptyMesh } from './types.js';
import { tessellateFace } from './tessellateFace.js';

/**
 * Tessellate a shell (collection of faces)
 * 
 * @param model The topology model
 * @param shellId The shell to tessellate
 * @param options Tessellation options
 * @returns Combined mesh for all faces in the shell
 */
export function tessellateShell(
  model: TopoModel,
  shellId: ShellId,
  options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh {
  const faces = getShellFaces(model, shellId);
  const meshes: Mesh[] = [];
  
  for (const faceId of faces) {
    if (isFaceDeleted(model, faceId)) {
      continue;
    }
    
    const mesh = tessellateFace(model, faceId, options);
    if (mesh.positions.length > 0) {
      meshes.push(mesh);
    }
  }
  
  return mergeMeshes(meshes);
}

/**
 * Tessellate a body (collection of shells)
 * 
 * This is the main entry point for tessellating a BREP body.
 * It combines all shells' faces into a single mesh.
 * 
 * @param model The topology model
 * @param bodyId The body to tessellate
 * @param options Tessellation options
 * @returns Combined mesh for the entire body
 */
export function tessellateBody(
  model: TopoModel,
  bodyId: BodyId,
  options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh {
  const shells = getBodyShells(model, bodyId);
  
  if (shells.length === 0) {
    return createEmptyMesh();
  }
  
  const meshes: Mesh[] = [];
  
  for (const shellId of shells) {
    const mesh = tessellateShell(model, shellId, options);
    if (mesh.positions.length > 0) {
      meshes.push(mesh);
    }
  }
  
  return mergeMeshes(meshes);
}

/**
 * Tessellate all bodies in a model
 * 
 * @param model The topology model
 * @param options Tessellation options
 * @returns Array of meshes, one per body
 */
export function tessellateAllBodies(
  model: TopoModel,
  options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh[] {
  const meshes: Mesh[] = [];
  
  for (let i = 0; i < model.bodies.count; i++) {
    const bodyId = i as BodyId;
    if ((model.bodies.flags[i] & 1) !== 0) {
      continue; // Skip deleted bodies
    }
    
    const mesh = tessellateBody(model, bodyId, options);
    meshes.push(mesh);
  }
  
  return meshes;
}
