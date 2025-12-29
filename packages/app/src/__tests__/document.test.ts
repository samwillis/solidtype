/**
 * Document Model Tests
 *
 * Tests for the Y.Map/Y.Array-based document model.
 * See DOCUMENT-MODEL.md for specification.
 */

import { describe, test, expect } from 'vitest';
import * as Y from 'yjs';
import { createDocument, getDatumPlaneIds } from '../editor/document/createDocument';
import { uuid } from '../editor/document/yjs';
import {
  findFeature,
  getFeatureIds,
  addSketchFeature,
  addExtrudeFeature,
  addRevolveFeature,
  addBooleanFeature,
  getSketchData,
  getSketchDataAsArrays,
  addPointToSketch,
  addLineToSketch,
  addConstraintToSketch,
  parseFeature,
  deleteFeature,
  renameFeature,
} from '../editor/document/featureHelpers';
import { validateDocument, validateInvariants } from '../editor/document/validate';
import type { SketchPlaneRef } from '../editor/document/schema';

// ============================================================================
// Document Creation Tests
// ============================================================================

describe('Document Creation', () => {
  test('createDocument initializes with default features', () => {
    const doc = createDocument();
    expect(doc.featureOrder.length).toBe(4); // origin + 3 planes
  });

  test('default features have correct structure', () => {
    const doc = createDocument();
    const featureIds = doc.featureOrder.toArray();

    // First 4 features should be origin + datum planes
    expect(featureIds.length).toBeGreaterThanOrEqual(4);

    // Get datum plane IDs
    const datumIds = getDatumPlaneIds(doc);
    expect(datumIds.origin).not.toBeNull();
    expect(datumIds.xy).not.toBeNull();
    expect(datumIds.xz).not.toBeNull();
    expect(datumIds.yz).not.toBeNull();

    // Verify origin
    const origin = doc.featuresById.get(datumIds.origin!);
    expect(origin).not.toBeNull();
    expect(origin?.get('type')).toBe('origin');

    // Verify XY plane
    const xyPlane = doc.featuresById.get(datumIds.xy!);
    expect(xyPlane).not.toBeNull();
    expect(xyPlane?.get('type')).toBe('plane');
    expect(xyPlane?.get('role')).toBe('xy');
    expect(xyPlane?.get('normal')).toEqual([0, 0, 1]);

    // Verify XZ plane
    const xzPlane = doc.featuresById.get(datumIds.xz!);
    expect(xzPlane).not.toBeNull();
    expect(xzPlane?.get('type')).toBe('plane');
    expect(xzPlane?.get('role')).toBe('xz');
    expect(xzPlane?.get('normal')).toEqual([0, 1, 0]);

    // Verify YZ plane
    const yzPlane = doc.featuresById.get(datumIds.yz!);
    expect(yzPlane).not.toBeNull();
    expect(yzPlane?.get('type')).toBe('plane');
    expect(yzPlane?.get('role')).toBe('yz');
    expect(yzPlane?.get('normal')).toEqual([1, 0, 0]);
  });

  test('meta is initialized correctly', () => {
    const doc = createDocument();
    expect(doc.meta.get('name')).toBe('Untitled');
    expect(doc.meta.get('schemaVersion')).toBe(2);
    expect(doc.meta.get('units')).toBe('mm');
    expect(typeof doc.meta.get('created')).toBe('number');
    expect(typeof doc.meta.get('modified')).toBe('number');
  });

  test('datum planes are pinned to start of featureOrder', () => {
    const doc = createDocument();
    const datumIds = getDatumPlaneIds(doc);
    const order = doc.featureOrder.toArray();

    // First 4 should be origin, xy, xz, yz
    expect(order[0]).toBe(datumIds.origin);
    expect(order[1]).toBe(datumIds.xy);
    expect(order[2]).toBe(datumIds.xz);
    expect(order[3]).toBe(datumIds.yz);
  });
});

// ============================================================================
// Rebuild Gate Tests
// ============================================================================

