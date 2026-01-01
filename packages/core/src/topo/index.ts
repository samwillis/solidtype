/**
 * BREP Topology module
 *
 * This module provides the boundary representation (BREP) topology layer:
 * - handles.ts: Branded handle types for type-safe references
 * - TopoModel.ts: OO BREP model class
 * - validate.ts: Topology validation
 * - heal.ts: Topology healing (merge vertices, collapse edges, etc.)
 */

// Re-export handles
export * from "./handles.js";

// Export the OO TopoModel class
export { TopoModel, EntityFlags, type ModelStats, type PCurve } from "./TopoModel.js";

// Re-export validation and healing
export * from "./validate.js";
export * from "./heal.js";
export * from "./sameParameter.js";
