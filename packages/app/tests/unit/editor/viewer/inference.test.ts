/**
 * Inference line helpers tests
 */

import { describe, it, expect } from "vitest";
import { computeHVInferenceLines } from "../../../../src/editor/components/viewer/viewer-utils";

describe("computeHVInferenceLines", () => {
  it("returns a vertical inference line when aligned by x", () => {
    const points = [{ x: 10, y: 0 }];
    const cursor = { x: 11, y: 5 };
    const lines = computeHVInferenceLines(points, cursor, 2);

    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("vertical");
    expect(lines[0].start).toEqual({ x: 10, y: 0 });
    expect(lines[0].end).toEqual({ x: 10, y: 5 });
  });

  it("returns a horizontal inference line when aligned by y", () => {
    const points = [{ x: 3, y: 12 }];
    const cursor = { x: 7, y: 11 };
    const lines = computeHVInferenceLines(points, cursor, 2);

    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("horizontal");
    expect(lines[0].start).toEqual({ x: 3, y: 12 });
    expect(lines[0].end).toEqual({ x: 7, y: 12 });
  });

  it("returns both lines when aligned by x and y", () => {
    const points = [
      { x: 10, y: 2 },
      { x: 4, y: 6 },
    ];
    const cursor = { x: 9, y: 7 };
    const lines = computeHVInferenceLines(points, cursor, 2);

    expect(lines).toHaveLength(2);
    const kinds = lines.map((line) => line.kind).sort();
    expect(kinds).toEqual(["horizontal", "vertical"]);
  });

  it("prefers the closest aligned point", () => {
    const points = [
      { x: 9, y: 0 },
      { x: 12, y: 1 },
    ];
    const cursor = { x: 10, y: 10 };
    const lines = computeHVInferenceLines(points, cursor, 3);

    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("vertical");
    expect(lines[0].start.x).toBe(9);
  });
});
