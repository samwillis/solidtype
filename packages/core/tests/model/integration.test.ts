/**
 * Integration tests for Phase 5 modeling operations
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TopoModel } from "../../src/topo/TopoModel.js";
import { createNumericContext } from "../../src/num/tolerance.js";
import { validateModel } from "../../src/topo/validate.js";
import { tessellateBody } from "../../src/mesh/tessellateBody.js";
import { createBox } from "../../src/model/primitives.js";
import { extrude } from "../../src/model/extrude.js";
import { revolve, Y_AXIS_REVOLVE } from "../../src/model/revolve.js";
import { union, subtract, intersect } from "../../src/model/boolean.js";
import { createRectangleProfile, createPolygonProfile } from "../../src/model/sketchProfile.js";
import { XY_PLANE, YZ_PLANE, createOffsetPlane } from "../../src/model/planes.js";
import { vec2 } from "../../src/num/vec2.js";
import { vec3 } from "../../src/num/vec3.js";

describe(`Extrude integration`, () => {
  let model: TopoModel;

  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  it(`extruded rectangle creates valid topology`, () => {
    const profile = createRectangleProfile(XY_PLANE, 2, 2);
    const result = extrude(model, profile, {
      operation: `add`,
      distance: 3,
    });

    expect(result.success).toBe(true);

    const validation = validateModel(model);
    expect(validation.errorCount).toBe(0);
  });

  it(`extruded rectangle can be tessellated`, () => {
    const profile = createRectangleProfile(XY_PLANE, 2, 2);
    const result = extrude(model, profile, {
      operation: `add`,
      distance: 3,
    });

    expect(result.success).toBe(true);
    expect(result.body).toBeDefined();

    const mesh = tessellateBody(model, result.body!);

    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length).toBeGreaterThan(0);

    const maxIndex = mesh.positions.length / 3 - 1;
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeLessThanOrEqual(maxIndex);
    }
  });

  it(`extruded triangle creates correct face count`, () => {
    const vertices = [vec2(0, 0), vec2(2, 0), vec2(1, 1.5)];
    const profile = createPolygonProfile(XY_PLANE, vertices);
    const result = extrude(model, profile, {
      operation: `add`,
      distance: 2,
    });

    expect(result.success).toBe(true);

    const stats = model.getStats();
    expect(stats.faces).toBe(5);
  });

  it(`extrude on offset plane works correctly`, () => {
    const offsetPlane = createOffsetPlane(XY_PLANE, 5);
    const profile = createRectangleProfile(offsetPlane, 1, 1);
    const result = extrude(model, profile, {
      operation: `add`,
      distance: 2,
    });

    expect(result.success).toBe(true);

    const mesh = tessellateBody(model, result.body!);
    expect(mesh.positions.length).toBeGreaterThan(0);
  });
});

describe(`Revolve integration`, () => {
  let model: TopoModel;

  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  it(`revolved rectangle creates body and faces`, () => {
    const profile = createRectangleProfile(YZ_PLANE, 1, 2, 3, 0);
    const result = revolve(model, profile, {
      operation: `add`,
      axis: Y_AXIS_REVOLVE,
    });

    expect(result.success).toBe(true);

    const stats = model.getStats();
    expect(stats.bodies).toBe(1);
    expect(stats.faces).toBeGreaterThan(0);
  });

  it(`revolved rectangle can be tessellated`, () => {
    const profile = createRectangleProfile(YZ_PLANE, 0.5, 1, 2, 0);
    const result = revolve(model, profile, {
      operation: `add`,
      axis: Y_AXIS_REVOLVE,
    });

    expect(result.success).toBe(true);
    expect(result.body).toBeDefined();

    const mesh = tessellateBody(model, result.body!);

    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it(`partial revolve (90 degrees) creates end caps`, () => {
    const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
    const result = revolve(model, profile, {
      operation: `add`,
      axis: Y_AXIS_REVOLVE,
      angle: Math.PI / 2,
    });

    expect(result.success).toBe(true);

    const stats = model.getStats();
    expect(stats.faces).toBeGreaterThan(0);
  });
});

describe(`Boolean integration`, () => {
  let model: TopoModel;

  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  it(`union of boxes creates valid topology`, () => {
    const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
    const boxB = createBox(model, { center: vec3(1, 0, 0), width: 2, height: 2, depth: 2 });

    const result = union(model, boxA, boxB);
    expect(result.success).toBe(true);
    expect(result.body).toBeDefined();
  });

  it(`union result can be tessellated`, () => {
    const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
    const boxB = createBox(model, { center: vec3(1, 0, 0), width: 2, height: 2, depth: 2 });

    const result = union(model, boxA, boxB);
    expect(result.success).toBe(true);
    expect(result.body).toBeDefined();

    const mesh = tessellateBody(model, result.body!);
    expect(mesh.positions.length).toBeGreaterThan(0);
  });

  it(`subtract creates valid result`, () => {
    const outer = createBox(model, { center: vec3(0, 0, 0), width: 4, height: 4, depth: 4 });
    const inner = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });

    const result = subtract(model, outer, inner);
    expect(result.success).toBe(true);
    expect(result.body).toBeDefined();
  });

  it(`intersect of overlapping boxes works`, () => {
    const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
    const boxB = createBox(model, { center: vec3(0.5, 0.5, 0.5), width: 2, height: 2, depth: 2 });

    const result = intersect(model, boxA, boxB);
    expect(result.success).toBe(true);
    expect(result.body).toBeDefined();
  });
});

describe(`Combined operations`, () => {
  let model: TopoModel;

  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  it(`extrude then union with box`, () => {
    const box = createBox(model, { center: vec3(2, 0, 0), width: 1, height: 1, depth: 1 });

    const profile = createRectangleProfile(XY_PLANE, 1, 1);
    const extrudeResult = extrude(model, profile, {
      operation: `add`,
      distance: 1,
    });

    expect(extrudeResult.success).toBe(true);
    expect(extrudeResult.body).toBeDefined();

    const unionResult = union(model, extrudeResult.body!, box);
    expect(unionResult.success).toBe(true);
  });

  it(`multiple extrusions work independently`, () => {
    const profile1 = createRectangleProfile(XY_PLANE, 2, 2);
    const result1 = extrude(model, profile1, {
      operation: `add`,
      distance: 3,
    });
    expect(result1.success).toBe(true);

    const offsetPlane = createOffsetPlane(XY_PLANE, 5);
    const profile2 = createRectangleProfile(offsetPlane, 1, 1);
    const result2 = extrude(model, profile2, {
      operation: `add`,
      distance: 2,
    });
    expect(result2.success).toBe(true);

    const stats = model.getStats();
    expect(stats.bodies).toBe(2);

    const mesh1 = tessellateBody(model, result1.body!);
    const mesh2 = tessellateBody(model, result2.body!);

    expect(mesh1.positions.length).toBeGreaterThan(0);
    expect(mesh2.positions.length).toBeGreaterThan(0);
  });
});

describe(`Edge cases`, () => {
  let model: TopoModel;

  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  it(`very thin extrusion succeeds`, () => {
    const profile = createRectangleProfile(XY_PLANE, 10, 10);
    const result = extrude(model, profile, {
      operation: `add`,
      distance: 0.001,
    });

    expect(result.success).toBe(true);
  });

  it(`very small profile extrusion succeeds`, () => {
    const profile = createRectangleProfile(XY_PLANE, 0.01, 0.01);
    const result = extrude(model, profile, {
      operation: `add`,
      distance: 1,
    });

    expect(result.success).toBe(true);
  });

  it(`pentagon profile extrusion and tessellation`, () => {
    const radius = 2;
    const vertices = [];
    for (let i = 0; i < 5; i++) {
      const angle = (2 * Math.PI * i) / 5 - Math.PI / 2;
      vertices.push(vec2(radius * Math.cos(angle), radius * Math.sin(angle)));
    }

    const profile = createPolygonProfile(XY_PLANE, vertices);
    const result = extrude(model, profile, {
      operation: `add`,
      distance: 1,
    });

    expect(result.success).toBe(true);

    const mesh = tessellateBody(model, result.body!);
    expect(mesh.positions.length).toBeGreaterThan(0);

    const stats = model.getStats();
    expect(stats.faces).toBe(7);
  });
});
