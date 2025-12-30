# OpenCascade.js Integration Refactor

> ✅ **COMPLETED**: This refactor has been implemented. The kernel layer is now powered by OpenCascade.js.
> See `packages/core/src/kernel/` for the implementation and `packages/core/src/api/SolidSession.ts` for the public API.

---

## Overview

This document outlines the refactor to replace SolidType's custom CAD kernel with [OpenCascade.js](https://ocjs.org) - a WebAssembly port of the production-grade OpenCascade (OCCT) CAD kernel.

**Why this change:**
- Our custom boolean operations have persistent numerical stability issues with tilted geometry
- OCCT is battle-tested with 30+ years of development, used by FreeCAD, KiCad, and commercial products
- This frees us to focus on SolidType's differentiators: AI integration, modern UX, and constraint-based parametrics

**Key links:**
- Documentation: https://ocjs.org
- GitHub: https://github.com/donalffons/opencascade.js
- Examples: https://github.com/nicholasdavies/opencascade.js-examples

---

## Architecture After Refactor

**Key principle: The app consumes our clean API, not OCCT directly.**

```
┌─────────────────────────────────────────────────────────────┐
│                      @solidtype/app                          │
│   React UI • Feature Tree • Sketch Editor • AI Chat          │
│   Three.js Viewer • Collaboration • File Management          │
│                                                              │
│   Uses ONLY: SolidSession, Sketch, SketchProfile, etc.       │
│   Does NOT know about: OCCT, TopoDS_Shape, BRepAlgoAPI       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      @solidtype/core                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PUBLIC API (api/)                        │   │
│  │                                                       │   │
│  │  SolidSession        - Main modeling session          │   │
│  │  Body, Face, Edge    - Opaque handles (not OCCT)      │   │
│  │  Sketch, Constraint  - 2D sketch system               │   │
│  │  SketchProfile       - Closed sketch region           │   │
│  │  Mesh                - Tessellated output             │   │
│  │                                                       │   │
│  │  This is the ONLY layer the app imports from core.    │   │
│  │  Clean types, good docs, stable interface.            │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              INTERNAL: occt/ (private)                │   │
│  │                                                       │   │
│  │  OCCTKernel          - Singleton, manages WASM init   │   │
│  │  Shape               - Wrapper with memory mgmt       │   │
│  │  primitives.ts       - Box, cylinder, sphere          │   │
│  │  operations.ts       - Extrude, revolve, boolean      │   │
│  │  tessellate.ts       - Shape → Mesh conversion        │   │
│  │  sketch-to-wire.ts   - SketchProfile → OCCT Face      │   │
│  │                                                       │   │
│  │  NOT exported from @solidtype/core package.           │   │
│  │  Implementation detail that can be swapped.           │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              KEEP (our code)                          │   │
│  │                                                       │   │
│  │  sketch/             - 2D sketch & constraints        │   │
│  │  naming/             - Persistent naming system       │   │
│  │  num/                - Numeric utilities              │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              REMOVE (replaced by OCCT)                │   │
│  │                                                       │   │
│  │  boolean/            - All boolean operation code     │   │
│  │  topo/TopoModel.ts   - Our B-Rep structure            │   │
│  │  mesh/tessellate*    - Tessellation code              │   │
│  │  model/extrude.ts    - Use OCCT instead               │   │
│  │  model/revolve.ts    - Use OCCT instead               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  opencascade.js (WASM)                       │
│     npm package: opencascade.js                              │
│     ~15-30MB custom build                                    │
│                                                              │
│     Hidden behind occt/ layer - app never touches this.     │
└─────────────────────────────────────────────────────────────┘
```

### Why This Layering Matters

1. **Swappable implementation**: We could replace OCCT with another kernel without app changes
2. **Clean types**: Our API uses simple TypeScript types, not OCCT's C++ conventions
3. **Testable**: We can mock the kernel for unit tests
4. **Stable interface**: OCCT API changes don't break the app
5. **Better DX**: Our API is designed for our use cases, with good docs

---

## Public API Definition

This is the API that `@solidtype/app` consumes. It should be clean, well-typed, and completely hide OCCT.

### Core Types

```typescript
// packages/core/src/api/types.ts

/** Opaque handle to a body in the session */
export type BodyId = number & { readonly __brand: 'BodyId' };

/** Opaque handle to a face */
export type FaceId = number & { readonly __brand: 'FaceId' };

/** Opaque handle to an edge */
export type EdgeId = number & { readonly __brand: 'EdgeId' };

/** Tessellated mesh for rendering */
export interface Mesh {
  readonly vertices: Float32Array;  // [x1,y1,z1, x2,y2,z2, ...]
  readonly normals: Float32Array;   // [nx1,ny1,nz1, ...]
  readonly indices: Uint32Array;    // Triangle indices
}

/** Bounding box */
export interface BoundingBox {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

/** Result of a modeling operation */
export type OperationResult<T = void> = 
  | { success: true; value: T }
  | { success: false; error: ModelingError };

/** Modeling error with context */
export interface ModelingError {
  code: 'BOOLEAN_FAILED' | 'INVALID_PROFILE' | 'SELF_INTERSECTION' | 'UNKNOWN';
  message: string;
  details?: Record<string, unknown>;
}
```