describe('Rebuild Gate', () => {
  test('setRebuildGate updates state', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    doc.state.set('rebuildGate', sketchId);
    expect(doc.state.get('rebuildGate')).toBe(sketchId);
  });

  test('rebuildGate defaults to null', () => {
    const doc = createDocument();
    expect(doc.state.get('rebuildGate')).toBeNull();
  });

  test('rebuildGate can be cleared', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    doc.state.set('rebuildGate', sketchId);
    doc.state.set('rebuildGate', null);
    expect(doc.state.get('rebuildGate')).toBeNull();
  });
});

// ============================================================================
// Undo/Redo Tests
// ============================================================================

describe('Undo/Redo', () => {
  test('UndoManager tracks feature additions', () => {
    const doc = createDocument();
    const undoManager = new Y.UndoManager([doc.featuresById, doc.featureOrder]);

    const sketchId = addSketchFeature(doc, 'xy');
    expect(doc.featureOrder.length).toBe(5); // 4 defaults + 1 sketch

    undoManager.undo();
    expect(doc.featureOrder.length).toBe(4);
    expect(doc.featuresById.get(sketchId)).toBeUndefined();

    undoManager.redo();
    expect(doc.featureOrder.length).toBe(5);
  });

  test('UndoManager tracks attribute changes', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy', 'Original Name');

    // Create undo manager after initial setup
    const undoManager = new Y.UndoManager([doc.featuresById, doc.featureOrder]);

    // Change attribute - this change should be tracked
    const sketch = doc.featuresById.get(sketchId)!;
    sketch.set('name', 'New Name');
    expect(sketch.get('name')).toBe('New Name');

    undoManager.undo();
    expect(sketch.get('name')).toBe('Original Name');
  });
});

// ============================================================================
// UUID Generation Tests
// ============================================================================

describe('UUID Generation', () => {
  test('uuid generates valid v4 UUIDs', () => {
    const id = uuid();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  test('uuid generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(uuid());
    }
    expect(ids.size).toBe(100);
  });
});

// ============================================================================
// Feature Helper Tests
// ============================================================================

describe('Feature Helpers', () => {
  test('findFeature finds by ID', () => {
    const doc = createDocument();
    const datumIds = getDatumPlaneIds(doc);
    const feature = findFeature(doc.featuresById, datumIds.xy!);
    expect(feature).not.toBeNull();
    expect(feature?.get('name')).toBe('XY Plane');
  });

  test('getFeatureIds returns all IDs in order', () => {
    const doc = createDocument();
    const ids = getFeatureIds(doc.featureOrder);
    expect(ids.length).toBe(4);

    const datumIds = getDatumPlaneIds(doc);
    expect(ids).toContain(datumIds.origin);
    expect(ids).toContain(datumIds.xy);
    expect(ids).toContain(datumIds.xz);
    expect(ids).toContain(datumIds.yz);
  });

  test('addSketchFeature creates sketch with plane reference', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy', 'MySketch');

    const sketch = doc.featuresById.get(id);
    expect(sketch).not.toBeNull();
    expect(sketch?.get('type')).toBe('sketch');
    expect(sketch?.get('name')).toBe('MySketch');

    // Plane should be a SketchPlaneRef object
    const plane = sketch?.get('plane') as SketchPlaneRef;
    expect(plane.kind).toBe('planeFeatureId');
    // The ref should be the UUID of the XY plane
    const datumIds = getDatumPlaneIds(doc);
    expect(plane.ref).toBe(datumIds.xy);
  });

  test('addExtrudeFeature creates extrude element', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, sketchId, 10, 'add', 'reverse');

    const extrude = doc.featuresById.get(extrudeId);
    expect(extrude).not.toBeNull();
    expect(extrude?.get('type')).toBe('extrude');
    expect(extrude?.get('sketch')).toBe(sketchId);
    expect(extrude?.get('distance')).toBe(10);
    expect(extrude?.get('op')).toBe('add');
    expect(extrude?.get('direction')).toBe('reverse');
  });

  test('addRevolveFeature creates revolve element', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const axisId = uuid(); // Would be a line entity ID
    const revolveId = addRevolveFeature(doc, sketchId, axisId, 90, 'add');

    const revolve = doc.featuresById.get(revolveId);
    expect(revolve).not.toBeNull();
    expect(revolve?.get('type')).toBe('revolve');
    expect(revolve?.get('sketch')).toBe(sketchId);
    expect(revolve?.get('axis')).toBe(axisId);
    expect(revolve?.get('angle')).toBe(90);
    expect(revolve?.get('op')).toBe('add');
  });

  test('deleteFeature removes feature from map and order', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');

    expect(doc.featuresById.get(sketchId)).not.toBeNull();
    expect(doc.featureOrder.toArray()).toContain(sketchId);

    const deleted = deleteFeature(doc, sketchId);
    expect(deleted).toBe(true);
    expect(doc.featuresById.get(sketchId)).toBeUndefined();
    expect(doc.featureOrder.toArray()).not.toContain(sketchId);
  });

  test('deleteFeature prevents deleting datum planes', () => {
    const doc = createDocument();
    const datumIds = getDatumPlaneIds(doc);

    const deleted = deleteFeature(doc, datumIds.xy!);
    expect(deleted).toBe(false);
    expect(doc.featuresById.get(datumIds.xy!)).not.toBeNull();
  });

  test('renameFeature updates feature name', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy', 'Original');

    const renamed = renameFeature(doc, sketchId, 'Updated');
    expect(renamed).toBe(true);
    expect(doc.featuresById.get(sketchId)?.get('name')).toBe('Updated');
  });
});

