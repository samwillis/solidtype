/**
 * Model module - Modeling operators
 *
 * Provides modeling operations on top of geom and topo:
 * - Primitives (box, cylinder, etc.)
 * - Datum planes for sketch placement
 * - Sketch profiles for 2D shapes
 * - Extrude and revolve operations
 * - Boolean operations (union, subtract, intersect)
 * - Robust error handling types (ModelingResult, ModelingError)
 */

// Result types and error handling
export * from "./types.js";

// Primitives
export * from "./primitives.js";

// Datum planes
export * from "./planes.js";

// Sketch profiles
export * from "./sketchProfile.js";

// Modeling operations
export * from "./extrude.js";
export * from "./revolve.js";
export * from "./boolean.js";

// P-curve helpers
export * from "./pcurveHelpers.js";
