/**
 * STL Export Tests - Phase 18
 */

import { describe, test, expect } from "vitest";
import { exportMeshesToStl, isStlBinary } from "../../src/export/stl.js";
import type { Mesh } from "../../src/mesh/types.js";

// Simple cube mesh for testing (8 vertices, 12 triangles)
function createCubeMesh(): Mesh {
  const positions = new Float32Array([
    // Front face
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    // Back face
    -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1,
  ]);

  const normals = new Float32Array(positions.length); // Not used in STL

  // 12 triangles (2 per face)
  const indices = new Uint32Array([
    // Front
    0, 1, 2, 0, 2, 3,
    // Back
    4, 5, 6, 4, 6, 7,
    // Top
    3, 2, 6, 3, 6, 5,
    // Bottom
    4, 7, 1, 4, 1, 0,
    // Right
    1, 7, 6, 1, 6, 2,
    // Left
    4, 0, 3, 4, 3, 5,
  ]);

  return { positions, normals, indices };
}

describe(`exportMeshesToStl`, () => {
  test(`generates valid binary STL`, () => {
    const mesh = createCubeMesh();
    const result = exportMeshesToStl([mesh], { binary: true });

    expect(isStlBinary(result)).toBe(true);
    expect(result instanceof ArrayBuffer).toBe(true);

    const buffer = result as ArrayBuffer;

    // Minimum size: 80 (header) + 4 (count) + 50 * triangles
    expect(buffer.byteLength).toBeGreaterThan(84);

    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);

    // Should have 12 triangles
    expect(triangleCount).toBe(12);

    // Check buffer size matches expected
    expect(buffer.byteLength).toBe(80 + 4 + 12 * 50);
  });

  test(`generates valid ASCII STL`, () => {
    const mesh = createCubeMesh();
    const result = exportMeshesToStl([mesh], { binary: false, name: `cube` });

    expect(isStlBinary(result)).toBe(false);
    expect(typeof result).toBe(`string`);

    const ascii = result as string;

    expect(ascii).toContain(`solid cube`);
    expect(ascii).toContain(`endsolid cube`);
    expect(ascii).toContain(`facet normal`);
    expect(ascii).toContain(`outer loop`);
    expect(ascii).toContain(`vertex`);
    expect(ascii).toContain(`endloop`);
    expect(ascii).toContain(`endfacet`);

    // Count facets
    const facetCount = (ascii.match(/facet normal/g) || []).length;
    expect(facetCount).toBe(12);

    // Count vertices (3 per facet × 12 facets = 36)
    const vertexCount = (ascii.match(/vertex /g) || []).length;
    expect(vertexCount).toBe(36);
  });

  test(`handles multiple meshes`, () => {
    const mesh1 = createCubeMesh();
    const mesh2 = createCubeMesh();
    const result = exportMeshesToStl([mesh1, mesh2], { binary: true });

    const buffer = result as ArrayBuffer;
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);

    // Should have 24 triangles (12 per mesh)
    expect(triangleCount).toBe(24);
  });

  test(`handles empty meshes array`, () => {
    const result = exportMeshesToStl([], { binary: true });

    const buffer = result as ArrayBuffer;
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);

    expect(triangleCount).toBe(0);
    expect(buffer.byteLength).toBe(84); // Header + count only
  });

  test(`respects precision option for ASCII`, () => {
    const mesh = createCubeMesh();

    const low = exportMeshesToStl([mesh], { binary: false, precision: 2 }) as string;
    const high = exportMeshesToStl([mesh], { binary: false, precision: 8 }) as string;

    // Low precision should have shorter output
    expect(low.length).toBeLessThan(high.length);

    // Check format (2 decimal places)
    expect(low).toMatch(/vertex -1\.00 -1\.00 1\.00/);
  });

  test(`calculates correct face normals`, () => {
    // Simple face in XY plane (normal should be +Z)
    const positions = new Float32Array([
      0,
      0,
      0, // v0
      1,
      0,
      0, // v1
      1,
      1,
      0, // v2
    ]);
    const normals = new Float32Array(9);
    const indices = new Uint32Array([0, 1, 2]);

    const mesh: Mesh = { positions, normals, indices };
    const result = exportMeshesToStl([mesh], { binary: false }) as string;

    // Normal should be approximately (0, 0, 1)
    expect(result).toMatch(/facet normal 0\.0+ 0\.0+ 1\.0+/);
  });
});
