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

// geom: curves & surfaces (Phase 2)
export * from './geom/curve2d.js';
export * from './geom/intersect2d.js';
export * from './geom/curve3d.js';
export * from './geom/surface.js';

// topo: BREP topology (Phase 3)
export * from './topo/index.js';

// mesh: tessellation (Phase 4)
export * from './mesh/index.js';

// model: modeling operators (Phase 4+)
export * from './model/index.js';

// naming: persistent naming subsystem (Phase 6)
export * from './naming/index.js';
