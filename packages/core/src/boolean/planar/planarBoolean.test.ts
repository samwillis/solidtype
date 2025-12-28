import { describe, expect, it } from 'vitest';
import { dot3 } from '../../num/vec3.js';
import { SolidSession } from '../../api/SolidSession.js';

describe('planar boolean trimming', () => {
  it('trims cap faces when subtracting a through-slot aligned to caps', () => {
    const session = new SolidSession();
    
    // Base: extrude a rectangle on XY to create a prism with top/bottom caps.
    const baseSketch = session.createSketch(session.getXYPlane());
    baseSketch.addRectangle(-3, -2, 6, 4);
    const base = session.extrudeSketch(baseSketch, {
      operation: 'add',
      distance: 3,
    }).body!;
    
    // Tool: sketch on YZ, spanning full Z height of the base, symmetric extrude through X.
    const toolSketch = session.createSketch(session.getYZPlane());
    // width along Y = 2, height along Z = 3 (centered at z=1.5 to span 0..3)
    toolSketch.addRectangle(0, 1.5, 2, 3);
    const tool = session.extrudeSketch(toolSketch, {
      operation: 'add',
      distance: 6,
      symmetric: true,
    }).body!;
    
    const result = session.subtract(base, tool);
    expect(result.success).toBe(true);
    expect(result.body).toBeDefined();
    
    const model = session.getModel();
    let foundTopWithHole = false;
    
    for (const face of result.body!.getFaces()) {
      const normal = face.getNormal();
      if (Math.abs(dot3(normal, [0, 0, 1])) > 0.9) {
        const loops = model.getFaceLoops(face.id);
        if (loops.length > 1) {
          foundTopWithHole = true;
          break;
        }
      }
    }
    
    expect(foundTopWithHole).toBe(true);
  });
});
