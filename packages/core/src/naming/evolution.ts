/**
 * Evolution Graph and Naming Strategy
 *
 * This module implements the persistent naming strategy that tracks how
 * subshapes evolve through modeling operations.
 */

import type { Vec3 } from "../num/vec3.js";
import { dot3, sub3 } from "../num/vec3.js";
import { TopoModel } from "../topo/TopoModel.js";
import type { BodyId, FaceId, EdgeId } from "../topo/handles.js";
import { surfaceNormal } from "../geom/surface.js";
import type {
  FeatureId,
  StepId,
  FeatureLocalSelector,
  SubshapeRef,
  PersistentRef,
  EvolutionMapping,
  GeometryTopologyFingerprint,
  ResolveResult,
} from "./types.js";
import {
  asFeatureId,
  asStepId,
  createPersistentRef,
  resolvedRef,
  notFoundRef,
  ambiguousRef,
} from "./types.js";

// ============================================================================
// NamingStrategy Interface
// ============================================================================

export interface NamingStrategy {
  recordBirth(
    featureId: FeatureId,
    selector: FeatureLocalSelector,
    subshape: SubshapeRef,
    fingerprint?: GeometryTopologyFingerprint
  ): PersistentRef;

  recordEvolution(stepId: StepId, mappings: EvolutionMapping[]): void;

  resolve(ref: PersistentRef, model: TopoModel): ResolveResult;

  allocateFeatureId(): FeatureId;

  allocateStepId(): StepId;

  getFeatureRefs(featureId: FeatureId): PersistentRef[];

  lookupRefForSubshape(subshape: SubshapeRef): PersistentRef | null;

  updateBodyMapping(oldBody: BodyId, newBody: BodyId): void;

  clear(): void;
}

// ============================================================================
// Internal Types
// ============================================================================

interface BirthRecord {
  featureId: FeatureId;
  selector: FeatureLocalSelector;
  originalSubshape: SubshapeRef;
  fingerprint?: GeometryTopologyFingerprint;
  persistentRef: PersistentRef;
}

interface EvolutionStep {
  stepId: StepId;
  mappings: EvolutionMapping[];
}

// ============================================================================
// DefaultNamingStrategy Implementation
// ============================================================================

export class DefaultNamingStrategy implements NamingStrategy {
  private birthsByFeature: Map<FeatureId, BirthRecord[]> = new Map();
  private birthsBySelector: Map<string, BirthRecord> = new Map();
  private refsBySubshape: Map<string, PersistentRef> = new Map();
  private evolutionSteps: EvolutionStep[] = [];
  private nextFeatureId: number = 0;
  private nextStepId: number = 0;
  private currentBodyMap: Map<BodyId, BodyId> = new Map();

  constructor() {}

  private birthKey(featureId: FeatureId, selector: FeatureLocalSelector): string {
    return `${featureId}:${selector.kind}:${JSON.stringify(selector.data)}`;
  }

  private subshapeKey(ref: SubshapeRef): string {
    return `${ref.body}:${ref.type}:${ref.id}`;
  }

  recordBirth(
    featureId: FeatureId,
    selector: FeatureLocalSelector,
    subshape: SubshapeRef,
    fingerprint?: GeometryTopologyFingerprint
  ): PersistentRef {
    const persistentRef = createPersistentRef(featureId, selector, subshape.type, fingerprint);

    const record: BirthRecord = {
      featureId,
      selector,
      originalSubshape: { ...subshape },
      fingerprint,
      persistentRef,
    };

    const featureRecords = this.birthsByFeature.get(featureId) || [];
    featureRecords.push(record);
    this.birthsByFeature.set(featureId, featureRecords);

    const key = this.birthKey(featureId, selector);
    this.birthsBySelector.set(key, record);

    const subshapeKeyStr = this.subshapeKey(subshape);
    this.refsBySubshape.set(subshapeKeyStr, persistentRef);

    return persistentRef;
  }

  recordEvolution(stepId: StepId, mappings: EvolutionMapping[]): void {
    for (const mapping of mappings) {
      if (mapping.old && mapping.news.length > 0) {
        const oldKey = this.subshapeKey(mapping.old);
        const existingRef = this.refsBySubshape.get(oldKey);

        if (existingRef) {
          this.refsBySubshape.delete(oldKey);

          for (const newSubshape of mapping.news) {
            const newKey = this.subshapeKey(newSubshape);
            this.refsBySubshape.set(newKey, existingRef);
          }
        }
      }
    }

    this.evolutionSteps.push({ stepId, mappings });
  }