// ============================================================================
// Sketch Data Tests
// ============================================================================

describe('Sketch Data', () => {
  test('getSketchData returns empty maps for new sketch', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = doc.featuresById.get(id)!;

    const data = getSketchData(sketch);
    expect(Object.keys(data.pointsById)).toHaveLength(0);
    expect(Object.keys(data.entitiesById)).toHaveLength(0);
    expect(Object.keys(data.constraintsById)).toHaveLength(0);
  });

  test('addPointToSketch adds point with UUID', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = doc.featuresById.get(id)!;

    const pointId = addPointToSketch(sketch, 5, 10);

    // Point ID should be a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(pointId).toMatch(uuidRegex);

    const data = getSketchData(sketch);
    expect(Object.keys(data.pointsById)).toHaveLength(1);
    expect(data.pointsById[pointId].x).toBe(5);
    expect(data.pointsById[pointId].y).toBe(10);
  });

  test('addLineToSketch adds line with UUID', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = doc.featuresById.get(id)!;

    const pt1 = addPointToSketch(sketch, 0, 0);
    const pt2 = addPointToSketch(sketch, 10, 0);
    const lineId = addLineToSketch(sketch, pt1, pt2);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(lineId).toMatch(uuidRegex);

    const data = getSketchData(sketch);
    expect(Object.keys(data.entitiesById)).toHaveLength(1);
    expect(data.entitiesById[lineId].type).toBe('line');
    expect(data.entitiesById[lineId].start).toBe(pt1);
    expect(data.entitiesById[lineId].end).toBe(pt2);
  });

  test('addConstraintToSketch adds constraint with UUID', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = doc.featuresById.get(id)!;

    const p1 = addPointToSketch(sketch, 0, 0);
    const p2 = addPointToSketch(sketch, 10, 5);
    const constraintId = addConstraintToSketch(sketch, {
      type: 'horizontal',
      points: [p1, p2],
    });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(constraintId).toMatch(uuidRegex);

    const data = getSketchData(sketch);
    expect(Object.keys(data.constraintsById)).toHaveLength(1);
    expect(data.constraintsById[constraintId].type).toBe('horizontal');
  });

  test('getSketchDataAsArrays returns arrays', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = doc.featuresById.get(id)!;

    addPointToSketch(sketch, 0, 0);
    addPointToSketch(sketch, 10, 0);

    const { points, entities, constraints } = getSketchDataAsArrays(sketch);
    expect(Array.isArray(points)).toBe(true);
    expect(points).toHaveLength(2);
    expect(Array.isArray(entities)).toBe(true);
    expect(Array.isArray(constraints)).toBe(true);
  });
});

