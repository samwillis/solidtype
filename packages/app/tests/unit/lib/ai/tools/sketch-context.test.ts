/**
 * Sketch Context Serialization Tests
 *
 * Tests for serializing sketch data into AI-friendly context.
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";

import type { SketchAIContext } from "../../../../../src/lib/ai/context/sketch-context";
import {
  buildSketchSystemPrompt,
  buildSketchContextSummary,
} from "../../../../../src/lib/ai/prompts/sketch";

describe("Sketch System Prompt", () => {
  const mockSketchContext: SketchAIContext = {
    sketchId: "sketch-123",
    planeName: "XY",
    points: [
      { id: "p1", x: 0, y: 0, fixed: true },
      { id: "p2", x: 100, y: 0, fixed: false },
      { id: "p3", x: 100, y: 50, fixed: false },
      { id: "p4", x: 0, y: 50, fixed: false },
    ],
    entities: [
      {
        id: "l1",
        type: "line",
        points: ["p1", "p2"],
        properties: { type: "line", start: "p1", end: "p2" },
      },
      {
        id: "l2",
        type: "line",
        points: ["p2", "p3"],
        properties: { type: "line", start: "p2", end: "p3" },
      },
      {
        id: "l3",
        type: "line",
        points: ["p3", "p4"],
        properties: { type: "line", start: "p3", end: "p4" },
      },
      {
        id: "l4",
        type: "line",
        points: ["p4", "p1"],
        properties: { type: "line", start: "p4", end: "p1" },
      },
    ],
    constraints: [
      { id: "c1", type: "horizontal", targets: ["p1", "p2"] },
      { id: "c2", type: "vertical", targets: ["p2", "p3"] },
      { id: "c3", type: "horizontal", targets: ["p3", "p4"] },
      { id: "c4", type: "vertical", targets: ["p4", "p1"] },
    ],
    solverStatus: "underconstrained",
    degreesOfFreedom: 4,
  };

  describe("buildSketchSystemPrompt", () => {
    it("should include sketch ID and plane name", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("sketch-123");
      expect(prompt).toContain("XY");
    });

    it("should include solver status and DOF", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("underconstrained");
      expect(prompt).toContain("4");
    });

    it("should list all points", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("p1:");
      expect(prompt).toContain("p2:");
      expect(prompt).toContain("p3:");
      expect(prompt).toContain("p4:");
      expect(prompt).toContain("[FIXED]");
    });

    it("should list all entities", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("l1: line");
      expect(prompt).toContain("l2: line");
    });

    it("should list all constraints", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("c1: horizontal");
      expect(prompt).toContain("c2: vertical");
    });

    it("should include coordinate system description", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("Origin is at (0, 0)");
      expect(prompt).toContain("X increases to the right");
      expect(prompt).toContain("Y increases upward");
    });

    it("should include guidelines", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("Guidelines");
      expect(prompt).toContain("constraints");
    });

    it("should include common patterns", () => {
      const prompt = buildSketchSystemPrompt(mockSketchContext);

      expect(prompt).toContain("Rectangle");
      expect(prompt).toContain("Circle");
      expect(prompt).toContain("Slot");
    });
  });

  describe("buildSketchContextSummary", () => {
    it("should provide a concise summary", () => {
      const summary = buildSketchContextSummary(mockSketchContext);

      expect(summary).toContain("sketch-123");
      expect(summary).toContain("XY");
      expect(summary).toContain("Points: 4");
      expect(summary).toContain("Entities: 4");
      expect(summary).toContain("Constraints: 4");
      expect(summary).toContain("underconstrained");
      expect(summary).toContain("DOF: 4");
    });
  });

  describe("Empty Sketch Context", () => {
    const emptySketchContext: SketchAIContext = {
      sketchId: "empty-sketch",
      planeName: "XZ",
      points: [],
      entities: [],
      constraints: [],
      solverStatus: "underconstrained",
      degreesOfFreedom: 0,
    };

    it("should handle empty sketch gracefully", () => {
      const prompt = buildSketchSystemPrompt(emptySketchContext);

      expect(prompt).toContain("empty-sketch");
      expect(prompt).toContain("XZ");
      expect(prompt).toContain("Points (0)");
      expect(prompt).toContain("Entities (0)");
      expect(prompt).toContain("Constraints (0)");
    });

    it("should show (none) for empty lists", () => {
      const prompt = buildSketchSystemPrompt(emptySketchContext);

      expect(prompt).toContain("(none)");
    });
  });

  describe("Solved Sketch Context", () => {
    const solvedSketchContext: SketchAIContext = {
      sketchId: "solved-sketch",
      planeName: "YZ",
      points: [
        { id: "p1", x: 0, y: 0, fixed: true },
        { id: "p2", x: 100, y: 0, fixed: false },
      ],
      entities: [
        {
          id: "l1",
          type: "line",
          points: ["p1", "p2"],
          properties: { type: "line", start: "p1", end: "p2" },
        },
      ],
      constraints: [
        { id: "c1", type: "fixed", targets: ["p1"] },
        { id: "c2", type: "horizontal", targets: ["p1", "p2"] },
        { id: "c3", type: "distance", targets: ["p1", "p2"], value: 100 },
      ],
      solverStatus: "solved",
      degreesOfFreedom: 0,
    };

    it("should show solved status", () => {
      const prompt = buildSketchSystemPrompt(solvedSketchContext);

      expect(prompt).toContain("solved");
      expect(prompt).toContain("Degrees of Freedom: 0");
    });

    it("should show constraint values", () => {
      const prompt = buildSketchSystemPrompt(solvedSketchContext);

      expect(prompt).toContain("= 100");
    });
  });

  describe("Context with Various Entities", () => {
    const mixedSketchContext: SketchAIContext = {
      sketchId: "mixed-sketch",
      planeName: "Custom Plane",
      points: [
        { id: "center", x: 50, y: 50, fixed: false },
        { id: "arc-start", x: 100, y: 50, fixed: false },
        { id: "arc-end", x: 50, y: 100, fixed: false },
        { id: "arc-center", x: 50, y: 50, fixed: false },
      ],
      entities: [
        {
          id: "c1",
          type: "circle",
          points: ["center"],
          properties: { type: "circle", center: "center", radius: 25 },
        },
        {
          id: "a1",
          type: "arc",
          points: ["arc-start", "arc-end", "arc-center"],
          properties: {
            type: "arc",
            start: "arc-start",
            end: "arc-end",
            center: "arc-center",
            ccw: true,
          },
        },
      ],
      constraints: [{ id: "r1", type: "radius", targets: ["c1"], value: 25 }],
      solverStatus: "underconstrained",
      degreesOfFreedom: 6,
    };

    it("should handle circles and arcs", () => {
      const prompt = buildSketchSystemPrompt(mixedSketchContext);

      expect(prompt).toContain("circle");
      expect(prompt).toContain("arc");
      expect(prompt).toContain("Custom Plane");
    });
  });
});
