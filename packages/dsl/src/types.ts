/**
 * SolidType DSL Types
 * 
 * Defines the structure of the model tree produced by JSX DSL code.
 * These types represent a declarative description of a parametric model,
 * which is then interpreted by the modeling runtime to produce actual geometry.
 */

import type { Vec2, Vec3 } from '@solidtype/core';

// ============================================================================
// Plane References
// ============================================================================

/**
 * Reference to a datum plane by name
 */
export type StandardPlane = 'XY' | 'YZ' | 'ZX';

/**
 * Custom plane definition
 */
export interface CustomPlane {
  origin: Vec3;
  normal: Vec3;
  xDir?: Vec3;
}

/**
 * Plane reference - either a standard plane or custom definition
 */
export type PlaneRef = StandardPlane | CustomPlane;

// ============================================================================
// Sketch Entity Nodes (children of Sketch)
// ============================================================================

/**
 * Rectangle entity in a sketch
 */
export interface RectangleNode {
  kind: 'Rectangle';
  id?: string;
  width: number;
  height: number;
  centerX?: number;
  centerY?: number;
}

/**
 * Circle entity in a sketch
 */
export interface CircleNode {
  kind: 'Circle';
  id?: string;
  radius: number;
  centerX?: number;
  centerY?: number;
}

/**
 * Line entity in a sketch
 */
export interface LineNode {
  kind: 'Line';
  id?: string;
  p1: Vec2;
  p2: Vec2;
}

/**
 * Arc entity in a sketch
 */
export interface ArcNode {
  kind: 'Arc';
  id?: string;
  center: Vec2;
  radius: number;
  startAngle: number;
  endAngle: number;
  ccw?: boolean;
}

/**
 * Union of all sketch entity types
 */
export type SketchEntityNode = RectangleNode | CircleNode | LineNode | ArcNode;

// ============================================================================
// Axis References
// ============================================================================

/**
 * Axis defined relative to sketch
 */
export interface SketchAxisRef {
  kind: 'sketchAxis';
  axis: 'x' | 'y';
  offset?: number;
}

/**
 * Axis defined by a custom line in sketch space
 */
export interface CustomAxisRef {
  kind: 'customAxis';
  origin: Vec2;
  direction: Vec2;
}

/**
 * Union of axis reference types
 */
export type AxisRef = SketchAxisRef | CustomAxisRef;

// ============================================================================
// Model Nodes (main DSL elements)
// ============================================================================

/**
 * Root Model node - required as the root of every Part
 */
export interface ModelNode {
  kind: 'Model';
  children: FeatureNode[];
}

/**
 * Sketch node - defines a 2D sketch on a plane
 */
export interface SketchNode {
  kind: 'Sketch';
  id: string;
  plane: PlaneRef;
  children: SketchEntityNode[];
}

/**
 * Extrude node - extrudes a sketch profile
 */
export interface ExtrudeNode {
  kind: 'Extrude';
  id?: string;
  sketch: string; // Reference to sketch ID
  distance: number;
  direction?: Vec3; // Optional, defaults to plane normal
  op?: 'add' | 'cut';
}

/**
 * Revolve node - revolves a sketch profile around an axis
 */
export interface RevolveNode {
  kind: 'Revolve';
  id?: string;
  sketch: string; // Reference to sketch ID
  axis: AxisRef;
  angle?: number; // Radians, default 2π
  op?: 'add' | 'cut';
}

/**
 * Sweep node - sweeps a profile along a path (MVP)
 */
export interface SweepNode {
  kind: 'Sweep';
  id?: string;
  profile: string; // Reference to profile sketch ID
  path: string;    // Reference to path sketch ID or edge
  op?: 'add' | 'cut';
}

/**
 * Boolean node - explicit boolean operation between bodies
 */
export interface BooleanNode {
  kind: 'Boolean';
  id?: string;
  operation: 'union' | 'subtract' | 'intersect';
  bodies: string[]; // References to body IDs (from extrude/revolve results)
}

/**
 * Group node - logical grouping of features
 */
export interface GroupNode {
  kind: 'Group';
  id?: string;
  name?: string;
  children: FeatureNode[];
}

/**
 * Union of all feature node types
 */
export type FeatureNode = 
  | SketchNode 
  | ExtrudeNode 
  | RevolveNode 
  | SweepNode 
  | BooleanNode 
  | GroupNode;

/**
 * Union of all DSL node types
 */
export type DSLNode = ModelNode | FeatureNode | SketchEntityNode;

// ============================================================================
// Build Result Types
// ============================================================================

/**
 * Handle to a built body in the kernel
 */
export interface BuiltBodyHandle {
  id: string;
  bodyId: number; // Kernel body ID
  sourceFeatureId: string;
}

/**
 * Feature checkpoint for breakpoint support
 */
export interface FeatureCheckpoint {
  id: string;
  kind: FeatureNode['kind'];
  label: string;
  parentId?: string;
  // Path into the DSL tree for navigation
  dslPath: string[];
  // Whether this checkpoint has valid geometry
  hasGeometry: boolean;
}

/**
 * Modeling error information
 */
export interface ModelingError {
  featureId?: string;
  message: string;
  details?: string;
}

/**
 * Result of building a model from DSL
 */
export interface ModelBuildResult {
  success: boolean;
  bodies: BuiltBodyHandle[];
  checkpoints: FeatureCheckpoint[];
  errors: ModelingError[];
  /** Last checkpoint with valid geometry (for partial builds) */
  lastValidCheckpointId?: string;
}

// ============================================================================
// Part Function Types
// ============================================================================

/**
 * Props type that Part functions receive
 * Users extend this with their own parameter types
 */
export interface PartPropsBase {
  [key: string]: number | string | boolean | undefined;
}

/**
 * A Part function - the main user-authored model definition
 */
export type PartFunction<P extends PartPropsBase = PartPropsBase> = 
  (props: P) => ModelNode;
