/**
 * PersistentRef V1 — Merge-safe topological reference
 *
 * Design goals:
 * - Survives Yjs fork/merge (uses UUIDs, not sequential IDs)
 * - Portable across tool calls (string-encoded)
 * - Progressive enhancement (fingerprints optional, semantic hints deferred)
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 2
 * @see docs/TOPOLOGICAL-NAMING.md for the long-term naming algorithm
 */

// ============================================================================
// Types
// ============================================================================

/**
 * PersistentRefV1 — stable handle for topological entities
 *
 * This is the primary format for storing references to faces/edges/vertices
 * in the Yjs document. It is designed to be CRDT-safe and merge-friendly.
 */
export interface PersistentRefV1 {
  /** Version for forward compatibility */
  v: 1;

  /** Expected subshape type */
  expectedType: "face" | "edge" | "vertex";

  /** UUID of the feature that created this subshape */
  originFeatureId: string;

  /** Feature-local selector (how to find within the feature) */
  localSelector: {
    /** Selector kind (e.g., "extrude.topCap", "extrude.side", "revolve.side") */
    kind: string;
    /** Disambiguation data (keyed by stable IDs, not indices) */
    data: Record<string, string | number>;
  };

  /** Geometry fingerprint for fallback matching (optional) */
  fingerprint?: {
    /** Approximate centroid [x, y, z] */
    centroid: [number, number, number];
    /** Approximate area (faces) or length (edges) */
    size: number;
    /** Surface normal for faces [nx, ny, nz] */
    normal?: [number, number, number];
  };
}

/**
 * PersistentRefSet — optional multi-candidate reference.
 *
 * Most of the time this contains exactly one candidate. It grows only when:
 * - a merge introduces competing repairs, or
 * - resolution is ambiguous and we record a small shortlist, or
 * - we later learn a stronger candidate (e.g. OCCT-history-backed) and keep
 *   the older fallback for safety.
 */
export interface PersistentRefSet {
  /** Optional preferred candidate (must also exist in `candidates`) */
  preferred?: string;
  /** Ordered list of candidate stref strings (deduped + capped, e.g. 3–5) */
  candidates: string[];
}

// ============================================================================
// Canonical JSON Stringify
// ============================================================================

/**
 * Canonical JSON stringify - produces deterministic output
 *
 * This ensures two clients encoding the same PersistentRef produce
 * identical strings, which is critical for CRDT-safe storage.
 *
 * - Sorts object keys recursively
 * - Produces stable output for arrays/primitives
 * - No locale-dependent formatting
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      // Sort keys for deterministic output
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
}

// ============================================================================
// Encoding / Decoding
// ============================================================================

/**
 * Encode a PersistentRefV1 to a portable string: stref:v1:<base64url>
 *
 * @param ref - The PersistentRefV1 object to encode
 * @returns Encoded string in format "stref:v1:..."
 */
export function encodePersistentRef(ref: PersistentRefV1): string {
  // Use canonical JSON for deterministic encoding
  const json = canonicalJsonStringify(ref);
  // Base64url encode (URL-safe base64 without padding)
  const base64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `stref:v1:${base64}`;
}

/**
 * Decode a PersistentRef string
 *
 * @param s - The encoded string (stref:v1:...)
 * @returns Result with decoded ref or error
 */
export function decodePersistentRef(
  s: string
): { ok: true; ref: PersistentRefV1 } | { ok: false; error: string } {
  // Check prefix
  if (!s.startsWith("stref:v1:")) {
    return { ok: false, error: "Invalid prefix (expected 'stref:v1:')" };
  }

  try {
    // Extract base64url payload
    const base64url = s.slice(9);
    // Convert from base64url to standard base64
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    // Decode
    const json = atob(base64);
    const ref = JSON.parse(json) as PersistentRefV1;

    // Validate required fields
    if (ref.v !== 1) {
      return { ok: false, error: `Unsupported version: ${ref.v}` };
    }
    if (!ref.expectedType) {
      return { ok: false, error: "Missing required field: expectedType" };
    }
    if (!ref.originFeatureId) {
      return { ok: false, error: "Missing required field: originFeatureId" };
    }
    if (!ref.localSelector || !ref.localSelector.kind) {
      return { ok: false, error: "Missing required field: localSelector" };
    }

    return { ok: true, ref };
  } catch (e) {
    return { ok: false, error: `Parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a string is a valid PersistentRef string
 */
export function isPersistentRefString(s: string): boolean {
  return s.startsWith("stref:v1:");
}

/**
 * Check if a value is a PersistentRefSet
 */
export function isPersistentRefSet(value: unknown): value is PersistentRefSet {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.candidates) && obj.candidates.every((c) => typeof c === "string");
}

/**
 * Get the preferred ref from a string or PersistentRefSet
 */
export function getPreferredRef(ref: string | PersistentRefSet): string | undefined {
  if (typeof ref === "string") {
    return ref;
  }
  return ref.preferred ?? ref.candidates[0];
}

/**
 * Get all candidate refs from a string or PersistentRefSet
 */
export function getAllCandidates(ref: string | PersistentRefSet): string[] {
  if (typeof ref === "string") {
    return [ref];
  }
  return ref.candidates;
}

// ============================================================================
// Local Selector Kinds
// ============================================================================

/**
 * Known local selector kinds for extrude features
 */
export type ExtrudeLocalSelectorKind =
  | "extrude.topCap"
  | "extrude.bottomCap"
  | "extrude.side"
  | "extrude.topEdge"
  | "extrude.bottomEdge"
  | "extrude.sideEdge";

/**
 * Known local selector kinds for revolve features
 */
export type RevolveLocalSelectorKind = "revolve.side" | "revolve.startCap" | "revolve.endCap";

/**
 * All known local selector kinds
 */
export type KnownLocalSelectorKind =
  | ExtrudeLocalSelectorKind
  | RevolveLocalSelectorKind
  | "face.unknown"
  | "edge.unknown"
  | "vertex.unknown";

// ============================================================================
// Profile Loop ID Generation
// ============================================================================

/**
 * Compute a stable loopId from an ordered list of segment entity IDs.
 *
 * The loopId is deterministic and rotation-invariant:
 * - Sort the segment IDs cyclically so the lexicographically smallest comes first
 * - Join with a delimiter and hash to produce a short identifier
 *
 * This ensures two clients who independently create the same loop
 * compute the same loopId after merge.
 *
 * @param segmentIds - Array of sketch entity UUIDs forming the loop
 * @returns Stable loop identifier string
 */
export function computeLoopId(segmentIds: string[]): string {
  if (segmentIds.length === 0) {
    return "loop:empty";
  }

  // Find the lexicographically smallest ID
  let minIndex = 0;
  for (let i = 1; i < segmentIds.length; i++) {
    if (segmentIds[i] < segmentIds[minIndex]) {
      minIndex = i;
    }
  }

  // Rotate so the smallest ID comes first
  const rotated = [...segmentIds.slice(minIndex), ...segmentIds.slice(0, minIndex)];

  // Join and create a short hash
  const joined = rotated.join("|");

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 33) ^ joined.charCodeAt(i);
  }

  // Convert to base36 for a shorter string
  const hashStr = Math.abs(hash).toString(36);

  return `loop:${hashStr}`;
}

/**
 * Check if a loopId is the "unknown" sentinel
 */
export function isUnknownLoopId(loopId: string): boolean {
  return loopId === "loop:unknown";
}
