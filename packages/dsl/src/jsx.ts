/**
 * SolidType JSX Factory
 * 
 * This module provides the JSX factory function `sjsx` that transforms
 * JSX syntax into ModelNode trees. It's designed to be used with TypeScript's
 * JSX compilation with:
 * 
 *   jsxFactory: "sjsx"
 *   jsxFragmentFactory: "Fragment"
 * 
 * Example:
 *   <Model>
 *     <Sketch id="base" plane="XY">
 *       <Rectangle width={10} height={5} />
 *     </Sketch>
 *     <Extrude sketch="base" distance={20} />
 *   </Model>
 * 
 * Compiles to sjsx() calls that produce a ModelNode tree.
 */

import type {
  DSLNode,
  ModelNode,
  SketchNode,
  ExtrudeNode,
  RevolveNode,
  SweepNode,
  BooleanNode,
  GroupNode,
  SketchEntityNode,
  RectangleNode,
  CircleNode,
  LineNode,
  ArcNode,
  PlaneRef,
  AxisRef,
  FeatureNode,
} from './types.js';
import type { Vec2, Vec3 } from '@solidtype/core';

// ============================================================================
// JSX Element Type Definitions
// ============================================================================

/**
 * Props for <Model> element
 */
export interface ModelProps {
  children?: FeatureNode | FeatureNode[];
}

/**
 * Props for <Sketch> element
 */
export interface SketchProps {
  id: string;
  plane: PlaneRef;
  children?: SketchEntityNode | SketchEntityNode[];
}

/**
 * Props for <Rectangle> element
 */
export interface RectangleProps {
  id?: string;
  width: number;
  height: number;
  centerX?: number;
  centerY?: number;
}

/**
 * Props for <Circle> element
 */
export interface CircleProps {
  id?: string;
  radius: number;
  centerX?: number;
  centerY?: number;
}

/**
 * Props for <Line> element
 */
export interface LineProps {
  id?: string;
  p1: Vec2;
  p2: Vec2;
}

/**
 * Props for <Arc> element
 */
export interface ArcProps {
  id?: string;
  center: Vec2;
  radius: number;
  startAngle: number;
  endAngle: number;
  ccw?: boolean;
}

/**
 * Props for <Extrude> element
 */
export interface ExtrudeProps {
  id?: string;
  sketch: string;
  distance: number;
  direction?: Vec3;
  op?: 'add' | 'cut';
}

/**
 * Props for <Revolve> element
 */
export interface RevolveProps {
  id?: string;
  sketch: string;
  axis: AxisRef;
  angle?: number;
  op?: 'add' | 'cut';
}

/**
 * Props for <Sweep> element
 */
export interface SweepProps {
  id?: string;
  profile: string;
  path: string;
  op?: 'add' | 'cut';
}

/**
 * Props for <Boolean> element
 */
export interface BooleanProps {
  id?: string;
  operation: 'union' | 'subtract' | 'intersect';
  bodies: string[];
}

/**
 * Props for <Group> element
 */
export interface GroupProps {
  id?: string;
  name?: string;
  children?: FeatureNode | FeatureNode[];
}

// ============================================================================
// Component Type Registry
// ============================================================================

/**
 * Map of component names to their prop types
 */
export interface DSLComponents {
  Model: ModelProps;
  Sketch: SketchProps;
  Rectangle: RectangleProps;
  Circle: CircleProps;
  Line: LineProps;
  Arc: ArcProps;
  Extrude: ExtrudeProps;
  Revolve: RevolveProps;
  Sweep: SweepProps;
  Boolean: BooleanProps;
  Group: GroupProps;
}

export type DSLComponentName = keyof DSLComponents;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize children to an array
 */
function normalizeChildren<T>(children: unknown): T[] {
  if (children === undefined || children === null) {
    return [];
  }
  if (Array.isArray(children)) {
    return (children as unknown[]).flat().filter((c): c is T => c !== null && c !== undefined) as T[];
  }
  return [children as T];
}

// ============================================================================
// JSX Factory
// ============================================================================

/**
 * JSX factory function for SolidType DSL
 * 
 * This is called by the TypeScript compiler when processing JSX syntax.
 * 
 * @param type - The element type (component name as string)
 * @param props - The element props
 * @param children - Child elements (passed via rest args by some JSX transforms)
 */
