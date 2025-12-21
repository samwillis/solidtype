/**
 * Document utilities for parsing, serialization, and ID generation
 */

import type { SketchData, SketchPoint, SketchEntity, SketchConstraint } from '../types/document';

/**
 * ID counters for generating unique IDs
 */
export interface IdCounters {
  [prefix: string]: number;
}

// ============================================================================
// Vector Parsing/Serialization
// ============================================================================

/**
 * Parse a comma-separated vector string to a number array
 */
export function parseVector(str: string): number[] {
  return str.split(',').map(s => parseFloat(s.trim()));
}

/**
 * Parse a vector string to a 3-component tuple
 */
export function parseVector3(str: string): [number, number, number] {
  const parts = parseVector(str);
  if (parts.length !== 3) {
    throw new Error(`Expected 3 components, got ${parts.length}`);
  }
  return parts as [number, number, number];
}

/**
 * Serialize a number array to a comma-separated string
 */
export function serializeVector(vec: number[]): string {
  return vec.join(',');
}

// ============================================================================
// ID Generation
// ============================================================================

const TYPE_PREFIXES: Record<string, string> = {
  sketch: 's',
  extrude: 'e',
  revolve: 'r',
  fillet: 'f',
  chamfer: 'c',
  boolean: 'b',
  plane: 'p',
  // Points, lines, arcs in sketches
  point: 'pt',
  line: 'ln',
  arc: 'ar',
  constraint: 'cn',
};

/**
 * Generate a unique ID for a feature or entity
 */
export function generateId(type: string, counters: IdCounters): string {
  const prefix = TYPE_PREFIXES[type] || type[0].toLowerCase();
  const count = (counters[prefix] || 0) + 1;
  counters[prefix] = count;
  return `${prefix}${count}`;
}

/**
 * Extract counter values from existing IDs
 */
export function extractCounters(ids: string[]): IdCounters {
  const counters: IdCounters = {};
  
  for (const id of ids) {
    // Match pattern like "s1", "e23", "pt5"
    const match = id.match(/^([a-z]+)(\d+)$/);
    if (match) {
      const [, prefix, numStr] = match;
      const num = parseInt(numStr, 10);
      if (!counters[prefix] || counters[prefix] < num) {
        counters[prefix] = num;
      }
    }
  }
  
  return counters;
}

// ============================================================================
// Sketch Data Parsing
// ============================================================================

/**
 * Parse sketch data from XML element content
 */
export function parseSketchData(
  pointsJson: string,
  entitiesJson: string,
  constraintsJson: string
): SketchData {
  return {
    points: pointsJson ? JSON.parse(pointsJson) as SketchPoint[] : [],
    entities: entitiesJson ? JSON.parse(entitiesJson) as SketchEntity[] : [],
    constraints: constraintsJson ? JSON.parse(constraintsJson) as SketchConstraint[] : [],
  };
}

/**
 * Serialize sketch data to JSON strings
 */
export function serializeSketchData(data: SketchData): {
  points: string;
  entities: string;
  constraints: string;
} {
  return {
    points: JSON.stringify(data.points),
    entities: JSON.stringify(data.entities),
    constraints: JSON.stringify(data.constraints),
  };
}

// ============================================================================
// Attribute Parsing
// ============================================================================

/**
 * Parse a boolean attribute value
 */
export function parseBoolean(value: string | null | undefined): boolean {
  return value === 'true';
}

/**
 * Parse a number attribute value
 */
export function parseNumber(value: string | null | undefined, defaultValue: number = 0): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}
