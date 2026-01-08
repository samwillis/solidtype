/**
 * PersistentRef Resolution Tests
 *
 * Tests for the resolvePersistentRef function.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 6
 */

import { describe, test, expect } from "vitest";
import {
  resolvePersistentRef,
  resolveMultiplePersistentRefs,
} from "../../src/editor/naming/resolvePersistentRef";
import { encodePersistentRef, type PersistentRefV1 } from "../../src/editor/naming";
import type { ReferenceIndex } from "../../src/editor/kernel";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestRef(overrides: Partial<PersistentRefV1> = {}): PersistentRefV1 {
  return {
    v: 1,
    expectedType: "face",
    originFeatureId: "feature-123",
    localSelector: { kind: "extrude.topCap", data: { loopId: "loop:abc" } },
    fingerprint: {
      centroid: [0.5, 0.5, 1],
      size: 1,
      normal: [0, 0, 1],
    },
    ...overrides,
  };
}

function createTestIndex(refs: string[]): ReferenceIndex {
  return {
    body1: {
      faces: refs,
      edges: [],
    },
  };
}

// ============================================================================
// Resolution Tests
// ============================================================================

describe("resolvePersistentRef", () => {
  test("finds exact match", () => {
    const ref = createTestRef();
    const encoded = encodePersistentRef(ref);
    const index = createTestIndex([encoded]);

    const result = resolvePersistentRef(encoded, index);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.bodyKey).toBe("body1");
      expect(result.index).toBe(0);
    }
  });

  test("returns not_found for missing feature", () => {
    const ref = createTestRef({ originFeatureId: "nonexistent" });
    const encoded = encodePersistentRef(ref);

    const otherRef = createTestRef({ originFeatureId: "other-feature" });
    const index = createTestIndex([encodePersistentRef(otherRef)]);

    const result = resolvePersistentRef(encoded, index);

    expect(result.status).toBe("not_found");
  });

  test("returns not_found for empty index", () => {
    const ref = createTestRef();
    const encoded = encodePersistentRef(ref);
    const index: ReferenceIndex = {};

    const result = resolvePersistentRef(encoded, index);

    expect(result.status).toBe("not_found");
  });

  test("returns ambiguous for multiple matches with similar scores", () => {
    // Create two refs with same feature ID and selector kind
    const ref1 = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc", faceIndex: 0 } },
      fingerprint: { centroid: [1, 0, 0.5], size: 1, normal: [1, 0, 0] },
    });
    const ref2 = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc", faceIndex: 1 } },
      fingerprint: { centroid: [0, 1, 0.5], size: 1, normal: [0, 1, 0] },
    });

    // Search for a ref that matches both (only loopId in data)
    const searchRef = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc" } },
      fingerprint: { centroid: [0.5, 0.5, 0.5], size: 1, normal: [0.7, 0.7, 0] },
    });

    const index = createTestIndex([encodePersistentRef(ref1), encodePersistentRef(ref2)]);
    const result = resolvePersistentRef(encodePersistentRef(searchRef), index);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.length).toBe(2);
    }
  });

  test("loop:unknown always returns ambiguous", () => {
    const ref1 = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:unknown", faceIndex: 0 } },
      fingerprint: { centroid: [1, 0, 0.5], size: 1, normal: [1, 0, 0] },
    });
    const ref2 = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:unknown", faceIndex: 1 } },
      fingerprint: { centroid: [0, 1, 0.5], size: 1, normal: [0, 1, 0] },
    });

    // Search with unknown loop
    const searchRef = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:unknown" } },
    });

    const index = createTestIndex([encodePersistentRef(ref1), encodePersistentRef(ref2)]);
    const result = resolvePersistentRef(encodePersistentRef(searchRef), index);

    // Should be ambiguous even if one matches better, because loop:unknown
    expect(result.status).toBe("ambiguous");
  });

  test("uses fingerprint for disambiguation", () => {
    // Two faces with same selector but different positions
    const ref1 = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc" } },
      fingerprint: { centroid: [10, 0, 0], size: 1, normal: [1, 0, 0] },
    });
    const ref2 = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc" } },
      fingerprint: { centroid: [0, 10, 0], size: 1, normal: [0, 1, 0] },
    });

    // Search for one very close to ref1
    const searchRef = createTestRef({
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc" } },
      fingerprint: { centroid: [10.01, 0, 0], size: 1, normal: [1, 0, 0] },
    });

    const index = createTestIndex([encodePersistentRef(ref1), encodePersistentRef(ref2)]);
    const result = resolvePersistentRef(encodePersistentRef(searchRef), index);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.index).toBe(0); // ref1
    }
  });

  test("handles PersistentRefSet with preferred", () => {
    const ref1 = createTestRef({
      localSelector: { kind: "extrude.topCap", data: { loopId: "loop:abc" } },
    });
    const ref2 = createTestRef({
      localSelector: { kind: "extrude.bottomCap", data: { loopId: "loop:abc" } },
    });

    const encoded1 = encodePersistentRef(ref1);
    const encoded2 = encodePersistentRef(ref2);

    const index = createTestIndex([encoded1, encoded2]);

    // Use a ref set with preferred pointing to ref1
    const refSet = {
      preferred: encoded1,
      candidates: [encoded1, encoded2],
    };

    const result = resolvePersistentRef(refSet, index);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.index).toBe(0);
    }
  });

  test("handles edge refs", () => {
    const ref = createTestRef({
      expectedType: "edge",
      localSelector: { kind: "extrude.edge", data: { loopId: "loop:abc", edgeIndex: 0 } },
      fingerprint: { centroid: [0.5, 0, 0], size: 1 },
    });

    const encoded = encodePersistentRef(ref);
    const index: ReferenceIndex = {
      body1: {
        faces: [],
        edges: [encoded],
      },
    };

    const result = resolvePersistentRef(encoded, index);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.index).toBe(0);
    }
  });
});

describe("resolveMultiplePersistentRefs", () => {
  test("resolves multiple refs at once", () => {
    const ref1 = createTestRef({
      localSelector: { kind: "extrude.topCap", data: { loopId: "loop:abc" } },
    });
    const ref2 = createTestRef({
      localSelector: { kind: "extrude.bottomCap", data: { loopId: "loop:abc" } },
    });

    const encoded1 = encodePersistentRef(ref1);
    const encoded2 = encodePersistentRef(ref2);

    const index = createTestIndex([encoded1, encoded2]);

    const results = resolveMultiplePersistentRefs([encoded1, encoded2], index);

    expect(results.length).toBe(2);
    expect(results[0].status).toBe("found");
    expect(results[1].status).toBe("found");
  });
});
