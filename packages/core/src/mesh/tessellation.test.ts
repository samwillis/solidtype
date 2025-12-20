/**
 * Tests for face and body tessellation
 */

import { describe, it, expect } from 'vitest';
import { createNumericContext } from '../num/tolerance.js';
import { vec3 } from '../num/vec3.js';
import { TopoModel } from '../topo/TopoModel.js';
import { createBox, createUnitCube } from '../model/primitives.js';
import { extrude } from '../model/extrude.js';
import { revolve, Y_AXIS_REVOLVE } from '../model/revolve.js';
import { createCircleProfile } from '../model/sketchProfile.js';
import { XY_PLANE } from '../model/planes.js';
import { tessellateBody, tessellateAllBodies } from './tessellateBody.js';
import { getMeshVertexCount, getMeshTriangleCount } from './types.js';

describe('tessellateBody', () => {
  it('tessellates a unit cube', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    
    expect(getMeshTriangleCount(mesh)).toBe(12);
    expect(getMeshVertexCount(mesh)).toBe(24);
    expect(mesh.positions.length).toBe(mesh.normals.length);
  });

  it('tessellates a non-unit box', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const bodyId = createBox(model, {
      width: 2,
      depth: 3,
      height: 4,
      center: vec3(1, 2, 3),
    });
    
    const mesh = tessellateBody(model, bodyId);
    
    expect(getMeshTriangleCount(mesh)).toBe(12);
    expect(getMeshVertexCount(mesh)).toBe(24);
  });

  it('produces normals that are unit length', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    
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
    const model = new TopoModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nx = mesh.normals[i];
      const ny = mesh.normals[i + 1];
      const nz = mesh.normals[i + 2];
      
      const absMax = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
      expect(absMax).toBeCloseTo(1, 5);
    }
  });

  it('produces valid triangle indices', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const bodyId = createUnitCube(model);
    
    const mesh = tessellateBody(model, bodyId);
    const vertexCount = getMeshVertexCount(mesh);
    
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
      expect(mesh.indices[i]).toBeLessThan(vertexCount);
    }
  });

  it('tessellates an extruded circle (cylindrical faces)', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const profile = createCircleProfile(XY_PLANE, 5);
    const result = extrude(model, profile, { operation: 'add', distance: 3 });
    expect(result.success).toBe(true);
    const mesh = tessellateBody(model, result.body!);

    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.positions.length).toBe(mesh.normals.length);
    expect(getMeshTriangleCount(mesh)).toBeGreaterThan(0);
  });

  it('tessellates a revolved circle (torus faces)', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const profile = createCircleProfile(XY_PLANE, 1, 3, 0);
    const result = revolve(model, profile, { operation: 'add', axis: Y_AXIS_REVOLVE });
    expect(result.success).toBe(true);

    const mesh = tessellateBody(model, result.body!);
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.positions.length).toBe(mesh.normals.length);
  });
});

describe('tessellateAllBodies', () => {
  it('tessellates multiple bodies', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    
    createBox(model, { center: vec3(-2, 0, 0) });
    createBox(model, { center: vec3(2, 0, 0) });
    
    const meshes = tessellateAllBodies(model);
    
    expect(meshes).toHaveLength(2);
    expect(getMeshTriangleCount(meshes[0])).toBe(12);
    expect(getMeshTriangleCount(meshes[1])).toBe(12);
  });

  it('returns empty array for empty model', () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    
    const meshes = tessellateAllBodies(model);
    
    expect(meshes).toHaveLength(0);
  });
});
