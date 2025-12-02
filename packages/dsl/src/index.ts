/**
 * @solidtype/dsl - JSX DSL for SolidType modeling
 * 
 * This package provides a declarative JSX-based DSL for defining
 * parametric CAD models. The DSL is interpreted to produce geometry
 * using the @solidtype/core kernel.
 * 
 * Usage example:
 * 
 * ```tsx
 * /** @jsx sjsx *\/
 * import { sjsx, Model, Sketch, Rectangle, Extrude } from '@solidtype/dsl';
 * 
 * export function Part(props: { width: number; height: number; depth: number }) {
 *   return (
 *     <Model>
 *       <Sketch id="base" plane="XY">
 *         <Rectangle width={props.width} height={props.height} />
 *       </Sketch>
 *       <Extrude sketch="base" distance={props.depth} />
 *     </Model>
 *   );
 * }
 * ```
 */

// Types
export * from './types.js';

// JSX factory and components
export {
  sjsx,
  Fragment,
  Model,
  Sketch,
  Rectangle,
  Circle,
  Line,
  Arc,
  Extrude,
  Revolve,
  Sweep,
  Boolean,
  Group,
} from './jsx.js';

export type {
  ModelProps,
  SketchProps,
  RectangleProps,
  CircleProps,
  LineProps,
  ArcProps,
  ExtrudeProps,
  RevolveProps,
  SweepProps,
  BooleanProps,
  GroupProps,
  DSLComponents,
  DSLComponentName,
} from './jsx.js';

// Interpreter
export {
  interpretModel,
  interpretModelWithMeshes,
  getMeshForBody,
} from './interpreter.js';
