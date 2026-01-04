/**
 * Tests for primitive shape creation
 */

import { describe, it, expect } from "vitest";
import { createNumericContext } from "../../src/num/tolerance.js";
import { vec3 } from "../../src/num/vec3.js";
import { TopoModel } from "../../src/topo/TopoModel.js";
import { asVertexId } from "../../src/topo/handles.js";
import { validateModel, isValidModel } from "../../src/topo/validate.js";
import { createBox, createUnitCube } from "../../src/model/primitives.js";

describe("createBox", () => {
  it("creates a valid box with correct topology", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    createBox(model);

    const stats = model.getStats();

    expect(stats.bodies).toBe(1);
    expect(stats.shells).toBe(1);
    expect(stats.faces).toBe(6);
    expect(stats.loops).toBe(6);
    expect(stats.edges).toBe(12);
    expect(stats.vertices).toBe(8);
    expect(stats.halfEdges).toBe(24);
    expect(stats.surfaces).toBe(6);
  });

  it("creates a closed shell", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const bodyId = createBox(model);

    const shells = model.getBodyShells(bodyId);
    expect(shells).toHaveLength(1);
    expect(model.isShellClosed(shells[0])).toBe(true);
  });

  it("creates correct vertex positions for unit cube", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    createUnitCube(model);

    for (let i = 0; i < 8; i++) {
      const pos = model.getVertexPosition(asVertexId(i));
      expect(Math.abs(pos[0])).toBeCloseTo(0.5, 10);
      expect(Math.abs(pos[1])).toBeCloseTo(0.5, 10);
      expect(Math.abs(pos[2])).toBeCloseTo(0.5, 10);
    }
  });

  it("creates correct vertex positions with custom dimensions", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    createBox(model, { width: 4, depth: 6, height: 8 });

    const expectedHalfDims = [2, 3, 4];
    for (let i = 0; i < 8; i++) {
      const pos = model.getVertexPosition(asVertexId(i));
      expect(Math.abs(pos[0])).toBeCloseTo(expectedHalfDims[0], 10);
      expect(Math.abs(pos[1])).toBeCloseTo(expectedHalfDims[1], 10);
      expect(Math.abs(pos[2])).toBeCloseTo(expectedHalfDims[2], 10);
    }
  });

  it("creates correct vertex positions with custom center", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    const center = vec3(10, 20, 30);
    createBox(model, { width: 2, depth: 2, height: 2, center });

    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    for (let i = 0; i < 8; i++) {
      const pos = model.getVertexPosition(asVertexId(i));
      sumX += pos[0];
      sumY += pos[1];
      sumZ += pos[2];
    }
    expect(sumX / 8).toBeCloseTo(center[0], 10);
    expect(sumY / 8).toBeCloseTo(center[1], 10);
    expect(sumZ / 8).toBeCloseTo(center[2], 10);
  });

  it("passes model validation", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    createBox(model);

    const report = validateModel(model);

    const errors = report.issues.filter((i) => i.severity === "error");
    const warnings = report.issues.filter((i) => i.severity === "warning");

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("passes quick validation check", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    createBox(model);

    expect(isValidModel(model)).toBe(true);
  });

  it("can create multiple boxes in same model", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);

    createBox(model, { center: vec3(-2, 0, 0) });
    createBox(model, { center: vec3(2, 0, 0) });

    const stats = model.getStats();

    expect(stats.bodies).toBe(2);
    expect(stats.shells).toBe(2);
    expect(stats.faces).toBe(12);
    expect(stats.vertices).toBe(16);

    expect(isValidModel(model)).toBe(true);
  });
});

describe("createUnitCube", () => {
  it("creates a 1x1x1 cube centered at origin", () => {
    const ctx = createNumericContext();
    const model = new TopoModel(ctx);
    createUnitCube(model);

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < 8; i++) {
      const pos = model.getVertexPosition(asVertexId(i));
      minX = Math.min(minX, pos[0]);
      maxX = Math.max(maxX, pos[0]);
      minY = Math.min(minY, pos[1]);
      maxY = Math.max(maxY, pos[1]);
      minZ = Math.min(minZ, pos[2]);
      maxZ = Math.max(maxZ, pos[2]);
    }

    expect(maxX - minX).toBeCloseTo(1, 10);
    expect(maxY - minY).toBeCloseTo(1, 10);
    expect(maxZ - minZ).toBeCloseTo(1, 10);

    expect((maxX + minX) / 2).toBeCloseTo(0, 10);
    expect((maxY + minY) / 2).toBeCloseTo(0, 10);
    expect((maxZ + minZ) / 2).toBeCloseTo(0, 10);
  });
});
