/**
 * Tests for primitive shape creation
 */

import { describe, it, expect } from 'vitest';
import { createNumericContext } from '../num/tolerance.js';
import { vec3 } from '../num/vec3.js';
import {
  createEmptyModel,
  getModelStats,
  getBodyShells,
  getShellFaces,
  isShellClosed,
  getVertexPosition,
} from '../topo/model.js';
import { validateModel, isValidModel } from '../topo/validate.js';
import { createBox, createUnitCube } from './primitives.js';

describe('createBox', () => {
  it('creates a valid box with correct topology', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const bodyId = createBox(model);
    
    const stats = getModelStats(model);
    
    // Box should have:
    // - 8 vertices
    // - 12 edges
    // - 24 half-edges (2 per edge)
    // - 6 faces
    // - 6 loops (1 per face)
    // - 1 shell
    // - 1 body
    expect(stats.bodies).toBe(1);
    expect(stats.shells).toBe(1);
    expect(stats.faces).toBe(6);
    expect(stats.loops).toBe(6);
    expect(stats.edges).toBe(12);
    expect(stats.vertices).toBe(8);
    expect(stats.halfEdges).toBe(24);
    expect(stats.surfaces).toBe(6);
  });

  it('creates a closed shell', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const bodyId = createBox(model);
    
    const shells = getBodyShells(model, bodyId);
    expect(shells).toHaveLength(1);
    expect(isShellClosed(model, shells[0])).toBe(true);
  });

  it('creates correct vertex positions for unit cube', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    createUnitCube(model);
    
    // Check that all vertices are at ±0.5 in each dimension
    for (let i = 0; i < 8; i++) {
      const pos = getVertexPosition(model, i as any);
      expect(Math.abs(pos[0])).toBeCloseTo(0.5, 10);
      expect(Math.abs(pos[1])).toBeCloseTo(0.5, 10);
      expect(Math.abs(pos[2])).toBeCloseTo(0.5, 10);
    }
  });

  it('creates correct vertex positions with custom dimensions', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    createBox(model, { width: 4, depth: 6, height: 8 });
    
    // Check that all vertices are at the correct positions
    const expectedHalfDims = [2, 3, 4]; // half of 4, 6, 8
    for (let i = 0; i < 8; i++) {
      const pos = getVertexPosition(model, i as any);
      expect(Math.abs(pos[0])).toBeCloseTo(expectedHalfDims[0], 10);
      expect(Math.abs(pos[1])).toBeCloseTo(expectedHalfDims[1], 10);
      expect(Math.abs(pos[2])).toBeCloseTo(expectedHalfDims[2], 10);
    }
  });

  it('creates correct vertex positions with custom center', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    const center = vec3(10, 20, 30);
    createBox(model, { width: 2, depth: 2, height: 2, center });
    
    // Check that vertices are centered around the given point
    let sumX = 0, sumY = 0, sumZ = 0;
    for (let i = 0; i < 8; i++) {
      const pos = getVertexPosition(model, i as any);
      sumX += pos[0];
      sumY += pos[1];
      sumZ += pos[2];
    }
    expect(sumX / 8).toBeCloseTo(center[0], 10);
    expect(sumY / 8).toBeCloseTo(center[1], 10);
    expect(sumZ / 8).toBeCloseTo(center[2], 10);
  });

  it('passes model validation', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    createBox(model);
    
    const report = validateModel(model);
    
    // Filter out info messages about boundary edges (which we don't have for a closed box)
    const errors = report.issues.filter(i => i.severity === 'error');
    const warnings = report.issues.filter(i => i.severity === 'warning');
    
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('passes quick validation check', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    createBox(model);
    
    expect(isValidModel(model)).toBe(true);
  });

  it('can create multiple boxes in same model', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    
    const box1 = createBox(model, { center: vec3(-2, 0, 0) });
    const box2 = createBox(model, { center: vec3(2, 0, 0) });
    
    const stats = getModelStats(model);
    
    expect(stats.bodies).toBe(2);
    expect(stats.shells).toBe(2);
    expect(stats.faces).toBe(12);
    expect(stats.vertices).toBe(16);
    
    // Both should be valid
    expect(isValidModel(model)).toBe(true);
  });
});

describe('createUnitCube', () => {
  it('creates a 1x1x1 cube centered at origin', () => {
    const ctx = createNumericContext();
    const model = createEmptyModel(ctx);
    createUnitCube(model);
    
    // Check dimensions by looking at vertex positions
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < 8; i++) {
      const pos = getVertexPosition(model, i as any);
      minX = Math.min(minX, pos[0]);
      maxX = Math.max(maxX, pos[0]);
      minY = Math.min(minY, pos[1]);
      maxY = Math.max(maxY, pos[1]);
      minZ = Math.min(minZ, pos[2]);
      maxZ = Math.max(maxZ, pos[2]);
    }
    
    expect(maxX - minX).toBeCloseTo(1, 10);
    expect(maxY - minY).toBeCloseTo(1, 10);
    expect(maxZ - minZ).toBeCloseTo(1, 10);
    
    // Check centered at origin
    expect((maxX + minX) / 2).toBeCloseTo(0, 10);
    expect((maxY + minY) / 2).toBeCloseTo(0, 10);
    expect((maxZ + minZ) / 2).toBeCloseTo(0, 10);
  });
});
