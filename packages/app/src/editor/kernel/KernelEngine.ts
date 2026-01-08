/**
 * KernelEngine - Reusable CAD kernel rebuild engine
 *
 * This class encapsulates the core rebuild logic from the kernel worker,
 * allowing it to be used in both the UI worker and the AI worker.
 *
 * Design principles:
 * - No worker-specific APIs (no postMessage, no self)
 * - Pure class with async init and rebuild methods
 * - Returns structured results instead of sending messages
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 4
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCascade WASM bindings use dynamic types */

import * as Y from "yjs";
import {
  SolidSession,
  type BodyId,
  type OperationResult,
  XY_PLANE,
  YZ_PLANE,
  ZX_PLANE,
  createDatumPlane,
  type DatumPlane,
  planeToWorld,
  sub3,
  vec2,
  coincident,
  horizontalPoints,
  verticalPoints,
  fixed,
  distance,
  angle,
  parallel,
  perpendicular,
  equalLength,
  tangent,
  symmetric,
  pointOnLine,
  pointOnArc,
  type Mesh,
} from "@solidtype/core";

import type { TransferableMesh, BodyInfo, BuildError, FeatureStatus } from "../worker/types";
import { getRoot, getState, getFeaturesById, getFeatureOrder, mapToObject } from "../document/yjs";
import type { SketchPlaneRef, DatumPlaneRole } from "../document/schema";
import {
  buildBodyReferenceIndex,
  computeProfileLoops,
  type ReferenceIndex,
  type SketchInfo as ReferenceSketchInfo,
} from "./referenceIndex";

// ============================================================================
// Types
// ============================================================================

export interface KernelEngineOptions {
  /** Whether to compute meshes (false for headless/query-only mode) */
  computeMeshes?: boolean;
  /** Callback for OCCT initialization (allows platform-specific loading) */
  initOCCT?: () => Promise<any>;
  /** Pre-initialized OpenCascade instance (if already loaded) */
  oc?: any;
}

export interface SketchSolveResult {
  sketchId: string;
  status: string;
  points: Array<{ id: string; x: number; y: number }>;
  planeTransform?: {
    origin: [number, number, number];
    xDir: [number, number, number];
    yDir: [number, number, number];
    normal: [number, number, number];
  };
  dof?: {
    totalDOF: number;
    constrainedDOF: number;
    remainingDOF: number;
    isFullyConstrained: boolean;
    isOverConstrained: boolean;
  };
}

export interface RebuildResult {
  bodies: BodyInfo[];
  meshes: Map<string, TransferableMesh>;
  referenceIndex: ReferenceIndex;
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
  sketchSolveResults: Map<string, SketchSolveResult>;
}

/** Body entry in the bodyMap - stores body ID with metadata */
interface BodyEntry {
  bodyId: BodyId;
  name: string;
  color: string;
  /** Feature ID that created this body (for reference tracking) */
  sourceFeatureId: string;
}

interface SketchData {
  pointsById: Record<
    string,
    {
      id: string;
      x: number;
      y: number;
      fixed?: boolean;
      attachedTo?: string;
      param?: number;
    }
  >;
  entitiesById: Record<
    string,
    {
      id: string;
      type: string;
      start?: string;
      end?: string;
      center?: string;
      ccw?: boolean;
      radius?: number;
    }
  >;
  constraintsById: Record<string, any>;
}

interface SketchInfo {
  planeRef: SketchPlaneRef;
  plane: DatumPlane;
  data: SketchData;
  referenceInfo?: ReferenceSketchInfo;
}

interface FeatureInterpretResult {
  bodyId: BodyId | null;
  bodyEntryId: string | null;
  bodyName?: string;
  bodyColor?: string;
}

/** Default body colors - cycle through these for new bodies */
const DEFAULT_BODY_COLORS = [
  "#6699cc", // blue-gray
  "#99cc99", // green
  "#cc9999", // red
  "#cccc99", // yellow
  "#cc99cc", // purple
  "#99cccc", // cyan
];

// ============================================================================
// KernelEngine Class
// ============================================================================

export class KernelEngine {
  private session: SolidSession | null = null;
  private options: Required<KernelEngineOptions>;
  private bodyMap = new Map<string, BodyEntry>();
  private sketchCache = new Map<string, SketchInfo>();
  private featureToSketchInfo = new Map<string, ReferenceSketchInfo>();
  private bodyColorIndex = 0;
  private datumPlaneCache: { xy: string | null; xz: string | null; yz: string | null } | null =
    null;

  constructor(options: KernelEngineOptions = {}) {
    this.options = {
      computeMeshes: options.computeMeshes ?? true,
      initOCCT:
        options.initOCCT ??
        (() => {
          throw new Error("initOCCT callback not provided");
        }),
      oc: options.oc ?? null,
    };
  }