// ============================================================================
// Feature Parsing Tests
// ============================================================================

describe('Feature Parsing', () => {
  test('parseFeature parses plane correctly', () => {
    const doc = createDocument();
    const datumIds = getDatumPlaneIds(doc);
    const planeMap = doc.featuresById.get(datumIds.xy!)!;
    const feature = parseFeature(planeMap);

    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('plane');
    expect(feature!.id).toBe(datumIds.xy);
    expect(feature!.name).toBe('XY Plane');
    if (feature!.type === 'plane' && 'role' in feature!) {
      expect(feature!.role).toBe('xy');
    }
  });

  test('parseFeature parses sketch correctly', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy', 'TestSketch');
    const sketchMap = doc.featuresById.get(id)!;
    const feature = parseFeature(sketchMap);

    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('sketch');
    if (feature!.type === 'sketch') {
      expect(feature!.plane.kind).toBe('planeFeatureId');
    }
  });

  test('parseFeature parses extrude correctly', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, sketchId, 15, 'cut');
    const extrudeMap = doc.featuresById.get(extrudeId)!;
    const feature = parseFeature(extrudeMap);

    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('extrude');
    if (feature!.type === 'extrude') {
      expect(feature!.sketch).toBe(sketchId);
      expect(feature!.distance).toBe(15);
      expect(feature!.op).toBe('cut');
    }
  });

  test('parseFeature parses revolve correctly', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const axisId = uuid();
    const revolveId = addRevolveFeature(doc, sketchId, axisId, 180, 'cut');
    const revolveMap = doc.featuresById.get(revolveId)!;
    const feature = parseFeature(revolveMap);

    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('revolve');
    if (feature!.type === 'revolve') {
      expect(feature!.sketch).toBe(sketchId);
      expect(feature!.axis).toBe(axisId);
      expect(feature!.angle).toBe(180);
      expect(feature!.op).toBe('cut');
    }
  });
});

// ============================================================================
// Extrude Extent Tests
// ============================================================================

describe('Extrude Extent Types', () => {
  test('addExtrudeFeature defaults to blind extent', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, sketchId, 10);
    const extrudeMap = doc.featuresById.get(extrudeId)!;
    const feature = parseFeature(extrudeMap);

    expect(feature).not.toBeNull();
    if (feature!.type === 'extrude') {
      expect(feature!.extent).toBe('blind');
      expect(feature!.distance).toBe(10);
    }
  });

  test('addExtrudeFeature with options object supports throughAll', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, {
      sketchId,
      extent: 'throughAll',
      op: 'cut',
    });
    const extrudeMap = doc.featuresById.get(extrudeId)!;
    const feature = parseFeature(extrudeMap);

    expect(feature).not.toBeNull();
    if (feature!.type === 'extrude') {
      expect(feature!.extent).toBe('throughAll');
      expect(feature!.op).toBe('cut');
    }
  });

  test('addExtrudeFeature with options object supports toFace with extentRef', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, {
      sketchId,
      extent: 'toFace',
      extentRef: 'face:e1:0',
      op: 'add',
    });
    const extrudeMap = doc.featuresById.get(extrudeId)!;
    const feature = parseFeature(extrudeMap);

    expect(feature).not.toBeNull();
    if (feature!.type === 'extrude') {
      expect(feature!.extent).toBe('toFace');
      expect(feature!.extentRef).toBe('face:e1:0');
    }
  });
});

// ============================================================================
// Multi-Body Support Tests
// ============================================================================

