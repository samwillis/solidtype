# Appendix: Testing Strategy

This document describes the testing approach for both the kernel (`@solidtype/core`) and the app (`@solidtype/app`).

---

## Testing Philosophy

1. **Test-Driven Development** - Write tests before or alongside implementation
2. **Fast and Deterministic** - Tests should run quickly and produce consistent results
3. **Example-Based** - Prefer clear, specific test cases over randomized testing
4. **Pyramid Structure** - Many unit tests, fewer integration tests, fewer E2E tests

---

## Test Categories

### Unit Tests

Test individual functions and classes in isolation.

**Coverage:**

- Geometry calculations (`num/`, `geom/`)
- Topology operations (`topo/`)
- Constraint solver (`sketch/solver.ts`)
- Individual modeling operations (`model/`)

**Characteristics:**

- No external dependencies
- Fast (<100ms per test)
- Focused on single functionality

### Integration Tests

Test how components work together.

**Coverage:**

- Full rebuild pipeline
- Worker communication
- Yjs document operations
- Feature tree → kernel → mesh

**Characteristics:**

- May involve multiple modules
- Still relatively fast (<1s per test)
- Test realistic workflows

### End-to-End Tests

Test the complete user experience.

**Coverage:**

- UI interactions
- Full modeling workflows
- Export/import

**Characteristics:**

- Slower (seconds to minutes)
- Run in browser environment
- Verify user-facing behavior

---

## Kernel Testing

### Test Framework

Using **Vitest** for all kernel tests.

```typescript
// packages/core/vitest.config.ts
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
```

### Test Organization

```
packages/core/src/
├── num/
│   ├── vec3.ts
│   └── vec3.test.ts      # Tests next to source
├── geom/
│   ├── curve2d.ts
│   └── curve2d.test.ts
├── model/
│   ├── extrude.ts
│   └── extrude.test.ts
└── ...
```

### Example: Geometry Tests

```typescript
// packages/core/src/num/vec3.test.ts

import { describe, test, expect } from "vitest";
import { add, subtract, dot, cross, normalize, length } from "./vec3";

describe("vec3", () => {
  test("add adds vectors", () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
  });

  test("dot computes dot product", () => {
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0); // Perpendicular
    expect(dot([1, 0, 0], [1, 0, 0])).toBe(1); // Parallel
  });

  test("normalize produces unit vector", () => {
    const n = normalize([3, 4, 0]);
    expect(length(n)).toBeCloseTo(1);
    expect(n).toEqual([0.6, 0.8, 0]);
  });
});
```

### Example: Modeling Tests

```typescript
// packages/core/src/model/extrude.test.ts

import { describe, test, expect } from "vitest";
import { SolidSession } from "../api/SolidSession";
import { createRectangleProfile } from "../test-utils";

describe("extrude", () => {
  test("extrudes rectangle to box", () => {
    const session = new SolidSession();
    const profile = createRectangleProfile(10, 20);

    const result = session.extrude(profile, { distance: 5 });

    expect(result.ok).toBe(true);
    expect(result.body.getFaces()).toHaveLength(6);
    expect(result.body.getEdges()).toHaveLength(12);
  });

  test("extrude cut creates hole", () => {
    const session = new SolidSession();

    // Create base
    const baseProfile = createRectangleProfile(20, 20);
    session.extrude(baseProfile, { distance: 10 });

    // Cut hole
    const holeProfile = createCircleProfile(5);
    const result = session.extrude(holeProfile, {
      distance: 10,
      operation: "cut",
    });

    expect(result.ok).toBe(true);
    // Should have more faces now (cylinder hole)
    expect(result.body.getFaces().length).toBeGreaterThan(6);
  });

  test("extrude fails with open profile", () => {
    const session = new SolidSession();
    const openProfile = createOpenLineProfile();

    const result = session.extrude(openProfile, { distance: 5 });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("OPEN_PROFILE");
  });
});
```

### Example: Constraint Solver Tests

