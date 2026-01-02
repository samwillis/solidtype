/**
 * Runtime Invariant Validation
 *
 * Validates the document snapshot against runtime invariants.
 * See DOCUMENT-MODEL.md section 5 for specification.
 */

import { DocSnapshotSchema, type DocSnapshot } from "./schema";

// ============================================================================
// Validation Result
// ============================================================================

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// ============================================================================
// Zod Schema Validation
// ============================================================================

/**
 * Validate document snapshot against Zod schema
 */
export function validateSchema(snapshot: unknown): ValidationResult {
  const result = DocSnapshotSchema.safeParse(snapshot);

  if (result.success) {
    return { ok: true, errors: [] };
  }

  const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return { ok: false, errors };
}

// ============================================================================
// Runtime Invariants
// ============================================================================

/**
 * Validate all runtime invariants on a document snapshot
 */
export function validateInvariants(snapshot: DocSnapshot): ValidationResult {
  const errors: string[] = [];

  // 6.1 Identity consistency
  validateIdentityConsistency(snapshot, errors);

  // 6.2 FeatureOrder ⇄ featuresById agreement
  validateOrderAgreement(snapshot, errors);

  // 6.3 Datum plane invariants
  validateDatumPlanes(snapshot, errors);

  // 6.4 Rebuild gate
  validateRebuildGate(snapshot, errors);

  // 6.5 Sketch plane refs
  validateSketchPlaneRefs(snapshot, errors);

  // 6.6 Extrude invariants
  validateExtrudeInvariants(snapshot, errors);

  // 6.7 Revolve invariants
  validateRevolveInvariants(snapshot, errors);

  // 6.8 Sketch internal integrity
  validateSketchIntegrity(snapshot, errors);

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * 6.1 Identity consistency (map key vs record.id)
 */
function validateIdentityConsistency(snapshot: DocSnapshot, errors: string[]): void {
  for (const [key, feature] of Object.entries(snapshot.featuresById)) {
    if (feature.id !== key) {
      errors.push(`Identity mismatch: featuresById key '${key}' != feature.id '${feature.id}'`);
    }

    // For sketches, validate internal ID consistency
    if (feature.type === "sketch") {
      const data = feature.data;

      for (const [pointKey, point] of Object.entries(data.pointsById)) {
        if (point.id !== pointKey) {
          errors.push(`Sketch ${key}: pointsById key '${pointKey}' != point.id '${point.id}'`);
        }
      }

      for (const [entityKey, entity] of Object.entries(data.entitiesById)) {
        if (entity.id !== entityKey) {
          errors.push(`Sketch ${key}: entitiesById key '${entityKey}' != entity.id '${entity.id}'`);
        }
      }

      for (const [constraintKey, constraint] of Object.entries(data.constraintsById)) {
        if (constraint.id !== constraintKey) {
          errors.push(
            `Sketch ${key}: constraintsById key '${constraintKey}' != constraint.id '${constraint.id}'`
          );
        }
      }
    }
  }
}

/**
 * 6.2 FeatureOrder ⇄ featuresById agreement (bidirectional)
 */
function validateOrderAgreement(snapshot: DocSnapshot, errors: string[]): void {
  const orderSet = new Set(snapshot.featureOrder);
  const byIdKeys = new Set(Object.keys(snapshot.featuresById));

  // Check for duplicates in featureOrder
  if (orderSet.size !== snapshot.featureOrder.length) {
    errors.push("featureOrder contains duplicate IDs");
  }

  // Every id in featureOrder exists in featuresById
  for (const id of snapshot.featureOrder) {
    if (!byIdKeys.has(id)) {
      errors.push(`featureOrder contains '${id}' which doesn't exist in featuresById`);
    }
  }

  // Every id in featuresById appears in featureOrder
  for (const id of byIdKeys) {
    if (!orderSet.has(id)) {
      errors.push(`featuresById contains '${id}' which doesn't appear in featureOrder`);
    }
  }
}

/**
 * 6.3 Datum plane invariants
 */
function validateDatumPlanes(snapshot: DocSnapshot, errors: string[]): void {
  let originCount = 0;
  let xyCount = 0;
  let xzCount = 0;
  let yzCount = 0;

  let originId: string | null = null;
  let xyId: string | null = null;
  let xzId: string | null = null;
  let yzId: string | null = null;

  for (const [id, feature] of Object.entries(snapshot.featuresById)) {
    if (feature.type === "origin") {
      originCount++;
      originId = id;
    } else if (feature.type === "plane" && "definition" in feature) {
      const definition = feature.definition as { kind: string; role?: string };
      if (definition.kind === "datum" && definition.role) {
        const role = definition.role;
      if (role === "xy") {
        xyCount++;
        xyId = id;
      } else if (role === "xz") {
        xzCount++;
        xzId = id;
      } else if (role === "yz") {
        yzCount++;
        yzId = id;
        }
      }
    }
  }

  // Exactly one origin
  if (originCount !== 1) {
    errors.push(`Expected exactly 1 origin, found ${originCount}`);
  }

  // Exactly one of each datum plane role
  if (xyCount !== 1) {
    errors.push(`Expected exactly 1 XY plane, found ${xyCount}`);
  }
  if (xzCount !== 1) {
    errors.push(`Expected exactly 1 XZ plane, found ${xzCount}`);
  }
  if (yzCount !== 1) {
    errors.push(`Expected exactly 1 YZ plane, found ${yzCount}`);
  }

  // Pinned ordering: first 4 entries are [origin, xy, xz, yz]
  if (originId && xyId && xzId && yzId) {
    const expected = [originId, xyId, xzId, yzId];
    const actual = snapshot.featureOrder.slice(0, 4);

    for (let i = 0; i < 4; i++) {
      if (actual[i] !== expected[i]) {
        errors.push(
          `Datum features not pinned: expected ${expected[i]} at position ${i}, got ${actual[i]}`
        );
      }
    }
  }
}

/**
 * 6.4 Rebuild gate
 */
function validateRebuildGate(snapshot: DocSnapshot, errors: string[]): void {
  const gate = snapshot.state.rebuildGate;

  if (gate !== null && !snapshot.featuresById[gate]) {
    errors.push(`rebuildGate references '${gate}' which doesn't exist in featuresById`);
  }
}

/**
 * 6.5 Sketch plane refs
 */
function validateSketchPlaneRefs(snapshot: DocSnapshot, errors: string[]): void {
  for (const [id, feature] of Object.entries(snapshot.featuresById)) {
    if (feature.type === "sketch") {
      const plane = feature.plane;

      if (plane.kind === "planeFeatureId") {
        const refFeature = snapshot.featuresById[plane.ref];
        if (!refFeature) {
          errors.push(`Sketch ${id}: plane ref '${plane.ref}' doesn't exist in featuresById`);
        } else if (refFeature.type !== "plane") {
          errors.push(
            `Sketch ${id}: plane ref '${plane.ref}' is not a plane feature (is ${refFeature.type})`
          );
        }
      }
    }
  }
}

/**
 * 6.6 Extrude invariants
 */
function validateExtrudeInvariants(snapshot: DocSnapshot, errors: string[]): void {
  for (const [id, feature] of Object.entries(snapshot.featuresById)) {
    if (feature.type === "extrude") {
      // sketch exists and is type sketch
      const sketchFeature = snapshot.featuresById[feature.sketch];
      if (!sketchFeature) {
        errors.push(`Extrude ${id}: sketch '${feature.sketch}' doesn't exist in featuresById`);
      } else if (sketchFeature.type !== "sketch") {
        errors.push(
          `Extrude ${id}: sketch '${feature.sketch}' is not a sketch feature (is ${sketchFeature.type})`
        );
      }

      // Extent-specific requirements
      if (feature.extent === "blind") {
        if (feature.distance === undefined) {
          errors.push(`Extrude ${id}: blind extent requires distance`);
        }
      } else if (feature.extent === "toFace" || feature.extent === "toVertex") {
        if (!feature.extentRef) {
          errors.push(`Extrude ${id}: ${feature.extent} extent requires extentRef`);
        }
      }
    }
  }
}

/**
 * 6.7 Revolve invariants
 */
function validateRevolveInvariants(snapshot: DocSnapshot, errors: string[]): void {
  for (const [id, feature] of Object.entries(snapshot.featuresById)) {
    if (feature.type === "revolve") {
      // sketch exists and is type sketch
      const sketchFeature = snapshot.featuresById[feature.sketch];
      if (!sketchFeature) {
        errors.push(`Revolve ${id}: sketch '${feature.sketch}' doesn't exist in featuresById`);
      } else if (sketchFeature.type !== "sketch") {
        errors.push(
          `Revolve ${id}: sketch '${feature.sketch}' is not a sketch feature (is ${sketchFeature.type})`
        );
      } else {
        // axis exists in sketch's entitiesById
        const sketchData = sketchFeature.data;
        if (!sketchData.entitiesById[feature.axis]) {
          errors.push(
            `Revolve ${id}: axis '${feature.axis}' doesn't exist in sketch's entitiesById`
          );
        }
      }
    }
  }
}

/**
 * 6.8 Sketch internal integrity
 */
function validateSketchIntegrity(snapshot: DocSnapshot, errors: string[]): void {
  for (const [id, feature] of Object.entries(snapshot.featuresById)) {
    if (feature.type === "sketch") {
      const data = feature.data;
      const pointIds = new Set(Object.keys(data.pointsById));
      const entityIds = new Set(Object.keys(data.entitiesById));

      // Entity endpoints exist in pointsById
      for (const [entityId, entity] of Object.entries(data.entitiesById)) {
        if (entity.type === "line") {
          if (!pointIds.has(entity.start)) {
            errors.push(
              `Sketch ${id}: line ${entityId} start '${entity.start}' doesn't exist in pointsById`
            );
          }
          if (!pointIds.has(entity.end)) {
            errors.push(
              `Sketch ${id}: line ${entityId} end '${entity.end}' doesn't exist in pointsById`
            );
          }
        } else if (entity.type === "arc") {
          if (!pointIds.has(entity.start)) {
            errors.push(
              `Sketch ${id}: arc ${entityId} start '${entity.start}' doesn't exist in pointsById`
            );
          }
          if (!pointIds.has(entity.end)) {
            errors.push(
              `Sketch ${id}: arc ${entityId} end '${entity.end}' doesn't exist in pointsById`
            );
          }
          if (!pointIds.has(entity.center)) {
            errors.push(
              `Sketch ${id}: arc ${entityId} center '${entity.center}' doesn't exist in pointsById`
            );
          }
        }
      }

      // Constraint refs exist and are correct type
      for (const [constraintId, constraint] of Object.entries(data.constraintsById)) {
        if ("points" in constraint && Array.isArray(constraint.points)) {
          for (const pointId of constraint.points) {
            if (!pointIds.has(pointId)) {
              errors.push(
                `Sketch ${id}: constraint ${constraintId} references point '${pointId}' which doesn't exist`
              );
            }
          }
        }

        if ("point" in constraint) {
          if (!pointIds.has(constraint.point)) {
            errors.push(
              `Sketch ${id}: constraint ${constraintId} references point '${constraint.point}' which doesn't exist`
            );
          }
        }

        if ("lines" in constraint && Array.isArray(constraint.lines)) {
          for (const lineId of constraint.lines) {
            if (!entityIds.has(lineId)) {
              errors.push(
                `Sketch ${id}: constraint ${constraintId} references entity '${lineId}' which doesn't exist`
              );
            }
          }
        }

        if ("line" in constraint) {
          if (!entityIds.has(constraint.line)) {
            errors.push(
              `Sketch ${id}: constraint ${constraintId} references line '${constraint.line}' which doesn't exist`
            );
          }
        }

        if ("arc" in constraint) {
          if (!entityIds.has(constraint.arc)) {
            errors.push(
              `Sketch ${id}: constraint ${constraintId} references arc '${constraint.arc}' which doesn't exist`
            );
          }
        }

        if ("axis" in constraint) {
          if (!entityIds.has(constraint.axis)) {
            errors.push(
              `Sketch ${id}: constraint ${constraintId} references axis '${constraint.axis}' which doesn't exist`
            );
          }
        }
      }
    }
  }
}

// ============================================================================
// Combined Validation
// ============================================================================

/**
 * Validate a document snapshot (schema + invariants)
 * Use on document load
 */
export function validateDocument(snapshot: unknown): ValidationResult {
  // First validate schema
  const schemaResult = validateSchema(snapshot);
  if (!schemaResult.ok) {
    return schemaResult;
  }

  // Then validate invariants
  return validateInvariants(snapshot as DocSnapshot);
}

/**
 * Dev-only validation helper
 * Only validates if DEV mode is enabled
 */
export function validateDocumentDev(snapshot: unknown): ValidationResult {
  if (import.meta.env?.DEV) {
    return validateDocument(snapshot);
  }
  return { ok: true, errors: [] };
}
