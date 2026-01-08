/**
 * Naming Module
 *
 * Persistent naming system for merge-safe topological references.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 2, 6
 * @see docs/TOPOLOGICAL-NAMING.md
 */

export {
  // Types
  type PersistentRefV1,
  type PersistentRefSet,
  type ExtrudeLocalSelectorKind,
  type RevolveLocalSelectorKind,
  type KnownLocalSelectorKind,
  // Encoding/Decoding
  encodePersistentRef,
  decodePersistentRef,
  canonicalJsonStringify,
  // Helpers
  isPersistentRefString,
  isPersistentRefSet,
  getPreferredRef,
  getAllCandidates,
  // Loop ID
  computeLoopId,
  isUnknownLoopId,
} from "./persistentRef";

export {
  // Resolution types
  type ResolveResult,
  type ResolveFoundResult,
  type ResolveAmbiguousResult,
  type ResolveNotFoundResult,
  type PersistentRefSet as RefSet,
  // Resolution functions
  resolvePersistentRef,
  resolveMultiplePersistentRefs,
} from "./resolvePersistentRef";
