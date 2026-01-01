/**
 * Golden Mesh Test Utilities
 *
 * Provides utilities for creating, serializing, and comparing mesh outputs
 * for deterministic testing of boolean operations and tessellation.
 */

import type { Mesh } from "../../mesh/types.js";

/**
 * Serializable representation of a mesh for golden tests
 */
export interface GoldenMesh {
  /** Number of vertices */
  vertexCount: number;
  /** Number of triangles */
  triangleCount: number;
  /** Positions as array of [x, y, z] tuples, rounded to precision */
  positions: [number, number, number][];
  /** Normals as array of [x, y, z] tuples, rounded to precision */
  normals: [number, number, number][];
  /** Triangle indices as array of [a, b, c] tuples */
  indices: [number, number, number][];
  /** Optional metadata */
  metadata?: {
    description?: string;
    generatedAt?: string;
    tolerance?: number;
  };
}

/**
 * Mesh statistics for quick validation
 */
export interface MeshStats {
  vertexCount: number;
  triangleCount: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  totalSurfaceArea: number;
  /** Per-normal-axis face areas (for planar verification) */
  axisAreas: {
    posX: number;
    negX: number;
    posY: number;
    negY: number;
    posZ: number;
    negZ: number;
  };
}

/**
 * Round a number to specified decimal places
 */
function round(value: number, decimals: number = 6): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Compute the area of a triangle given three vertices
 */
function triangleArea(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): number {
  const ab: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cx = ab[1] * ac[2] - ab[2] * ac[1];
  const cy = ab[2] * ac[0] - ab[0] * ac[2];
  const cz = ab[0] * ac[1] - ab[1] * ac[0];
  return Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
}

/**
 * Compute the normal of a triangle (unnormalized)
 */
function triangleNormal(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): [number, number, number] {
  const ab: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
}

/**
 * Convert a Mesh to a GoldenMesh for serialization
 */
export function meshToGolden(mesh: Mesh, precision: number = 6, description?: string): GoldenMesh {
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;

  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: [number, number, number][] = [];

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    positions.push([
      round(mesh.positions[offset], precision),
      round(mesh.positions[offset + 1], precision),
      round(mesh.positions[offset + 2], precision),
    ]);
    normals.push([
      round(mesh.normals[offset], precision),
      round(mesh.normals[offset + 1], precision),
      round(mesh.normals[offset + 2], precision),
    ]);
  }

  for (let i = 0; i < triangleCount; i++) {
    const offset = i * 3;
    indices.push([mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]]);
  }

  return {
    vertexCount,
    triangleCount,
    positions,
    normals,
    indices,
    metadata: {
      description,
      generatedAt: new Date().toISOString(),
      tolerance: Math.pow(10, -precision),
    },
  };
}

/**
 * Convert a GoldenMesh back to a Mesh
 */
export function goldenToMesh(golden: GoldenMesh): Mesh {
  const positions = new Float32Array(golden.positions.flat());
  const normals = new Float32Array(golden.normals.flat());
  const indices = new Uint32Array(golden.indices.flat());

  return { positions, normals, indices };
}

/**
 * Compute statistics about a mesh
 */
