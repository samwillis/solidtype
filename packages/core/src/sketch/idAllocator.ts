/**
 * ID Allocator
 *
 * This module provides session-scoped ID allocation for sketches, points,
 * entities, and constraints. This is important for:
 *
 * 1. Test isolation - tests can reset IDs to avoid cross-test interference
 * 2. Worker isolation - each worker can have its own ID space
 * 3. Multi-session support - multiple modeling sessions can coexist
 *
 * Usage:
 * - For simple use cases, the global allocator is used automatically
 * - For advanced scenarios, create an IdAllocator instance
 * - Tests should call resetAllIds() in beforeEach
 */

import type { SketchId, SketchPointId, SketchEntityId, ConstraintId } from "./types.js";

// ============================================================================
// IdAllocator Class
// ============================================================================

/**
 * Allocator for sketch-related IDs
 *
 * Each instance maintains its own ID counters, allowing for isolated
 * ID spaces in tests or parallel sessions.
 */
export class IdAllocator {
  private _nextSketchId: number = 0;
  private _nextPointId: number = 0;
  private _nextEntityId: number = 0;
  private _nextConstraintId: number = 0;

  /**
   * Allocate a new SketchId
   */
  allocateSketchId(): SketchId {
    return this._nextSketchId++ as SketchId;
  }

  /**
   * Allocate a new SketchPointId
   */
  allocatePointId(): SketchPointId {
    return this._nextPointId++ as SketchPointId;
  }

  /**
   * Allocate a new SketchEntityId
   */
  allocateEntityId(): SketchEntityId {
    return this._nextEntityId++ as SketchEntityId;
  }

  /**
   * Allocate a new ConstraintId
   */
  allocateConstraintId(): ConstraintId {
    return this._nextConstraintId++ as ConstraintId;
  }

  /**
   * Reset all counters to zero
   */
  reset(): void {
    this._nextSketchId = 0;
    this._nextPointId = 0;
    this._nextEntityId = 0;
    this._nextConstraintId = 0;
  }

  /**
   * Get current counter values (for debugging/testing)
   */
  getState(): { sketch: number; point: number; entity: number; constraint: number } {
    return {
      sketch: this._nextSketchId,
      point: this._nextPointId,
      entity: this._nextEntityId,
      constraint: this._nextConstraintId,
    };
  }
}

// ============================================================================
// Global Allocator (for backward compatibility)
// ============================================================================

/**
 * The global ID allocator used when no specific allocator is provided
 */
const globalAllocator = new IdAllocator();

/**
 * Get the global allocator
 */
export function getGlobalAllocator(): IdAllocator {
  return globalAllocator;
}

/**
 * Reset all global ID counters
 *
 * This is primarily for use in tests to ensure isolation between test cases.
 */
export function resetAllIds(): void {
  globalAllocator.reset();
}

// ============================================================================
// Convenience Functions (using global allocator)
// ============================================================================

/**
 * Allocate a SketchId using the global allocator
 */
export function allocateSketchIdGlobal(): SketchId {
  return globalAllocator.allocateSketchId();
}

/**
 * Allocate a SketchPointId using the global allocator
 */
export function allocatePointIdGlobal(): SketchPointId {
  return globalAllocator.allocatePointId();
}

/**
 * Allocate a SketchEntityId using the global allocator
 */
export function allocateEntityIdGlobal(): SketchEntityId {
  return globalAllocator.allocateEntityId();
}

/**
 * Allocate a ConstraintId using the global allocator
 */
export function allocateConstraintIdGlobal(): ConstraintId {
  return globalAllocator.allocateConstraintId();
}