### SolidSession Interface

```typescript
// packages/core/src/api/SolidSession.ts

import type { BodyId, FaceId, Mesh, BoundingBox, OperationResult } from './types.js';
import type { SketchProfile } from '../sketch/sketchProfile.js';
import type { DatumPlane } from '../model/planes.js';

export type ExtrudeOperation = 'add' | 'cut' | 'new';

export interface ExtrudeOptions {
  operation: ExtrudeOperation;
  distance: number;
  direction?: [number, number, number];  // Default: profile plane normal
  symmetric?: boolean;                    // Extrude both directions
  targetBody?: BodyId;                    // For add/cut operations
}

export interface FilletOptions {
  radius: number;
  edges?: EdgeId[];  // If omitted, fillet all edges
}

/**
 * Main session for solid modeling operations.
 * 
 * This is the primary API for the app to interact with the CAD kernel.
 * The underlying implementation (OCCT) is completely hidden.
 * 
 * @example
 * ```typescript
 * const session = new SolidSession();
 * await session.init();
 * 
 * const profile = session.createRectangleProfile(XY_PLANE, 10, 20);
 * const bodyId = session.extrude(profile, { operation: 'new', distance: 5 });
 * const mesh = session.tessellate(bodyId);
 * ```
 */
export class SolidSession {
  /**
   * Initialize the session. Must be called before any operations.
   * Loads the WASM kernel asynchronously.
   */
  async init(): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Primitives
  // ─────────────────────────────────────────────────────────────

  /** Create a box primitive */
  createBox(width: number, height: number, depth: number): BodyId;

  /** Create a cylinder primitive */
  createCylinder(radius: number, height: number): BodyId;

  /** Create a sphere primitive */
  createSphere(radius: number): BodyId;

  // ─────────────────────────────────────────────────────────────
  // Sketch-based operations
  // ─────────────────────────────────────────────────────────────

  /** Create a rectangular sketch profile */
  createRectangleProfile(plane: DatumPlane, width: number, height: number): SketchProfile;

  /** Create a circular sketch profile */
  createCircleProfile(plane: DatumPlane, radius: number): SketchProfile;

  /** Create a profile from arbitrary vertices */
  createPolygonProfile(plane: DatumPlane, vertices: [number, number][]): SketchProfile;

  /** Extrude a sketch profile */
  extrude(profile: SketchProfile, options: ExtrudeOptions): OperationResult<BodyId>;

  /** Revolve a sketch profile around an axis */
  revolve(
    profile: SketchProfile,
    axis: { origin: [number, number, number]; direction: [number, number, number] },
    angleDegrees: number,
    options?: { operation?: ExtrudeOperation; targetBody?: BodyId }
  ): OperationResult<BodyId>;

  // ─────────────────────────────────────────────────────────────
  // Boolean operations
  // ─────────────────────────────────────────────────────────────

  /** Union two bodies */
  union(bodyA: BodyId, bodyB: BodyId): OperationResult<BodyId>;

  /** Subtract bodyB from bodyA */
  subtract(bodyA: BodyId, bodyB: BodyId): OperationResult<BodyId>;

  /** Intersect two bodies */
  intersect(bodyA: BodyId, bodyB: BodyId): OperationResult<BodyId>;

  // ─────────────────────────────────────────────────────────────
  // Modification operations
  // ─────────────────────────────────────────────────────────────

  /** Apply fillet to edges */
  fillet(bodyId: BodyId, options: FilletOptions): OperationResult<void>;

  /** Apply chamfer to edges */
  chamfer(bodyId: BodyId, distance: number, edges?: EdgeId[]): OperationResult<void>;

  // ─────────────────────────────────────────────────────────────
  // Query operations
  // ─────────────────────────────────────────────────────────────

  /** Get tessellated mesh for rendering */
  tessellate(bodyId: BodyId, quality?: 'low' | 'medium' | 'high'): Mesh;

  /** Get bounding box of a body */
  getBoundingBox(bodyId: BodyId): BoundingBox;

  /** Get all faces of a body */
  getFaces(bodyId: BodyId): FaceId[];

  /** Get all edges of a body */
  getEdges(bodyId: BodyId): EdgeId[];

  /** Check if a body is valid (manifold, closed) */
  isValid(bodyId: BodyId): boolean;

  // ─────────────────────────────────────────────────────────────
  // Import/Export
  // ─────────────────────────────────────────────────────────────

  /** Export body to STEP format */
  exportSTEP(bodyId: BodyId): Uint8Array;

  /** Import body from STEP format */
  importSTEP(data: Uint8Array): OperationResult<BodyId>;

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  /** Delete a body and free memory */
  deleteBody(bodyId: BodyId): void;

  /** Dispose the session and free all resources */
  dispose(): void;
}
```

