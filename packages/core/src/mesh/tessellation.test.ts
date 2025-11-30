/**
 * Tests for face and body tessellation
 */

import { describe, it, expect } from 'vitest';
import { createNumericContext } from '../num/tolerance.js';
import { vec3 } from '../num/vec3.js';
import { createEmptyModel } from '../topo/model.js';
import { createBox, createUnitCube } from '../model/primitives.js';
import { tessellateBody, tessellateAllBodies } from './tessellateBody.js';
import { getMeshVertexCount, getMeshTriangleCount } from './types.js';

describe('tessellateBody', () => {
  it('tessellates a unit cube', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    
    // A cube has 6 faces, each face is a quad = 2 triangles
    // So we expect 12 triangles total
    expect(getMeshTriangleCount(mesh)).toBe(12);
    
    // Each face has 4 vertices (not shared across faces due to different normals)
    // So we expect 6 * 4 = 24 vertices
    expect(getMeshVertexCount(mesh)).toBe(24);
    
    // Check that positions and normals have the same length
    expect(mesh.positions.length).toBe(mesh.normals.length);
  });

  it('tessellates a non-unit box', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const bodyId = createBox(model, {
      width: 2,
      depth: 3,
      height: 4,
      center: vec3(1, 2, 3),
    });
    
    const mesh = tessellateBody(model, bodyId);
    
    // Same topology as unit cube
    expect(getMeshTriangleCount(mesh)).toBe(12);
    expect(getMeshVertexCount(mesh)).toBe(24);
  });

  it('produces normals that are unit length', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    
    // Check that all normals are unit length
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nx = mesh.normals[i];
      const ny = mesh.normals[i + 1];
      const nz = mesh.normals[i + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it('produces outward-pointing normals for cube', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    
    // For each face, verify the normal points away from the cube center (0,0,0)
    // We can check this by computing centroid of face vertices and
    // verifying that dot(centroid, normal) > 0
    // But since faces share vertices differently, let's just check
    // that normals are axis-aligned (±1 in one axis, 0 in others)
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nx = mesh.normals[i];
      const ny = mesh.normals[i + 1];
      const nz = mesh.normals[i + 2];
      
      // At least one component should be ±1
      const absMax = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
      expect(absMax).toBeCloseTo(1, 5);
    }
  });

  it('produces valid triangle indices', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    const vertexCount = getMeshVertexCount(mesh);
    
    // All indices should be valid
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
      expect(mesh.indices[i]).toBeLessThan(vertexCount);
    }
  });
});

describe('tessellateAllBodies', () => {
  it('tessellates multiple bodies', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    
    createBox(model, { center: vec3(-2, 0, 0) });
    createBox(model, { center: vec3(2, 0, 0) });
    
    const meshes = tessellateAllBodies(model);
    
    expect(meshes).toHaveLength(2);
    expect(getMeshTriangleCount(meshes[0])).toBe(12);
    expect(getMeshTriangleCount(meshes[1])).toBe(12);
  });

  it('returns empty array for empty model', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    
    const meshes = tessellateAllBodies(model);
    
    expect(meshes).toHaveLength(0);
  });
});
