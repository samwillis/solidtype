/**
 * Helper functions for working with features in the Yjs document
 */

import * as Y from 'yjs';
import type { SolidTypeDoc } from './createDocument';
import type { Feature, FeatureType, SketchData } from '../types/document';
import { generateId, parseVector3, parseNumber, parseBoolean, serializeSketchData, parseSketchData } from './utils';
import { getCounters, updateCounter } from './createDocument';

// ============================================================================
// Feature Finding
// ============================================================================

/**
 * Find a feature by ID
 */
export function findFeature(features: Y.XmlFragment, id: string): Y.XmlElement | null {
  for (let i = 0; i < features.length; i++) {
    const child = features.get(i);
    if (child instanceof Y.XmlElement && child.getAttribute('id') === id) {
      return child;
    }
  }
  return null;
}

/**
 * Get all feature IDs from the document
 */
export function getFeatureIds(features: Y.XmlFragment): string[] {
  const ids: string[] = [];
  for (let i = 0; i < features.length; i++) {
    const child = features.get(i);
    if (child instanceof Y.XmlElement) {
      const id = child.getAttribute('id');
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * Get features array from XmlFragment
 */
export function getFeaturesArray(features: Y.XmlFragment): Y.XmlElement[] {
  const result: Y.XmlElement[] = [];
  for (let i = 0; i < features.length; i++) {
    const child = features.get(i);
    if (child instanceof Y.XmlElement) {
      result.push(child);
    }
  }
  return result;
}

// ============================================================================
// Feature Creation
// ============================================================================

/**
 * Create a new sketch feature
 */
export function addSketchFeature(
  doc: SolidTypeDoc,
  planeId: string,
  name?: string
): string {
  const counters = getCounters(doc);
  const id = generateId('sketch', counters);
  updateCounter(doc, 's', counters['s']);

  const sketch = new Y.XmlElement('sketch');
  sketch.setAttribute('id', id);
  sketch.setAttribute('plane', planeId);
  if (name) {
    sketch.setAttribute('name', name);
  } else {
    sketch.setAttribute('name', `Sketch${counters['s']}`);
  }

  // Store sketch data as attributes (JSON strings)
  sketch.setAttribute('points', '[]');
  sketch.setAttribute('entities', '[]');
  sketch.setAttribute('constraints', '[]');

  doc.features.push([sketch]);
  return id;
}

/**
 * Create a new extrude feature
 */
export function addExtrudeFeature(
  doc: SolidTypeDoc,
  sketchId: string,
  distance: number,
  op: 'add' | 'cut' = 'add',
  direction: 'normal' | 'reverse' = 'normal',
  name?: string
): string {
  const counters = getCounters(doc);
  const id = generateId('extrude', counters);
  updateCounter(doc, 'e', counters['e']);

  const extrude = new Y.XmlElement('extrude');
  extrude.setAttribute('id', id);
  extrude.setAttribute('sketch', sketchId);
  extrude.setAttribute('distance', String(distance));
  extrude.setAttribute('op', op);
  extrude.setAttribute('direction', direction);
  if (name) {
    extrude.setAttribute('name', name);
  } else {
    extrude.setAttribute('name', `Extrude${counters['e']}`);
  }

  doc.features.push([extrude]);
  return id;
}

// ============================================================================
// Sketch Data Manipulation
// ============================================================================

/**
 * Get sketch data from a sketch element
 */
export function getSketchData(sketch: Y.XmlElement): SketchData {
  const pointsJson = sketch.getAttribute('points') || '[]';
  const entitiesJson = sketch.getAttribute('entities') || '[]';
  const constraintsJson = sketch.getAttribute('constraints') || '[]';

  return parseSketchData(pointsJson, entitiesJson, constraintsJson);
}

/**
 * Update sketch data
 */
export function setSketchData(sketch: Y.XmlElement, data: SketchData): void {
  const serialized = serializeSketchData(data);
  sketch.setAttribute('points', serialized.points);
  sketch.setAttribute('entities', serialized.entities);
  sketch.setAttribute('constraints', serialized.constraints);
}

/**
 * Add a point to a sketch
 */
export function addPointToSketch(
  sketch: Y.XmlElement,
  x: number,
  y: number,
  fixed?: boolean
): string {
  const data = getSketchData(sketch);
  
  // Generate ID based on existing points
  const maxNum = data.points.reduce((max, p) => {
    const match = p.id.match(/^pt(\d+)$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  
  const id = `pt${maxNum + 1}`;
  data.points.push({ id, x, y, fixed });
  setSketchData(sketch, data);
  
  return id;
}

/**
 * Add a line to a sketch
 */
export function addLineToSketch(
  sketch: Y.XmlElement,
  startId: string,
  endId: string
): string {
  const data = getSketchData(sketch);
  
  // Generate ID based on existing entities
  const maxNum = data.entities.reduce((max, e) => {
    const match = e.id.match(/^ln(\d+)$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  
  const id = `ln${maxNum + 1}`;
  data.entities.push({ id, type: 'line', start: startId, end: endId });
  setSketchData(sketch, data);
  
  return id;
}

// ============================================================================
// Feature Parsing
// ============================================================================

/**
 * Parse a feature element into a Feature object
 */
export function parseFeature(element: Y.XmlElement): Feature | null {
  const type = element.nodeName as FeatureType;
  const id = element.getAttribute('id');
  if (!id) return null;

  const name = element.getAttribute('name') || undefined;
  const suppressed = parseBoolean(element.getAttribute('suppressed'));

  switch (type) {
    case 'origin':
      return { type: 'origin', id, name, suppressed };

    case 'plane':
      return {
        type: 'plane',
        id,
        name,
        suppressed,
        normal: parseVector3(element.getAttribute('normal') || '0,0,1'),
        origin: parseVector3(element.getAttribute('origin') || '0,0,0'),
        xDir: parseVector3(element.getAttribute('xDir') || '1,0,0'),
      };

    case 'sketch':
      return {
        type: 'sketch',
        id,
        name,
        suppressed,
        plane: element.getAttribute('plane') ?? 'xy',
        data: getSketchData(element),
      };

    case 'extrude':
      return {
        type: 'extrude',
        id,
        name,
        suppressed,
        sketch: element.getAttribute('sketch') ?? '',
        distance: parseNumber(element.getAttribute('distance'), 10),
        op: (element.getAttribute('op') ?? 'add') as 'add' | 'cut',
        direction: (element.getAttribute('direction') ?? 'normal') as 'normal' | 'reverse',
      };

    case 'revolve':
      return {
        type: 'revolve',
        id,
        name,
        suppressed,
        sketch: element.getAttribute('sketch') ?? '',
        angle: parseNumber(element.getAttribute('angle'), 360),
        op: (element.getAttribute('op') ?? 'add') as 'add' | 'cut',
        axisStart: [0, 0] as [number, number],
        axisEnd: [1, 0] as [number, number],
      };

    default:
      return null;
  }
}
