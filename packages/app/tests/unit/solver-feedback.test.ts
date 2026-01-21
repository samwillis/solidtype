/**
 * Phase 7: Constraint Solver Feedback Tests
 *
 * Tests the getSketchSolveReport tool that exposes constraint solver
 * feedback to the AI agent.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 7
 */

import { describe, it, expect } from "vitest";
import { getSketchSolveReportImpl } from "../../src/lib/ai/tools/sketch-impl";
import type { SketchToolContext } from "../../src/lib/ai/tools/sketch-impl";
import type { RebuildResult, SketchSolveResult } from "../../src/editor/kernel";
import * as Y from "yjs";

// Helper to create a mock document
function createMockDoc() {
  const ydoc = new Y.Doc();
  return {
    ydoc,
    featuresById: ydoc.getMap("featuresById"),
    featureOrder: ydoc.getArray<string>("featureOrder"),
  };
}

// Helper to create a mock rebuild result with sketch solve results
function createMockRebuildResult(sketchResults: Map<string, SketchSolveResult>): RebuildResult {
  return {
    bodies: [],
    meshes: new Map(),
    referenceIndex: {},
    featureStatus: {},
    errors: [],
    sketchSolveResults: sketchResults,
  };
}

describe("getSketchSolveReport", () => {
  it("returns fallback when rebuild result is not available", () => {
    const mockDoc = createMockDoc();
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: null,
      getRebuildResult: () => null,
    };

    const result = getSketchSolveReportImpl(ctx, { sketchId: "sketch-1" });

    expect(result.status).toBe("failed");
    expect(result.dof).toBe(-1);
    expect(result.message).toContain("not available");
  });

  it("returns fallback when sketch is not found in results", () => {
    const mockDoc = createMockDoc();
    const rebuildResult = createMockRebuildResult(new Map());
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: null,
      getRebuildResult: () => rebuildResult,
    };

    const result = getSketchSolveReportImpl(ctx, { sketchId: "nonexistent-sketch" });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("No solve result found");
  });

  it("returns underconstrained status when DOF > 0", () => {
    const mockDoc = createMockDoc();
    const sketchResults = new Map<string, SketchSolveResult>();
    sketchResults.set("sketch-1", {
      sketchId: "sketch-1",
      status: "success",
      points: [
        { id: "p1", x: 0, y: 0 },
        { id: "p2", x: 10, y: 0 },
      ],
      dof: {
        totalDOF: 4,
        constrainedDOF: 2,
        remainingDOF: 2,
        isFullyConstrained: false,
        isOverConstrained: false,
      },
    });

    const rebuildResult = createMockRebuildResult(sketchResults);
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: "sketch-1",
      getRebuildResult: () => rebuildResult,
    };

    const result = getSketchSolveReportImpl(ctx, { sketchId: "sketch-1" });

    expect(result.status).toBe("underconstrained");
    expect(result.dof).toBe(2);
    expect(result.totalDOF).toBe(4);
    expect(result.constrainedDOF).toBe(2);
    expect(result.isFullyConstrained).toBe(false);
    expect(result.isOverConstrained).toBe(false);
    expect(result.solvedPoints).toHaveLength(2);
  });

  it("returns ok status when fully constrained", () => {
    const mockDoc = createMockDoc();
    const sketchResults = new Map<string, SketchSolveResult>();
    sketchResults.set("sketch-1", {
      sketchId: "sketch-1",
      status: "success",
      points: [
        { id: "p1", x: 0, y: 0 },
        { id: "p2", x: 10, y: 0 },
      ],
      dof: {
        totalDOF: 4,
        constrainedDOF: 4,
        remainingDOF: 0,
        isFullyConstrained: true,
        isOverConstrained: false,
      },
    });

    const rebuildResult = createMockRebuildResult(sketchResults);
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: "sketch-1",
      getRebuildResult: () => rebuildResult,
    };

    const result = getSketchSolveReportImpl(ctx, { sketchId: "sketch-1" });

    expect(result.status).toBe("ok");
    expect(result.dof).toBe(0);
    expect(result.isFullyConstrained).toBe(true);
    expect(result.isOverConstrained).toBe(false);
  });

  it("returns overconstrained status when DOF < 0", () => {
    const mockDoc = createMockDoc();
    const sketchResults = new Map<string, SketchSolveResult>();
    sketchResults.set("sketch-1", {
      sketchId: "sketch-1",
      status: "not_converged",
      points: [],
      dof: {
        totalDOF: 4,
        constrainedDOF: 6,
        remainingDOF: -2,
        isFullyConstrained: false,
        isOverConstrained: true,
      },
    });

    const rebuildResult = createMockRebuildResult(sketchResults);
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: "sketch-1",
      getRebuildResult: () => rebuildResult,
    };

    const result = getSketchSolveReportImpl(ctx, { sketchId: "sketch-1" });

    expect(result.status).toBe("overconstrained");
    expect(result.isOverConstrained).toBe(true);
  });

  it("handles solve result without DOF info", () => {
    const mockDoc = createMockDoc();
    const sketchResults = new Map<string, SketchSolveResult>();
    sketchResults.set("sketch-1", {
      sketchId: "sketch-1",
      status: "success",
      points: [{ id: "p1", x: 5, y: 5 }],
      // No dof field
    });

    const rebuildResult = createMockRebuildResult(sketchResults);
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: "sketch-1",
      getRebuildResult: () => rebuildResult,
    };

    const result = getSketchSolveReportImpl(ctx, { sketchId: "sketch-1" });

    // Should still work with basic status
    expect(result.status).toBe("ok");
    expect(result.solvedPoints).toHaveLength(1);
  });

  it("can query sketch by ID even when not the active sketch", () => {
    const mockDoc = createMockDoc();
    const sketchResults = new Map<string, SketchSolveResult>();
    sketchResults.set("sketch-A", {
      sketchId: "sketch-A",
      status: "success",
      points: [],
      dof: {
        totalDOF: 4,
        constrainedDOF: 4,
        remainingDOF: 0,
        isFullyConstrained: true,
        isOverConstrained: false,
      },
    });
    sketchResults.set("sketch-B", {
      sketchId: "sketch-B",
      status: "under_constrained",
      points: [],
      dof: {
        totalDOF: 6,
        constrainedDOF: 2,
        remainingDOF: 4,
        isFullyConstrained: false,
        isOverConstrained: false,
      },
    });

    const rebuildResult = createMockRebuildResult(sketchResults);
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: "sketch-A", // Active is A
      getRebuildResult: () => rebuildResult,
    };

    // Query sketch B (not active)
    const result = getSketchSolveReportImpl(ctx, { sketchId: "sketch-B" });

    expect(result.sketchId).toBe("sketch-B");
    expect(result.status).toBe("underconstrained");
    expect(result.dof).toBe(4);
  });
});

describe("SketchToolContext with getRebuildResult", () => {
  it("getRebuildResult is optional for backward compatibility", () => {
    const mockDoc = createMockDoc();

    // Context without getRebuildResult (legacy usage)
    const ctx: SketchToolContext = {
      doc: mockDoc as any,
      activeSketchId: null,
      // No getRebuildResult
    };

    // Should still work but return fallback
    const result = getSketchSolveReportImpl(ctx, { sketchId: "any" });
    expect(result.status).toBe("failed");
    expect(result.message).toContain("not available");
  });
});
