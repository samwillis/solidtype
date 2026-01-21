/**
 * ReferenceIndex Tests
 *
 * Tests for fingerprint computation and PersistentRef generation.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 3
 */

import { describe, test, expect } from "vitest";
import {
  computeFaceFingerprints,
  computeEdgeFingerprints,
  generateFaceRef,
  generateEdgeRef,
  buildBodyReferenceIndex,
  computeProfileLoops,
  type FaceFingerprint,
  type SketchInfo,
} from "../../src/editor/kernel/referenceIndex";
import { decodePersistentRef } from "../../src/editor/naming";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a simple triangle mesh for testing
 * A single triangle in the XY plane
 */
function createSimpleTriangleMesh() {
  // Triangle vertices at (0,0,0), (1,0,0), (0,1,0)
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);

  // All normals point up (+Z)
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);

  // Single triangle
  const indices = new Uint32Array([0, 1, 2]);

  // Single face (face 0)
  const faceMap = new Uint32Array([0]);

  return { positions, normals, indices, faceMap };
}

/**
 * Create a box mesh for testing (simplified - just 2 faces)
 * Top face (Z+) and bottom face (Z-)
 */
function createBoxMesh() {
  // Two quads split into triangles
  const positions = new Float32Array([
    // Top face (Z=1)
    0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    // Bottom face (Z=0)
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
  ]);

  const normals = new Float32Array([
    // Top face normals (Z+)
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    // Bottom face normals (Z-)
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
  ]);

  // Two triangles per face
  const indices = new Uint32Array([
    // Top face
    0, 1, 2, 0, 2, 3,
    // Bottom face
    4, 6, 5, 4, 7, 6,
  ]);

  // Two triangles for face 0 (top), two for face 1 (bottom)
  const faceMap = new Uint32Array([0, 0, 1, 1]);

  return { positions, normals, indices, faceMap };
}

/**
 * Create simple edge data for testing
 */
function createEdgeData() {
  // Two edges: (0,0,0)-(1,0,0) and (1,0,0)-(1,1,0)
  const edges = new Float32Array([
    0,
    0,
    0,
    1,
    0,
    0, // Edge 0
    1,
    0,
    0,
    1,
    1,
    0, // Edge 1
  ]);

  const edgeMap = new Uint32Array([0, 1]);

  return { edges, edgeMap };
}

// ============================================================================
// Face Fingerprint Tests
// ============================================================================

describe("computeFaceFingerprints", () => {
  test("computes fingerprint for single triangle", () => {
    const { positions, normals, indices, faceMap } = createSimpleTriangleMesh();

    const fingerprints = computeFaceFingerprints(positions, normals, indices, faceMap);

    expect(fingerprints).toHaveLength(1);

    const fp = fingerprints[0];
    // Centroid should be at (1/3, 1/3, 0)
    expect(fp.centroid[0]).toBeCloseTo(1 / 3, 5);
    expect(fp.centroid[1]).toBeCloseTo(1 / 3, 5);
    expect(fp.centroid[2]).toBeCloseTo(0, 5);

    // Normal should be (0, 0, 1)
    expect(fp.normal[0]).toBeCloseTo(0, 5);
    expect(fp.normal[1]).toBeCloseTo(0, 5);
    expect(fp.normal[2]).toBeCloseTo(1, 5);

    // Area of triangle with base 1 and height 1 = 0.5
    expect(fp.size).toBeCloseTo(0.5, 5);
  });

  test("computes fingerprints for multiple faces", () => {
    const { positions, normals, indices, faceMap } = createBoxMesh();

    const fingerprints = computeFaceFingerprints(positions, normals, indices, faceMap);

    expect(fingerprints).toHaveLength(2);

    // Top face (face 0) - normal should be (0, 0, 1)
    expect(fingerprints[0].normal[2]).toBeCloseTo(1, 5);

    // Bottom face (face 1) - normal should be (0, 0, -1)
    expect(fingerprints[1].normal[2]).toBeCloseTo(-1, 5);
  });

  test("handles empty faceMap", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const indices = new Uint32Array([0, 1, 2]);
    const faceMap = new Uint32Array([]);

    const fingerprints = computeFaceFingerprints(positions, normals, indices, faceMap);

    expect(fingerprints).toHaveLength(0);
  });
});

// ============================================================================
// Edge Fingerprint Tests
// ============================================================================

