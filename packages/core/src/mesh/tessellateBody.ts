/**
 * Body tessellation
 *
 * Converts BREP bodies into triangle meshes by tessellating all faces
 * and merging the results.
 */

import { TopoModel } from "../topo/TopoModel.js";
import type { BodyId, ShellId } from "../topo/handles.js";
import type { Mesh, TessellationOptions } from "./types.js";
import { mergeMeshes, DEFAULT_TESSELLATION_OPTIONS, createEmptyMesh } from "./types.js";
import { tessellateFace } from "./tessellateFace.js";

/**
 * Tessellate a shell (collection of faces)
 */
export function tessellateShell(
  model: TopoModel,
  shellId: ShellId,
  options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh {
  const faces = model.getShellFaces(shellId);
  const meshes: Mesh[] = [];

  for (const faceId of faces) {
    if (model.isFaceDeleted(faceId)) {
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
 */
export function tessellateBody(
  model: TopoModel,
  bodyId: BodyId,
  options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh {
  const shells = model.getBodyShells(bodyId);

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
 */
export function tessellateAllBodies(
  model: TopoModel,
  options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh[] {
  const meshes: Mesh[] = [];

  for (const bodyId of model.iterateBodies()) {
    const mesh = tessellateBody(model, bodyId, options);
    meshes.push(mesh);
  }

  return meshes;
}
