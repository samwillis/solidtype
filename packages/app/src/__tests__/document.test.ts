/**
 * Document Model Tests - Phase 01
 */

import { describe, test, expect } from 'vitest';
import * as Y from 'yjs';
import { createDocument } from '../document/createDocument';
import {
  parseVector,
  parseVector3,
  serializeVector,
  generateId,
  extractCounters,
} from '../document/utils';
import type { IdCounters } from '../types/document';
import {
  findFeature,
  getFeatureIds,
  addSketchFeature,
  addExtrudeFeature,
  addRevolveFeature,
  getSketchData,
  addPointToSketch,
  addLineToSketch,
  addConstraintToSketch,
  parseFeature,
} from '../document/featureHelpers';

// ============================================================================
// Document Creation Tests
// ============================================================================

describe('Document Creation', () => {
  test('createDocument initializes with default features', () => {
    const doc = createDocument();
    expect(doc.features.length).toBe(4); // origin + 3 planes
  });

  test('default features have correct structure', () => {
    const doc = createDocument();
    const features = [];
    for (let i = 0; i < doc.features.length; i++) {
      const child = doc.features.get(i);
      if (child instanceof Y.XmlElement) {
        features.push(child);
      }
    }

    // Origin
    expect(features[0].nodeName).toBe('origin');
    expect(features[0].getAttribute('id')).toBe('origin');

    // XY Plane
    expect(features[1].nodeName).toBe('plane');
    expect(features[1].getAttribute('id')).toBe('xy');
    expect(features[1].getAttribute('normal')).toBe('0,0,1');

    // XZ Plane
    expect(features[2].nodeName).toBe('plane');
    expect(features[2].getAttribute('id')).toBe('xz');
    expect(features[2].getAttribute('normal')).toBe('0,1,0');

    // YZ Plane
    expect(features[3].nodeName).toBe('plane');
    expect(features[3].getAttribute('id')).toBe('yz');
    expect(features[3].getAttribute('normal')).toBe('1,0,0');
  });

  test('meta is initialized correctly', () => {
    const doc = createDocument();
    expect(doc.meta.get('name')).toBe('Untitled');
    expect(doc.meta.get('version')).toBe(1);
    expect(typeof doc.meta.get('created')).toBe('number');
    expect(typeof doc.meta.get('modified')).toBe('number');
  });
});

// ============================================================================
// Rebuild Gate Tests
// ============================================================================

describe('Rebuild Gate', () => {
  test('setRebuildGate updates state', () => {
    const doc = createDocument();
    doc.state.set('rebuildGate', 'e1');
    expect(doc.state.get('rebuildGate')).toBe('e1');
  });

  test('rebuildGate defaults to null', () => {
    const doc = createDocument();
    expect(doc.state.get('rebuildGate')).toBeNull();
  });

  test('rebuildGate can be cleared', () => {
    const doc = createDocument();
    doc.state.set('rebuildGate', 'e1');
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
    const undoManager = new Y.UndoManager(doc.features);

    const sketch = new Y.XmlElement('sketch');
    sketch.setAttribute('id', 's1');
    doc.features.push([sketch]);

    expect(doc.features.length).toBe(5);

    undoManager.undo();
    expect(doc.features.length).toBe(4);

    undoManager.redo();
    expect(doc.features.length).toBe(5);
  });

  test('UndoManager tracks attribute changes', () => {
    const doc = createDocument();
    
    // Add sketch first
    const sketch = new Y.XmlElement('sketch');
    sketch.setAttribute('id', 's1');
    sketch.setAttribute('plane', 'xy');
    doc.features.push([sketch]);

    // Create undo manager after initial setup
    const undoManager = new Y.UndoManager(doc.features);

    // Change attribute - this change should be tracked
    sketch.setAttribute('plane', 'xz');
    expect(sketch.getAttribute('plane')).toBe('xz');

    undoManager.undo();
    expect(sketch.getAttribute('plane')).toBe('xy');
  });
});

// ============================================================================
// ID Generation Tests
// ============================================================================

describe('ID Generation', () => {
  test('generateId increments counter', () => {
    const counters: IdCounters = {};
    expect(generateId('sketch', counters)).toBe('s1');
    expect(generateId('sketch', counters)).toBe('s2');
    expect(generateId('extrude', counters)).toBe('e1');
  });

  test('extractCounters parses existing IDs', () => {
    const ids = ['s1', 's5', 'e3', 's2', 'e1'];
    const counters = extractCounters(ids);
    expect(counters['s']).toBe(5);
    expect(counters['e']).toBe(3);
  });
});

// ============================================================================
// Vector Parsing Tests
// ============================================================================

describe('Vector Parsing', () => {
  test('parseVector handles comma-separated strings', () => {
    expect(parseVector('0,0,1')).toEqual([0, 0, 1]);
    expect(parseVector('1.5,-2.5,3')).toEqual([1.5, -2.5, 3]);
  });

  test('parseVector3 returns 3-tuple', () => {
    expect(parseVector3('0,0,1')).toEqual([0, 0, 1]);
  });

  test('serializeVector produces comma-separated string', () => {
    expect(serializeVector([0, 0, 1])).toBe('0,0,1');
    expect(serializeVector([1.5, -2.5, 3])).toBe('1.5,-2.5,3');
  });
});

// ============================================================================
// Feature Helper Tests
// ============================================================================