describe("computeEdgeFingerprints", () => {
  test("computes fingerprints for edges", () => {
    const { edges, edgeMap } = createEdgeData();

    const fingerprints = computeEdgeFingerprints(edges, edgeMap);

    expect(fingerprints).toHaveLength(2);

    // Edge 0: midpoint at (0.5, 0, 0), length 1
    expect(fingerprints[0].centroid[0]).toBeCloseTo(0.5, 5);
    expect(fingerprints[0].centroid[1]).toBeCloseTo(0, 5);
    expect(fingerprints[0].centroid[2]).toBeCloseTo(0, 5);
    expect(fingerprints[0].size).toBeCloseTo(1, 5);

    // Edge 1: midpoint at (1, 0.5, 0), length 1
    expect(fingerprints[1].centroid[0]).toBeCloseTo(1, 5);
    expect(fingerprints[1].centroid[1]).toBeCloseTo(0.5, 5);
    expect(fingerprints[1].centroid[2]).toBeCloseTo(0, 5);
    expect(fingerprints[1].size).toBeCloseTo(1, 5);
  });

  test("handles empty edgeMap", () => {
    const edges = new Float32Array([]);
    const edgeMap = new Uint32Array([]);

    const fingerprints = computeEdgeFingerprints(edges, edgeMap);

    expect(fingerprints).toHaveLength(0);
  });
});

// ============================================================================
// PersistentRef Generation Tests
// ============================================================================

describe("generateFaceRef", () => {
  test("generates topCap ref for upward-facing extrude face", () => {
    const fingerprint: FaceFingerprint = {
      centroid: [0.5, 0.5, 1],
      size: 1,
      normal: [0, 0, 1], // Pointing up
    };

    const refString = generateFaceRef("feature-123", "extrude", 0, fingerprint);

    expect(refString).toMatch(/^stref:v1:/);

    const decoded = decodePersistentRef(refString);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.localSelector.kind).toBe("extrude.topCap");
      expect(decoded.ref.expectedType).toBe("face");
      expect(decoded.ref.originFeatureId).toBe("feature-123");
    }
  });

  test("generates bottomCap ref for downward-facing extrude face", () => {
    const fingerprint: FaceFingerprint = {
      centroid: [0.5, 0.5, 0],
      size: 1,
      normal: [0, 0, -1], // Pointing down
    };

    const refString = generateFaceRef("feature-456", "extrude", 1, fingerprint);

    const decoded = decodePersistentRef(refString);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.localSelector.kind).toBe("extrude.bottomCap");
    }
  });

  test("generates side ref for lateral extrude face", () => {
    const fingerprint: FaceFingerprint = {
      centroid: [1, 0.5, 0.5],
      size: 1,
      normal: [1, 0, 0], // Pointing sideways
    };

    const refString = generateFaceRef("feature-789", "extrude", 2, fingerprint);

    const decoded = decodePersistentRef(refString);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.localSelector.kind).toBe("extrude.side");
    }
  });

  test("uses sketchInfo loopId when provided", () => {
    const fingerprint: FaceFingerprint = {
      centroid: [0.5, 0.5, 1],
      size: 1,
      normal: [0, 0, 1],
    };

    const sketchInfo: SketchInfo = {
      profileLoops: [{ loopId: "loop:abc123", entityIds: ["e1", "e2", "e3"] }],
    };

    const refString = generateFaceRef("feature-123", "extrude", 0, fingerprint, sketchInfo);

    const decoded = decodePersistentRef(refString);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.localSelector.data.loopId).toBe("loop:abc123");
    }
  });

  test("generates revolve.side ref for revolve feature", () => {
    const fingerprint: FaceFingerprint = {
      centroid: [1, 0, 0.5],
      size: 10,
      normal: [1, 0, 0],
    };

    const refString = generateFaceRef("revolve-1", "revolve", 0, fingerprint);

    const decoded = decodePersistentRef(refString);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.localSelector.kind).toBe("revolve.side");
    }
  });

  test("generates face.unknown for unknown feature type", () => {
    const fingerprint: FaceFingerprint = {
      centroid: [0, 0, 0],
      size: 1,
      normal: [0, 0, 1],
    };

    const refString = generateFaceRef("unknown-1", "fillet", 0, fingerprint);

    const decoded = decodePersistentRef(refString);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.localSelector.kind).toBe("face.unknown");
    }
  });
});