export function computeMeshStats(mesh: Mesh): MeshStats {
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    const x = mesh.positions[offset];
    const y = mesh.positions[offset + 1];
    const z = mesh.positions[offset + 2];
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }

  let totalSurfaceArea = 0;
  const axisAreas = { posX: 0, negX: 0, posY: 0, negY: 0, posZ: 0, negZ: 0 };

  for (let i = 0; i < triangleCount; i++) {
    const offset = i * 3;
    const ia = mesh.indices[offset];
    const ib = mesh.indices[offset + 1];
    const ic = mesh.indices[offset + 2];

    const a: [number, number, number] = [
      mesh.positions[ia * 3],
      mesh.positions[ia * 3 + 1],
      mesh.positions[ia * 3 + 2],
    ];
    const b: [number, number, number] = [
      mesh.positions[ib * 3],
      mesh.positions[ib * 3 + 1],
      mesh.positions[ib * 3 + 2],
    ];
    const c: [number, number, number] = [
      mesh.positions[ic * 3],
      mesh.positions[ic * 3 + 1],
      mesh.positions[ic * 3 + 2],
    ];

    const area = triangleArea(a, b, c);
    totalSurfaceArea += area;

    // Classify by normal direction
    const normal = triangleNormal(a, b, c);
    const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    if (len > 1e-9) {
      const nx = normal[0] / len;
      const ny = normal[1] / len;
      const nz = normal[2] / len;

      const threshold = 0.9;
      if (nx > threshold) axisAreas.posX += area;
      else if (nx < -threshold) axisAreas.negX += area;
      else if (ny > threshold) axisAreas.posY += area;
      else if (ny < -threshold) axisAreas.negY += area;
      else if (nz > threshold) axisAreas.posZ += area;
      else if (nz < -threshold) axisAreas.negZ += area;
    }
  }

  return {
    vertexCount,
    triangleCount,
    boundingBox: { min, max },
    totalSurfaceArea,
    axisAreas,
  };
}

/**
 * Compare two meshes for equality with tolerance
 */
export interface MeshComparison {
  equal: boolean;
  differences: string[];
  stats: {
    actual: MeshStats;
    expected: MeshStats;
  };
}

export function compareMeshes(
  actual: Mesh,
  expected: GoldenMesh,
  tolerance: number = 1e-5
): MeshComparison {
  const differences: string[] = [];
  const actualStats = computeMeshStats(actual);
  const expectedMesh = goldenToMesh(expected);
  const expectedStats = computeMeshStats(expectedMesh);

  // Check vertex count
  if (actualStats.vertexCount !== expectedStats.vertexCount) {
    differences.push(
      `Vertex count mismatch: expected ${expectedStats.vertexCount}, got ${actualStats.vertexCount}`
    );
  }

  // Check triangle count
  if (actualStats.triangleCount !== expectedStats.triangleCount) {
    differences.push(
      `Triangle count mismatch: expected ${expectedStats.triangleCount}, got ${actualStats.triangleCount}`
    );
  }

  // Check bounding box
  for (let i = 0; i < 3; i++) {
    if (Math.abs(actualStats.boundingBox.min[i] - expectedStats.boundingBox.min[i]) > tolerance) {
      differences.push(
        `Bounding box min[${i}] mismatch: expected ${expectedStats.boundingBox.min[i]}, got ${actualStats.boundingBox.min[i]}`
      );
    }
    if (Math.abs(actualStats.boundingBox.max[i] - expectedStats.boundingBox.max[i]) > tolerance) {
      differences.push(
        `Bounding box max[${i}] mismatch: expected ${expectedStats.boundingBox.max[i]}, got ${actualStats.boundingBox.max[i]}`
      );
    }
  }

  // Check surface area
  if (Math.abs(actualStats.totalSurfaceArea - expectedStats.totalSurfaceArea) > tolerance * 100) {
    differences.push(
      `Total surface area mismatch: expected ${expectedStats.totalSurfaceArea.toFixed(4)}, got ${actualStats.totalSurfaceArea.toFixed(4)}`
    );
  }

  // Check axis-aligned areas
  const areaKeys: (keyof MeshStats[`axisAreas`])[] = [
    `posX`,
    `negX`,
    `posY`,
    `negY`,
    `posZ`,
    `negZ`,
  ];
  for (const key of areaKeys) {
    const diff = Math.abs(actualStats.axisAreas[key] - expectedStats.axisAreas[key]);
    if (diff > tolerance * 10) {
      differences.push(
        `Axis area ${key} mismatch: expected ${expectedStats.axisAreas[key].toFixed(4)}, got ${actualStats.axisAreas[key].toFixed(4)}`
      );
    }
  }

  // If counts match, compare positions
  if (actualStats.vertexCount === expectedStats.vertexCount) {
    // Sort vertices for order-independent comparison
    const actualVerts = sortVertices(actual);
    const expectedVerts = sortVertices(expectedMesh);

    let vertMismatches = 0;
    for (let i = 0; i < actualVerts.length && vertMismatches < 5; i++) {
      const av = actualVerts[i];
      const ev = expectedVerts[i];
      const dist = Math.sqrt((av[0] - ev[0]) ** 2 + (av[1] - ev[1]) ** 2 + (av[2] - ev[2]) ** 2);
      if (dist > tolerance) {
        vertMismatches++;
        differences.push(
          `Vertex ${i} position mismatch: expected [${ev.join(`, `)}], got [${av.map((v) => v.toFixed(6)).join(`, `)}]`
        );
      }
    }
    if (vertMismatches >= 5) {
      differences.push(`... and more vertex mismatches`);
    }
  }

  return {
    equal: differences.length === 0,
    differences,
    stats: { actual: actualStats, expected: expectedStats },
  };
}