### Example Usage in App

```typescript
// packages/app/src/worker/kernel.worker.ts
import { SolidSession, XY_PLANE } from '@solidtype/core';

const session = new SolidSession();

async function handleMessage(msg: WorkerMessage) {
  await session.init();  // Idempotent, safe to call multiple times

  switch (msg.type) {
    case 'createBox': {
      const bodyId = session.createBox(msg.width, msg.height, msg.depth);
      const mesh = session.tessellate(bodyId);
      return { bodyId, mesh };
    }

    case 'extrudeSketch': {
      const profile = session.createPolygonProfile(msg.plane, msg.vertices);
      const result = session.extrude(profile, {
        operation: msg.operation,
        distance: msg.distance,
        targetBody: msg.targetBodyId,
      });
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      const mesh = session.tessellate(result.value);
      return { bodyId: result.value, mesh };
    }
  }
}
```

---

## Phase 1: Setup & Basic Integration

### 1.1 Install opencascade.js

```bash
cd packages/core
pnpm add opencascade.js
```

### 1.2 Module Structure

Create two distinct layers:

```
packages/core/src/
├── api/                    # PUBLIC API - what the app imports
│   ├── index.ts            # Re-exports public types
│   ├── SolidSession.ts     # Main session class (thin wrapper)
│   ├── types.ts            # BodyId, FaceId, Mesh, etc.
│   └── errors.ts           # Typed errors for operations
│
├── kernel/                 # PRIVATE - OCCT implementation
│   ├── index.ts            # Internal exports only
│   ├── init.ts             # OCCT initialization
│   ├── OCCTKernel.ts       # Singleton kernel manager
│   ├── Shape.ts            # TopoDS_Shape wrapper with memory mgmt
│   ├── primitives.ts       # Box, cylinder, sphere
│   ├── operations.ts       # Extrude, revolve, boolean
│   ├── sketch-to-wire.ts   # SketchProfile → OCCT Face
│   ├── tessellate.ts       # Shape → Mesh conversion
│   └── io.ts               # STEP/IGES import/export
│
├── sketch/                 # KEEP - 2D sketch system
├── naming/                 # KEEP - Persistent naming
└── num/                    # KEEP - Numeric utilities
```

**Key export rules:**
- `@solidtype/core` exports ONLY from `api/`
- `kernel/` is never exported - internal implementation detail
- App imports: `import { SolidSession } from '@solidtype/core'`

### 1.3 OCCT Initialization

```typescript
// packages/core/src/occt/init.ts
import initOpenCascade, { OpenCascadeInstance } from 'opencascade.js';

let oc: OpenCascadeInstance | null = null;
let initPromise: Promise<OpenCascadeInstance> | null = null;

/**
 * Initialize OpenCascade.js. Call this once at app startup.
 * Safe to call multiple times - will return cached instance.
 */
export async function initOCCT(): Promise<OpenCascadeInstance> {
  if (oc) return oc;
  
  if (!initPromise) {
    initPromise = initOpenCascade().then(instance => {
      oc = instance;
      console.log('OpenCascade.js initialized');
      return instance;
    });
  }
  
  return initPromise;
}

/**
 * Get the OCCT instance. Throws if not initialized.
 */
export function getOC(): OpenCascadeInstance {
  if (!oc) {
    throw new Error('OCCT not initialized. Call initOCCT() first.');
  }
  return oc;
}

/**
 * Check if OCCT is initialized.
 */
export function isOCCTInitialized(): boolean {
  return oc !== null;
}
```

### 1.4 Shape Wrapper with Memory Management

OCCT objects must be manually deleted to prevent memory leaks:

```typescript
// packages/core/src/occt/Shape.ts
import { getOC } from './init.js';
import type { TopoDS_Shape } from 'opencascade.js';

/**
 * Wrapper for TopoDS_Shape that handles memory management.
 * 
 * IMPORTANT: Always use Shape.dispose() when done, or use
 * Shape.using() for automatic cleanup.
 */
export class Shape {
  private _shape: TopoDS_Shape;
  private _disposed = false;

  constructor(shape: TopoDS_Shape) {
    this._shape = shape;
  }

  get raw(): TopoDS_Shape {
    if (this._disposed) {
      throw new Error('Shape has been disposed');
    }
    return this._shape;
  }

  get isNull(): boolean {
    return this._shape.IsNull();
  }

  /**
   * Clone this shape (deep copy).
   */
  clone(): Shape {
    const oc = getOC();
    const copy = new oc.BRepBuilderAPI_Copy_2(this._shape, true, false);
    return new Shape(copy.Shape());
  }

  /**
   * Free the underlying OCCT memory.
   */
  dispose(): void {
    if (!this._disposed) {
      this._shape.delete();
      this._disposed = true;
    }
  }

  /**
   * Execute a function with this shape, then dispose.
   */
  using<T>(fn: (shape: Shape) => T): T {
    try {
      return fn(this);
    } finally {
      this.dispose();
    }
  }

  /**
   * Static helper for using multiple shapes.
   */
  static usingAll<T>(shapes: Shape[], fn: (shapes: Shape[]) => T): T {
    try {
      return fn(shapes);
    } finally {
      shapes.forEach(s => s.dispose());
    }
  }
}
```

