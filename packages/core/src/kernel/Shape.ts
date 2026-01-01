/**
 * Shape Wrapper with Memory Management
 *
 * OCCT objects must be manually deleted to prevent memory leaks.
 * This wrapper provides safe memory management and lifecycle control.
 */

import { getOC } from "./init.js";
import type { TopoDS_Shape } from "opencascade.js";
// Type declarations are in ./opencascade.d.ts

/**
 * Wrapper for TopoDS_Shape that handles memory management.
 *
 * IMPORTANT: Always use Shape.dispose() when done, or use
 * Shape.using() for automatic cleanup.
 */
export class Shape {
  private _shape: TopoDS_Shape;
  private _disposed = false;

  constructor(shape: TopoDS_Shape) {
    this._shape = shape;
  }

  get raw(): TopoDS_Shape {
    if (this._disposed) {
      throw new Error(`Shape has been disposed`);
    }
    return this._shape;
  }

  get isNull(): boolean {
    return this._shape.IsNull();
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Clone this shape (deep copy).
   */
  clone(): Shape {
    const oc = getOC();
    const copy = new oc.BRepBuilderAPI_Copy_2(this._shape, true, false);
    const result = new Shape(copy.Shape());
    copy.delete();
    return result;
  }

  /**
   * Free the underlying OCCT memory.
   */
  dispose(): void {
    if (!this._disposed) {
      this._shape.delete();
      this._disposed = true;
    }
  }

  /**
   * Execute a function with this shape, then dispose.
   */
  using<T>(fn: (shape: Shape) => T): T {
    try {
      return fn(this);
    } finally {
      this.dispose();
    }
  }

  /**
   * Static helper for using multiple shapes.
   */
  static usingAll<T>(shapes: Shape[], fn: (shapes: Shape[]) => T): T {
    try {
      return fn(shapes);
    } finally {
      shapes.forEach((s) => s.dispose());
    }
  }
}
