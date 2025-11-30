/**
 * @solidtype/core - Functional, data-oriented CAD kernel
 * 
 * This package provides the core functional kernel for SolidType:
 * - num: numeric utilities, tolerances, predicates
 * - geom: curves & surfaces
 * - topo: BREP topology
 * - model: modeling operators
 * - naming: persistent naming
 * - sketch: sketch representation & constraint solver
 * - mesh: tessellation
 */

// num: numeric backbone & tolerances (Phase 1)
export * from './num/vec2.js';
export * from './num/vec3.js';
export * from './num/mat4.js';
export * from './num/tolerance.js';
export * from './num/predicates.js';
export * from './num/rootFinding.js';