```typescript
// packages/core/src/sketch/solver.test.ts

import { describe, test, expect } from "vitest";
import { SketchModel } from "./SketchModel";
import { solveSketch } from "./solver";
import { horizontal, vertical, distance, coincident } from "./constraints";

describe("constraint solver", () => {
  test("horizontal constraint aligns Y coordinates", () => {
    const sketch = new SketchModel();
    const p1 = sketch.addPoint(0, 0);
    const p2 = sketch.addPoint(10, 5); // Initially not horizontal

    sketch.addConstraint(horizontal(p1, p2));
    sketch.addConstraint(fixed(p1));

    const result = solveSketch(sketch);

    expect(result.status).toBe("solved");
    expect(sketch.getPoint(p1).y).toBeCloseTo(sketch.getPoint(p2).y);
  });

  test("distance constraint sets exact distance", () => {
    const sketch = new SketchModel();
    const p1 = sketch.addPoint(0, 0);
    const p2 = sketch.addPoint(3, 4); // Distance = 5

    sketch.addConstraint(fixed(p1));
    sketch.addConstraint(distance(p1, p2, 10)); // Change to 10

    const result = solveSketch(sketch);

    expect(result.status).toBe("solved");
    const d = Math.hypot(
      sketch.getPoint(p2).x - sketch.getPoint(p1).x,
      sketch.getPoint(p2).y - sketch.getPoint(p1).y
    );
    expect(d).toBeCloseTo(10);
  });

  test("over-constrained sketch reports error", () => {
    const sketch = new SketchModel();
    const p1 = sketch.addPoint(0, 0);
    const p2 = sketch.addPoint(10, 0);

    sketch.addConstraint(fixed(p1));
    sketch.addConstraint(fixed(p2)); // Both fixed
    sketch.addConstraint(distance(p1, p2, 20)); // Impossible

    const result = solveSketch(sketch);

    expect(result.status).toBe("over_constrained");
  });
});
```

---

## App Testing

### Test Framework

Using **Vitest** with **Testing Library** for React component tests.

```typescript
// packages/app/vitest.config.ts
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
  },
});
```

### Example: Component Tests

```typescript
// packages/app/src/components/FeatureTree.test.tsx

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureTree } from './FeatureTree';
import { DocumentProvider } from '../contexts/DocumentContext';

describe('FeatureTree', () => {
  test('renders features from document', () => {
    const doc = createMockDocument();
    addSketchFeature(doc, 's1', 'xy');
    addExtrudeFeature(doc, 'e1', 's1', 10);

    render(
      <DocumentProvider doc={doc}>
        <FeatureTree />
      </DocumentProvider>
    );

    expect(screen.getByText('Sketch1')).toBeInTheDocument();
    expect(screen.getByText('Extrude1')).toBeInTheDocument();
  });

  test('clicking feature selects it', () => {
    const onSelect = vi.fn();

    render(
      <DocumentProvider doc={createMockDocument()}>
        <FeatureTree onSelect={onSelect} />
      </DocumentProvider>
    );

    fireEvent.click(screen.getByText('Sketch1'));

    expect(onSelect).toHaveBeenCalledWith('s1');
  });
});
```

### Example: Hook Tests

```typescript
// packages/app/src/hooks/useDocument.test.ts

import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDocument, DocumentProvider } from "../contexts/DocumentContext";

describe("useDocument", () => {
  test("createDocument initializes with default features", () => {
    const { result } = renderHook(() => useDocument(), {
      wrapper: DocumentProvider,
    });

    expect(result.current.doc).toBeDefined();
    expect(result.current.doc.features.length).toBe(4); // origin + 3 planes
  });

  test("setRebuildGate updates gate position", () => {
    const { result } = renderHook(() => useDocument(), {
      wrapper: DocumentProvider,
    });

    act(() => {
      result.current.setRebuildGate("e1");
    });

    expect(result.current.rebuildGate).toBe("e1");
  });
});
```

---

## Integration Testing

### Worker Integration

```typescript
// packages/app/src/worker/integration.test.ts

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { KernelClient } from './KernelClient';

describe('KernelClient', () => {
  let client: KernelClient;

  beforeEach(() => {
    client = new KernelClient();
  });

  afterEach(() => {
    client.dispose();
  });

  test('rebuild returns mesh for body', async () => {
    const features = [
      { id: 's1', type: 'sketch', ... },
      { id: 'e1', type: 'extrude', sketch: 's1', distance: 10 },
    ];

    const meshes = await new Promise<Map<string, Mesh>>((resolve) => {
      const meshMap = new Map();
      client.onMesh((bodyId, mesh) => {
        meshMap.set(bodyId, mesh);
        if (meshMap.size === 1) resolve(meshMap);
      });
      client.rebuild(features, null);
    });

    expect(meshes.size).toBe(1);
    const mesh = meshes.get('e1');
    expect(mesh.positions.length).toBeGreaterThan(0);
  });
});
```