---

## Phase 2: Primitives & Basic Operations

### 2.1 Primitive Shapes

```typescript
// packages/core/src/occt/primitives.ts
import { getOC } from './init.js';
import { Shape } from './Shape.js';

/**
 * Create a box centered at origin or at a corner.
 */
export function makeBox(
  width: number, 
  height: number, 
  depth: number,
  centered = false
): Shape {
  const oc = getOC();
  
  if (centered) {
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;
    const corner1 = new oc.gp_Pnt_3(-halfW, -halfH, -halfD);
    const corner2 = new oc.gp_Pnt_3(halfW, halfH, halfD);
    const box = new oc.BRepPrimAPI_MakeBox_4(corner1, corner2);
    corner1.delete();
    corner2.delete();
    return new Shape(box.Shape());
  }
  
  const box = new oc.BRepPrimAPI_MakeBox_2(width, height, depth);
  return new Shape(box.Shape());
}

/**
 * Create a cylinder along Z axis.
 */
export function makeCylinder(radius: number, height: number): Shape {
  const oc = getOC();
  const cyl = new oc.BRepPrimAPI_MakeCylinder_1(radius, height);
  return new Shape(cyl.Shape());
}

/**
 * Create a sphere at origin.
 */
export function makeSphere(radius: number): Shape {
  const oc = getOC();
  const sphere = new oc.BRepPrimAPI_MakeSphere_1(radius);
  return new Shape(sphere.Shape());
}
```

### 2.2 Boolean Operations

```typescript
// packages/core/src/occt/operations.ts
import { getOC } from './init.js';
import { Shape } from './Shape.js';

export type BooleanOp = 'union' | 'subtract' | 'intersect';

/**
 * Perform a boolean operation on two shapes.
 */
export function booleanOp(base: Shape, tool: Shape, op: BooleanOp): Shape {
  const oc = getOC();
  const progress = new oc.Message_ProgressRange_1();
  
  let result: TopoDS_Shape;
  
  switch (op) {
    case 'union': {
      const fuse = new oc.BRepAlgoAPI_Fuse_3(base.raw, tool.raw, progress);
      fuse.Build(progress);
      result = fuse.Shape();
      break;
    }
    case 'subtract': {
      const cut = new oc.BRepAlgoAPI_Cut_3(base.raw, tool.raw, progress);
      cut.Build(progress);
      result = cut.Shape();
      break;
    }
    case 'intersect': {
      const common = new oc.BRepAlgoAPI_Common_3(base.raw, tool.raw, progress);
      common.Build(progress);
      result = common.Shape();
      break;
    }
  }
  
  progress.delete();
  return new Shape(result);
}

/**
 * Add a fillet to all edges of a shape.
 */
export function fillet(shape: Shape, radius: number): Shape {
  const oc = getOC();
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape.raw, oc.ChFi3d_Rational);
  
  // Add all edges
  const explorer = new oc.TopExp_Explorer_2(
    shape.raw, 
    oc.TopAbs_ShapeEnum.TopAbs_EDGE, 
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  
  while (explorer.More()) {
    const edge = oc.TopoDS.Edge_1(explorer.Current());
    fillet.Add_2(radius, edge);
    explorer.Next();
  }
  
  explorer.delete();
  fillet.Build(new oc.Message_ProgressRange_1());
  return new Shape(fillet.Shape());
}
```

### 2.3 Extrude & Revolve

```typescript
// packages/core/src/occt/operations.ts (continued)

/**
 * Extrude a face or wire along a direction.
 */
export function extrude(profile: Shape, direction: [number, number, number], distance: number): Shape {
  const oc = getOC();
  
  const vec = new oc.gp_Vec_4(
    direction[0] * distance,
    direction[1] * distance,
    direction[2] * distance
  );
  
  const prism = new oc.BRepPrimAPI_MakePrism_1(profile.raw, vec, false, true);
  vec.delete();
  
  return new Shape(prism.Shape());
}

/**
 * Revolve a face or wire around an axis.
 */
export function revolve(
  profile: Shape, 
  axisOrigin: [number, number, number],
  axisDirection: [number, number, number],
  angleDegrees: number
): Shape {
  const oc = getOC();
  
  const origin = new oc.gp_Pnt_3(axisOrigin[0], axisOrigin[1], axisOrigin[2]);
  const dir = new oc.gp_Dir_4(axisDirection[0], axisDirection[1], axisDirection[2]);
  const axis = new oc.gp_Ax1_2(origin, dir);
  
  const angleRad = angleDegrees * Math.PI / 180;
  const revol = new oc.BRepPrimAPI_MakeRevol_1(profile.raw, axis, angleRad, true);
  
  origin.delete();
  dir.delete();
  axis.delete();
  
  return new Shape(revol.Shape());
}
```

