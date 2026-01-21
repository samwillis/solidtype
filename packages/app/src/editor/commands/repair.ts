/**
 * Repair Commands
 *
 * Commands for repairing broken references in the document.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 6
 */

import type { SolidTypeDoc } from "../document/createDocument";
import { decodePersistentRef } from "../naming";
import type { CommandResult } from "./types";
import { ok, err } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface RepairReferenceArgs {
  /** Feature ID containing the broken reference */
  featureId: string;
  /** Parameter name that contains the reference */
  paramName: string;
  /** New PersistentRef string to use */
  newRef: string;
}

export interface ClearReferenceArgs {
  /** Feature ID containing the reference */
  featureId: string;
  /** Parameter name to clear */
  paramName: string;
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Repair a broken reference by replacing it with a new valid ref
 */
export function repairReference(doc: SolidTypeDoc, args: RepairReferenceArgs): CommandResult<void> {
  const feature = doc.featuresById.get(args.featureId);
  if (!feature) {
    return err(`Feature ${args.featureId} not found`);
  }

  // Validate the new ref
  const decoded = decodePersistentRef(args.newRef);
  if (!decoded.ok) {
    return err(`Invalid ref: ${decoded.error}`);
  }

  doc.ydoc.transact(() => {
    feature.set(args.paramName, args.newRef);
  });

  return ok(undefined);
}

/**
 * Clear a reference parameter (set to null/undefined)
 */
export function clearReference(doc: SolidTypeDoc, args: ClearReferenceArgs): CommandResult<void> {
  const feature = doc.featuresById.get(args.featureId);
  if (!feature) {
    return err(`Feature ${args.featureId} not found`);
  }

  doc.ydoc.transact(() => {
    feature.delete(args.paramName);
  });

  return ok(undefined);
}

/**
 * Update a reference set with a new preferred candidate
 */
export function updateReferenceSetPreferred(
  doc: SolidTypeDoc,
  args: {
    featureId: string;
    paramName: string;
    preferredRef: string;
  }
): CommandResult<void> {
  const feature = doc.featuresById.get(args.featureId);
  if (!feature) {
    return err(`Feature ${args.featureId} not found`);
  }

  // Get current value
  const current = feature.get(args.paramName);
  if (!current || typeof current !== "object") {
    return err(`Parameter ${args.paramName} is not a reference set`);
  }

  const refSet = current as { preferred?: string; candidates: string[] };
  if (!Array.isArray(refSet.candidates)) {
    return err(`Parameter ${args.paramName} is not a valid reference set`);
  }

  // Validate the new preferred ref
  const decoded = decodePersistentRef(args.preferredRef);
  if (!decoded.ok) {
    return err(`Invalid ref: ${decoded.error}`);
  }

  doc.ydoc.transact(() => {
    // Add to candidates if not already present
    const candidates = refSet.candidates.includes(args.preferredRef)
      ? refSet.candidates
      : [...refSet.candidates, args.preferredRef];

    feature.set(args.paramName, {
      preferred: args.preferredRef,
      candidates,
    });
  });

  return ok(undefined);
}