describe("generateEdgeRef", () => {
  test("generates extrude.edge ref for extrude feature", () => {
    const fingerprint = {
      centroid: [0.5, 0, 0] as [number, number, number],
      size: 1,
    };

    const refString = generateEdgeRef("feature-123", "extrude", 0, fingerprint);

    const decoded = decodePersistentRef(refString);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.expectedType).toBe("edge");
      expect(decoded.ref.localSelector.kind).toBe("extrude.edge");
    }
  });
});

// ============================================================================
// buildBodyReferenceIndex Tests
// ============================================================================

describe("buildBodyReferenceIndex", () => {
  test("builds complete reference index for body", () => {
    const { positions, normals, indices, faceMap } = createBoxMesh();
    const { edges, edgeMap } = createEdgeData();

    const refIndex = buildBodyReferenceIndex(
      "body-1",
      "feature-1",
      "extrude",
      positions,
      normals,
      indices,
      faceMap,
      edges,
      edgeMap
    );

    expect(refIndex.faces).toHaveLength(2);
    expect(refIndex.edges).toHaveLength(2);

    // All refs should be valid PersistentRef strings
    for (const ref of refIndex.faces) {
      expect(ref).toMatch(/^stref:v1:/);
      expect(decodePersistentRef(ref).ok).toBe(true);
    }

    for (const ref of refIndex.edges) {
      expect(ref).toMatch(/^stref:v1:/);
      expect(decodePersistentRef(ref).ok).toBe(true);
    }
  });

  test("handles missing edge data", () => {
    const { positions, normals, indices, faceMap } = createSimpleTriangleMesh();

    const refIndex = buildBodyReferenceIndex(
      "body-1",
      "feature-1",
      "extrude",
      positions,
      normals,
      indices,
      faceMap
    );

    expect(refIndex.faces).toHaveLength(1);
    expect(refIndex.edges).toHaveLength(0);
  });
});

// ============================================================================
// computeProfileLoops Tests
// ============================================================================

describe("computeProfileLoops", () => {
  test("finds closed rectangle loop", () => {
    const entitiesById = {
      "line-1": { type: "line", start: "p1", end: "p2" },
      "line-2": { type: "line", start: "p2", end: "p3" },
      "line-3": { type: "line", start: "p3", end: "p4" },
      "line-4": { type: "line", start: "p4", end: "p1" },
    };
    const pointsById = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      p3: { x: 10, y: 10 },
      p4: { x: 0, y: 10 },
    };

    const loops = computeProfileLoops(entitiesById, pointsById);

    expect(loops).toHaveLength(1);
    expect(loops[0].entityIds).toHaveLength(4);
    expect(loops[0].loopId).toMatch(/^loop:/);
  });

  test("handles circle entity", () => {
    const entitiesById = {
      "circle-1": { type: "circle", center: "p1", radius: 5 },
    };
    const pointsById = {
      p1: { x: 0, y: 0 },
    };

    const loops = computeProfileLoops(entitiesById, pointsById);

    expect(loops).toHaveLength(1);
    expect(loops[0].entityIds).toEqual(["circle-1"]);
  });

  test("returns empty for open path", () => {
    const entitiesById = {
      "line-1": { type: "line", start: "p1", end: "p2" },
      "line-2": { type: "line", start: "p2", end: "p3" },
      // No line closing back to p1
    };
    const pointsById = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      p3: { x: 10, y: 10 },
    };

    const loops = computeProfileLoops(entitiesById, pointsById);

    expect(loops).toHaveLength(0);
  });

  test("computes stable loopId for same entities", () => {
    const entitiesById1 = {
      "line-a": { type: "line", start: "p1", end: "p2" },
      "line-b": { type: "line", start: "p2", end: "p3" },
      "line-c": { type: "line", start: "p3", end: "p1" },
    };
    const entitiesById2 = {
      "line-c": { type: "line", start: "p3", end: "p1" },
      "line-a": { type: "line", start: "p1", end: "p2" },
      "line-b": { type: "line", start: "p2", end: "p3" },
    };
    const pointsById = {
      p1: { x: 0, y: 0 },
      p2: { x: 1, y: 0 },
      p3: { x: 0.5, y: 1 },
    };

    const loops1 = computeProfileLoops(entitiesById1, pointsById);
    const loops2 = computeProfileLoops(entitiesById2, pointsById);

    // Both should produce the same loopId despite different iteration order
    expect(loops1[0].loopId).toBe(loops2[0].loopId);
  });
});
