# Phase 18: STEP Export

## Prerequisites

- Phase 17: Boolean Operations

## Goals

- Export model to STEP file format (ISO 10303-21)
- Support all current geometry types
- Maintain topology (faces, edges, shells)
- Allow downloading from browser

---

## User Workflow

1. User clicks "File → Export → STEP"
2. Export dialog appears with options
3. User selects which bodies to export
4. User clicks "Export"
5. STEP file downloads to browser

---

## STEP Format Overview

STEP (Standard for the Exchange of Product Data) uses ISO 10303-21 encoding:

```step
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('SolidType Export'),'2;1');
FILE_NAME('model.step','2024-01-01T00:00:00',('Author'),('Org'),'SolidType','SolidType','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1=CARTESIAN_POINT('',(0.,0.,0.));
#2=DIRECTION('',(0.,0.,1.));
#3=DIRECTION('',(1.,0.,0.));
#4=AXIS2_PLACEMENT_3D('',#1,#2,#3);
/* ... more entities ... */
ENDSEC;
END-ISO-10303-21;
```

---

## Implementation

### STEP Writer

```typescript
// packages/core/src/export/step.ts

export interface StepExportOptions {
  precision: number;
  schema: 'AP203' | 'AP214';  // Application protocols
}

export function exportToStep(
  bodies: Body[],
  options: StepExportOptions = { precision: 6, schema: 'AP214' }
): string {
  const writer = new StepWriter(options);
  
  // Write header
  writer.writeHeader();
  
  // Write geometry and topology for each body
  for (const body of bodies) {
    writer.writeBody(body);
  }
  
  // Write footer
  writer.writeFooter();
  
  return writer.toString();
}

class StepWriter {
  private entities: StepEntity[] = [];
  private nextId = 1;
  
  writeBody(body: Body): void {
    // Write shell structure
    const shell = this.writeClosedShell(body);
    
    // Write manifold solid
    this.addEntity('MANIFOLD_SOLID_BREP', [
      `'${body.name}'`,
      shell,
    ]);
  }
  
  writeClosedShell(body: Body): string {
    const faceRefs: string[] = [];
    
    for (const face of body.getFaces()) {
      const faceRef = this.writeFace(face);
      faceRefs.push(faceRef);
    }
    
    return this.addEntity('CLOSED_SHELL', [
      "''",
      `(${faceRefs.join(',')})`,
    ]);
  }
  
  writeFace(face: Face): string {
    const surface = this.writeSurface(face.getSurface());
    const bounds = this.writeFaceBounds(face);
    
    return this.addEntity('ADVANCED_FACE', [
      "''",
      `(${bounds.join(',')})`,
      surface,
      face.isForward() ? '.T.' : '.F.',
    ]);
  }
  
  writeSurface(surface: Surface): string {
    switch (surface.kind) {
      case 'plane':
        return this.writePlane(surface);
      case 'cylinder':
        return this.writeCylinder(surface);
      case 'cone':
        return this.writeCone(surface);
      case 'sphere':
        return this.writeSphere(surface);
      default:
        throw new Error(`Unsupported surface type: ${surface.kind}`);
    }
  }
  
  writePlane(plane: PlaneSurface): string {
    const position = this.writeAxis2Placement3D(plane.origin, plane.normal, plane.xDir);
    return this.addEntity('PLANE', ["''", position]);
  }
  
  writeCylinder(cyl: CylinderSurface): string {
    const position = this.writeAxis2Placement3D(cyl.origin, cyl.axis, cyl.xDir);
    return this.addEntity('CYLINDRICAL_SURFACE', ["''", position, cyl.radius.toFixed(6)]);
  }
  
  // ... more surface types ...
  
  writeAxis2Placement3D(origin: Vec3, zDir: Vec3, xDir: Vec3): string {
    const point = this.writeCartesianPoint(origin);
    const z = this.writeDirection(zDir);
    const x = this.writeDirection(xDir);
    return this.addEntity('AXIS2_PLACEMENT_3D', ["''", point, z, x]);
  }
  
  writeCartesianPoint(p: Vec3): string {
    return this.addEntity('CARTESIAN_POINT', [
      "''",
      `(${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)})`,
    ]);
  }
  
  writeDirection(d: Vec3): string {
    return this.addEntity('DIRECTION', [
      "''",
      `(${d[0].toFixed(6)},${d[1].toFixed(6)},${d[2].toFixed(6)})`,
    ]);
  }
  
  private addEntity(type: string, args: string[]): string {
    const id = `#${this.nextId++}`;
    this.entities.push({ id, type, args });
    return id;
  }
  
  toString(): string {
    let output = 'ISO-10303-21;\n';
    output += this.getHeader();
    output += 'DATA;\n';
    for (const entity of this.entities) {
      output += `${entity.id}=${entity.type}(${entity.args.join(',')});\n`;
    }
    output += 'ENDSEC;\n';
    output += 'END-ISO-10303-21;\n';
    return output;
  }
}
```

### Edge and Loop Writing

```typescript
writeFaceBounds(face: Face): string[] {
  const bounds: string[] = [];
  
  for (const loop of face.getLoops()) {
    const bound = this.writeLoop(loop, loop.isOuter());
    bounds.push(bound);
  }
  
  return bounds;
}

