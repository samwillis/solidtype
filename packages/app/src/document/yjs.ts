/**
 * Yjs utilities and helpers for the document model
 *
 * See YJS-DOC-MODEL-PLAN.md for full specification.
 */

import * as Y from 'yjs';

// ============================================================================
// UUID Helper
// ============================================================================

/**
 * Generate a UUID v4
 * Works in both browser and Node.js environments
 */
export function uuid(): string {
  const c = globalThis.crypto as { randomUUID?: () => string };
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  // This implementation matches UUID v4 format
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Get the root map from a Y.Doc
 * All model state must live under this map
 */
export function getRoot(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap('root');
}

/**
 * Get meta map from root
 */
export function getMeta(root: Y.Map<unknown>): Y.Map<unknown> {
  return root.get('meta') as Y.Map<unknown>;
}

/**
 * Get state map from root
 */
export function getState(root: Y.Map<unknown>): Y.Map<unknown> {
  return root.get('state') as Y.Map<unknown>;
}

/**
 * Get featuresById map from root
 */
export function getFeaturesById(root: Y.Map<unknown>): Y.Map<Y.Map<unknown>> {
  return root.get('featuresById') as Y.Map<Y.Map<unknown>>;
}

/**
 * Get featureOrder array from root
 */
export function getFeatureOrder(root: Y.Map<unknown>): Y.Array<string> {
  return root.get('featureOrder') as Y.Array<string>;
}

// ============================================================================
// Ghost State Prevention (Dev-only)
// ============================================================================

/**
 * Forbidden top-level shared type names
 * These should NOT exist at top level - everything goes under 'root'
 */
const FORBIDDEN_TOP_LEVEL_NAMES = ['meta', 'state', 'features', 'counters'];

/**
 * Check for ghost state (top-level shared types that shouldn't exist)
 * Throws in development mode if ghost state is detected
 *
 * @param ydoc The Y.Doc to check
 * @param throwOnError Whether to throw (default: true in dev)
 */
export function assertNoGhostState(ydoc: Y.Doc, throwOnError = true): string[] {
  const errors: string[] = [];

  // Access the internal share map directly to check for existing types
  // without accidentally creating them
  const shareMap = (ydoc as unknown as { share: Map<string, unknown> }).share;

  for (const name of FORBIDDEN_TOP_LEVEL_NAMES) {
    if (shareMap.has(name)) {
      errors.push(`Ghost state detected: top-level shared type '${name}' exists`);
    }
  }

  // Check for any top-level types other than 'root'
  for (const name of shareMap.keys()) {
    if (name !== 'root' && !FORBIDDEN_TOP_LEVEL_NAMES.includes(name)) {
      errors.push(`Unknown top-level shared type '${name}' - only 'root' is allowed`);
    }
  }

  if (errors.length > 0 && throwOnError) {
    throw new Error(`Ghost state check failed:\n${errors.join('\n')}`);
  }

  return errors;
}

// ============================================================================
// Y.Map Creation Helpers
// ============================================================================

/**
 * Create a feature Y.Map from a plain object
 * IMPORTANT: The returned map must be inserted into a tracked parent
 * BEFORE any further mutations (for proper undo tracking)
 */
export function createFeatureMap(): Y.Map<unknown> {
  return new Y.Map();
}

/**
 * Set all properties on a Y.Map from a plain object
 * Should be called AFTER the map is integrated into a tracked parent
 */
export function setMapProperties(map: Y.Map<unknown>, props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      map.set(key, value);
    }
  }
}

/**
 * Create a nested Y.Map for sketch data (pointsById, entitiesById, constraintsById)
 */
export function createSketchDataMap(): Y.Map<unknown> {
  const data = new Y.Map();
  data.set('pointsById', new Y.Map());
  data.set('entitiesById', new Y.Map());
  data.set('constraintsById', new Y.Map());
  return data;
}

/**
 * Get pointsById from sketch data map
 */
export function getPointsById(dataMap: Y.Map<unknown>): Y.Map<Y.Map<unknown>> {
  return dataMap.get('pointsById') as Y.Map<Y.Map<unknown>>;
}

/**
 * Get entitiesById from sketch data map
 */
export function getEntitiesById(dataMap: Y.Map<unknown>): Y.Map<Y.Map<unknown>> {
  return dataMap.get('entitiesById') as Y.Map<Y.Map<unknown>>;
}

/**
 * Get constraintsById from sketch data map
 */
export function getConstraintsById(dataMap: Y.Map<unknown>): Y.Map<Y.Map<unknown>> {
  return dataMap.get('constraintsById') as Y.Map<Y.Map<unknown>>;
}

// ============================================================================
// Feature Map to Plain Object Conversion
// ============================================================================

/**
 * Convert a Y.Map to a plain object (shallow)
 */
export function mapToObject(map: Y.Map<unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  map.forEach((value, key) => {
    if (value instanceof Y.Map) {
      obj[key] = mapToObject(value);
    } else if (value instanceof Y.Array) {
      obj[key] = value.toArray();
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

/**
 * Convert sketch data Y.Map to SketchData plain object
 */
export function sketchDataMapToObject(dataMap: Y.Map<unknown>): {
  pointsById: Record<string, unknown>;
  entitiesById: Record<string, unknown>;
  constraintsById: Record<string, unknown>;
} {
  const pointsById: Record<string, unknown> = {};
  const entitiesById: Record<string, unknown> = {};
  const constraintsById: Record<string, unknown> = {};

  const pointsMap = dataMap.get('pointsById') as Y.Map<Y.Map<unknown>> | undefined;
  if (pointsMap) {
    pointsMap.forEach((pointMap, id) => {
      pointsById[id] = mapToObject(pointMap);
    });
  }

  const entitiesMap = dataMap.get('entitiesById') as Y.Map<Y.Map<unknown>> | undefined;
  if (entitiesMap) {
    entitiesMap.forEach((entityMap, id) => {
      entitiesById[id] = mapToObject(entityMap);
    });
  }

  const constraintsMap = dataMap.get('constraintsById') as Y.Map<Y.Map<unknown>> | undefined;
  if (constraintsMap) {
    constraintsMap.forEach((constraintMap, id) => {
      constraintsById[id] = mapToObject(constraintMap);
    });
  }

  return { pointsById, entitiesById, constraintsById };
}

// ============================================================================
// Deterministic Iteration (for worker/solver)
// ============================================================================

/**
 * Get sorted keys from a Y.Map (lexicographic order)
 * Use this in worker/solver for deterministic iteration
 */
export function getSortedKeys<T>(map: Y.Map<T>): string[] {
  const keys: string[] = [];
  map.forEach((_, key) => keys.push(key));
  return keys.sort();
}

/**
 * Iterate over a Y.Map in deterministic order (sorted keys)
 * Use this in worker/solver for deterministic behavior
 */
export function* iterateSorted<T>(map: Y.Map<T>): Generator<[string, T]> {
  const sortedKeys = getSortedKeys(map);
  for (const key of sortedKeys) {
    yield [key, map.get(key) as T];
  }
}