/**
 * Sort vertices for order-independent comparison
 */
function sortVertices(mesh: Mesh): [number, number, number][] {
  const vertexCount = mesh.positions.length / 3;
  const vertices: [number, number, number][] = [];

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    vertices.push([mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]]);
  }

  // Sort by x, then y, then z
  vertices.sort((a, b) => {
    if (Math.abs(a[0] - b[0]) > 1e-9) return a[0] - b[0];
    if (Math.abs(a[1] - b[1]) > 1e-9) return a[1] - b[1];
    return a[2] - b[2];
  });

  return vertices;
}

/**
 * Assert mesh matches golden with detailed error message
 */
export function assertMeshEquals(
  actual: Mesh,
  expected: GoldenMesh,
  tolerance: number = 1e-5
): void {
  const comparison = compareMeshes(actual, expected, tolerance);

  if (!comparison.equal) {
    const message = [
      `Mesh does not match golden:`,
      ...comparison.differences,
      ``,
      `Actual stats:`,
      `  Vertices: ${comparison.stats.actual.vertexCount}`,
      `  Triangles: ${comparison.stats.actual.triangleCount}`,
      `  BBox: [${comparison.stats.actual.boundingBox.min.join(`, `)}] to [${comparison.stats.actual.boundingBox.max.join(`, `)}]`,
      `  Surface area: ${comparison.stats.actual.totalSurfaceArea.toFixed(4)}`,
      ``,
      `Expected stats:`,
      `  Vertices: ${comparison.stats.expected.vertexCount}`,
      `  Triangles: ${comparison.stats.expected.triangleCount}`,
      `  BBox: [${comparison.stats.expected.boundingBox.min.join(`, `)}] to [${comparison.stats.expected.boundingBox.max.join(`, `)}]`,
      `  Surface area: ${comparison.stats.expected.totalSurfaceArea.toFixed(4)}`,
    ].join(`\n`);

    throw new Error(message);
  }
}

/**
 * Serialize a golden mesh to JSON string
 */
export function serializeGolden(golden: GoldenMesh): string {
  return JSON.stringify(golden, null, 2);
}

/**
 * Parse a golden mesh from JSON string
 */
export function parseGolden(json: string): GoldenMesh {
  return JSON.parse(json) as GoldenMesh;
}

/**
 * Print mesh stats for debugging
 */
export function printMeshStats(mesh: Mesh, label: string = `Mesh`): void {
  const stats = computeMeshStats(mesh);
  console.log(`${label} stats:`);
  console.log(`  Vertices: ${stats.vertexCount}`);
  console.log(`  Triangles: ${stats.triangleCount}`);
  console.log(
    `  BBox: [${stats.boundingBox.min.map((v) => v.toFixed(3)).join(`, `)}] to [${stats.boundingBox.max.map((v) => v.toFixed(3)).join(`, `)}]`
  );
  console.log(`  Total surface area: ${stats.totalSurfaceArea.toFixed(4)}`);
  console.log(
    `  Axis areas: +X=${stats.axisAreas.posX.toFixed(2)}, -X=${stats.axisAreas.negX.toFixed(2)}, +Y=${stats.axisAreas.posY.toFixed(2)}, -Y=${stats.axisAreas.negY.toFixed(2)}, +Z=${stats.axisAreas.posZ.toFixed(2)}, -Z=${stats.axisAreas.negZ.toFixed(2)}`
  );
}
