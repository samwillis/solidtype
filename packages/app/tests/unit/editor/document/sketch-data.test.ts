/**
 * Sketch data helper tests
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";

import { createFeatureMap, createSketchDataMap } from "../../../../src/editor/document/yjs";
import {
  addConstraintToSketch,
  getSketchData,
  setSketchData,
  type NewSketchConstraint,
} from "../../../../src/editor/document/feature-helpers/sketch-data";

describe("sketch-data helpers", () => {
  const createSketchMap = () => {
    const doc = new Y.Doc();
    const root = doc.getMap("root");
    const sketch = createFeatureMap();
    root.set("sketch", sketch);
    sketch.set("data", createSketchDataMap());
    return sketch as Y.Map<unknown>;
  };

  it("stores arcs for equalRadius constraints", () => {
    const sketch = createSketchMap();
    const constraint: NewSketchConstraint = {
      type: "equalRadius",
      arcs: ["arc-a", "arc-b"],
    };

    const constraintId = addConstraintToSketch(sketch, constraint);
    const data = getSketchData(sketch);
    const stored = data.constraintsById[constraintId];

    expect(stored).toBeDefined();
    expect(stored.type).toBe("equalRadius");
    expect(stored.arcs).toEqual(["arc-a", "arc-b"]);
  });

  it("preserves circle entities when setting sketch data", () => {
    const sketch = createSketchMap();
    setSketchData(sketch, {
      points: [{ id: "center", x: 0, y: 0 }],
      entities: [
        {
          id: "circle-1",
          type: "circle",
          center: "center",
          radius: 5,
          construction: true,
        },
      ],
      constraints: [],
    });

    const data = getSketchData(sketch);
    const circle = data.entitiesById["circle-1"];

    expect(circle).toBeDefined();
    expect(circle.type).toBe("circle");
    expect(circle.center).toBe("center");
    expect(circle.radius).toBe(5);
    expect(circle.construction).toBe(true);
  });
});
