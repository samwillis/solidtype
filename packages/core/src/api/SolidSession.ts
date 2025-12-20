/**
 * SolidSession - main entry point for modeling operations
 * 
 * Provides an object-oriented interface for creating and manipulating solid models.
 */

import type { Vec3 } from '../num/vec3.js';
import type { NumericContext } from '../num/tolerance.js';
import { createNumericContext } from '../num/tolerance.js';
import type { TopoModel } from '../topo/model.js';
import { createEmptyModel } from '../topo/model.js';
import type { PersistentRef, ResolveResult } from '../naming/types.js';
import type { NamingStrategy } from '../naming/evolution.js';
import { createNamingStrategy } from '../naming/evolution.js';
import type { DatumPlane } from '../model/planes.js';
import { createDatumPlaneFromNormal, XY_PLANE, YZ_PLANE, ZX_PLANE } from '../model/planes.js';
import type { SketchProfile } from '../model/sketchProfile.js';
import { createRectangleProfile, createCircleProfile } from '../model/sketchProfile.js';
import type { ExtrudeOptions, ExtrudeResult } from '../model/extrude.js';
import { extrude } from '../model/extrude.js';
import type { RevolveOptions, RevolveResult } from '../model/revolve.js';
import { revolve } from '../model/revolve.js';
import type { BooleanOptions, BooleanResult } from '../model/boolean.js';
import { booleanOperation } from '../model/boolean.js';
import { Body } from './Body.js';
import { Sketch } from './Sketch.js';

/**
 * SolidSession - main entry point for modeling operations
 */
export class SolidSession {
  private model: TopoModel;
  private naming: NamingStrategy;
  
  constructor(ctx?: NumericContext) {
    const numericCtx = ctx ?? createNumericContext();
    this.model = createEmptyModel(numericCtx);
    this.naming = createNamingStrategy();
  }
  
  /**
   * Get the underlying topology model
   * @internal For advanced use only
   */
  getModel(): TopoModel {
    return this.model;
  }
  
  /**
   * Get the naming strategy
   * @internal For advanced use only
   */
  getNamingStrategy(): NamingStrategy {
    return this.naming;
  }
  
  /**
   * Create a datum plane
   */
  createDatumPlane(origin: Vec3, normal: Vec3, xDir?: Vec3): DatumPlane {
    return createDatumPlaneFromNormal('custom', origin, normal, xDir);
  }
  
  /**
   * Get the XY datum plane
   */
  getXYPlane(): DatumPlane {
    return XY_PLANE;
  }
  
  /**
   * Get the YZ datum plane
   */
  getYZPlane(): DatumPlane {
    return YZ_PLANE;
  }
  
  /**
   * Get the ZX datum plane
   */
  getZXPlane(): DatumPlane {
    return ZX_PLANE;
  }
  
  /**
   * Create a new sketch on a datum plane
   * 
   * @param plane The datum plane for the sketch
   * @param name Optional name for the sketch
   * @returns A new Sketch instance
   */
  createSketch(plane: DatumPlane, name?: string): Sketch {
    return new Sketch(plane, name);
  }
  
  /**
   * Extrude a sketch to create a body
   * 
   * @param sketch The solved sketch to extrude
   * @param options Extrusion options (distance, direction, operation)
   * @returns Extrusion result with the created body
   */
  extrudeSketch(
    sketch: Sketch,
    options: Omit<ExtrudeOptions, 'namingStrategy'>
  ): ExtrudeResult & { body?: Body } {
    const profile = sketch.toProfile();
    if (!profile) {
      return {
        success: false,
        error: 'Could not convert sketch to profile - ensure sketch forms closed loops',
      };
    }
    return this.extrude(profile, options);
  }
  
  /**
   * Create a rectangular sketch profile
   */
  createRectangleProfile(
    plane: DatumPlane,
    width: number,
    height: number,
    centerX: number = 0,
    centerY: number = 0
  ): SketchProfile {
    return createRectangleProfile(plane, width, height, centerX, centerY);
  }
  
  /**
   * Create a circular sketch profile
   */
  createCircleProfile(
    plane: DatumPlane,
    radius: number,
    centerX: number = 0,
    centerY: number = 0
  ): SketchProfile {
    return createCircleProfile(plane, radius, centerX, centerY);
  }
  
  /**
   * Extrude a profile to create a body
   */
  extrude(profile: SketchProfile, options: Omit<ExtrudeOptions, 'namingStrategy'>): ExtrudeResult & { body?: Body } {
    const result = extrude(this.model, profile, {
      ...options,
      namingStrategy: this.naming,
    });
    
    return {
      ...result,
      body: result.body !== undefined ? new Body(this, result.body) : undefined,
    } as ExtrudeResult & { body?: Body };
  }
  
  /**
   * Revolve a profile to create a body
   */
  revolve(profile: SketchProfile, options: Omit<RevolveOptions, 'namingStrategy'>): RevolveResult & { body?: Body } {
    const result = revolve(this.model, profile, {
      ...options,
      namingStrategy: this.naming,
    });
    
    return {
      ...result,
      body: result.body !== undefined ? new Body(this, result.body) : undefined,
    } as RevolveResult & { body?: Body };
  }
  
  /**
   * Perform a boolean operation on two bodies
   */
  boolean(
    bodyA: Body,
    bodyB: Body,
    options: Omit<BooleanOptions, 'namingStrategy'>
  ): BooleanResult & { body?: Body } {
    const result = booleanOperation(this.model, bodyA.id, bodyB.id, {
      ...options,
      namingStrategy: this.naming,
    });
    
    return {
      ...result,
      body: result.body !== undefined ? new Body(this, result.body) : undefined,
    } as BooleanResult & { body?: Body };
  }
  
  /**
   * Union two bodies
   */
  union(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body } {
    return this.boolean(bodyA, bodyB, { operation: 'union' });
  }
  
  /**
   * Subtract bodyB from bodyA
   */
  subtract(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body } {
    return this.boolean(bodyA, bodyB, { operation: 'subtract' });
  }
  
  /**
   * Intersect two bodies
   */
  intersect(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body } {
    return this.boolean(bodyA, bodyB, { operation: 'intersect' });
  }
  
  /**
   * Clear all naming data (useful for testing)
   */
  clearNaming(): void {
    this.naming.clear();
  }
  
  /**
   * Resolve a PersistentRef
   */
  resolve(ref: PersistentRef): ResolveResult {
    return this.naming.resolve(ref, this.model);
  }
}