  resolve(ref: PersistentRef, model: TopoModel): ResolveResult {
    const key = this.birthKey(ref.originFeatureId, ref.localSelector);
    const birthRecord = this.birthsBySelector.get(key);

    if (!birthRecord) {
      return notFoundRef(`No birth record found for feature ${ref.originFeatureId}`);
    }

    let currentRefs: SubshapeRef[] = [birthRecord.originalSubshape];

    for (const step of this.evolutionSteps) {
      const nextRefs: SubshapeRef[] = [];

      for (const currentRef of currentRefs) {
        let foundMapping = false;
        for (const mapping of step.mappings) {
          if (mapping.old && subshapeRefsMatch(mapping.old, currentRef)) {
            nextRefs.push(...mapping.news);
            foundMapping = true;
            break;
          }
        }

        if (!foundMapping) {
          nextRefs.push(currentRef);
        }
      }

      currentRefs = nextRefs;

      if (currentRefs.length === 0) {
        return notFoundRef(`Subshape was deleted during evolution`);
      }
    }

    currentRefs = currentRefs.map((r) => ({
      ...r,
      body: this.currentBodyMap.get(r.body) ?? r.body,
    }));

    if (currentRefs.length === 0) {
      return notFoundRef(`Subshape no longer exists`);
    }

    if (currentRefs.length === 1) {
      return resolvedRef(currentRefs[0]);
    }

    if (ref.fingerprint) {
      const bestMatch = this.findBestFingerprintMatch(currentRefs, ref.fingerprint, model);
      if (bestMatch) {
        return resolvedRef(bestMatch);
      }
    }

    return ambiguousRef(currentRefs);
  }