---

## Phase 3: Sketch to OCCT Wire Conversion

This is critical - we need to convert our existing Sketch system to OCCT wires:

```typescript
// packages/core/src/occt/sketch-to-wire.ts
import { getOC } from './init.js';
import { Shape } from './Shape.js';
import type { Sketch } from '../sketch/sketch.js';
import type { SketchProfile } from '../model/sketchProfile.js';

/**
 * Convert a SketchProfile to an OCCT Face.
 * 
 * The profile contains 2D curves in the sketch plane coordinate system.
 * We need to:
 * 1. Create OCCT 2D curves (lines, arcs)
 * 2. Build a wire from the curves
 * 3. Create a face from the wire
 * 4. Transform to the sketch plane in 3D
 */
export function sketchProfileToFace(profile: SketchProfile): Shape {
  const oc = getOC();
  
  // Get the sketch plane transformation
  const plane = profile.plane;
  const origin = plane.origin;
  const normal = plane.normal;
  const xDir = plane.xDirection;
  
  // Create OCCT coordinate system
  const ax2Origin = new oc.gp_Pnt_3(origin[0], origin[1], origin[2]);
  const ax2Normal = new oc.gp_Dir_4(normal[0], normal[1], normal[2]);
  const ax2XDir = new oc.gp_Dir_4(xDir[0], xDir[1], xDir[2]);
  const ax2 = new oc.gp_Ax2_3(ax2Origin, ax2Normal, ax2XDir);
  
  // Build wire from profile vertices
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  const vertices = profile.vertices; // Vec2[] in sketch plane coords
  
  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    
    // Create 3D points by transforming from sketch plane
    const p1 = transformToPlane(curr, origin, xDir, getYDirection(normal, xDir));
    const p2 = transformToPlane(next, origin, xDir, getYDirection(normal, xDir));
    
    const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
    const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);
    
    const edge = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
    wireBuilder.Add_1(edge.Edge());
    
    gp1.delete();
    gp2.delete();
  }
  
  const wire = wireBuilder.Wire();
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
  
  // Cleanup
  ax2Origin.delete();
  ax2Normal.delete();
  ax2XDir.delete();
  ax2.delete();
  
  return new Shape(faceBuilder.Face());
}

function transformToPlane(
  point2D: [number, number],
  origin: [number, number, number],
  xDir: [number, number, number],
  yDir: [number, number, number]
): [number, number, number] {
  return [
    origin[0] + point2D[0] * xDir[0] + point2D[1] * yDir[0],
    origin[1] + point2D[0] * xDir[1] + point2D[1] * yDir[1],
    origin[2] + point2D[0] * xDir[2] + point2D[1] * yDir[2],
  ];
}

function getYDirection(
  normal: [number, number, number],
  xDir: [number, number, number]
): [number, number, number] {
  // Y = Normal × X
  return [
    normal[1] * xDir[2] - normal[2] * xDir[1],
    normal[2] * xDir[0] - normal[0] * xDir[2],
    normal[0] * xDir[1] - normal[1] * xDir[0],
  ];
}
```

---

## Phase 4: Tessellation for Three.js