describe('Feature Helpers', () => {
  test('findFeature finds by ID', () => {
    const doc = createDocument();
    const feature = findFeature(doc.features, 'xy');
    expect(feature).not.toBeNull();
    expect(feature?.getAttribute('name')).toBe('XY Plane');
  });

  test('getFeatureIds returns all IDs', () => {
    const doc = createDocument();
    const ids = getFeatureIds(doc.features);
    expect(ids).toContain('origin');
    expect(ids).toContain('xy');
    expect(ids).toContain('xz');
    expect(ids).toContain('yz');
  });

  test('addSketchFeature creates sketch element', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy', 'MySketch');

    const sketch = findFeature(doc.features, id);
    expect(sketch).not.toBeNull();
    expect(sketch?.getAttribute('plane')).toBe('xy');
    expect(sketch?.getAttribute('name')).toBe('MySketch');
  });

  test('addExtrudeFeature creates extrude element', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, sketchId, 10, 'add', 'reverse');

    const extrude = findFeature(doc.features, extrudeId);
    expect(extrude).not.toBeNull();
    expect(extrude?.getAttribute('sketch')).toBe(sketchId);
    expect(extrude?.getAttribute('distance')).toBe('10');
    expect(extrude?.getAttribute('op')).toBe('add');
    expect(extrude?.getAttribute('direction')).toBe('reverse');
  });

  test('addRevolveFeature creates revolve element', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const axisId = 'ln1';
    const revolveId = addRevolveFeature(doc, sketchId, axisId, 90, 'add');

    const revolve = findFeature(doc.features, revolveId);
    expect(revolve).not.toBeNull();
    expect(revolve?.getAttribute('sketch')).toBe(sketchId);
    expect(revolve?.getAttribute('axis')).toBe(axisId);
    expect(revolve?.getAttribute('angle')).toBe('90');
    expect(revolve?.getAttribute('op')).toBe('add');
  });
});

// ============================================================================
// Sketch Data Tests
// ============================================================================

describe('Sketch Data', () => {
  test('getSketchData returns empty arrays for new sketch', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = findFeature(doc.features, id)!;
    
    const data = getSketchData(sketch);
    expect(data.points).toEqual([]);
    expect(data.entities).toEqual([]);
    expect(data.constraints).toEqual([]);
  });

  test('addPointToSketch adds point', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = findFeature(doc.features, id)!;
    
    const pointId = addPointToSketch(sketch, 5, 10);
    
    const data = getSketchData(sketch);
    expect(data.points).toHaveLength(1);
    expect(data.points[0].id).toBe(pointId);
    expect(data.points[0].x).toBe(5);
    expect(data.points[0].y).toBe(10);
  });

  test('addLineToSketch adds line', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = findFeature(doc.features, id)!;
    
    const pt1 = addPointToSketch(sketch, 0, 0);
    const pt2 = addPointToSketch(sketch, 10, 0);
    const lineId = addLineToSketch(sketch, pt1, pt2);
    
    const data = getSketchData(sketch);
    expect(data.entities).toHaveLength(1);
    expect(data.entities[0].id).toBe(lineId);
    expect(data.entities[0].type).toBe('line');
    expect((data.entities[0] as any).start).toBe(pt1);
    expect((data.entities[0] as any).end).toBe(pt2);
  });

  test('addConstraintToSketch adds constraint', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy');
    const sketch = findFeature(doc.features, id)!;

    const p1 = addPointToSketch(sketch, 0, 0);
    const p2 = addPointToSketch(sketch, 10, 5);
    const cid = addConstraintToSketch(sketch, { type: 'horizontal', points: [p1, p2] });

    const data = getSketchData(sketch);
    expect(data.constraints).toHaveLength(1);
    expect(data.constraints[0].id).toBe(cid);
    expect((data.constraints[0] as any).type).toBe('horizontal');
  });
});

// ============================================================================
// Feature Parsing Tests
// ============================================================================

describe('Feature Parsing', () => {
  test('parseFeature parses plane correctly', () => {
    const doc = createDocument();
    const element = findFeature(doc.features, 'xy')!;
    const feature = parseFeature(element);
    
    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('plane');
    expect(feature!.id).toBe('xy');
    expect(feature!.name).toBe('XY Plane');
  });

  test('parseFeature parses sketch correctly', () => {
    const doc = createDocument();
    const id = addSketchFeature(doc, 'xy', 'TestSketch');
    const element = findFeature(doc.features, id)!;
    const feature = parseFeature(element);
    
    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('sketch');
    expect((feature as any).plane).toBe('xy');
  });

  test('parseFeature parses extrude correctly', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const extrudeId = addExtrudeFeature(doc, sketchId, 15, 'cut');
    const element = findFeature(doc.features, extrudeId)!;
    const feature = parseFeature(element);
    
    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('extrude');
    expect((feature as any).sketch).toBe(sketchId);
    expect((feature as any).distance).toBe(15);
    expect((feature as any).op).toBe('cut');
  });

  test('parseFeature parses revolve correctly', () => {
    const doc = createDocument();
    const sketchId = addSketchFeature(doc, 'xy');
    const revolveId = addRevolveFeature(doc, sketchId, 'ln1', 180, 'cut');
    const element = findFeature(doc.features, revolveId)!;
    const feature = parseFeature(element);

    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('revolve');
    expect((feature as any).sketch).toBe(sketchId);
    expect((feature as any).axis).toBe('ln1');
    expect((feature as any).angle).toBe(180);
    expect((feature as any).op).toBe('cut');
  });
});
