# SolidType Testing Guide

This document describes SolidType's testing philosophy, strategies, and how to write effective tests.

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Running Tests](#running-tests)
3. [Test Organization](#test-organization)
4. [Writing Tests](#writing-tests)
5. [Testing Patterns](#testing-patterns)
6. [Performance Benchmarks](#performance-benchmarks)

---

## Testing Philosophy

SolidType follows a **TDD-first** approach:

1. **Write tests before implementation** where practical
2. **Test at the right level** – unit tests for functions, integration tests for workflows
3. **Prefer explicit examples** over random testing
4. **Keep tests fast and deterministic**
5. **Tests are documentation** – they demonstrate expected behavior

### Test Coverage Goals

| Module | Priority | Focus |
|--------|----------|-------|
| `num` | High | Edge cases, tolerance behavior |
| `geom` | High | Evaluator correctness, intersections |
| `topo` | High | Invariant validation, consistency |
| `model` | High | Operation correctness, naming integration |
| `naming` | Medium | Reference stability across edits |
| `sketch` | Medium | Solver convergence, constraint satisfaction |
| `mesh` | Medium | Triangulation correctness, valid output |

---

## Running Tests

### All Tests

```bash
# From repository root
pnpm test

# From a specific package
cd packages/core
pnpm test
```

### Watch Mode

```bash
cd packages/core
pnpm test:watch
```

### Specific Test File

```bash
cd packages/core
pnpm test src/num/vec3.test.ts
```

### Type Checking

```bash
pnpm typecheck
```

---

## Test Organization

### File Structure

Tests are co-located with source files:

```
src/
├── num/
│   ├── vec3.ts           # Source
│   ├── vec3.test.ts      # Tests
│   ├── tolerance.ts
│   └── tolerance.test.ts
├── topo/
│   ├── model.ts
│   ├── model.test.ts
│   └── ...
```

### Naming Conventions

- Test files: `*.test.ts`
- Describe blocks: Module or function name
- Test names: `should <expected behavior>`

```typescript
describe('vec3', () => {
  describe('normalize3', () => {
    it('should return unit vector', () => { ... });
    it('should handle zero vector', () => { ... });
  });
});
```

---

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { someFunction } from './module.js';

describe('someFunction', () => {
  it('should return expected result for normal input', () => {
    const result = someFunction(validInput);
    expect(result).toBe(expectedOutput);
  });

  it('should handle edge case', () => {
    const result = someFunction(edgeCaseInput);
    expect(result).toBeCloseTo(expected, tolerance);
  });

  it('should throw for invalid input', () => {
    expect(() => someFunction(invalidInput)).toThrow();
  });
});
```

### Floating-Point Comparisons

Always use tolerance-based comparisons:

```typescript
// Bad
expect(result).toBe(1.0);

// Good
expect(result).toBeCloseTo(1.0, 10);  // 10 decimal places

// Better - for geometry
import { GEOMETRIC_TOLERANCE } from './test-utils';
expect(Math.abs(result - expected)).toBeLessThan(GEOMETRIC_TOLERANCE);
```

### Testing with Tolerance Context

```typescript
import { createNumericContext, isZero } from '@solidtype/core';

describe('tolerance-aware tests', () => {
  const ctx = createNumericContext();

  it('should treat near-zero as zero', () => {
    const smallValue = ctx.tol.length * 0.5;
    expect(isZero(smallValue, ctx)).toBe(true);
  });
});
```

---

## Testing Patterns

### Pattern 1: Model Creation Tests

Test that models are created with correct topology:

```typescript
describe('createBox', () => {
  it('should create a valid box with 6 faces', () => {
    const model = createEmptyModel();
    const bodyId = createBox(model, { width: 1, depth: 1, height: 1 });
    
    const shells = getBodyShells(model, bodyId);
    expect(shells.length).toBe(1);
    
    const faces = getShellFaces(model, shells[0]);
    expect(faces.length).toBe(6);
  });

  it('should create 8 vertices', () => {
    const model = createEmptyModel();
    createBox(model, {});
    expect(model.vertices.liveCount).toBe(8);
  });
});
```

### Pattern 2: Validation Tests

Test that validation catches invalid topology:

```typescript
describe('validateModel', () => {
  it('should detect non-manifold edges', () => {
    const model = createModelWithNonManifoldEdge();
    const report = validateModel(model);
    
    expect(report.valid).toBe(false);
    expect(report.issues.some(i => i.kind === 'nonManifoldEdge')).toBe(true);
  });
});
```

### Pattern 3: Constraint Solver Tests

Test solver convergence and constraint satisfaction:

```typescript
describe('solveSketch', () => {
  it('should satisfy horizontal constraint', () => {
    const { sketch, constraints } = createHorizontalLineSketch();
    
    const result = solveSketch(sketch, constraints);
    
    expect(result.status).toBe('success');
    
    const line = getSketchEntity(sketch, lineId);
    const p1 = getSketchPoint(sketch, line.start);
    const p2 = getSketchPoint(sketch, line.end);
    
    expect(Math.abs(p1.y - p2.y)).toBeLessThan(1e-6);
  });
});
```

### Pattern 4: Naming Stability Tests

Test that persistent refs survive parameter changes:

```typescript
describe('persistent naming', () => {
  it('should resolve ref after parameter change', () => {
    const { model, naming, topFaceRef } = createExtrusionWithNaming(height: 10);
    
    // Verify initial resolution
    const initial = naming.resolve(topFaceRef, model);
    expect(initial).not.toBeNull();
    
    // Rebuild with different parameter
    const { model: model2 } = rebuildExtrusion(height: 15, naming);
    
    // Verify ref still resolves
    const updated = naming.resolve(topFaceRef, model2);
    expect(updated).not.toBeNull();
    expect(updated.type).toBe('face');
  });
});
```

### Pattern 5: Tessellation Tests

Test mesh output validity:

```typescript
describe('tessellateBody', () => {
  it('should produce valid triangle mesh', () => {
    const model = createEmptyModel();
    const body = createBox(model, {});
    
    const mesh = tessellateBody(model, body);
    
    // Check basic structure
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length % 3).toBe(0);
    
    // Check all indices are valid
    const vertexCount = mesh.positions.length / 3;
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeLessThan(vertexCount);
    }
  });

  it('should produce outward-facing normals', () => {
    const model = createEmptyModel();
    const body = createBox(model, { center: [0, 0, 0] });
    
    const mesh = tessellateBody(model, body);
    
    // Check that normals point outward (dot with position > 0 for box at origin)
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const px = mesh.positions[i];
      const py = mesh.positions[i + 1];
      const pz = mesh.positions[i + 2];
      const nx = mesh.normals[i];
      const ny = mesh.normals[i + 1];
      const nz = mesh.normals[i + 2];
      
      const dot = px * nx + py * ny + pz * nz;
      expect(dot).toBeGreaterThan(-0.01);
    }
  });
});
```

---

## Performance Benchmarks

### Running Benchmarks

```bash
cd packages/core

# All benchmarks
pnpm bench

# Specific benchmark suites
pnpm bench:model        # Primitive creation, extrusion, booleans
pnpm bench:tessellation # Face and body tessellation
pnpm bench:solver       # Constraint solver
```

### Interpreting Results

Benchmark output includes:
- **Average time**: Mean execution time per iteration
- **Min/Max**: Range of execution times
- **Std Dev**: Variability in timing
- **Ops/sec**: Operations per second

```
Benchmark: createBox
  Iterations: 1000
  Average:    0.125 ms
  Min:        0.098 ms
  Max:        0.312 ms
  Std Dev:    0.024 ms
  Ops/sec:    8000.00
```

### Adding New Benchmarks

```typescript
// In bench/mymodule.bench.ts
import { runBenchmark, printResult } from './utils.js';

function benchmarkMyOperation(): BenchmarkResult {
  // Setup (not timed)
  const data = prepareData();
  
  return runBenchmark('my operation', () => {
    // Timed code
    performOperation(data);
  }, { iterations: 500 });
}

export function runMyBenchmarks() {
  const result = benchmarkMyOperation();
  printResult(result);
}
```

---

## Test Utilities

### Common Helpers

```typescript
// Create a default numeric context
export function createTestContext(): NumericContext {
  return createNumericContext({
    length: 1e-6,
    angle: 1e-6,
  });
}

// Create an empty model with default tolerances
export function createTestModel(): TopoModel {
  return createEmptyModel(createTestContext());
}
```

### Assertion Helpers

```typescript
// Check vector equality within tolerance
export function expectVec3Close(
  actual: Vec3,
  expected: Vec3,
  tol = 1e-10
) {
  expect(actual[0]).toBeCloseTo(expected[0], -Math.log10(tol));
  expect(actual[1]).toBeCloseTo(expected[1], -Math.log10(tol));
  expect(actual[2]).toBeCloseTo(expected[2], -Math.log10(tol));
}

// Check model validity
export function expectValidModel(model: TopoModel) {
  const report = validateModel(model);
  if (!report.valid) {
    throw new Error(`Invalid model: ${report.issues.map(i => i.kind).join(', ')}`);
  }
}
```

---

## Debugging Tests

### Verbose Output

```typescript
it('debug test', () => {
  const result = someOperation();
  console.log('Result:', JSON.stringify(result, null, 2));
  expect(result).toBeDefined();
});
```

### Isolating Failures

```typescript
// Run only this test
it.only('should work', () => { ... });

// Skip this test
it.skip('broken test', () => { ... });
```

### Visual Debugging

For geometry issues, consider adding a debug mesh export:

```typescript
import { writeFileSync } from 'fs';

it('debug mesh output', () => {
  const mesh = tessellateBody(model, body);
  
  // Export to OBJ for visualization
  const obj = meshToOBJ(mesh);
  writeFileSync('/tmp/debug.obj', obj);
});
```

---

## See Also

- [Vitest Documentation](https://vitest.dev/)
- [docs/architecture.md](./architecture.md) – Architecture overview
- [PLAN.md](../PLAN.md) – Implementation phases
