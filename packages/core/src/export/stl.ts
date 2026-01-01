/**
 * STL Export - Phase 18
 *
 * Exports tessellated mesh data to STL format (binary or ASCII).
 */

import type { Mesh } from "../mesh/types.js";
import { normalize3, cross3, sub3 } from "../num/vec3.js";

/**
 * Options for STL export
 */
export interface StlExportOptions {
  /** Use binary format (default) or ASCII */
  binary?: boolean;
  /** Decimal precision for ASCII format (default: 6) */
  precision?: number;
  /** Model name for solid (default: 'model') */
  name?: string;
}

/**
 * A single triangle for STL output
 */
interface StlTriangle {
  normal: [number, number, number];
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
}

/**
 * Extract triangles from a tessellated mesh
 */
function extractTriangles(mesh: Mesh): StlTriangle[] {
  const triangles: StlTriangle[] = [];
  const { positions, indices } = mesh;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    // Get vertices
    const v1: [number, number, number] = [
      positions[i0 * 3],
      positions[i0 * 3 + 1],
      positions[i0 * 3 + 2],
    ];
    const v2: [number, number, number] = [
      positions[i1 * 3],
      positions[i1 * 3 + 1],
      positions[i1 * 3 + 2],
    ];
    const v3: [number, number, number] = [
      positions[i2 * 3],
      positions[i2 * 3 + 1],
      positions[i2 * 3 + 2],
    ];

    // Calculate face normal
    const edge1 = sub3(v2, v1);
    const edge2 = sub3(v3, v1);
    const normal = normalize3(cross3(edge1, edge2)) as [number, number, number];

    triangles.push({ normal, v1, v2, v3 });
  }

  return triangles;
}

/**
 * Write binary STL format
 */
function writeBinaryStl(triangles: StlTriangle[]): ArrayBuffer {
  const HEADER_SIZE = 80;
  const TRIANGLE_SIZE = 50; // 12 (normal) + 36 (vertices) + 2 (attribute)

  const bufferSize = HEADER_SIZE + 4 + triangles.length * TRIANGLE_SIZE;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header (80 bytes) - use TextEncoder if available, otherwise fill with spaces
  const headerText = `SolidType STL Export`;
  for (let i = 0; i < HEADER_SIZE; i++) {
    view.setUint8(i, i < headerText.length ? headerText.charCodeAt(i) : 0);
  }

  // Triangle count (4 bytes, little endian)
  view.setUint32(HEADER_SIZE, triangles.length, true);

  // Triangles
  let offset = HEADER_SIZE + 4;
  for (const tri of triangles) {
    // Normal
    view.setFloat32(offset, tri.normal[0], true);
    offset += 4;
    view.setFloat32(offset, tri.normal[1], true);
    offset += 4;
    view.setFloat32(offset, tri.normal[2], true);
    offset += 4;

    // Vertex 1
    view.setFloat32(offset, tri.v1[0], true);
    offset += 4;
    view.setFloat32(offset, tri.v1[1], true);
    offset += 4;
    view.setFloat32(offset, tri.v1[2], true);
    offset += 4;

    // Vertex 2
    view.setFloat32(offset, tri.v2[0], true);
    offset += 4;
    view.setFloat32(offset, tri.v2[1], true);
    offset += 4;
    view.setFloat32(offset, tri.v2[2], true);
    offset += 4;

    // Vertex 3
    view.setFloat32(offset, tri.v3[0], true);
    offset += 4;
    view.setFloat32(offset, tri.v3[1], true);
    offset += 4;
    view.setFloat32(offset, tri.v3[2], true);
    offset += 4;

    // Attribute byte count (unused, set to 0)
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

/**
 * Write ASCII STL format
 */
function writeAsciiStl(triangles: StlTriangle[], name: string, precision: number): string {
  const fmt = (n: number) => n.toFixed(precision);

  let output = `solid ${name}\n`;

  for (const tri of triangles) {
    output += `  facet normal ${fmt(tri.normal[0])} ${fmt(tri.normal[1])} ${fmt(tri.normal[2])}\n`;
    output += `    outer loop\n`;
    output += `      vertex ${fmt(tri.v1[0])} ${fmt(tri.v1[1])} ${fmt(tri.v1[2])}\n`;
    output += `      vertex ${fmt(tri.v2[0])} ${fmt(tri.v2[1])} ${fmt(tri.v2[2])}\n`;
    output += `      vertex ${fmt(tri.v3[0])} ${fmt(tri.v3[1])} ${fmt(tri.v3[2])}\n`;
    output += `    endloop\n`;
    output += `  endfacet\n`;
  }

  output += `endsolid ${name}\n`;

  return output;
}

/**
 * Export meshes to STL format
 *
 * @param meshes Array of tessellated meshes to export
 * @param options Export options (binary, precision, name)
 * @returns ArrayBuffer for binary format, string for ASCII format
 */
export function exportMeshesToStl(
  meshes: Mesh[],
  options: StlExportOptions = {}
): ArrayBuffer | string {
  const { binary = true, precision = 6, name = `model` } = options;

  // Collect all triangles from all meshes
  const allTriangles: StlTriangle[] = [];

  for (const mesh of meshes) {
    const triangles = extractTriangles(mesh);
    allTriangles.push(...triangles);
  }

  if (binary) {
    return writeBinaryStl(allTriangles);
  } else {
    return writeAsciiStl(allTriangles, name, precision);
  }
}

/**
 * Check if the result is binary (ArrayBuffer) or ASCII (string)
 */
export function isStlBinary(result: ArrayBuffer | string): result is ArrayBuffer {
  return result instanceof ArrayBuffer;
}
