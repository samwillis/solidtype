# Phase 18: STL Export

**Status: ✅ IMPLEMENTED**

## Prerequisites

- Phase 17: Boolean Operations

## Implementation Notes

### What's Done:

- `packages/core/src/export/stl.ts` - Complete STL writer with binary and ASCII formats
- `packages/core/src/export/stl.test.ts` - 6 tests for STL export
- `kernel.worker.ts` - `export-stl` message handler
- `KernelContext.tsx` - `exportStl()` async function with promise-based response
- `Toolbar.tsx` - Export button with download handling
- `worker/types.ts` - `ExportStlMessage` and `StlExportedMessage` types

### Key Implementation Details:

1. **Binary STL** - 80-byte header + 4-byte count + 50 bytes/triangle
2. **ASCII STL** - `solid`/`endsolid` with `facet normal`/`vertex` entries
3. **Face normal calculation** - Cross product of triangle edges
4. **Toolbar button** - Downloads as `model.stl` on click
5. **Worker transfer** - ArrayBuffer transferred for efficiency

## Goals

- Export model to STL file format (triangulated mesh)
- Support binary and ASCII STL formats
- Allow downloading from browser
- Foundation for 3D printing workflow

---

## User Workflow

1. User clicks "File → Export → STL"
2. Export dialog appears with options (format, units)
3. User selects which bodies to export
4. User clicks "Export"
5. STL file downloads to browser

---

## STL Format Overview

STL represents 3D geometry as a collection of triangles. Two formats:

### ASCII STL

```
solid model
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 1 1 0
    endloop
  endfacet
  ...
endsolid model
```

### Binary STL (more compact)

```
[80 bytes header]
[4 bytes: number of triangles]
[50 bytes per triangle: normal (12) + v1 (12) + v2 (12) + v3 (12) + attribute (2)]
```

---

## Implementation

### STL Writer

```typescript
// packages/core/src/export/stl.ts

export interface StlExportOptions {
  binary: boolean; // Binary (default) or ASCII
  precision: number; // Decimal places for ASCII
  name: string; // Model name for solid
}

export function exportToStl(
  bodies: Body[],
  options: StlExportOptions = { binary: true, precision: 6, name: "model" }
): ArrayBuffer | string {
  // Get tessellated mesh data for all bodies
  const allTriangles: Triangle[] = [];

  for (const body of bodies) {
    const mesh = body.tessellate();
    const triangles = extractTriangles(mesh);
    allTriangles.push(...triangles);
  }

  if (options.binary) {
    return writeBinaryStl(allTriangles);
  } else {
    return writeAsciiStl(allTriangles, options.name, options.precision);
  }
}

interface Triangle {
  normal: [number, number, number];
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
}

function extractTriangles(mesh: TessellatedMesh): Triangle[] {
  const triangles: Triangle[] = [];
  const { positions, normals, indices } = mesh;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    // Get vertices
    const v1: [number, number, number] = [
      positions[i0 * 3],
      positions[i0 * 3 + 1],
      positions[i0 * 3 + 2],
    ];
    const v2: [number, number, number] = [
      positions[i1 * 3],
      positions[i1 * 3 + 1],
      positions[i1 * 3 + 2],
    ];
    const v3: [number, number, number] = [
      positions[i2 * 3],
      positions[i2 * 3 + 1],
      positions[i2 * 3 + 2],
    ];

    // Calculate face normal (or use vertex normal)
    const normal = calculateFaceNormal(v1, v2, v3);

    triangles.push({ normal, v1, v2, v3 });
  }

  return triangles;
}

function writeBinaryStl(triangles: Triangle[]): ArrayBuffer {
  const HEADER_SIZE = 80;
  const TRIANGLE_SIZE = 50; // 12 (normal) + 36 (vertices) + 2 (attribute)

  const bufferSize = HEADER_SIZE + 4 + triangles.length * TRIANGLE_SIZE;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header (80 bytes)
  const encoder = new TextEncoder();
  const header = encoder.encode("SolidType STL Export");
  for (let i = 0; i < Math.min(header.length, HEADER_SIZE); i++) {
    view.setUint8(i, header[i]);
  }

  // Triangle count (4 bytes, little endian)
  view.setUint32(HEADER_SIZE, triangles.length, true);

  // Triangles
  let offset = HEADER_SIZE + 4;
  for (const tri of triangles) {
    // Normal
    view.setFloat32(offset, tri.normal[0], true);
    offset += 4;
    view.setFloat32(offset, tri.normal[1], true);
    offset += 4;
    view.setFloat32(offset, tri.normal[2], true);
    offset += 4;

    // Vertex 1
    view.setFloat32(offset, tri.v1[0], true);
    offset += 4;
    view.setFloat32(offset, tri.v1[1], true);
    offset += 4;
    view.setFloat32(offset, tri.v1[2], true);
    offset += 4;

    // Vertex 2
    view.setFloat32(offset, tri.v2[0], true);
    offset += 4;
    view.setFloat32(offset, tri.v2[1], true);
    offset += 4;
    view.setFloat32(offset, tri.v2[2], true);
    offset += 4;

    // Vertex 3
    view.setFloat32(offset, tri.v3[0], true);
    offset += 4;
    view.setFloat32(offset, tri.v3[1], true);
    offset += 4;
    view.setFloat32(offset, tri.v3[2], true);
    offset += 4;

    // Attribute byte count (unused, set to 0)
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

function writeAsciiStl(triangles: Triangle[], name: string, precision: number): string {
  const fmt = (n: number) => n.toFixed(precision);

  let output = `solid ${name}\n`;

  for (const tri of triangles) {
    output += `  facet normal ${fmt(tri.normal[0])} ${fmt(tri.normal[1])} ${fmt(tri.normal[2])}\n`;
    output += `    outer loop\n`;
    output += `      vertex ${fmt(tri.v1[0])} ${fmt(tri.v1[1])} ${fmt(tri.v1[2])}\n`;
    output += `      vertex ${fmt(tri.v2[0])} ${fmt(tri.v2[1])} ${fmt(tri.v2[2])}\n`;
    output += `      vertex ${fmt(tri.v3[0])} ${fmt(tri.v3[1])} ${fmt(tri.v3[2])}\n`;
    output += `    endloop\n`;
    output += `  endfacet\n`;
  }

  output += `endsolid ${name}\n`;

  return output;
}
```

