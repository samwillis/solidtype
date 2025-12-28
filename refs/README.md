# Reference Implementations

This directory contains source code from open-source CAD kernels for reference when implementing SolidType's kernel. These are **read-only references** - do not modify them.

## Quick Start

```bash
# Download and extract all references
./download-refs.sh

# Download a specific reference
./download-refs.sh occt
./download-refs.sh cgal
./download-refs.sh freecad
./download-refs.sh fornjot
```

---

## Available References

### 1. Open CASCADE Technology (OCCT) - C++

**What it is**: The most widely-used open-source B-Rep kernel, used by FreeCAD, KiCad, and many commercial products.

**License**: LGPL-2.1 (permissive for reference use)

**Key directories to study**:

| Path | Purpose |
|------|---------|
| `src/IntTools/` | Surface-surface intersection algorithms |
| `src/BOPAlgo/` | Boolean operation algorithms (PaveFiller, Builder) |
| `src/ShapeAnalysis/` | SameParameter/SameRange validation |
| `src/ShapeFix/` | Shape healing algorithms |
| `src/BRepBuilderAPI/` | High-level B-Rep construction APIs |
| `src/Geom/` | Curve and surface geometry |
| `src/TopoDS/` | Topology data structures |

**When to reference**:
- Implementing boolean operations (imprint, classify, stitch)
- SameParameter validation and healing
- P-curve and UV-trimming logic
- Understanding production B-Rep patterns

**Key files for booleans**:
- `src/BOPAlgo/BOPAlgo_PaveFiller.cxx` - Face-face intersection and imprinting
- `src/BOPAlgo/BOPAlgo_Builder.cxx` - Boolean result construction
- `src/IntTools/IntTools_FaceFace.cxx` - Surface intersection

---

### 2. CGAL (Computational Geometry Algorithms Library) - C++

**What it is**: The gold standard for robust computational geometry algorithms, with exact predicates and constructions.

**License**: LGPL/GPL (varies by module)

**Key directories to study**:

| Path | Purpose |
|------|---------|
| `Arrangement_on_surface_2/` | 2D planar arrangements (DCEL) |
| `Nef_2/` | 2D Boolean operations |
| `Nef_3/` | 3D Boolean operations with exact arithmetic |
| `Surface_mesh/` | Half-edge mesh data structure |
| `Polygon_mesh_processing/` | Mesh boolean operations |

**When to reference**:
- **DCEL implementation** for planar arrangements (`Arrangement_on_surface_2`)
- Robust geometric predicates
- Proper handling of degenerate cases
- 2D polygon operations

**Key files for planar arrangements**:
- `Arrangement_on_surface_2/include/CGAL/Arr_dcel_base.h` - DCEL structure
- `Arrangement_on_surface_2/include/CGAL/Arrangement_2.h` - Main arrangement class
- `Arrangement_on_surface_2/include/CGAL/Arr_naive_point_location.h` - Point location

---

### 3. FreeCAD (realthunder's Toponaming Branch) - C++/Python

**What it is**: The most advanced open-source implementation of persistent topological naming, solving the "toponaming problem" that plagues many CAD systems.

**License**: LGPL-2.0+

**Key directories to study**:

| Path | Purpose |
|------|---------|
| `src/Mod/Part/App/TopoShape*.cpp` | Toponaming implementation |
| `src/Mod/Part/App/TopoShapeEx.cpp` | Extended shape operations with naming |
| `src/App/PropertyLinks.cpp` | Persistent reference storage |

**When to reference**:
- Implementing persistent naming (`naming/` module)
- Understanding shape evolution graphs
- Reference resolution after topology changes
- Feature-based modeling with stable references

**Key concepts**:
- "Mapped element" system for tracking face/edge identity
- Hash-based geometry fingerprinting
- Parent-child shape relationships

---

### 4. Fornjot - Rust

**What it is**: A modern B-Rep CAD kernel written in Rust, with similar goals to SolidType (pure, portable, modern language).

**License**: Apache-2.0 / MIT

**Key directories to study**:

| Path | Purpose |
|------|---------|
| `crates/fj-core/src/` | Core kernel implementation (topology, geometry, operations) |
| `crates/fj-math/src/` | Math primitives (vectors, points) |
| `crates/fj-interop/src/` | Mesh generation and export |

**When to reference**:
- Modern B-Rep design patterns
- Clean separation of concerns
- API design for a modern kernel
- Tessellation approaches

**Why it's useful**:
- Written by a single developer with excellent blog posts explaining decisions
- Very readable, well-documented code
- Similar "from scratch" approach to SolidType
- Modern type system patterns that translate well to TypeScript

---

## Usage Guidelines

1. **Read-only**: These are references, not dependencies. Never import from them.

2. **Understand, don't copy**: Study the algorithms and patterns, then implement in TypeScript following SolidType's architecture.

3. **Credit**: If you adapt a specific algorithm, add a comment like:
   ```typescript
   // Algorithm adapted from CGAL Arrangement_on_surface_2
   // See: refs/cgal/Arrangement_on_surface_2/...
   ```

4. **License awareness**: All these projects have open-source licenses permitting study and reference.

---

## Key Cross-Reference Table

| SolidType Module | OCCT Reference | CGAL Reference | Fornjot Reference |
|------------------|----------------|----------------|-------------------|
| `boolean/planar/dcel.ts` | `BOPAlgo_PaveFiller` | `Arr_dcel_base.h` | - |
| `boolean/planar/classify.ts` | `BOPAlgo_Tools` | `Polygon_mesh_processing` | - |
| `boolean/planar/stitch.ts` | `BOPAlgo_Builder` | - | - |
| `topo/validate.ts` | `ShapeAnalysis_*` | - | `fj-core/validation/` |
| `topo/heal.ts` | `ShapeFix_*` | - | - |
| `naming/` | - | - | - (use FreeCAD) |
| `geom/surface.ts` | `Geom_*Surface` | `Surface_mesh` | `fj-math` |
| `num/predicates.ts` | - | `Kernel/predicates` | - |

---

## Updating References

To update to newer versions, edit `download-refs.sh` with new release tags/commits, then re-run:

```bash
rm -rf occt cgal freecad fornjot
./download-refs.sh
```

---

## Disk Space

Approximate sizes after extraction:
- OCCT: ~285 MB
- CGAL: ~320 MB  
- FreeCAD: ~560 MB
- Fornjot: ~20 MB

Total: ~1.2 GB

These are gitignored and not committed to the repository.
