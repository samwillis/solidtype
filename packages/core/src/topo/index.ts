/**
 * BREP Topology module
 * 
 * This module provides the boundary representation (BREP) topology layer:
 * - handles.ts: Branded handle types for type-safe references
 * - model.ts: Struct-of-arrays storage and creation/mutation API
 * - validate.ts: Topology validation
 * - heal.ts: Topology healing (merge vertices, collapse edges, etc.)
 */

// Re-export everything from the topology module
export * from './handles.js';
export * from './model.js';
export * from './validate.js';
export * from './heal.js';
