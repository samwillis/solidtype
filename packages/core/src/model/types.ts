/**
 * Modeling operation types
 *
 * Provides robust error handling types for modeling operations.
 * All high-level modeling operations should return ModelingResult<T>
 * to clearly communicate success/failure and provide diagnostics.
 */

import type { ValidationReport, ValidationIssue } from "../topo/validate.js";
import type { HealingResult } from "../topo/heal.js";

// ============================================================================
// Operation Types
// ============================================================================

/**
 * Type of modeling operation that produced an error
 */
export type ModelingOperationType =
  | `extrude`
  | `revolve`
  | `boolean`
  | `primitive`
  | `heal`
  | `validate`
  | `sketch`
  | `unknown`;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error category for modeling failures
 */
export type ModelingErrorCategory =
  | `invalidInput` // Bad input parameters
  | `geometryError` // Geometry computation failed
  | `topologyError` // Topology construction failed
  | `validationError` // Result failed validation
  | `healingError` // Healing could not fix issues
  | `unsupported` // Operation not supported for this case
  | `internal`; // Internal error (bug)

/**
 * Hint for UI to help users understand and fix errors
 */
export interface ModelingHint {
  /** Short description of what might be wrong */
  summary: string;
  /** Suggested action to fix the issue */
  suggestion?: string;
  /** Related parameter names that might need adjustment */
  relatedParameters?: string[];
}

/**
 * Detailed error information from a modeling operation
 */
