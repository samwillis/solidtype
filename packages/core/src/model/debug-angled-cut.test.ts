/**
 * Debug test for the angled cut issue from the app
 * 
 * Base: Rectangle on YZ plane, extruded in +X
 * Tool: Trapezoid on XY plane with angled bottom edge, extruded in +Z as cut
 */

import { describe, it, expect } from 'vitest';
import { TopoModel } from '../topo/TopoModel.js';
import { createNumericContext } from '../num/tolerance.js';
import { vec3, sub3, dot3, cross3, normalize3 } from '../num/vec3.js';
import type { Vec3 } from '../num/vec3.js';
import { subtract } from './boolean.js';
import { tessellateBody } from '../mesh/tessellateBody.js';
import { extrude } from './extrude.js';
import { createPolygonProfile } from './sketchProfile.js';
import { createDatumPlaneFromNormal, YZ_PLANE, XY_PLANE } from './planes.js';
import type { Vec2 } from '../num/vec2.js';
import { planarBoolean } from '../boolean/planar/planarBoolean.js';
import type { PlaneSurface } from '../geom/surface.js';

describe('angled cut debug', () => {
  it('reproduces the app angled cut issue', () => {
    const model = new TopoModel(createNumericContext());
    
    // Base body: Rectangle on YZ plane
    // Sketch4 points (in local YZ coords where local x → world y, local y → world z):
    // (13, 12), (13, -12), (-5, -12), (-5, 12)
    // This creates a rectangle from y=-5 to y=13, z=-12 to z=12
    const basePlane = YZ_PLANE;
    const baseProfile = createPolygonProfile(basePlane, [
      [13, 12] as Vec2,   // y=13, z=12
      [13, -12] as Vec2,  // y=13, z=-12
      [-5, -12] as Vec2,  // y=-5, z=-12
      [-5, 12] as Vec2,   // y=-5, z=12
    ]);
    
    console.log('=== Creating base body ===');
    const baseResult = extrude(model, baseProfile, {
      operation: 'add',
      distance: 10,  // Extrudes in +X direction
    });
    
    expect(baseResult.success).toBe(true);
    expect(baseResult.body).toBeDefined();
    console.log(`Base body created: ${baseResult.body}`);
    
    // Log base body faces
    const baseShells = model.getBodyShells(baseResult.body!);
    for (const shellId of baseShells) {
      const faces = model.getShellFaces(shellId);
      console.log(`Base shell ${shellId} has ${faces.length} faces`);
      for (const faceId of faces) {
        const surface = model.getSurface(model.getFaceSurfaceIndex(faceId));
        if (surface.kind === 'plane') {
          console.log(`  Face ${faceId}: normal=[${surface.normal[0].toFixed(2)},${surface.normal[1].toFixed(2)},${surface.normal[2].toFixed(2)}]`);
        }
      }
    }
    
    // Tool body: Trapezoid on XY plane with angled bottom edge
    // Sketch6 points (in local XY coords where local x → world x, local y → world y):
    // (-5, 20), (15, 20), (15, 9), (-5, 2)
    // The edge from (15, 9) to (-5, 2) is ANGLED (not horizontal)
    const toolPlane = XY_PLANE;
    const toolProfile = createPolygonProfile(toolPlane, [
      [-5, 20] as Vec2,   // x=-5, y=20
      [15, 20] as Vec2,   // x=15, y=20
      [15, 9] as Vec2,    // x=15, y=9
      [-5, 2] as Vec2,    // x=-5, y=2 (creates angled edge!)
    ]);
    
    console.log('\n=== Creating tool body ===');
    const toolResult = extrude(model, toolProfile, {
      operation: 'add',
      distance: 10,  // Extrudes in +Z direction
    });
    
    expect(toolResult.success).toBe(true);
    expect(toolResult.body).toBeDefined();
    console.log(`Tool body created: ${toolResult.body}`);
    
    // Log tool body faces
    const toolShells = model.getBodyShells(toolResult.body!);
    for (const shellId of toolShells) {
      const faces = model.getShellFaces(shellId);
      console.log(`Tool shell ${shellId} has ${faces.length} faces`);
      for (const faceId of faces) {
        const surface = model.getSurface(model.getFaceSurfaceIndex(faceId));
        if (surface.kind === 'plane') {
          const n = surface.normal;
          const isTilted = Math.abs(n[0]) > 0.01 && Math.abs(n[1]) > 0.01;
          console.log(`  Face ${faceId}: normal=[${n[0].toFixed(3)},${n[1].toFixed(3)},${n[2].toFixed(3)}]${isTilted ? ' (TILTED)' : ''}`);
        }
      }
    }
    
    // Perform the cut
    console.log('\n=== Performing subtract ===');
    const cutResult = subtract(model, baseResult.body!, toolResult.body!);
    
    console.log(`Subtract result: success=${cutResult.success}, warnings=${JSON.stringify(cutResult.warnings)}`);
    expect(cutResult.success).toBe(true);
    
    if (!cutResult.body) {
      console.log('ERROR: No result body!');
      return;
    }
    
    // Log result body faces
    const resultShells = model.getBodyShells(cutResult.body);
    console.log(`\n=== Result body ===`);
    for (const shellId of resultShells) {
      const faces = model.getShellFaces(shellId);
      console.log(`Result shell ${shellId} has ${faces.length} faces`);
      for (const faceId of faces) {
        const surface = model.getSurface(model.getFaceSurfaceIndex(faceId));
        if (surface.kind === 'plane') {
          const n = surface.normal;
          const loops = model.getFaceLoops(faceId);
          let vertexCount = 0;
          for (const loopId of loops) {
            for (const _he of model.iterateLoopHalfEdges(loopId)) {
              vertexCount++;
            }
          }
          console.log(`  Face ${faceId}: normal=[${n[0].toFixed(3)},${n[1].toFixed(3)},${n[2].toFixed(3)}], loops=${loops.length}, verts=${vertexCount}`);
        }
      }
    }
    
    // Tessellate and check mesh
    console.log('\n=== Tessellating ===');
    const mesh = tessellateBody(model, cutResult.body);
    
    console.log(`Mesh: ${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles`);
    
    // Check for NaN normals
    let nanCount = 0;
    for (let i = 0; i < mesh.normals.length; i++) {
      if (isNaN(mesh.normals[i])) nanCount++;
    }
    if (nanCount > 0) {
      console.log(`ERROR: ${nanCount} NaN values in normals!`);
    }
    
    // Compute bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i];
      const y = mesh.positions[i + 1];
      const z = mesh.positions[i + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    console.log(`BBox: [${minX.toFixed(1)}, ${minY.toFixed(1)}, ${minZ.toFixed(1)}] to [${maxX.toFixed(1)}, ${maxY.toFixed(1)}, ${maxZ.toFixed(1)}]`);
    
    // Expected bounds:
    // Base spans: x=[0,10], y=[-5,13], z=[-12,12]
    // Tool spans: x=[-5,15], y=[2,20], z=[0,10]
    // After cut, the result should be within the base bounds
    expect(minX).toBeCloseTo(0, 0);
    expect(maxX).toBeCloseTo(10, 0);
    expect(minY).toBeCloseTo(-5, 0);
    expect(maxY).toBeCloseTo(13, 0);
    expect(minZ).toBeCloseTo(-12, 0);
    expect(maxZ).toBeCloseTo(12, 0);
    
    // Check that NaN normals don't exist
    expect(nanCount).toBe(0);
  });

  it('debug the specific intersection computation', () => {
    // Enable debug flags
    (globalThis as any).DEBUG_PLANAR_BOOLEAN = true;
    
    const model = new TopoModel(createNumericContext());
    
    // Simpler case: just two boxes where one has a tilted face
    // Create a unit cube at origin
    const basePlane = YZ_PLANE;
    const baseProfile = createPolygonProfile(basePlane, [
      [5, 5] as Vec2,
      [5, -5] as Vec2,
      [-5, -5] as Vec2,
      [-5, 5] as Vec2,
    ]);
    
    const baseResult = extrude(model, baseProfile, {
      operation: 'add',
      distance: 10,
    });
    
    expect(baseResult.success).toBe(true);
    
    // Create a tilted trapezoid tool
    // This creates a tool with an angled face
    const toolPlane = XY_PLANE;
    const toolProfile = createPolygonProfile(toolPlane, [
      [-3, 8] as Vec2,   // top left
      [8, 8] as Vec2,    // top right
      [8, 2] as Vec2,    // bottom right
      [-3, -2] as Vec2,  // bottom left (creates angled bottom edge!)
    ]);
    
    const toolResult = extrude(model, toolProfile, {
      operation: 'add',
      distance: 10,
    });
    
    expect(toolResult.success).toBe(true);
    
    // Now do the subtract with verbose logging
    console.log('\n=== Detailed intersection debug ===');
    // Enable for verbose debugging:
    // (globalThis as any).DEBUG_FACE_INTERSECTION = true;
    // (globalThis as any).DEBUG_CLIP_3D = true;
    
    const cutResult = planarBoolean(model, baseResult.body!, toolResult.body!, {
      operation: 'subtract',
    });
    
    delete (globalThis as any).DEBUG_FACE_INTERSECTION;
    
    console.log(`Result: success=${cutResult.success}`);
    if (cutResult.warnings && cutResult.warnings.length > 0) {
      console.log(`Warnings (${cutResult.warnings.length}):`, cutResult.warnings.slice(0, 5));
      if (cutResult.warnings.length > 5) {
        console.log(`  ... and ${cutResult.warnings.length - 5} more`);
      }
    }
    
    // Cleanup debug flag
    delete (globalThis as any).DEBUG_PLANAR_BOOLEAN;
    
    expect(cutResult.success).toBe(true);
    // Non-manifold edge warnings are expected until full stitching is implemented
    // The important thing is that the boolean succeeds and produces a mesh
  });
});
