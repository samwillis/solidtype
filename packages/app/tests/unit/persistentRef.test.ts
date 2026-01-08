/**
 * PersistentRef Tests
 *
 * Tests for the merge-safe persistent reference encoding/decoding.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 2
 */

import { describe, test, expect } from "vitest";
import {
  encodePersistentRef,
  decodePersistentRef,
  canonicalJsonStringify,
  isPersistentRefString,
  isPersistentRefSet,
  getPreferredRef,
  getAllCandidates,
  computeLoopId,
  isUnknownLoopId,
  type PersistentRefV1,
  type PersistentRefSet,
} from "../../src/editor/naming";

// ============================================================================
// Encoding/Decoding Tests
// ============================================================================

describe("PersistentRef Encoding/Decoding", () => {
  test("round-trip encode/decode for face ref", () => {
    const ref: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "abc-123-def",
      localSelector: { kind: "extrude.topCap", data: { loopId: "loop:abc" } },
    };

    const encoded = encodePersistentRef(ref);
    expect(encoded).toMatch(/^stref:v1:/);

    const decoded = decodePersistentRef(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref).toEqual(ref);
    }
  });

  test("round-trip encode/decode for edge ref", () => {
    const ref: PersistentRefV1 = {
      v: 1,
      expectedType: "edge",
      originFeatureId: "feature-uuid-123",
      localSelector: {
        kind: "extrude.sideEdge",
        data: { loopId: "loop:xyz", vertexId: "vertex-uuid" },
      },
    };

    const encoded = encodePersistentRef(ref);
    const decoded = decodePersistentRef(encoded);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref).toEqual(ref);
    }
  });

  test("round-trip encode/decode with fingerprint", () => {
    const ref: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "feature-id",
      localSelector: { kind: "extrude.side", data: { loopId: "loop:123", segmentId: "seg-1" } },
      fingerprint: {
        centroid: [1.5, 2.5, 3.5],
        size: 100.0,
        normal: [0, 0, 1],
      },
    };

    const encoded = encodePersistentRef(ref);
    const decoded = decodePersistentRef(encoded);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.ref.fingerprint).toBeDefined();
      expect(decoded.ref.fingerprint?.centroid).toEqual([1.5, 2.5, 3.5]);
      expect(decoded.ref.fingerprint?.size).toBe(100.0);
      expect(decoded.ref.fingerprint?.normal).toEqual([0, 0, 1]);
    }
  });

  test("fingerprint is optional", () => {
    const refWithout: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "x",
      localSelector: { kind: "face.unknown", data: {} },
    };
    const refWith: PersistentRefV1 = {
      ...refWithout,
      fingerprint: { centroid: [0, 0, 0], size: 1 },
    };

    expect(decodePersistentRef(encodePersistentRef(refWithout)).ok).toBe(true);
    expect(decodePersistentRef(encodePersistentRef(refWith)).ok).toBe(true);
  });

  test("encoded string is valid after JSON stringify (for Yjs storage)", () => {
    const ref: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "test-id",
      localSelector: { kind: "extrude.topCap", data: {} },
    };

    const encoded = encodePersistentRef(ref);
    const stored = JSON.parse(JSON.stringify(encoded));
    expect(stored).toBe(encoded);
  });

  test("decode fails for invalid prefix", () => {
    const result = decodePersistentRef("invalid:prefix:data");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid prefix");
    }
  });

  test("decode fails for invalid base64", () => {
    const result = decodePersistentRef("stref:v1:!!!invalid!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Parse error");
    }
  });

  test("decode fails for missing required fields", () => {
    // Encode an incomplete object
    const incomplete = { v: 1, expectedType: "face" };
    const json = JSON.stringify(incomplete);
    const base64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const result = decodePersistentRef(`stref:v1:${base64}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Missing required field");
    }
  });
});

// ============================================================================
// Canonical JSON Tests
// ============================================================================

describe("canonicalJsonStringify", () => {
  test("sorts object keys", () => {
    const obj = { z: 1, a: 2, m: 3 };
    const result = canonicalJsonStringify(obj);
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  test("sorts nested object keys", () => {
    const obj = { outer: { z: 1, a: 2 }, b: { y: 3, x: 4 } };
    const result = canonicalJsonStringify(obj);
    expect(result).toBe('{"b":{"x":4,"y":3},"outer":{"a":2,"z":1}}');
  });

  test("preserves array order", () => {
    const obj = { arr: [3, 1, 2] };
    const result = canonicalJsonStringify(obj);
    expect(result).toBe('{"arr":[3,1,2]}');
  });

  test("two equivalent objects produce identical strings", () => {
    const obj1 = { b: 2, a: 1, c: { z: 3, y: 4 } };
    const obj2 = { c: { y: 4, z: 3 }, a: 1, b: 2 };

    expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("isPersistentRefString", () => {
  test("returns true for valid prefix", () => {
    expect(isPersistentRefString("stref:v1:abc123")).toBe(true);
  });

  test("returns false for invalid prefix", () => {
    expect(isPersistentRefString("invalid:prefix")).toBe(false);
    expect(isPersistentRefString("stref:v2:abc")).toBe(false);
    expect(isPersistentRefString("")).toBe(false);
  });
});

describe("isPersistentRefSet", () => {
  test("returns true for valid PersistentRefSet", () => {
    const refSet: PersistentRefSet = {
      preferred: "stref:v1:abc",
      candidates: ["stref:v1:abc", "stref:v1:def"],
    };
    expect(isPersistentRefSet(refSet)).toBe(true);
  });

  test("returns true for minimal PersistentRefSet", () => {
    const refSet: PersistentRefSet = {
      candidates: ["stref:v1:abc"],
    };
    expect(isPersistentRefSet(refSet)).toBe(true);
  });

  test("returns false for string", () => {
    expect(isPersistentRefSet("stref:v1:abc")).toBe(false);
  });

  test("returns false for null", () => {
    expect(isPersistentRefSet(null)).toBe(false);
  });

  test("returns false for object without candidates", () => {
    expect(isPersistentRefSet({ preferred: "abc" })).toBe(false);
  });
});

describe("getPreferredRef", () => {
  test("returns string for string input", () => {
    expect(getPreferredRef("stref:v1:abc")).toBe("stref:v1:abc");
  });

  test("returns preferred from PersistentRefSet", () => {
    const refSet: PersistentRefSet = {
      preferred: "stref:v1:preferred",
      candidates: ["stref:v1:preferred", "stref:v1:other"],
    };
    expect(getPreferredRef(refSet)).toBe("stref:v1:preferred");
  });

  test("returns first candidate if no preferred", () => {
    const refSet: PersistentRefSet = {
      candidates: ["stref:v1:first", "stref:v1:second"],
    };
    expect(getPreferredRef(refSet)).toBe("stref:v1:first");
  });
});

describe("getAllCandidates", () => {
  test("returns array with string for string input", () => {
    expect(getAllCandidates("stref:v1:abc")).toEqual(["stref:v1:abc"]);
  });

  test("returns candidates from PersistentRefSet", () => {
    const refSet: PersistentRefSet = {
      candidates: ["stref:v1:a", "stref:v1:b", "stref:v1:c"],
    };
    expect(getAllCandidates(refSet)).toEqual(["stref:v1:a", "stref:v1:b", "stref:v1:c"]);
  });
});

// ============================================================================
// Loop ID Tests
// ============================================================================

describe("computeLoopId", () => {
  test("returns empty loop for empty array", () => {
    expect(computeLoopId([])).toBe("loop:empty");
  });

  test("produces consistent ID for same segments", () => {
    const segments = ["seg-a", "seg-b", "seg-c", "seg-d"];
    const id1 = computeLoopId(segments);
    const id2 = computeLoopId(segments);
    expect(id1).toBe(id2);
  });

  test("produces same ID regardless of rotation", () => {
    // Same loop, different starting points
    const loop1 = ["seg-a", "seg-b", "seg-c", "seg-d"];
    const loop2 = ["seg-c", "seg-d", "seg-a", "seg-b"];
    const loop3 = ["seg-b", "seg-c", "seg-d", "seg-a"];

    const id1 = computeLoopId(loop1);
    const id2 = computeLoopId(loop2);
    const id3 = computeLoopId(loop3);

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  test("produces different ID for different segments", () => {
    const loop1 = ["seg-a", "seg-b", "seg-c"];
    const loop2 = ["seg-x", "seg-y", "seg-z"];

    expect(computeLoopId(loop1)).not.toBe(computeLoopId(loop2));
  });

  test("ID starts with 'loop:' prefix", () => {
    const id = computeLoopId(["seg-1", "seg-2"]);
    expect(id).toMatch(/^loop:/);
  });
});

describe("isUnknownLoopId", () => {
  test("returns true for unknown sentinel", () => {
    expect(isUnknownLoopId("loop:unknown")).toBe(true);
  });

  test("returns false for computed loop IDs", () => {
    const id = computeLoopId(["seg-a", "seg-b"]);
    expect(isUnknownLoopId(id)).toBe(false);
  });

  test("returns false for empty loop", () => {
    expect(isUnknownLoopId("loop:empty")).toBe(false);
  });
});

// ============================================================================
// CRDT Safety Tests
// ============================================================================

describe("CRDT Safety", () => {
  test("two clients encoding same ref produce identical strings", () => {
    // Simulate two clients creating the same ref independently
    const ref1: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "shared-feature-id",
      localSelector: {
        kind: "extrude.topCap",
        data: { loopId: computeLoopId(["line-1", "line-2", "line-3", "line-4"]) },
      },
    };

    const ref2: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "shared-feature-id",
      localSelector: {
        kind: "extrude.topCap",
        // Same loop entities but created independently
        data: { loopId: computeLoopId(["line-1", "line-2", "line-3", "line-4"]) },
      },
    };

    expect(encodePersistentRef(ref1)).toBe(encodePersistentRef(ref2));
  });

  test("different selector data produces different strings", () => {
    const ref1: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "feature-id",
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc", segmentId: "seg-1" } },
    };

    const ref2: PersistentRefV1 = {
      v: 1,
      expectedType: "face",
      originFeatureId: "feature-id",
      localSelector: { kind: "extrude.side", data: { loopId: "loop:abc", segmentId: "seg-2" } },
    };

    expect(encodePersistentRef(ref1)).not.toBe(encodePersistentRef(ref2));
  });
});