export function sjsx(
  type: DSLComponentName | string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): DSLNode {
  const allProps: Record<string, unknown> = props ?? {};
  
  // Handle children from props or rest args
  let nodeChildren: unknown = allProps.children ?? children;
  if (children.length > 0 && !allProps.children) {
    nodeChildren = children.length === 1 ? children[0] : children;
  }

  switch (type) {
    case 'Model': {
      const modelChildren = normalizeChildren<FeatureNode>(nodeChildren);
      return {
        kind: 'Model',
        children: modelChildren,
      } as ModelNode;
    }

    case 'Sketch': {
      const sketchChildren = normalizeChildren<SketchEntityNode>(nodeChildren);
      return {
        kind: 'Sketch',
        id: allProps.id as string,
        plane: allProps.plane as PlaneRef,
        children: sketchChildren,
      } as SketchNode;
    }

    case 'Rectangle': {
      return {
        kind: 'Rectangle',
        id: allProps.id as string | undefined,
        width: allProps.width as number,
        height: allProps.height as number,
        centerX: (allProps.centerX as number | undefined) ?? 0,
        centerY: (allProps.centerY as number | undefined) ?? 0,
      } as RectangleNode;
    }

    case 'Circle': {
      return {
        kind: 'Circle',
        id: allProps.id as string | undefined,
        radius: allProps.radius as number,
        centerX: (allProps.centerX as number | undefined) ?? 0,
        centerY: (allProps.centerY as number | undefined) ?? 0,
      } as CircleNode;
    }

    case 'Line': {
      return {
        kind: 'Line',
        id: allProps.id as string | undefined,
        p1: allProps.p1 as Vec2,
        p2: allProps.p2 as Vec2,
      } as LineNode;
    }

    case 'Arc': {
      return {
        kind: 'Arc',
        id: allProps.id as string | undefined,
        center: allProps.center as Vec2,
        radius: allProps.radius as number,
        startAngle: allProps.startAngle as number,
        endAngle: allProps.endAngle as number,
        ccw: (allProps.ccw as boolean | undefined) ?? true,
      } as ArcNode;
    }

    case 'Extrude': {
      return {
        kind: 'Extrude',
        id: allProps.id as string | undefined,
        sketch: allProps.sketch as string,
        distance: allProps.distance as number,
        direction: allProps.direction as Vec3 | undefined,
        op: (allProps.op as 'add' | 'cut' | undefined) ?? 'add',
      } as ExtrudeNode;
    }

    case 'Revolve': {
      return {
        kind: 'Revolve',
        id: allProps.id as string | undefined,
        sketch: allProps.sketch as string,
        axis: allProps.axis as AxisRef,
        angle: (allProps.angle as number | undefined) ?? Math.PI * 2,
        op: (allProps.op as 'add' | 'cut' | undefined) ?? 'add',
      } as RevolveNode;
    }

    case 'Sweep': {
      return {
        kind: 'Sweep',
        id: allProps.id as string | undefined,
        profile: allProps.profile as string,
        path: allProps.path as string,
        op: (allProps.op as 'add' | 'cut' | undefined) ?? 'add',
      } as SweepNode;
    }

    case 'Boolean': {
      return {
        kind: 'Boolean',
        id: allProps.id as string | undefined,
        operation: allProps.operation as 'union' | 'subtract' | 'intersect',
        bodies: allProps.bodies as string[],
      } as BooleanNode;
    }

    case 'Group': {
      const groupChildren = normalizeChildren<FeatureNode>(nodeChildren);
      return {
        kind: 'Group',
        id: allProps.id as string | undefined,
        name: allProps.name as string | undefined,
        children: groupChildren,
      } as GroupNode;
    }

    default:
      throw new Error(`Unknown DSL element type: ${type}`);
  }
}

/**
 * Fragment support (for grouping without a wrapper element)
 */
export function Fragment({ children }: { children?: DSLNode[] }): DSLNode[] {
  return children ?? [];
}

// ============================================================================
// Component Functions (for direct use without JSX)
// ============================================================================

export function Model(props: ModelProps): ModelNode {
  return sjsx('Model', props as unknown as Record<string, unknown>) as ModelNode;
}

export function Sketch(props: SketchProps): SketchNode {
  return sjsx('Sketch', props as unknown as Record<string, unknown>) as SketchNode;
}

export function Rectangle(props: RectangleProps): RectangleNode {
  return sjsx('Rectangle', props as unknown as Record<string, unknown>) as RectangleNode;
}

export function Circle(props: CircleProps): CircleNode {
  return sjsx('Circle', props as unknown as Record<string, unknown>) as CircleNode;
}

export function Line(props: LineProps): LineNode {
  return sjsx('Line', props as unknown as Record<string, unknown>) as LineNode;
}

export function Arc(props: ArcProps): ArcNode {
  return sjsx('Arc', props as unknown as Record<string, unknown>) as ArcNode;
}

export function Extrude(props: ExtrudeProps): ExtrudeNode {
  return sjsx('Extrude', props as unknown as Record<string, unknown>) as ExtrudeNode;
}

export function Revolve(props: RevolveProps): RevolveNode {
  return sjsx('Revolve', props as unknown as Record<string, unknown>) as RevolveNode;
}

export function Sweep(props: SweepProps): SweepNode {
  return sjsx('Sweep', props as unknown as Record<string, unknown>) as SweepNode;
}

export function Boolean(props: BooleanProps): BooleanNode {
  return sjsx('Boolean', props as unknown as Record<string, unknown>) as BooleanNode;
}

export function Group(props: GroupProps): GroupNode {
  return sjsx('Group', props as unknown as Record<string, unknown>) as GroupNode;
}