```typescript
// packages/core/src/occt/tessellate.ts
import { getOC } from './init.js';
import { Shape } from './Shape.js';

export interface TessellatedMesh {
  vertices: Float32Array;   // Flat array: [x1, y1, z1, x2, y2, z2, ...]
  normals: Float32Array;    // Flat array: [nx1, ny1, nz1, ...]
  indices: Uint32Array;     // Triangle indices
}

/**
 * Tessellate a shape for rendering.
 * 
 * @param shape - The shape to tessellate
 * @param linearDeflection - Max distance from mesh to real surface (default 0.1mm)
 * @param angularDeflection - Max angle between adjacent triangles (default 0.5 rad)
 */
export function tessellate(
  shape: Shape,
  linearDeflection = 0.1,
  angularDeflection = 0.5
): TessellatedMesh {
  const oc = getOC();
  
  // Perform tessellation
  new oc.BRepMesh_IncrementalMesh_2(
    shape.raw,
    linearDeflection,
    false,
    angularDeflection,
    false
  );
  
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let indexOffset = 0;
  
  // Iterate over all faces
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape.raw,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  
  while (faceExplorer.More()) {
    const face = oc.TopoDS.Face_1(faceExplorer.Current());
    const location = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);
    
    if (!triangulation.IsNull()) {
      const transform = location.Transformation();
      const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
      
      // Get vertices
      const numNodes = triangulation.get().NbNodes();
      const nodeStart = vertices.length / 3;
      
      for (let i = 1; i <= numNodes; i++) {
        const node = triangulation.get().Node(i);
        const transformed = node.Transformed(transform);
        vertices.push(transformed.X(), transformed.Y(), transformed.Z());
        
        // Compute normal (simplified - use face normal for planar)
        // For curved faces, OCCT provides per-vertex normals
        if (triangulation.get().HasUVNodes()) {
          const uv = triangulation.get().UVNode(i);
          // Could compute proper normal from surface here
        }
      }
      
      // Get triangles
      const numTriangles = triangulation.get().NbTriangles();
      for (let i = 1; i <= numTriangles; i++) {
        const triangle = triangulation.get().Triangle(i);
        let n1 = triangle.Value(1) - 1 + nodeStart;
        let n2 = triangle.Value(2) - 1 + nodeStart;
        let n3 = triangle.Value(3) - 1 + nodeStart;
        
        if (isReversed) {
          [n2, n3] = [n3, n2]; // Flip winding
        }
        
        indices.push(n1, n2, n3);
      }
    }
    
    location.delete();
    faceExplorer.Next();
  }
  
  faceExplorer.delete();
  
  // Compute normals from triangles
  const computedNormals = computeNormals(vertices, indices);
  
  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(computedNormals),
    indices: new Uint32Array(indices),
  };
}

function computeNormals(vertices: number[], indices: number[]): number[] {
  const normals = new Array(vertices.length).fill(0);
  
  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i] * 3;
    const i2 = indices[i + 1] * 3;
    const i3 = indices[i + 2] * 3;
    
    // Triangle vertices
    const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
    const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
    const v3 = [vertices[i3], vertices[i3 + 1], vertices[i3 + 2]];
    
    // Edges
    const e1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const e2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    
    // Cross product
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    
    // Accumulate
    for (const idx of [i1, i2, i3]) {
      normals[idx] += n[0];
      normals[idx + 1] += n[1];
      normals[idx + 2] += n[2];
    }
  }
  
  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2);
    if (len > 0) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }
  
  return normals;
}
```

---

## Phase 5: Internal Kernel Implementation

The `OCCTKernel` class is the **internal** implementation that `SolidSession` delegates to.
This is NOT exported from `@solidtype/core` - it's an implementation detail.

```typescript
// packages/core/src/kernel/OCCTKernel.ts (INTERNAL - not exported)
import { initOCCT, getOC } from './init.js';
import { Shape } from './Shape.js';
import { makeBox, makeCylinder, makeSphere } from './primitives.js';
import { booleanOp, extrude, revolve, fillet } from './operations.js';
import { sketchProfileToFace } from './sketch-to-wire.js';
import { tessellate, TessellatedMesh } from './tessellate.js';
import type { SketchProfile } from '../model/sketchProfile.js';

export type ExtrudeOperation = 'add' | 'cut';

/**
 * Internal OCCT kernel implementation.
 * 
 * NOT EXPORTED - this is an implementation detail.
 * SolidSession (the public API) delegates to this class.
 */
class OCCTKernel {
  private bodies: Map<number, Shape> = new Map();
  private nextBodyId = 0;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await initOCCT();
    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Session not initialized. Call init() first.');
    }
  }

  /**
   * Create a box primitive.
   */
  createBox(width: number, height: number, depth: number): number {
    this.ensureInitialized();
    const shape = makeBox(width, height, depth);
    const id = this.nextBodyId++;
    this.bodies.set(id, shape);
    return id;
  }

  /**
   * Extrude a sketch profile.
   */
  extrudeProfile(
    profile: SketchProfile,
    distance: number,
    operation: ExtrudeOperation = 'add',
    targetBodyId?: number
  ): number {
    this.ensureInitialized();
    
    // Convert sketch to OCCT face
    const face = sketchProfileToFace(profile);
    
    // Get extrusion direction from profile plane normal
    const direction = profile.plane.normal;
    
    // Create extruded solid
    const extrudedShape = extrude(face, direction, distance);
    face.dispose();
    
    if (operation === 'add' && targetBodyId !== undefined) {
      // Union with existing body
      const target = this.bodies.get(targetBodyId);
      if (!target) throw new Error(`Body ${targetBodyId} not found`);
      
      const result = booleanOp(target, extrudedShape, 'union');
      target.dispose();
      extrudedShape.dispose();
      
      this.bodies.set(targetBodyId, result);
      return targetBodyId;
      
    } else if (operation === 'cut' && targetBodyId !== undefined) {
      // Subtract from existing body
      const target = this.bodies.get(targetBodyId);
      if (!target) throw new Error(`Body ${targetBodyId} not found`);
      
      const result = booleanOp(target, extrudedShape, 'subtract');
      target.dispose();
      extrudedShape.dispose();
      
      this.bodies.set(targetBodyId, result);
      return targetBodyId;
      
    } else {
      // Create new body
      const id = this.nextBodyId++;
      this.bodies.set(id, extrudedShape);
      return id;
    }
  }

  /**
   * Apply fillet to all edges of a body.
   */
  filletBody(bodyId: number, radius: number): void {
    this.ensureInitialized();
    
    const body = this.bodies.get(bodyId);
    if (!body) throw new Error(`Body ${bodyId} not found`);
    
    const filleted = fillet(body, radius);
    body.dispose();
    this.bodies.set(bodyId, filleted);
  }

  /**
   * Get tessellated mesh for rendering.
   */
  tessellateBody(bodyId: number): TessellatedMesh {
    this.ensureInitialized();
    
    const body = this.bodies.get(bodyId);
    if (!body) throw new Error(`Body ${bodyId} not found`);
    
    return tessellate(body);
  }

  /**
   * Delete a body and free memory.
   */
  deleteBody(bodyId: number): void {
    const body = this.bodies.get(bodyId);
    if (body) {
      body.dispose();
      this.bodies.delete(bodyId);
    }
  }

  /**
   * Cleanup all resources.
   */
  dispose(): void {
    for (const body of this.bodies.values()) {
      body.dispose();
    }
    this.bodies.clear();
  }
}
```

