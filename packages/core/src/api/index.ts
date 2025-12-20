/**
 * Object-Oriented API for SolidType
 * 
 * This module provides ergonomic class-based APIs for the SolidType CAD kernel:
 * - SolidSession - main entry point for modeling operations
 * - Body, Face, Edge - wrappers for topological entities
 * - Sketch - 2D sketch with constraint solving
 * - Integration with persistent naming via PersistentRef
 */

export * from './types.js';
export * from './Face.js';
export * from './Edge.js';
export * from './Body.js';
export * from './Sketch.js';
export * from './SolidSession.js';
