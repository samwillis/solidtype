/**
 * Sketch Context Serialization
 *
 * Serializes sketch data for AI context, providing a structured view
 * of the current sketch state including points, entities, and constraints.
 */

import type { SolidTypeDoc } from "../../../editor/document";
import {
  getSketchData,
  getSketchDataAsArrays,
} from "../../../editor/document/feature-helpers/sketch-data";
import type {
  SketchData,
  SketchConstraint,
  SketchEntity,
  SketchPoint,
} from "../../../editor/document/schema";

/**
 * AI-friendly representation of a sketch context
 */
export interface SketchAIContext {
  sketchId: string;
  planeName: string;
  points: Array<{
    id: string;
    x: number;
    y: number;
    fixed: boolean;
  }>;
  entities: Array<{
    id: string;
    type: string;
    points: string[];
    properties: Record<string, unknown>;
  }>;
  constraints: Array<{
    id: string;
    type: string;
    targets: string[];
    value?: number;
  }>;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
  degreesOfFreedom: number;
}

/**
 * Serialize a sketch into AI-friendly context
 */
export function serializeSketchContext(
  doc: SolidTypeDoc,
  sketchId: string
): SketchAIContext | null {
  const sketchFeature = doc.featuresById.get(sketchId);
  if (!sketchFeature || sketchFeature.get("type") !== "sketch") {
    return null;
  }

  // Get sketch data using existing helpers
  const sketchData = getSketchData(sketchFeature);
  if (!sketchData) return null;

  // Convert points
  const points = Object.values(sketchData.pointsById).map((p: SketchPoint) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    fixed: p.fixed || false,
  }));

  // Convert entities
  const entities = Object.values(sketchData.entitiesById).map((e: SketchEntity) => {
    const pointRefs: string[] = [];
    const properties: Record<string, unknown> = { type: e.type };

    if (e.type === "line") {
      pointRefs.push(e.start, e.end);
      properties.start = e.start;
      properties.end = e.end;
      if (e.construction) properties.construction = true;
    } else if (e.type === "arc") {
      pointRefs.push(e.start, e.end, e.center);
      properties.start = e.start;
      properties.end = e.end;
      properties.center = e.center;
      properties.ccw = e.ccw;
      if (e.construction) properties.construction = true;
    } else if (e.type === "circle") {
      pointRefs.push(e.center);
      properties.center = e.center;
      properties.radius = e.radius;
      if (e.construction) properties.construction = true;
    }

    return {
      id: e.id,
      type: e.type,
      points: pointRefs,
      properties,
    };
  });

  // Convert constraints
  const constraints = Object.values(sketchData.constraintsById).map((c: SketchConstraint) => {
    const targets: string[] = [];

    // Collect all targets based on constraint type
    if ("points" in c && c.points) {
      targets.push(...c.points);
    }
    if ("point" in c && c.point) {
      targets.push(c.point);
    }
    if ("lines" in c && c.lines) {
      targets.push(...c.lines);
    }
    if ("line" in c && c.line) {
      targets.push(c.line);
    }
    if ("arc" in c && c.arc) {
      targets.push(c.arc);
    }
    if ("axis" in c && c.axis) {
      targets.push(c.axis);
    }

    const result: {
      id: string;
      type: string;
      targets: string[];
      value?: number;
    } = {
      id: c.id,
      type: c.type,
      targets,
    };

    if ("value" in c && c.value !== undefined) {
      result.value = c.value;
    }

    return result;
  });

  // Get plane reference
  const plane = sketchFeature.get("plane") as { kind: string; ref: string } | undefined;
  let planeName = "custom";
  if (plane?.kind === "planeFeatureId") {
    // Try to find the plane's name or role
    const planeFeature = doc.featuresById.get(plane.ref);
    if (planeFeature) {
      const definition = planeFeature.get("definition") as
        | { kind: string; role?: string }
        | undefined;
      if (definition?.kind === "datum" && definition.role) {
        planeName = definition.role.toUpperCase(); // "xy" -> "XY"
      } else {
        planeName = (planeFeature.get("name") as string) || plane.ref;
      }
    } else {
      planeName = plane.ref;
    }
  } else if (plane?.kind === "faceRef") {
    planeName = `Face: ${plane.ref}`;
  }

  // Calculate degrees of freedom (simplified estimation)
  // Each point has 2 DOF, constraints reduce DOF
  const pointCount = points.length;
  const constraintCount = constraints.length;
  // This is a simplified estimate; real solver would provide accurate DOF
  const estimatedDOF = Math.max(0, pointCount * 2 - constraintCount);

  // Determine solver status based on DOF
  let solverStatus: SketchAIContext["solverStatus"] = "underconstrained";
  if (estimatedDOF === 0) {
    solverStatus = "solved";
  } else if (estimatedDOF < 0) {
    solverStatus = "overconstrained";
  }

  return {
    sketchId,
    planeName,
    points,
    entities,
    constraints,
    solverStatus,
    degreesOfFreedom: estimatedDOF,
  };
}

/**
 * Get all sketch IDs from a document
 */
export function getSketchIds(doc: SolidTypeDoc): string[] {
  const sketchIds: string[] = [];
  for (const featureId of doc.featureOrder.toArray()) {
    const feature = doc.featuresById.get(featureId);
    if (feature && feature.get("type") === "sketch") {
      sketchIds.push(featureId);
    }
  }
  return sketchIds;
}

/**
 * Get a summary of all sketches in the document
 */
export function getSketchesSummary(
  doc: SolidTypeDoc
): Array<{ id: string; name: string; entityCount: number; constraintCount: number }> {
  const summaries: Array<{
    id: string;
    name: string;
    entityCount: number;
    constraintCount: number;
  }> = [];

  for (const featureId of doc.featureOrder.toArray()) {
    const feature = doc.featuresById.get(featureId);
    if (feature && feature.get("type") === "sketch") {
      const name = (feature.get("name") as string) || featureId;
      const data = getSketchDataAsArrays(feature);

      summaries.push({
        id: featureId,
        name,
        entityCount: data.entities.length,
        constraintCount: data.constraints.length,
      });
    }
  }

  return summaries;
}