---

## Phase 6: Update App Worker

The app worker uses `SolidSession` from our public API - it knows nothing about OCCT:

```typescript
// packages/app/src/worker/kernel.worker.ts

import { SolidSession } from '@solidtype/core';  // Clean public API

let session: SolidSession | null = null;

async function ensureSession(): Promise<SolidSession> {
  if (!session) {
    session = new SolidSession();
    await session.init();  // Internally loads OCCT WASM
  }
  return session;
}

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, payload, id } = event.data;
  
  try {
    const sess = await ensureSession();
    let result: unknown;
    
    switch (type) {
      case 'createBox': {
        const bodyId = sess.createBox(payload.width, payload.height, payload.depth);
        const mesh = sess.tessellate(bodyId);
        result = { bodyId, mesh };
        break;
      }
        
      case 'extrudeSketch': {
        const profile = sess.createPolygonProfile(payload.plane, payload.vertices);
        const extrudeResult = sess.extrude(profile, {
          operation: payload.operation,
          distance: payload.distance,
          targetBody: payload.targetBodyId,
        });
        
        if (!extrudeResult.success) {
          throw new Error(extrudeResult.error.message);
        }
        
        const mesh = sess.tessellate(extrudeResult.value);
        result = { bodyId: extrudeResult.value, mesh };
        break;
      }
        
      case 'tessellate': {
        result = sess.tessellate(payload.bodyId);
        break;
      }
        
      // ... other operations
    }
    
    self.postMessage({ id, success: true, result });
    
  } catch (error) {
    self.postMessage({ 
      id, 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
};
```

---

## Phase 7: Migration Checklist

### Files to CREATE:
- [ ] `packages/core/src/api/SolidSession.ts` - Public API (see Public API Definition above)
- [ ] `packages/core/src/api/types.ts` - BodyId, FaceId, Mesh, etc.
- [ ] `packages/core/src/api/errors.ts` - ModelingError types
- [ ] `packages/core/src/api/index.ts` - Public exports
- [ ] `packages/core/src/kernel/` - All OCCT wrapper code (see Phase 1-5)

### Files to KEEP (update imports):
- [ ] `packages/core/src/sketch/*` - Sketch system
- [ ] `packages/core/src/naming/*` - Naming system  
- [ ] `packages/core/src/num/*` - Numeric utilities (still useful for sketch)
- [ ] `packages/core/src/geom/curve2d.ts` - 2D curves for sketches
- [ ] `packages/core/src/model/planes.ts` - DatumPlane definitions
- [ ] `packages/core/src/model/sketchProfile.ts` - SketchProfile type

### Files to REMOVE (after migration complete):
- [ ] `packages/core/src/boolean/*` - All boolean code
- [ ] `packages/core/src/topo/TopoModel.ts` - Our B-Rep structure
- [ ] `packages/core/src/mesh/tessellateBody.ts` - Old tessellation
- [ ] `packages/core/src/mesh/tessellateFace.ts` - Old tessellation
- [ ] `packages/core/src/model/boolean.ts` - Old boolean entry point
- [ ] `packages/core/src/model/extrude.ts` - Replace with OCCT
- [ ] `packages/core/src/model/revolve.ts` - Replace with OCCT

### Files to UPDATE:
- [ ] `packages/core/src/index.ts` - Export from `api/`, NOT from `kernel/`
- [ ] `packages/app/src/worker/kernel.worker.ts` - Use SolidSession from public API

### Documentation to UPDATE (see Phase 8):
- [ ] `ARCHITECTURE.md` - New module structure
- [ ] `OVERVIEW.md` - Technical approach
- [ ] `AGENTS.md` - Updated guidance
- [ ] Mark `KERNEL-REFACTOR.md` as superseded

---

## Testing Strategy

### Unit Tests (packages/core)