writeLoop(loop: Loop, isOuter: boolean): string {
  const edgeRefs: string[] = [];
  
  for (const halfEdge of loop.getHalfEdges()) {
    const edgeRef = this.writeOrientedEdge(halfEdge);
    edgeRefs.push(edgeRef);
  }
  
  const edgeLoop = this.addEntity('EDGE_LOOP', ["''", `(${edgeRefs.join(',')})`]);
  
  const boundType = isOuter ? 'FACE_OUTER_BOUND' : 'FACE_BOUND';
  return this.addEntity(boundType, ["''", edgeLoop, '.T.']);
}

writeOrientedEdge(halfEdge: HalfEdge): string {
  const edge = this.writeEdge(halfEdge.getEdge());
  return this.addEntity('ORIENTED_EDGE', [
    "''",
    '*',
    '*',
    edge,
    halfEdge.isForward() ? '.T.' : '.F.',
  ]);
}
```

---

## App UI Work

### Export Dialog

```typescript
// packages/app/src/components/dialogs/ExportDialog.tsx

export function ExportDialog({ onClose }) {
  const { meshes } = useKernel();
  const bodies = useBodies();
  const [selectedBodies, setSelectedBodies] = useState<string[]>(
    bodies.map(b => b.id) // Default: all bodies
  );
  const [exporting, setExporting] = useState(false);
  
  const handleExport = async () => {
    setExporting(true);
    
    // Request STEP export from worker
    const step = await kernel.exportStep(selectedBodies);
    
    // Download file
    downloadFile(step, 'model.step', 'application/step');
    
    setExporting(false);
    onClose();
  };
  
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Export STEP</DialogTitle>
      <DialogContent>
        <div className="export-body-list">
          <h4>Select Bodies to Export</h4>
          {bodies.map(body => (
            <Checkbox
              key={body.id}
              label={body.name}
              checked={selectedBodies.includes(body.id)}
              onChange={(checked) => {
                if (checked) {
                  setSelectedBodies([...selectedBodies, body.id]);
                } else {
                  setSelectedBodies(selectedBodies.filter(id => id !== body.id));
                }
              }}
            />
          ))}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleExport} 
          variant="primary"
          disabled={selectedBodies.length === 0 || exporting}
        >
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
}
```

### Menu Integration

```typescript
<MenuItem onClick={() => setExportDialogOpen(true)}>
  <Icon name="export" />
  Export STEP...
</MenuItem>
```

---

## Worker Integration

```typescript
// In kernel.worker.ts

case 'exportStep':
  const bodyIds = command.bodyIds;
  const bodiesToExport = bodyIds.map(id => bodyMap.get(id)).filter(Boolean);
  
  const stepContent = exportToStep(bodiesToExport);
  
  self.postMessage({
    type: 'stepExported',
    content: stepContent,
  });
  break;
```

---

## Testing Plan

### Unit Tests

```typescript
// Test STEP export
test('exportToStep generates valid STEP', () => {
  const session = new SolidSession();
  const body = createBox(session, 10, 10, 10);
  
  const step = exportToStep([body]);
  
  expect(step).toContain('ISO-10303-21');
  expect(step).toContain('CLOSED_SHELL');
  expect(step).toContain('ADVANCED_FACE');
  expect(step).toContain('END-ISO-10303-21');
});

// Test specific geometry
test('cylinder exports correctly', () => {
  const session = new SolidSession();
  const body = createCylinder(session);
  
  const step = exportToStep([body]);
  
  expect(step).toContain('CYLINDRICAL_SURFACE');
});
```

### Validation

- Import exported STEP into FreeCAD, Fusion 360, or similar
- Verify geometry matches original
- Check for any import warnings

---

## Open Questions

1. **Application Protocol** - Which STEP AP to use?
   - Decision: Start with AP214 (broader support)

2. **Color/material** - Export appearance?
   - Decision: Not in this phase, geometry only

3. **Assembly** - Export as assembly or single part?
   - Decision: Single part with multiple bodies