export interface ModelingError {
  /** Error category */
  category: ModelingErrorCategory;
  /** Human-readable error message */
  message: string;
  /** The operation that failed */
  operation: ModelingOperationType;
  /** Optional validation report if validation failed */
  validationReport?: ValidationReport;
  /** Optional healing result if healing was attempted */
  healingResult?: HealingResult;
  /** Hints for UI to help users fix the issue */
  hints?: ModelingHint[];
  /** Additional details for debugging */
  details?: Record<string, unknown>;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a modeling operation
 *
 * This is the standard return type for all high-level modeling operations.
 * It follows the discriminated union pattern for type-safe error handling.
 *
 * Usage:
 * ```ts
 * const result = extrude(model, profile, options);
 * if (result.ok) {
 *   // result.value is available
 *   const bodyId = result.value.body;
 * } else {
 *   // result.error is available
 *   console.error(result.error.message);
 * }
 * ```
 */
export type ModelingResult<T> =
  | { ok: true; value: T; warnings?: string[] }
  | { ok: false; error: ModelingError };

// ============================================================================
// Result Constructors
// ============================================================================

/**
 * Create a successful modeling result
 */
export function success<T>(value: T, warnings?: string[]): ModelingResult<T> {
  return { ok: true, value, warnings };
}

/**
 * Create a failed modeling result
 */
export function failure<T>(error: ModelingError): ModelingResult<T> {
  return { ok: false, error };
}

/**
 * Create a modeling error
 */
export function createModelingError(
  category: ModelingErrorCategory,
  message: string,
  operation: ModelingOperationType,
  options?: {
    validationReport?: ValidationReport;
    healingResult?: HealingResult;
    hints?: ModelingHint[];
    details?: Record<string, unknown>;
  }
): ModelingError {
  return {
    category,
    message,
    operation,
    ...options,
  };
}

/**
 * Create an error for invalid input
 */
export function invalidInputError(
  message: string,
  operation: ModelingOperationType,
  hints?: ModelingHint[]
): ModelingError {
  return createModelingError(`invalidInput`, message, operation, { hints });
}

/**
 * Create an error for geometry computation failure
 */
export function geometryError(
  message: string,
  operation: ModelingOperationType,
  hints?: ModelingHint[]
): ModelingError {
  return createModelingError(`geometryError`, message, operation, { hints });
}

/**
 * Create an error for topology construction failure
 */
export function topologyError(
  message: string,
  operation: ModelingOperationType,
  validationReport?: ValidationReport,
  hints?: ModelingHint[]
): ModelingError {
  return createModelingError(`topologyError`, message, operation, {
    validationReport,
    hints,
  });
}

/**
 * Create an error for validation failure
 */
export function validationError(
  message: string,
  operation: ModelingOperationType,
  validationReport: ValidationReport,
  hints?: ModelingHint[]
): ModelingError {
  return createModelingError(`validationError`, message, operation, {
    validationReport,
    hints,
  });
}

/**
 * Create an error for healing failure
 */
export function healingError(
  message: string,
  operation: ModelingOperationType,
  healingResult: HealingResult,
  hints?: ModelingHint[]
): ModelingError {
  return createModelingError(`healingError`, message, operation, {
    healingResult,
    hints,
  });
}

/**
 * Create an error for unsupported operation
 */
export function unsupportedError(
  message: string,
  operation: ModelingOperationType,
  hints?: ModelingHint[]
): ModelingError {
  return createModelingError(`unsupported`, message, operation, { hints });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a result is successful
 */
export function isSuccess<T>(
  result: ModelingResult<T>
): result is { ok: true; value: T; warnings?: string[] } {
  return result.ok;
}

/**
 * Check if a result is a failure
 */
export function isFailure<T>(
  result: ModelingResult<T>
): result is { ok: false; error: ModelingError } {
  return !result.ok;
}

/**
 * Map over a successful result
 */
export function mapResult<T, U>(result: ModelingResult<T>, fn: (value: T) => U): ModelingResult<U> {
  if (result.ok) {
    return { ok: true, value: fn(result.value), warnings: result.warnings };
  }
  return result;
}

/**
 * Chain modeling operations (flatMap)
 */
export function chainResult<T, U>(
  result: ModelingResult<T>,
  fn: (value: T) => ModelingResult<U>
): ModelingResult<U> {
  if (result.ok) {
    const nextResult = fn(result.value);
    if (nextResult.ok && result.warnings) {
      // Combine warnings
      return {
        ...nextResult,
        warnings: [...(result.warnings || []), ...(nextResult.warnings || [])],
      };
    }
    return nextResult;
  }
  return result;
}

/**
 * Extract the value from a result, throwing if it's a failure
 */
export function unwrapResult<T>(result: ModelingResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Modeling operation failed: ${result.error.message}`);
}

/**
 * Extract the value from a result, or return a default
 */
export function unwrapOr<T>(result: ModelingResult<T>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Create hints from validation issues
 */
export function hintsFromValidation(report: ValidationReport): ModelingHint[] {
  const hints: ModelingHint[] = [];

  // Group issues by kind
  const issuesByKind = new Map<string, ValidationIssue[]>();
  for (const issue of report.issues) {
    const existing = issuesByKind.get(issue.kind) || [];
    existing.push(issue);
    issuesByKind.set(issue.kind, existing);
  }

  // Create hints for common issues
  if (issuesByKind.has(`zeroLengthEdge`) || issuesByKind.has(`shortEdge`)) {
    hints.push({
      summary: `Some edges are very short or zero-length`,
      suggestion: `Try increasing the extrusion distance or adjusting sketch dimensions`,
      relatedParameters: [`distance`, `sketchDimensions`],
    });
  }

  if (issuesByKind.has(`zeroAreaFace`) || issuesByKind.has(`sliverFace`)) {
    hints.push({
      summary: `Some faces have very small or zero area`,
      suggestion: `Check that profile edges are not collinear or nearly collinear`,
      relatedParameters: [`profile`],
    });
  }

  if (issuesByKind.has(`nonManifoldEdge`)) {
    hints.push({
      summary: `Model has non-manifold edges (more than 2 faces sharing an edge)`,
      suggestion: `This may indicate self-intersection. Try adjusting the geometry to avoid overlaps`,
    });
  }

  if (issuesByKind.has(`boundaryEdge`) || issuesByKind.has(`crack`)) {
    hints.push({
      summary: `Model has cracks or unclosed boundaries`,
      suggestion: `Ensure the profile is closed and try using the healing operations`,
    });
  }

  if (issuesByKind.has(`duplicateVertex`)) {
    hints.push({
      summary: `Some vertices are nearly coincident`,
      suggestion: `Try running the healing operation to merge duplicate vertices`,
    });
  }

  return hints;
}