Test via the **public API** (`SolidSession`), not the internal kernel:

```typescript
// packages/core/src/api/SolidSession.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SolidSession, XY_PLANE } from './index.js';

describe('SolidSession', () => {
  let session: SolidSession;

  beforeAll(async () => {
    session = new SolidSession();
    await session.init();
  });

  it('creates a box and tessellates it', () => {
    const bodyId = session.createBox(10, 20, 30);
    const mesh = session.tessellate(bodyId);
    
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    
    // Box should have 8 vertices (possibly more due to triangulation)
    expect(mesh.vertices.length / 3).toBeGreaterThanOrEqual(8);
  });

  it('extrudes a sketch profile', async () => {
    const profile = session.createRectangleProfile(XY_PLANE, 10, 20);
    const result = session.extrude(profile, { operation: 'new', distance: 5 });
    
    expect(result.success).toBe(true);
    if (result.success) {
      const mesh = session.tessellate(result.value);
      expect(mesh.vertices.length).toBeGreaterThan(0);
    }
  });

  it('performs boolean subtract (the tilted geometry case)', async () => {
    // Create base box
    const baseId = session.createBox(20, 20, 20);
    
    // Create tilted cut profile and subtract
    const tiltedPlane = session.createDatumPlane(/* tilted 20° */);
    const profile = session.createRectangleProfile(tiltedPlane, 10, 10);
    const result = session.extrude(profile, {
      operation: 'cut',
      distance: 30,
      targetBody: baseId,
    });
    
    expect(result.success).toBe(true);
    const mesh = session.tessellate(baseId);
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests (app)

- [ ] Create box via UI → renders correctly
- [ ] Extrude sketch → produces solid
- [ ] Boolean cut → removes material correctly
- [ ] Tilted geometry (the original failing case) → works correctly

---

## Success Criteria

1. **Boolean operations work for all orientations** including tilted/angled geometry
2. **All existing UI features work** (create sketch, extrude, cut, etc.)
3. **Performance is acceptable** (operations < 100ms for simple geometry)
4. **Memory is managed** (no leaks during normal usage)
5. **Bundle size is reasonable** (< 30MB for WASM module)

---

## Known Considerations

### Bundle Size
OpenCascade.js supports custom builds. Start with the full build, then optimize:

```javascript
// opencascade.js custom build config
{
  "include": [
    "BRepPrimAPI",     // Primitives
    "BRepAlgoAPI",     // Boolean operations
    "BRepBuilderAPI",  // Shape construction
    "BRepFilletAPI",   // Fillets
    "BRepMesh",        // Tessellation
    "TopExp",          // Topology exploration
    "TopoDS",          // Topology data structures
  ]
}
```

### Memory Management
OCCT objects must be manually deleted. The `Shape` wrapper class handles this, but be careful with intermediate objects in complex operations.

### Threading
OpenCascade.js supports Web Workers and SharedArrayBuffer for parallel operations. Consider using this for complex boolean operations.

---

## Phase 8: Documentation Updates (REQUIRED)

**When the refactor is complete, you MUST update these documents to reflect the new architecture:**

### ARCHITECTURE.md

Update to reflect:
- [ ] New module structure (`api/`, `kernel/` instead of `boolean/`, `topo/`)
- [ ] Remove references to `TopoModel`, our custom B-Rep
- [ ] Add `kernel/` section explaining OCCT integration
- [ ] Update the layer diagram
- [ ] Update the "packages/core" module list

### OVERVIEW.md

Update to reflect:
- [ ] Change "custom CAD kernel" → "OCCT-powered kernel"
- [ ] Update any technical approach sections mentioning our boolean implementation
- [ ] Keep focus on differentiators (AI, UX, constraints, naming)

### AGENTS.md

Update to reflect:
- [ ] Remove reference to `KERNEL-REFACTOR.md` as superseded
- [ ] Update module structure guidance
- [ ] Add guidance for working with OCCT wrapper layer

### Package Exports

Ensure `packages/core/src/index.ts` exports:
- [ ] `SolidSession` and public API types
- [ ] Sketch system exports
- [ ] Naming system exports
- [ ] Does NOT export anything from `kernel/`

### README Updates (if applicable)
- [ ] Update any architecture diagrams
- [ ] Update dependency list to mention opencascade.js
- [ ] Update build instructions if WASM setup is needed

### Cleanup
- [ ] Mark `KERNEL-REFACTOR.md` as superseded (add note at top)
- [ ] Remove or archive old boolean/topo test files
- [ ] Update any JSDoc comments referencing old architecture

---

## References

- OpenCascade.js Docs: https://ocjs.org/docs/getting-started
- OpenCascade.js Examples: https://github.com/nicholasdavies/opencascade.js-examples
- OCCT Reference: https://dev.opencascade.org/doc/refman/html/
- CascadeStudio (Code-CAD with OCCT.js): https://github.com/zalo/CascadeStudio