  private findBestFingerprintMatch(
    candidates: SubshapeRef[],
    targetFingerprint: GeometryTopologyFingerprint,
    model: TopoModel
  ): SubshapeRef | null {
    let bestCandidate: SubshapeRef | null = null;
    let bestScore = Infinity;

    for (const candidate of candidates) {
      const candidateFingerprint = computeSubshapeFingerprint(model, candidate);
      if (!candidateFingerprint) continue;

      const score = fingerprintDistance(targetFingerprint, candidateFingerprint);
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    const threshold = 0.1 * (targetFingerprint.approxAreaOrLength || 1);
    return bestScore < threshold ? bestCandidate : null;
  }

  allocateFeatureId(): FeatureId {
    return asFeatureId(this.nextFeatureId++);
  }

  allocateStepId(): StepId {
    return asStepId(this.nextStepId++);
  }

  getFeatureRefs(featureId: FeatureId): PersistentRef[] {
    const records = this.birthsByFeature.get(featureId) || [];
    return records.map((r) => r.persistentRef);
  }

  updateBodyMapping(oldBody: BodyId, newBody: BodyId): void {
    this.currentBodyMap.set(oldBody, newBody);

    const keysToUpdate: Array<{ oldKey: string; newKey: string; ref: PersistentRef }> = [];

    for (const [key, ref] of this.refsBySubshape) {
      const [bodyStr, type, id] = key.split(`:`);
      const body = parseInt(bodyStr, 10) as BodyId;

      if (body === oldBody) {
        const newKey = `${newBody}:${type}:${id}`;
        keysToUpdate.push({ oldKey: key, newKey, ref });
      }
    }

    for (const { oldKey, newKey, ref } of keysToUpdate) {
      this.refsBySubshape.delete(oldKey);
      this.refsBySubshape.set(newKey, ref);
    }
  }

  clearBodyMappings(): void {
    this.currentBodyMap.clear();
  }

  lookupRefForSubshape(subshape: SubshapeRef): PersistentRef | null {
    const key = this.subshapeKey(subshape);
    return this.refsBySubshape.get(key) ?? null;
  }

  clear(): void {
    this.birthsByFeature.clear();
    this.birthsBySelector.clear();
    this.refsBySubshape.clear();
    this.evolutionSteps = [];
    this.currentBodyMap.clear();
    this.nextFeatureId = 0;
    this.nextStepId = 0;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function subshapeRefsMatch(a: SubshapeRef, b: SubshapeRef): boolean {
  return a.body === b.body && a.type === b.type && a.id === b.id;
}

export function computeSubshapeFingerprint(
  model: TopoModel,
  ref: SubshapeRef
): GeometryTopologyFingerprint | null {
  if (ref.type === `face`) {
    return computeFaceFingerprint(model, ref.id as FaceId);
  } else if (ref.type === `edge`) {
    return computeEdgeFingerprint(model, ref.id as EdgeId);
  }
  return null;
}

export function computeFaceFingerprint(
  model: TopoModel,
  faceId: FaceId
): GeometryTopologyFingerprint {
  const loops = model.getFaceLoops(faceId);
  let centroidSum: Vec3 = [0, 0, 0];
  let vertexCount = 0;
  let adjacentCount = 0;

  for (const loopId of loops) {
    for (const he of model.iterateLoopHalfEdges(loopId)) {
      const vertex = model.getHalfEdgeStartVertex(he);
      const pos = model.getVertexPosition(vertex);
      centroidSum = [centroidSum[0] + pos[0], centroidSum[1] + pos[1], centroidSum[2] + pos[2]];
      vertexCount++;
      adjacentCount++;
    }
  }

  const centroid: Vec3 =
    vertexCount > 0
      ? [centroidSum[0] / vertexCount, centroidSum[1] / vertexCount, centroidSum[2] / vertexCount]
      : [0, 0, 0];

  const surfaceIdx = model.getFaceSurfaceIndex(faceId);
  const surface = model.getSurface(surfaceIdx);
  let normal = surfaceNormal(surface, 0, 0);
  if (model.isFaceReversed(faceId)) {
    normal = [-normal[0], -normal[1], -normal[2]];
  }

  const approxArea = computeFaceApproxArea(model, faceId);

  return {
    centroid,
    approxAreaOrLength: approxArea,
    normal,
    adjacentCount,
  };
}

function computeFaceApproxArea(model: TopoModel, faceId: FaceId): number {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return 0;

  const outerLoop = loops[0];
  const vertices: Vec3[] = [];

  for (const he of model.iterateLoopHalfEdges(outerLoop)) {
    const vertex = model.getHalfEdgeStartVertex(he);
    vertices.push(model.getVertexPosition(vertex));
  }

  if (vertices.length < 3) return 0;

  const centroid: Vec3 = [
    vertices.reduce((sum, v) => sum + v[0], 0) / vertices.length,
    vertices.reduce((sum, v) => sum + v[1], 0) / vertices.length,
    vertices.reduce((sum, v) => sum + v[2], 0) / vertices.length,
  ];

  let totalArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const v0 = sub3(vertices[i], centroid);
    const v1 = sub3(vertices[j], centroid);
    const cross: Vec3 = [
      v0[1] * v1[2] - v0[2] * v1[1],
      v0[2] * v1[0] - v0[0] * v1[2],
      v0[0] * v1[1] - v0[1] * v1[0],
    ];
    totalArea += Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2) / 2;
  }

  return totalArea;
}

export function computeEdgeFingerprint(
  model: TopoModel,
  edgeId: EdgeId
): GeometryTopologyFingerprint {
  const startVertex = model.getEdgeStartVertex(edgeId);
  const endVertex = model.getEdgeEndVertex(edgeId);

  const startPos = model.getVertexPosition(startVertex);
  const endPos = model.getVertexPosition(endVertex);

  const centroid: Vec3 = [
    (startPos[0] + endPos[0]) / 2,
    (startPos[1] + endPos[1]) / 2,
    (startPos[2] + endPos[2]) / 2,
  ];

  const dx = endPos[0] - startPos[0];
  const dy = endPos[1] - startPos[1];
  const dz = endPos[2] - startPos[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    centroid,
    approxAreaOrLength: length,
    adjacentCount: 2,
  };
}

export function fingerprintDistance(
  a: GeometryTopologyFingerprint,
  b: GeometryTopologyFingerprint
): number {
  const dx = a.centroid[0] - b.centroid[0];
  const dy = a.centroid[1] - b.centroid[1];
  const dz = a.centroid[2] - b.centroid[2];
  const centroidDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const maxSize = Math.max(a.approxAreaOrLength, b.approxAreaOrLength, 0.001);
  const sizeRatio = Math.abs(a.approxAreaOrLength - b.approxAreaOrLength) / maxSize;

  let normalDiff = 0;
  if (a.normal && b.normal) {
    normalDiff = 1 - dot3(a.normal, b.normal);
  }

  let adjacentDiff = 0;
  if (a.adjacentCount !== undefined && b.adjacentCount !== undefined) {
    const maxAdj = Math.max(a.adjacentCount, b.adjacentCount, 1);
    adjacentDiff = Math.abs(a.adjacentCount - b.adjacentCount) / maxAdj;
  }

  const WEIGHT_CENTROID = 1.0;
  const WEIGHT_SIZE = 0.5;
  const WEIGHT_NORMAL = 2.0;
  const WEIGHT_ADJACENT = 0.2;

  return (
    centroidDist * WEIGHT_CENTROID +
    sizeRatio * WEIGHT_SIZE +
    normalDiff * WEIGHT_NORMAL +
    adjacentDiff * WEIGHT_ADJACENT
  );
}

export function collectBodyFaceRefs(model: TopoModel, bodyId: BodyId): SubshapeRef[] {
  const refs: SubshapeRef[] = [];
  const shells = model.getBodyShells(bodyId);

  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    for (const faceId of faces) {
      refs.push({ body: bodyId, type: `face`, id: faceId });
    }
  }

  return refs;
}

export function createNamingStrategy(): NamingStrategy {
  return new DefaultNamingStrategy();
}