describe('Multi-Body Support', () => {
  test('addExtrudeFeature with mergeScope option', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, {
      sketchId,
      distance: 10,
      mergeScope: 'new',
      resultBodyName: 'CustomBody',
      resultBodyColor: '#ff0000',
    });
    const extrudeMap = doc.featuresById.get(extrudeId)!;
    const feature = parseFeature(extrudeMap);

    expect(feature).not.toBeNull();
    if (feature!.type === 'extrude') {
      expect(feature!.mergeScope).toBe('new');
      expect(feature!.resultBodyName).toBe('CustomBody');
      expect(feature!.resultBodyColor).toBe('#ff0000');
    }
  });

  test('addExtrudeFeature with specific target bodies', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, {
      sketchId,
      distance: 10,
      mergeScope: 'specific',
      targetBodies: ['body1', 'body2'],
    });
    const extrudeMap = doc.featuresById.get(extrudeId)!;
    const feature = parseFeature(extrudeMap);

    expect(feature).not.toBeNull();
    if (feature!.type === 'extrude') {
      expect(feature!.mergeScope).toBe('specific');
      expect(feature!.targetBodies).toEqual(['body1', 'body2']);
    }
  });

  test('addRevolveFeature with mergeScope option', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const axisId = uuid();
    const revolveId = addRevolveFeature(doc, {
      sketchId,
      axis: axisId,
      angle: 360,
      mergeScope: 'auto',
      resultBodyName: 'RevolveBody',
    });
    const revolveMap = doc.featuresById.get(revolveId)!;
    const feature = parseFeature(revolveMap);

    expect(feature).not.toBeNull();
    if (feature!.type === 'revolve') {
      expect(feature!.mergeScope).toBe('auto');
      expect(feature!.resultBodyName).toBe('RevolveBody');
    }
  });
});

// ============================================================================
// Sketch on Face Tests
// ============================================================================

describe('Sketch on Face', () => {
  test('addSketchFeature accepts face reference for plane', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'face:e1:0', 'SketchOnFace');
    const sketchMap = doc.featuresById.get(sketchId)!;
    const feature = parseFeature(sketchMap);

    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('sketch');
    if (feature!.type === 'sketch') {
      expect(feature!.plane.kind).toBe('faceRef');
      expect(feature!.plane.ref).toBe('face:e1:0');
      expect(feature!.name).toBe('SketchOnFace');
    }
  });
});

// ============================================================================
// Boolean Feature Tests
// ============================================================================

describe('Boolean Features', () => {
  test('addBooleanFeature creates boolean operation', () => {
    const doc = createDocument();
    const boolId = addBooleanFeature(doc, {
      operation: 'subtract',
      target: 'body1',
      tool: 'body2',
      name: 'MyBoolean',
    });

    const boolMap = doc.featuresById.get(boolId)!;
    expect(boolMap.get('type')).toBe('boolean');
    expect(boolMap.get('operation')).toBe('subtract');
    expect(boolMap.get('target')).toBe('body1');
    expect(boolMap.get('tool')).toBe('body2');
    expect(boolMap.get('name')).toBe('MyBoolean');
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Document Validation', () => {
  test('validateDocument passes for valid new document', () => {
    const doc = createDocument();
    const snapshot = doc.root.toJSON();
    const result = validateDocument(snapshot);

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validateInvariants detects missing datum planes', () => {
    const doc = createDocument();
    const datumIds = getDatumPlaneIds(doc);

    // Manually break the document by removing a datum plane ID from order
    // (don't do this in real code!)
    const xyIndex = doc.featureOrder.toArray().indexOf(datumIds.xy!);
    doc.featureOrder.delete(xyIndex, 1);

    const snapshot = doc.root.toJSON() as any;
    // Also remove from featuresById in snapshot
    delete snapshot.featuresById[datumIds.xy!];

    const result = validateInvariants(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('XY plane'))).toBe(true);
  });

  test('validateInvariants detects identity mismatch', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');

    // Get snapshot and break identity
    const snapshot = doc.root.toJSON() as any;
    snapshot.featuresById[sketchId].id = 'wrong-id';

    const result = validateInvariants(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Identity mismatch'))).toBe(true);
  });
});
