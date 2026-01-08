/**
 * PersistentRef Resolution
 *
 * Resolves stored PersistentRef strings to current geometry.
 * Handles found/ambiguous/not_found cases and scores candidates.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 6
 */

import { decodePersistentRef, type PersistentRefV1 } from "./persistentRef";
import type { ReferenceIndex } from "../kernel/referenceIndex";

// ============================================================================
// Types
// ============================================================================

export interface ResolveFoundResult {
  status: "found";
  bodyKey: string;
  index: number;
}

export interface ResolveAmbiguousResult {
  status: "ambiguous";
  candidates: Array<{ bodyKey: string; index: number; score: number }>;
}

export interface ResolveNotFoundResult {
  status: "not_found";
  reason: string;
}

export type ResolveResult = ResolveFoundResult | ResolveAmbiguousResult | ResolveNotFoundResult;

/**
 * PersistentRefSet for robust references
 */
export interface PersistentRefSet {
  /** Optional preferred candidate (must also exist in candidates) */
  preferred?: string;
  /** Ordered list of candidate stref strings */
  candidates: string[];
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Resolve a PersistentRef to current geometry
 *
 * @param ref - Single ref string or PersistentRefSet
 * @param referenceIndex - Current ReferenceIndex from rebuild
 * @returns Resolution result (found/ambiguous/not_found)
 */
export function resolvePersistentRef(
  ref: string | PersistentRefSet,
  referenceIndex: ReferenceIndex
): ResolveResult {
  const candidates = typeof ref === "string" ? [ref] : ref.candidates;

  // Order candidates: preferred first if present
  const ordered =
    typeof ref === "string"
      ? candidates
      : ref.preferred
        ? [ref.preferred, ...candidates.filter((c) => c !== ref.preferred)]
        : candidates;

  for (const refString of ordered) {
    const decoded = decodePersistentRef(refString);
    if (!decoded.ok) continue;
    const parsed = decoded.ref;

    const hits: Array<{ bodyKey: string; index: number; score: number }> = [];

    for (const [bodyKey, refIndex] of Object.entries(referenceIndex)) {
      const refs = parsed.expectedType === "face" ? refIndex.faces : refIndex.edges;

      for (let i = 0; i < refs.length; i++) {
        const candidateDecoded = decodePersistentRef(refs[i]);
        if (!candidateDecoded.ok) continue;

        const candidate = candidateDecoded.ref;

        // Match by feature ID first
        if (candidate.originFeatureId !== parsed.originFeatureId) continue;

        // Match by selector kind
        if (candidate.localSelector.kind !== parsed.localSelector.kind) continue;

        // Score by selector data + fingerprint similarity
        const score = computeScore(parsed, candidate);
        hits.push({ bodyKey, index: i, score });
      }
    }

    if (hits.length === 0) continue;

    // Sort by score (lower is better)
    hits.sort((a, b) => a.score - b.score);

    // If best match is significantly better than second, return found
    if (hits.length === 1 || hits[0].score < hits[1].score * 0.5) {
      return { status: "found", bodyKey: hits[0].bodyKey, index: hits[0].index };
    }

    // Check if selector contains "loop:unknown" - always return ambiguous
    const hasUnknownLoop =
      parsed.localSelector.data.loopId === "loop:unknown" ||
      String(parsed.localSelector.data.loopId).includes("unknown");

    if (hasUnknownLoop) {
      return { status: "ambiguous", candidates: hits.slice(0, 5) };
    }

    // Multiple close matches - ambiguous
    return { status: "ambiguous", candidates: hits.slice(0, 5) };
  }

  return { status: "not_found", reason: "No candidate reference could be resolved" };
}

/**
 * Compute match score between two refs (lower is better)
 */
function computeScore(ref: PersistentRefV1, candidate: PersistentRefV1): number {
  let score = 0;

  // Selector data match
  for (const [key, value] of Object.entries(ref.localSelector.data)) {
    if (candidate.localSelector.data[key] !== value) {
      // If both have the value but different, penalize
      if (key in candidate.localSelector.data) {
        score += 10;
      }
    }
  }

  // Fingerprint distance
  if (ref.fingerprint && candidate.fingerprint) {
    const dx = ref.fingerprint.centroid[0] - candidate.fingerprint.centroid[0];
    const dy = ref.fingerprint.centroid[1] - candidate.fingerprint.centroid[1];
    const dz = ref.fingerprint.centroid[2] - candidate.fingerprint.centroid[2];
    score += Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Size difference
    const sizeDiff = Math.abs(ref.fingerprint.size - candidate.fingerprint.size);
    const avgSize = (ref.fingerprint.size + candidate.fingerprint.size) / 2;
    if (avgSize > 0) {
      score += (sizeDiff / avgSize) * 5;
    }

    // Normal similarity (faces only)
    if (ref.fingerprint.normal && candidate.fingerprint.normal) {
      const dot =
        ref.fingerprint.normal[0] * candidate.fingerprint.normal[0] +
        ref.fingerprint.normal[1] * candidate.fingerprint.normal[1] +
        ref.fingerprint.normal[2] * candidate.fingerprint.normal[2];
      score += (1 - dot) * 10;
    }
  }

  return score;
}

/**
 * Resolve multiple refs at once (for batch operations)
 */
export function resolveMultiplePersistentRefs(
  refs: Array<string | PersistentRefSet>,
  referenceIndex: ReferenceIndex
): ResolveResult[] {
  return refs.map((ref) => resolvePersistentRef(ref, referenceIndex));
}
