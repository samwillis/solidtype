/**
 * Boolean operations on solid bodies
 *
 * This module provides the main boolean operation API. For planar-only bodies,
 * it delegates to the new boundary-evaluation-based planar boolean implementation.
 */

import { TopoModel } from "../topo/TopoModel.js";
import type { BodyId, FaceId } from "../topo/handles.js";
import type {
  NamingStrategy,
  FeatureId,
  PersistentRef,
  EvolutionMapping,
  StepId,
} from "../naming/index.js";
import { faceRef, modifyMapping } from "../naming/index.js";
import { planarBoolean } from "../boolean/planar/planarBoolean.js";

export type BooleanOperation = `union` | `subtract` | `intersect`;

export interface BooleanOptions {
  operation: BooleanOperation;
  namingStrategy?: NamingStrategy;
  featureId?: FeatureId;
}

export interface BooleanResult {
  success: boolean;
  body?: BodyId;
  error?: string;
  warnings?: string[];
  featureId?: FeatureId;
  stepId?: StepId;
  faceRefsFromA?: PersistentRef[];
  faceRefsFromB?: PersistentRef[];
  evolutionMappings?: EvolutionMapping[];
}

export function booleanOperation(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId,
  options: BooleanOptions
): BooleanResult {
  const { operation, namingStrategy } = options;

  const featureId = namingStrategy
    ? (options.featureId ?? namingStrategy.allocateFeatureId())
    : undefined;
  const stepId = namingStrategy ? namingStrategy.allocateStepId() : undefined;

  // Collect faces to check planarity
  const facesA = collectBodyFaces(model, bodyA);
  const facesB = collectBodyFaces(model, bodyB);

  const nonPlanarA = facesA.filter(
    (f) => model.getSurface(model.getFaceSurfaceIndex(f)).kind !== `plane`
  );
  const nonPlanarB = facesB.filter(
    (f) => model.getSurface(model.getFaceSurfaceIndex(f)).kind !== `plane`
  );

  if (nonPlanarA.length > 0 || nonPlanarB.length > 0) {
    return {
      success: false,
      error: `Boolean operations currently only support planar faces`,
    };
  }

  // Use the new boundary-evaluation-based planar boolean implementation
  const planarResult = planarBoolean(model, bodyA, bodyB, { operation });

  if (!planarResult.success) {
    return {
      success: false,
      error: planarResult.error,
      warnings: planarResult.warnings,
    };
  }

  // Wrap result with naming support if enabled
  if (namingStrategy && stepId !== undefined && planarResult.body !== undefined) {
    const evolutionMappings: EvolutionMapping[] = [];
    const resultBody = planarResult.body;

    // Create evolution mappings for faces from A
    if (planarResult.facesFromA) {
      for (const { newFace, sourceFace } of planarResult.facesFromA) {
        evolutionMappings.push(
          modifyMapping(faceRef(bodyA, sourceFace), faceRef(resultBody, newFace))
        );
      }
    }

    // Create evolution mappings for faces from B
    if (planarResult.facesFromB) {
      for (const { newFace, sourceFace } of planarResult.facesFromB) {
        evolutionMappings.push(
          modifyMapping(faceRef(bodyB, sourceFace), faceRef(resultBody, newFace))
        );
      }
    }

    // Record evolution with naming strategy
    namingStrategy.recordEvolution(stepId, evolutionMappings);

    // Build face refs for the result
    const faceRefsFromA: PersistentRef[] = (planarResult.facesFromA ?? [])
      .map(({ newFace }) => namingStrategy.lookupRefForSubshape(faceRef(resultBody, newFace)))
      .filter((ref): ref is PersistentRef => ref !== null);

    const faceRefsFromB: PersistentRef[] = (planarResult.facesFromB ?? [])
      .map(({ newFace }) => namingStrategy.lookupRefForSubshape(faceRef(resultBody, newFace)))
      .filter((ref): ref is PersistentRef => ref !== null);

    return {
      success: true,
      body: resultBody,
      featureId,
      stepId,
      faceRefsFromA,
      faceRefsFromB,
      evolutionMappings,
      warnings: planarResult.warnings,
    };
  }

  return {
    success: true,
    body: planarResult.body,
    warnings: planarResult.warnings,
  };
}

function collectBodyFaces(model: TopoModel, bodyId: BodyId): FaceId[] {
  const faces: FaceId[] = [];
  const shells = model.getBodyShells(bodyId);
  for (const shellId of shells) {
    faces.push(...model.getShellFaces(shellId));
  }
  return faces;
}

export function union(model: TopoModel, bodyA: BodyId, bodyB: BodyId): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: `union` });
}

export function subtract(model: TopoModel, bodyA: BodyId, bodyB: BodyId): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: `subtract` });
}

export function intersect(model: TopoModel, bodyA: BodyId, bodyB: BodyId): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: `intersect` });
}