---

## App UI Work

### Export Dialog

```typescript
// packages/app/src/components/dialogs/ExportDialog.tsx

export function ExportStlDialog({ onClose }) {
  const { meshes } = useKernel();
  const [format, setFormat] = useState<'binary' | 'ascii'>('binary');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);

    // Request STL export from worker
    const result = await kernel.exportStl({ binary: format === 'binary' });

    // Download file
    const mimeType = 'model/stl';
    const filename = 'model.stl';

    if (format === 'binary') {
      downloadBinaryFile(result, filename, mimeType);
    } else {
      downloadTextFile(result, filename, mimeType);
    }

    setExporting(false);
    onClose();
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Export STL</DialogTitle>
      <DialogContent>
        <Select
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'binary', label: 'Binary (smaller file)' },
            { value: 'ascii', label: 'ASCII (human readable)' },
          ]}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleExport}
          variant="primary"
          disabled={exporting}
        >
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function downloadBinaryFile(buffer: ArrayBuffer, filename: string, mimeType: string) {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
```

---

## Worker Integration

```typescript
// In kernel.worker.ts

case 'exportStl':
  const { binary } = command;
  const allBodies = Array.from(bodyMap.values());

  const stlResult = exportToStl(allBodies, { binary, precision: 6, name: 'model' });

  if (binary) {
    self.postMessage(
      { type: 'stlExported', buffer: stlResult },
      [stlResult] // Transfer the ArrayBuffer
    );
  } else {
    self.postMessage({ type: 'stlExported', content: stlResult });
  }
  break;
```

---

## Testing Plan

### Unit Tests

```typescript
// Test STL export
test("exportToStl generates valid binary STL", () => {
  const session = new SolidSession();
  const body = createBox(session, 10, 10, 10);

  const buffer = exportToStl([body], { binary: true }) as ArrayBuffer;

  // Check header
  expect(buffer.byteLength).toBeGreaterThan(84);

  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);

  // Box has 12 triangles (2 per face × 6 faces)
  expect(triangleCount).toBe(12);
});

test("exportToStl generates valid ASCII STL", () => {
  const session = new SolidSession();
  const body = createBox(session, 10, 10, 10);

  const ascii = exportToStl([body], { binary: false, name: "box" }) as string;

  expect(ascii).toContain("solid box");
  expect(ascii).toContain("facet normal");
  expect(ascii).toContain("vertex");
  expect(ascii).toContain("endsolid box");

  // Count facets
  const facetCount = (ascii.match(/facet normal/g) || []).length;
  expect(facetCount).toBe(12);
});
```

### Validation

- Open exported STL in slicer software (PrusaSlicer, Cura)
- Import into Blender or other 3D software
- Verify geometry is watertight (manifold)
- Check for inverted normals

---

## Future: STEP Export

STEP export (ISO 10303-21) is more complex but preserves:

- Exact geometry (not tessellated)
- Topology information
- Face/edge structure

This can be added as a separate phase after STL export is working.

---

## Open Questions

1. **Unit conversion** - Should we offer unit scaling on export?
   - Decision: Default to model units (mm), add unit selector later

2. **Tessellation quality** - Should user control triangle density?
   - Decision: Use default tessellation settings, add quality slider later

3. **Multiple bodies** - Export as single STL or separate files?
   - Decision: Single STL with all bodies merged