  /**
   * Initialize the OCCT session
   */
  async init(): Promise<void> {
    if (this.session?.isInitialized()) {
      return;
    }

    // If oc is not provided, call initOCCT
    if (!this.options.oc) {
      this.options.oc = await this.options.initOCCT();
    }

    // Note: In the worker context, setOC is called before creating the session
    // Here we assume it's already been set or will be set by the caller

    this.session = new SolidSession();
    await this.session.init();
  }

  /**
   * Check if the engine is initialized
   */
  isInitialized(): boolean {
    return this.session?.isInitialized() ?? false;
  }

  /**
   * Rebuild from a Yjs document
   */
  async rebuildFromYDoc(ydoc: Y.Doc): Promise<RebuildResult> {
    const root = getRoot(ydoc);
    const featuresById = getFeaturesById(root);
    const featureOrder = getFeatureOrder(root);
    const state = getState(root);
    const rebuildGate = state?.get("rebuildGate") as string | null;

    return this.rebuild(featuresById, featureOrder, rebuildGate);
  }

  /**
   * Core rebuild logic
   */
  private async rebuild(
    featuresById: Y.Map<Y.Map<unknown>>,
    featureOrder: Y.Array<string>,
    rebuildGate: string | null
  ): Promise<RebuildResult> {
    if (!this.session) {
      throw new Error("KernelEngine not initialized");
    }

    // Clear previous state
    this.session.dispose();
    this.session = new SolidSession();
    await this.session.init();

    this.bodyMap.clear();
    this.sketchCache.clear();
    this.featureToSketchInfo.clear();
    this.resetBodyColorIndex();

    // Build datum plane cache
    this.buildDatumPlaneCache(featuresById);

    const bodies: BodyInfo[] = [];
    const errors: BuildError[] = [];
    const featureStatus: Record<string, FeatureStatus> = {};
    const sketchSolveResults = new Map<string, SketchSolveResult>();

    let reachedGate = false;

    // Iterate in featureOrder
    for (const id of featureOrder.toArray()) {
      const featureMap = featuresById.get(id);
      if (!featureMap) continue;

      const type = featureMap.get("type") as string;
      const suppressed = featureMap.get("suppressed") === true;

      // Check if we've passed the rebuild gate
      if (reachedGate) {
        featureStatus[id] = "gated";
        continue;
      }

      if (suppressed) {
        featureStatus[id] = "suppressed";
        continue;
      }

      try {
        let result: FeatureInterpretResult | null = null;

        switch (type) {
          case "origin":
          case "plane":
            featureStatus[id] = "computed";
            break;

          case "sketch": {
            const solveResult = this.interpretSketch(featureMap, featuresById);
            sketchSolveResults.set(id, solveResult);
            featureStatus[id] = "computed";
            break;
          }

          case "extrude":
            result = this.interpretExtrude(featureMap, id, featuresById);
            featureStatus[id] = "computed";

            if (result.bodyId !== null && result.bodyEntryId !== null) {
              const entry: BodyEntry = {
                bodyId: result.bodyId,
                name: result.bodyName || `Body${this.bodyMap.size + 1}`,
                color: result.bodyColor || this.getNextBodyColor(),
                sourceFeatureId: id,
              };
              this.bodyMap.set(result.bodyEntryId, entry);
            }
            break;

          case "revolve":
            result = this.interpretRevolve(featureMap, id, featuresById);
            featureStatus[id] = "computed";

            if (result.bodyId !== null && result.bodyEntryId !== null) {
              const entry: BodyEntry = {
                bodyId: result.bodyId,
                name: result.bodyName || `Body${this.bodyMap.size + 1}`,
                color: result.bodyColor || this.getNextBodyColor(),
                sourceFeatureId: id,
              };
              this.bodyMap.set(result.bodyEntryId, entry);
            }
            break;

          case "boolean":
            this.interpretBoolean(featureMap);
            featureStatus[id] = "computed";
            break;

          default:
            featureStatus[id] = "computed";
            break;
        }
      } catch (err) {
        errors.push({
          featureId: id,
          code: "BUILD_ERROR",
          message: err instanceof Error ? err.message : String(err),
        });
        featureStatus[id] = "error";
      }

      if (rebuildGate && id === rebuildGate) {
        reachedGate = true;
      }
    }

    // Build meshes and reference index
    const meshes = new Map<string, TransferableMesh>();
    const referenceIndex: ReferenceIndex = {};

    if (this.options.computeMeshes) {
      for (const [featureId, entry] of this.bodyMap) {
        try {
          const mesh = this.session.tessellate(entry.bodyId);
          const transferableMesh = this.toTransferableMesh(mesh);
          meshes.set(featureId, transferableMesh);

          // Build reference index
          const featureMap = featuresById.get(entry.sourceFeatureId);
          const featureType = (featureMap?.get("type") as string) || "unknown";
          const sketchInfo = this.featureToSketchInfo.get(entry.sourceFeatureId);

          const bodyRefIndex = buildBodyReferenceIndex(
            featureId,
            entry.sourceFeatureId,
            featureType,
            transferableMesh.positions,
            transferableMesh.normals,
            transferableMesh.indices,
            transferableMesh.faceMap,
            transferableMesh.edges,
            transferableMesh.edgeMap,
            sketchInfo
          );
          referenceIndex[featureId] = bodyRefIndex;
        } catch (err) {
          console.error(`[KernelEngine] Failed to tessellate body ${featureId}:`, err);
        }
      }
    }

    // Build bodies list
    for (const [entryId, entry] of this.bodyMap) {
      bodies.push({
        id: String(entry.bodyId),
        featureId: entryId,
        faceCount: 0,
        name: entry.name,
        color: entry.color,
      });
    }

    return {
      bodies,
      meshes,
      referenceIndex,
      featureStatus,
      errors,
      sketchSolveResults,
    };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.session?.dispose();
    this.session = null;
    this.bodyMap.clear();
    this.sketchCache.clear();
    this.featureToSketchInfo.clear();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getNextBodyColor(): string {
    const color = DEFAULT_BODY_COLORS[this.bodyColorIndex % DEFAULT_BODY_COLORS.length];
    this.bodyColorIndex++;
    return color;
  }

  private resetBodyColorIndex(): void {
    this.bodyColorIndex = 0;
  }

  private toTransferableMesh(mesh: Mesh): TransferableMesh {
    return {
      positions: new Float32Array(mesh.positions),
      normals: new Float32Array(mesh.normals),
      indices: new Uint32Array(mesh.indices),
      faceMap: mesh.faceMap ? new Uint32Array(mesh.faceMap) : undefined,
      edges: mesh.edges ? new Float32Array(mesh.edges) : undefined,
      edgeMap: mesh.edgeMap ? new Uint32Array(mesh.edgeMap) : undefined,
    };
  }

  // ============================================================================
  // Datum Plane Helpers
  // ============================================================================

  private findDatumPlaneByRole(
    featuresById: Y.Map<Y.Map<unknown>>,
    role: DatumPlaneRole
  ): string | null {
    let foundId: string | null = null;
    featuresById.forEach((featureMap, id) => {
      if (featureMap.get("type") === "plane" && featureMap.get("role") === role) {
        foundId = id;
      }
    });
    return foundId;
  }

  private buildDatumPlaneCache(featuresById: Y.Map<Y.Map<unknown>>): void {
    this.datumPlaneCache = {
      xy: this.findDatumPlaneByRole(featuresById, "xy"),
      xz: this.findDatumPlaneByRole(featuresById, "xz"),
      yz: this.findDatumPlaneByRole(featuresById, "yz"),
    };
  }

  private getDatumPlaneFromFeature(featureMap: Y.Map<unknown>): DatumPlane | null {
    const type = featureMap.get("type");
    if (type !== "plane") return null;

    const role = featureMap.get("role") as DatumPlaneRole | undefined;
    const normal = featureMap.get("normal") as [number, number, number];
    const origin = featureMap.get("origin") as [number, number, number];
    const xDir = featureMap.get("xDir") as [number, number, number];

    if (role === "xy") return XY_PLANE;
    if (role === "xz") return ZX_PLANE;
    if (role === "yz") return YZ_PLANE;

    const yDir = [
      normal[1] * xDir[2] - normal[2] * xDir[1],
      normal[2] * xDir[0] - normal[0] * xDir[2],
      normal[0] * xDir[1] - normal[1] * xDir[0],
    ] as [number, number, number];

    return createDatumPlane("custom", {
      kind: "plane",
      origin,
      normal,
      xDir,
      yDir,
    });
  }

  private getSketchPlane(
    planeRef: SketchPlaneRef,
    featuresById: Y.Map<Y.Map<unknown>>
  ): DatumPlane | null {
    if (planeRef.kind === "planeFeatureId") {
      const planeFeature = featuresById.get(planeRef.ref);
      if (!planeFeature) return null;
      return this.getDatumPlaneFromFeature(planeFeature);
    }

    if (planeRef.kind === "faceRef") {
      const parts = planeRef.ref.split(":");
      if (parts.length !== 3 || parts[0] !== "face") {
        return null;
      }

      const featureId = parts[1];
      const faceIndex = parseInt(parts[2], 10);
      if (isNaN(faceIndex)) return null;

      const bodyEntry = this.bodyMap.get(featureId);
      if (!bodyEntry || !this.session) return null;

      const facePlane = this.session.getFacePlane(bodyEntry.bodyId, faceIndex);
      if (!facePlane) return null;

      return createDatumPlane(`face-${featureId}-${faceIndex}`, {
        kind: "plane",
        origin: facePlane.origin,
        normal: facePlane.normal,
        xDir: facePlane.xDir,
        yDir: facePlane.yDir,
      });
    }

    return null;
  }

  // ============================================================================
  // Feature Interpretation
  // ============================================================================

  private parseSketchData(sketchMap: Y.Map<unknown>): SketchData {
    const dataMap = sketchMap.get("data") as Y.Map<unknown> | undefined;

    if (!dataMap) {
      return { pointsById: {}, entitiesById: {}, constraintsById: {} };
    }

    const pointsById: Record<string, any> = {};
    const entitiesById: Record<string, any> = {};
    const constraintsById: Record<string, any> = {};

    const pointsMap = dataMap.get("pointsById") as Y.Map<Y.Map<unknown>> | undefined;
    if (pointsMap) {
      pointsMap.forEach((pointMap, id) => {
        pointsById[id] = mapToObject(pointMap);
      });
    }

    const entitiesMap = dataMap.get("entitiesById") as Y.Map<Y.Map<unknown>> | undefined;
    if (entitiesMap) {
      entitiesMap.forEach((entityMap, id) => {
        entitiesById[id] = mapToObject(entityMap);
      });
    }

    const constraintsMap = dataMap.get("constraintsById") as Y.Map<Y.Map<unknown>> | undefined;
    if (constraintsMap) {
      constraintsMap.forEach((constraintMap, id) => {
        constraintsById[id] = mapToObject(constraintMap);
      });
    }

    return { pointsById, entitiesById, constraintsById };
  }

  private interpretSketch(
    sketchMap: Y.Map<unknown>,
    featuresById: Y.Map<Y.Map<unknown>>
  ): SketchSolveResult {
    const id = sketchMap.get("id") as string;
    const planeRef = sketchMap.get("plane") as SketchPlaneRef;

    const plane = this.getSketchPlane(planeRef, featuresById);
    if (!plane) {
      throw new Error("Cannot resolve sketch plane");
    }

    const data = this.parseSketchData(sketchMap);

    // Build a kernel sketch
    const sketch = this.session!.createSketch(plane);
    const pointIdMap = new Map<string, any>();
    const entityIdMap = new Map<string, any>();

    // Add points
    const sortedPointIds = Object.keys(data.pointsById).sort();
    for (const pointId of sortedPointIds) {
      const point = data.pointsById[pointId];
      const pid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
      pointIdMap.set(point.id, pid);
    }

    // Add entities
    const sortedEntityIds = Object.keys(data.entitiesById).sort();
    for (const entityId of sortedEntityIds) {
      const entity = data.entitiesById[entityId];
      if (entity.type === "line" && entity.start && entity.end) {
        const startId = pointIdMap.get(entity.start);
        const endId = pointIdMap.get(entity.end);
        if (startId !== undefined && endId !== undefined) {
          const eid = sketch.addLine(startId, endId);
          entityIdMap.set(entity.id, eid);
        }
      }
      if (entity.type === "arc" && entity.start && entity.end && entity.center) {
        const startId = pointIdMap.get(entity.start);
        const endId = pointIdMap.get(entity.end);
        const centerId = pointIdMap.get(entity.center);
        if (startId !== undefined && endId !== undefined && centerId !== undefined) {
          const eid = sketch.addArc(startId, endId, centerId, entity.ccw ?? true);
          entityIdMap.set(entity.id, eid);
        }
      }
      if (entity.type === "circle" && entity.center && entity.radius && entity.radius > 0) {
        const centerId = pointIdMap.get(entity.center);
        if (centerId !== undefined) {
          const centerPoint = data.pointsById[entity.center];
          if (centerPoint) {
            const edgeX = centerPoint.x + entity.radius;
            const edgeY = centerPoint.y;
            const edgePointId = sketch.addPoint(edgeX, edgeY);
            const eid = sketch.addArc(edgePointId, edgePointId, centerId, true);
            entityIdMap.set(entity.id, eid);
          }
        }
      }
    }

    // Apply constraints
    this.applyConstraints(data, pointIdMap, entityIdMap, sketch);

    const before = new Map<string, { x: number; y: number }>();
    for (const [pid, p] of Object.entries(data.pointsById)) {
      before.set(pid, { x: p.x, y: p.y });
    }

    const solveResult = sketch.solve();
    const dof = sketch.analyzeDOF();

    // Update sketch data with solved positions
    let maxDelta = 0;
    const solvedPoints: Array<{ id: string; x: number; y: number }> = [];

    for (const [pid, p] of Object.entries(data.pointsById)) {
      const kernelPid = pointIdMap.get(pid);
      if (kernelPid === undefined) continue;
      const solved = sketch.getPoint(kernelPid);
      if (!solved) continue;

      const prev = before.get(pid);
      if (prev) {
        const dx = solved.x - prev.x;
        const dy = solved.y - prev.y;
        maxDelta = Math.max(maxDelta, Math.hypot(dx, dy));
      }

      p.x = solved.x;
      p.y = solved.y;

      if (maxDelta > 1e-9) {
        solvedPoints.push({ id: p.id, x: p.x, y: p.y });
      }
    }

    // Compute profile loops
    const profileLoops = computeProfileLoops(data.entitiesById, data.pointsById);
    const referenceInfo: ReferenceSketchInfo = { profileLoops };

    // Store sketch info
    this.sketchCache.set(id, { planeRef, plane, data, referenceInfo });

    const { origin, xDir, yDir, normal } = plane.surface;

    return {
      sketchId: id,
      status: solveResult.status,
      points: solvedPoints,
      planeTransform: {
        origin: origin as [number, number, number],
        xDir: xDir as [number, number, number],
        yDir: yDir as [number, number, number],
        normal: normal as [number, number, number],
      },
      dof,
    };
  }

  private applyConstraints(
    data: SketchData,
    pointIdMap: Map<string, any>,
    entityIdMap: Map<string, any>,
    sketch: any
  ): void {
    const sortedConstraintIds = Object.keys(data.constraintsById).sort();
    for (const constraintId of sortedConstraintIds) {
      const c = data.constraintsById[constraintId];
      if (!c || typeof c !== "object") continue;

      switch (c.type) {
        case "coincident": {
          const [a, b] = c.points ?? [];
          const p1 = pointIdMap.get(a);
          const p2 = pointIdMap.get(b);
          if (p1 !== undefined && p2 !== undefined) {
            sketch.addConstraint(coincident(p1, p2));
          }
          break;
        }
        case "horizontal": {
          const [a, b] = c.points ?? [];
          const p1 = pointIdMap.get(a);
          const p2 = pointIdMap.get(b);
          if (p1 !== undefined && p2 !== undefined) {
            sketch.addConstraint(horizontalPoints(p1, p2));
          }
          break;
        }
        case "vertical": {
          const [a, b] = c.points ?? [];
          const p1 = pointIdMap.get(a);
          const p2 = pointIdMap.get(b);
          if (p1 !== undefined && p2 !== undefined) {
            sketch.addConstraint(verticalPoints(p1, p2));
          }
          break;
        }
        case "fixed": {
          const pointId = c.point;
          const pid = pointIdMap.get(pointId);
          const p = data.pointsById[pointId];
          if (pid !== undefined && p) {
            sketch.addConstraint(fixed(pid, vec2(p.x, p.y)));
          }
          break;
        }
        case "distance": {
          const [a, b] = c.points ?? [];
          const p1 = pointIdMap.get(a);
          const p2 = pointIdMap.get(b);
          const val = typeof c.value === "number" ? c.value : Number(c.value);
          if (p1 !== undefined && p2 !== undefined && Number.isFinite(val)) {
            sketch.addConstraint(distance(p1, p2, val));
          }
          break;
        }
        case "angle": {
          const [l1, l2] = c.lines ?? [];
          const e1 = entityIdMap.get(l1);
          const e2 = entityIdMap.get(l2);
          const valDeg = typeof c.value === "number" ? c.value : Number(c.value);
          if (e1 !== undefined && e2 !== undefined && Number.isFinite(valDeg)) {
            sketch.addConstraint(angle(e1, e2, (valDeg * Math.PI) / 180));
          }
          break;
        }
        case "parallel": {
          const [l1, l2] = c.lines ?? [];
          const e1 = entityIdMap.get(l1);
          const e2 = entityIdMap.get(l2);
          if (e1 !== undefined && e2 !== undefined) {
            sketch.addConstraint(parallel(e1, e2));
          }
          break;
        }
        case "perpendicular": {
          const [l1, l2] = c.lines ?? [];
          const e1 = entityIdMap.get(l1);
          const e2 = entityIdMap.get(l2);
          if (e1 !== undefined && e2 !== undefined) {
            sketch.addConstraint(perpendicular(e1, e2));
          }
          break;
        }
        case "equalLength": {
          const [l1, l2] = c.lines ?? [];
          const e1 = entityIdMap.get(l1);
          const e2 = entityIdMap.get(l2);
          if (e1 !== undefined && e2 !== undefined) {
            sketch.addConstraint(equalLength(e1, e2));
          }
          break;
        }
        case "tangent": {
          const lineId = entityIdMap.get(c.line);
          const arcId = entityIdMap.get(c.arc);
          if (lineId !== undefined && arcId !== undefined) {
            sketch.addConstraint(tangent(lineId, arcId, "end", "start"));
          }
          break;
        }
        case "symmetric": {
          const [pt1, pt2] = c.points ?? [];
          const p1 = pointIdMap.get(pt1);
          const p2 = pointIdMap.get(pt2);
          const axisId = entityIdMap.get(c.axis);
          if (p1 !== undefined && p2 !== undefined && axisId !== undefined) {
            sketch.addConstraint(symmetric(p1, p2, axisId));
          }
          break;
        }
        case "pointOnLine": {
          const pid = pointIdMap.get(c.point);
          const lid = entityIdMap.get(c.line);
          if (pid !== undefined && lid !== undefined) {
            sketch.addConstraint(pointOnLine(pid, lid));
          }
          break;
        }
        case "pointOnArc": {
          const pid = pointIdMap.get(c.point);
          const arcId = entityIdMap.get(c.arc);
          if (pid !== undefined && arcId !== undefined) {
            sketch.addConstraint(pointOnArc(pid, arcId));
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private calculateExtrudeDistance(
    featureMap: Y.Map<unknown>,
    direction: number,
    _sketchPlane?: DatumPlane
  ): number {
    const extent = (featureMap.get("extent") as string) || "blind";
    const baseDistance = (featureMap.get("distance") as number) || 10;

    switch (extent) {
      case "blind":
        return baseDistance * direction;
      case "throughAll":
        return 1000 * direction;
      case "toFace":
      case "toVertex":
        return baseDistance * direction;
      default:
        return baseDistance * direction;
    }
  }

  private interpretExtrude(
    featureMap: Y.Map<unknown>,
    featureId: string,
    _featuresById: Y.Map<Y.Map<unknown>>
  ): FeatureInterpretResult {
    const sketchId = featureMap.get("sketch") as string;
    const op = (featureMap.get("op") as string) || "add";
    const direction = (featureMap.get("direction") as string) || "normal";
    const mergeScope = (featureMap.get("mergeScope") as string) || "auto";
    const targetBodies = (featureMap.get("targetBodies") as string[]) || [];
    const resultBodyName = (featureMap.get("resultBodyName") as string) || "";
    const resultBodyColor = (featureMap.get("resultBodyColor") as string) || "";

    if (!sketchId) {
      throw new Error("Extrude requires a sketch reference");
    }

    const sketchInfo = this.sketchCache.get(sketchId);
    if (!sketchInfo) {
      throw new Error(`Sketch not found: ${sketchId}`);
    }

    // Create sketch and add entities
    const sketch = this.session!.createSketch(sketchInfo.plane);
    const pointIdMap = new Map<string, any>();

    const sortedPointIds = Object.keys(sketchInfo.data.pointsById).sort();
    for (const pid of sortedPointIds) {
      const point = sketchInfo.data.pointsById[pid];
      const kernelPid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
      pointIdMap.set(point.id, kernelPid);
    }

    const sortedEntityIds = Object.keys(sketchInfo.data.entitiesById).sort();
    for (const eid of sortedEntityIds) {
      const entity = sketchInfo.data.entitiesById[eid];
      if (entity.type === "line" && entity.start && entity.end) {
        const startId = pointIdMap.get(entity.start);
        const endId = pointIdMap.get(entity.end);
        if (startId !== undefined && endId !== undefined) {
          sketch.addLine(startId, endId);
        }
      } else if (entity.type === "arc" && entity.start && entity.end && entity.center) {
        const startId = pointIdMap.get(entity.start);
        const endId = pointIdMap.get(entity.end);
        const centerId = pointIdMap.get(entity.center);
        if (startId !== undefined && endId !== undefined && centerId !== undefined) {
          sketch.addArc(startId, endId, centerId, entity.ccw ?? true);
        }
      } else if (entity.type === "circle" && entity.center && entity.radius) {
        const centerPoint = sketchInfo.data.pointsById[entity.center];
        if (centerPoint) {
          sketch.addCircle(centerPoint.x, centerPoint.y, entity.radius);
        }
      }
    }

    const profile = sketch.toProfile();
    if (!profile) {
      throw new Error("Sketch does not contain a closed profile");
    }

    const dirMultiplier = direction === "reverse" ? -1 : 1;
    const finalDistance = this.calculateExtrudeDistance(
      featureMap,
      dirMultiplier,
      sketchInfo.plane
    );

    const result = this.session!.extrude(profile, {
      operation: "new",
      distance: finalDistance,
    });

    if (!result.success) {
      throw new Error(result.error?.message || "Extrude failed");
    }

    const extrudedBodyId = result.value;

    // Store sketch info for reference index generation
    if (sketchInfo.referenceInfo) {
      this.featureToSketchInfo.set(featureId, sketchInfo.referenceInfo);
    }

    // Handle cut operation
    if (op === "cut") {
      let anySuccess = false;
      let lastError: string | undefined;
      for (const [existingId, entry] of this.bodyMap) {
        const boolResult = this.session!.subtract(entry.bodyId, extrudedBodyId);
        if (boolResult.success) {
          this.bodyMap.set(existingId, { ...entry, bodyId: boolResult.value });
          anySuccess = true;
        } else {
          lastError = boolResult.error?.message;
        }
      }

      this.session!.deleteBody(extrudedBodyId);

      if (!anySuccess && this.bodyMap.size > 0 && lastError) {
        throw new Error(`Cut operation failed: ${lastError}`);
      }
      return { bodyId: null, bodyEntryId: null };
    }

    // Handle add operation with merge logic
    const finalBodyName = resultBodyName || `Body${this.bodyMap.size + 1}`;
    const finalBodyColor = resultBodyColor || this.getNextBodyColor();

    if (mergeScope === "new" || this.bodyMap.size === 0) {
      return {
        bodyId: extrudedBodyId,
        bodyEntryId: featureId,
        bodyName: finalBodyName,
        bodyColor: finalBodyColor,
      };
    }

    // Handle specific merge targets or auto merge
    return this.handleMerge(
      extrudedBodyId,
      featureId,
      mergeScope,
      targetBodies,
      finalBodyName,
      finalBodyColor
    );
  }

  private interpretRevolve(
    featureMap: Y.Map<unknown>,
    featureId: string,
    _featuresById: Y.Map<Y.Map<unknown>>
  ): FeatureInterpretResult {
    const sketchId = featureMap.get("sketch") as string;
    const axisId = (featureMap.get("axis") as string) || "";
    const angleDeg = (featureMap.get("angle") as number) || 360;
    const op = (featureMap.get("op") as string) || "add";
    const mergeScope = (featureMap.get("mergeScope") as string) || "auto";
    const targetBodies = (featureMap.get("targetBodies") as string[]) || [];
    const resultBodyName = (featureMap.get("resultBodyName") as string) || "";
    const resultBodyColor = (featureMap.get("resultBodyColor") as string) || "";

    if (!sketchId) {
      throw new Error("Revolve requires a sketch reference");
    }
    if (!axisId) {
      throw new Error("Revolve requires an axis line selection");
    }

    const sketchInfo = this.sketchCache.get(sketchId);
    if (!sketchInfo) {
      throw new Error(`Sketch not found: ${sketchId}`);
    }

    const axisEntity = sketchInfo.data.entitiesById[axisId];
    if (!axisEntity || axisEntity.type !== "line" || !axisEntity.start || !axisEntity.end) {
      throw new Error("Invalid axis selection");
    }

    const axisStart2d = sketchInfo.data.pointsById[axisEntity.start];
    const axisEnd2d = sketchInfo.data.pointsById[axisEntity.end];
    if (!axisStart2d || !axisEnd2d) {
      throw new Error("Axis references missing sketch points");
    }

    const sketch = this.session!.createSketch(sketchInfo.plane);
    const pointIdMap = new Map<string, any>();
    const entityIdMap = new Map<string, any>();

    const sortedPointIds = Object.keys(sketchInfo.data.pointsById).sort();
    for (const pid of sortedPointIds) {
      const point = sketchInfo.data.pointsById[pid];
      const kernelPid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
      pointIdMap.set(point.id, kernelPid);
    }

    const sortedEntityIds = Object.keys(sketchInfo.data.entitiesById).sort();
    for (const eid of sortedEntityIds) {
      const entity = sketchInfo.data.entitiesById[eid];
      if (entity.type === "line" && entity.start && entity.end) {
        const startId = pointIdMap.get(entity.start);
        const endId = pointIdMap.get(entity.end);
        if (startId !== undefined && endId !== undefined) {
          const isAxis = entity.id === axisId;
          const kernelEid = sketch.addLine(startId, endId, { construction: isAxis });
          entityIdMap.set(entity.id, kernelEid);
        }
      }
      if (entity.type === "arc" && entity.start && entity.end && entity.center) {
        const startId = pointIdMap.get(entity.start);
        const endId = pointIdMap.get(entity.end);
        const centerId = pointIdMap.get(entity.center);
        if (startId !== undefined && endId !== undefined && centerId !== undefined) {
          const kernelEid = sketch.addArc(startId, endId, centerId, entity.ccw ?? true);
          entityIdMap.set(entity.id, kernelEid);
        }
      }
    }

    const profileEntityIds: any[] = [];
    for (const eid of sortedEntityIds) {
      if (eid === axisId) continue;
      const kernelEid = entityIdMap.get(eid);
      if (kernelEid !== undefined) profileEntityIds.push(kernelEid);
    }

    const profile = sketch.getCoreSketch().toProfile(profileEntityIds);
    if (!profile) {
      throw new Error("Sketch does not contain a closed profile");
    }

    const axisStartWorld = planeToWorld(sketchInfo.plane, axisStart2d.x, axisStart2d.y);
    const axisEndWorld = planeToWorld(sketchInfo.plane, axisEnd2d.x, axisEnd2d.y);
    const axisDir = sub3(axisEndWorld, axisStartWorld);

    const result = this.session!.revolve(profile, {
      operation: "new",
      axis: { origin: axisStartWorld, direction: axisDir },
      angleDegrees: angleDeg,
    });

    if (!result.success) {
      throw new Error(result.error?.message || "Revolve failed");
    }

    const revolvedBodyId = result.value;

    // Store sketch info for reference index generation
    if (sketchInfo.referenceInfo) {
      this.featureToSketchInfo.set(featureId, sketchInfo.referenceInfo);
    }

    // Handle cut operation
    if (op === "cut") {
      for (const [existingId, entry] of this.bodyMap) {
        const boolResult = this.session!.subtract(entry.bodyId, revolvedBodyId);
        if (boolResult.success) {
          this.bodyMap.set(existingId, { ...entry, bodyId: boolResult.value });
        }
      }
      this.session!.deleteBody(revolvedBodyId);
      return { bodyId: null, bodyEntryId: null };
    }

    // Handle add operation
    const finalBodyName = resultBodyName || `Body${this.bodyMap.size + 1}`;
    const finalBodyColor = resultBodyColor || this.getNextBodyColor();

    if (mergeScope === "new" || this.bodyMap.size === 0) {
      return {
        bodyId: revolvedBodyId,
        bodyEntryId: featureId,
        bodyName: finalBodyName,
        bodyColor: finalBodyColor,
      };
    }

    return this.handleMerge(
      revolvedBodyId,
      featureId,
      mergeScope,
      targetBodies,
      finalBodyName,
      finalBodyColor
    );
  }

  private handleMerge(
    newBodyId: BodyId,
    featureId: string,
    mergeScope: string,
    targetBodies: string[],
    finalBodyName: string,
    finalBodyColor: string
  ): FeatureInterpretResult {
    if (mergeScope === "specific" && targetBodies.length > 0) {
      let currentBodyId = newBodyId;
      let mergedIntoId: string | null = null;
      let mergedEntry: BodyEntry | null = null;

      for (const targetId of targetBodies) {
        const targetEntry = this.bodyMap.get(targetId);
        if (targetEntry) {
          const unionResult = this.session!.union(targetEntry.bodyId, currentBodyId);
          if (unionResult.success) {
            if (currentBodyId !== unionResult.value) {
              this.session!.deleteBody(currentBodyId);
            }
            if (targetEntry.bodyId !== unionResult.value) {
              this.session!.deleteBody(targetEntry.bodyId);
            }
            currentBodyId = unionResult.value;
            if (!mergedIntoId) {
              mergedIntoId = targetId;
              mergedEntry = targetEntry;
            }
          }
        }
      }

      if (mergedIntoId && mergedEntry) {
        this.bodyMap.set(mergedIntoId, { ...mergedEntry, bodyId: currentBodyId });
        return {
          bodyId: null,
          bodyEntryId: mergedIntoId,
          bodyName: mergedEntry.name,
          bodyColor: mergedEntry.color,
        };
      }

      return {
        bodyId: currentBodyId,
        bodyEntryId: featureId,
        bodyName: finalBodyName,
        bodyColor: finalBodyColor,
      };
    }

    // Auto merge
    let currentBodyId = newBodyId;
    let mergedIntoId: string | null = null;
    let mergedEntry: BodyEntry | null = null;

    for (const [existingId, entry] of this.bodyMap) {
      const unionResult = this.session!.union(entry.bodyId, currentBodyId);
      if (unionResult.success) {
        if (currentBodyId !== unionResult.value) {
          this.session!.deleteBody(currentBodyId);
        }
        if (entry.bodyId !== unionResult.value) {
          this.session!.deleteBody(entry.bodyId);
        }
        currentBodyId = unionResult.value;
        if (!mergedIntoId) {
          mergedIntoId = existingId;
          mergedEntry = entry;
        }
      }
    }

    if (mergedIntoId && mergedEntry) {
      this.bodyMap.set(mergedIntoId, { ...mergedEntry, bodyId: currentBodyId });
      return {
        bodyId: null,
        bodyEntryId: mergedIntoId,
        bodyName: mergedEntry.name,
        bodyColor: mergedEntry.color,
      };
    }

    return {
      bodyId: currentBodyId,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  private interpretBoolean(featureMap: Y.Map<unknown>): FeatureInterpretResult {
    const operation = (featureMap.get("operation") as string) || "union";
    const targetId = featureMap.get("target") as string;
    const toolId = featureMap.get("tool") as string;

    if (!targetId || !toolId) {
      throw new Error("Boolean requires target and tool body references");
    }

    const targetEntry = this.bodyMap.get(targetId);
    const toolEntry = this.bodyMap.get(toolId);

    if (!targetEntry) {
      throw new Error(`Target body not found: ${targetId}`);
    }
    if (!toolEntry) {
      throw new Error(`Tool body not found: ${toolId}`);
    }

    let result: OperationResult<BodyId>;
    switch (operation) {
      case "union":
        result = this.session!.union(targetEntry.bodyId, toolEntry.bodyId);
        break;
      case "subtract":
        result = this.session!.subtract(targetEntry.bodyId, toolEntry.bodyId);
        break;
      case "intersect":
        result = this.session!.intersect(targetEntry.bodyId, toolEntry.bodyId);
        break;
      default:
        throw new Error(`Unknown boolean operation: ${operation}`);
    }

    if (!result.success) {
      throw new Error(result.error?.message || "Boolean operation failed");
    }

    this.session!.deleteBody(targetEntry.bodyId);
    this.session!.deleteBody(toolEntry.bodyId);
    this.bodyMap.delete(toolId);
    this.bodyMap.set(targetId, { ...targetEntry, bodyId: result.value });

    return {
      bodyId: null,
      bodyEntryId: targetId,
      bodyName: targetEntry.name,
      bodyColor: targetEntry.color,
    };
  }
}