---

## Test Utilities

### Geometry Helpers

```typescript
// packages/core/src/test-utils.ts

export function createRectangleProfile(width: number, height: number): SketchProfile {
  const sketch = new SketchModel();
  const p1 = sketch.addPoint(0, 0);
  const p2 = sketch.addPoint(width, 0);
  const p3 = sketch.addPoint(width, height);
  const p4 = sketch.addPoint(0, height);

  sketch.addLine(p1, p2);
  sketch.addLine(p2, p3);
  sketch.addLine(p3, p4);
  sketch.addLine(p4, p1);

  return sketch.toProfile();
}

export function createCircleProfile(radius: number): SketchProfile {
  const sketch = new SketchModel();
  const center = sketch.addPoint(0, 0);
  const start = sketch.addPoint(radius, 0);

  sketch.addArc(start, start, center, true);

  return sketch.toProfile();
}
```

### Mock Factories

```typescript
// packages/app/src/test-utils.ts

export function createMockDocument(): SolidTypeDoc {
  const ydoc = new Y.Doc();
  // ... initialize
  return { ydoc, meta, state, features };
}

export function addSketchFeature(doc: SolidTypeDoc, id: string, plane: string) {
  const sketch = new Y.XmlElement("sketch");
  sketch.setAttribute("id", id);
  sketch.setAttribute("plane", plane);
  sketch.setAttribute("name", `Sketch${id.slice(1)}`);
  doc.features.push([sketch]);
}
```

---

## Coverage Goals

| Module           | Target Coverage |
| ---------------- | --------------- |
| `num/`           | 95%+            |
| `geom/`          | 90%+            |
| `topo/`          | 85%+            |
| `model/`         | 80%+            |
| `sketch/`        | 85%+            |
| `naming/`        | 80%+            |
| `mesh/`          | 80%+            |
| React Components | 70%+            |
| Hooks            | 80%+            |

---

## Minimum Test Requirements Per Phase

Each phase MUST include these test categories before completion:

### Phase 01: Document Model

- [ ] Document creation with default features
- [ ] Rebuild gate state management
- [ ] Undo/redo with UndoManager
- [ ] ID generation consistency
- [ ] Vector serialization/parsing

### Phase 02: Kernel-Viewer Wiring

- [ ] Yjs sync: initial state sent to worker
- [ ] Yjs sync: updates propagate to worker
- [ ] Rebuild triggered on feature change
- [ ] Rebuild gate stops at correct feature
- [ ] Mesh data returned with transferable arrays
- [ ] Error reporting with feature ID

### Phase 03-04: Sketch + Extrude Add

- [ ] Sketch creation in Yjs
- [ ] Profile extraction (closed loop detection)
- [ ] Extrude creates correct face count
- [ ] Face selectors assigned correctly
- [ ] Mesh tessellation produces valid geometry

### Phase 05-06: Extrude Cut + Revolve

- [ ] Boolean subtract updates body
- [ ] Face references survive cut (when not split)
- [ ] Revolve creates correct topology
- [ ] Partial revolve has cap faces

### Phase 07-08: Constraints + Dimensions

- [ ] Each constraint type solves correctly
- [ ] Under-constrained detection
- [ ] Over-constrained detection
- [ ] Dimension update triggers re-solve

### Phase 09-10: Arcs + Curves

- [ ] Arc entity creation
- [ ] Point-on-arc constraint
- [ ] Curved profile extrusion
- [ ] Tangent constraints

### Phase 11: 3D Selection

- [ ] Raycast returns face ID
- [ ] Face map correlates triangles to faces
- [ ] Persistent reference created on selection
- [ ] Reference resolves after parameter change

### Phase 12: Rebuild Gate

- [ ] Gate UI is draggable
- [ ] Features below gate are gated
- [ ] Gate persists in Yjs state
- [ ] Model shows state at gate position

### Regression Requirements

After each phase, ALL previous phase tests must still pass. Add to CI:

```bash
# CI script
pnpm test --bail  # Stop on first failure
```

---

## Running Tests

```bash
# Run all kernel tests
cd packages/core && pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test src/model/extrude.test.ts

# Watch mode
pnpm test --watch

# Run app tests
cd packages/app && pnpm test
```

---

## CI Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
          cache: "pnpm"

      - run: pnpm install
      - run: pnpm test
      - run: pnpm test:coverage

      - uses: codecov/codecov-action@v3
```
