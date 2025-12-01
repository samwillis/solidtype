import { describe, it, expect } from 'vitest';
import { SolidSession, Body, Face, vec3 } from './index.js';

describe('@solidtype/oo', () => {
  it('should pass smoke test', () => {
    expect(true).toBe(true);
  });
  
  describe('SolidSession', () => {
    it('should create a session', () => {
      const session = new SolidSession();
      expect(session).toBeDefined();
    });
    
    it('should extrude a rectangle profile', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);
      
      const result = session.extrude(profile, {
        operation: 'add',
        distance: 5,
      });
      
      expect(result.success).toBe(true);
      expect(result.body).toBeInstanceOf(Body);
    });
    
    it('should get faces from extruded body', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);
      
      const result = session.extrude(profile, {
        operation: 'add',
        distance: 5,
      });
      
      const faces = result.body!.getFaces();
      // A rectangular extrusion should have 6 faces
      expect(faces.length).toBe(6);
      
      for (const face of faces) {
        expect(face).toBeInstanceOf(Face);
      }
    });
    
    it('should tessellate an extruded body', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);
      
      const result = session.extrude(profile, {
        operation: 'add',
        distance: 5,
      });
      
      const mesh = result.body!.tessellate();
      
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.indices.length).toBeGreaterThan(0);
    });
    
    it('should create persistent refs for extruded faces', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);
      
      const result = session.extrude(profile, {
        operation: 'add',
        distance: 5,
      });
      
      // Feature ID should be assigned
      expect(result.featureId).toBeDefined();
      
      // Persistent refs for top and bottom caps
      expect(result.topCapRefs).toBeDefined();
      expect(result.topCapRefs!.length).toBe(1);
      expect(result.bottomCapRefs).toBeDefined();
      expect(result.bottomCapRefs!.length).toBe(1);
      
      // Side face refs
      expect(result.sideRefs).toBeDefined();
      expect(result.sideRefs![0].length).toBe(4);
    });
    
    it('should resolve persistent refs', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);
      
      const result = session.extrude(profile, {
        operation: 'add',
        distance: 5,
      });
      
      const topCapRef = result.topCapRefs![0];
      const resolved = result.body!.resolve(topCapRef);
      
      expect(resolved).not.toBeNull();
      expect(resolved).toBeInstanceOf(Face);
    });
    
    it('should perform boolean union', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      
      const profile1 = session.createRectangleProfile(plane, 10, 10, 0, 0);
      const result1 = session.extrude(profile1, {
        operation: 'add',
        distance: 5,
      });
      
      const profile2 = session.createRectangleProfile(plane, 10, 10, 5, 0);
      const result2 = session.extrude(profile2, {
        operation: 'add',
        distance: 5,
      });
      
      const unionResult = session.union(result1.body!, result2.body!);
      
      expect(unionResult.success).toBe(true);
      expect(unionResult.body).toBeInstanceOf(Body);
    });
    
    it('should perform boolean subtract', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      
      const profile1 = session.createRectangleProfile(plane, 20, 20, 0, 0);
      const result1 = session.extrude(profile1, {
        operation: 'add',
        distance: 10,
      });
      
      const profile2 = session.createRectangleProfile(plane, 5, 5, 0, 0);
      const result2 = session.extrude(profile2, {
        operation: 'add',
        distance: 15,
      });
      
      const subtractResult = session.subtract(result1.body!, result2.body!);
      
      expect(subtractResult.success).toBe(true);
      expect(subtractResult.body).toBeInstanceOf(Body);
    });
    
    it('should revolve a profile', () => {
      const session = new SolidSession();
      const plane = session.getZXPlane();
      
      // Create a profile offset from Y axis
      const profile = session.createRectangleProfile(plane, 2, 5, 5, 0);
      
      const result = session.revolve(profile, {
        operation: 'add',
        axis: { origin: vec3(0, 0, 0), direction: vec3(0, 1, 0) },
        segments: 8,
      });
      
      expect(result.success).toBe(true);
      expect(result.body).toBeInstanceOf(Body);
    });
    
    it('should select face by ray and find existing ref', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);
      
      const result = session.extrude(profile, {
        operation: 'add',
        distance: 5,
      });
      
      expect(result.success).toBe(true);
      
      // Ray pointing down at the top face (from above)
      const selection = result.body!.selectFaceByRay({
        origin: vec3(0, 0, 10),
        direction: vec3(0, 0, -1),
      });
      
      expect(selection).not.toBeNull();
      expect(selection!.face).toBeInstanceOf(Face);
      expect(selection!.distance).toBeGreaterThan(0);
      
      // The face was created by extrude, so it should have a PersistentRef
      expect(selection!.persistentRef).not.toBeNull();
    });
    
    it('should use getRefForFace to find refs directly', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);
      
      const result = session.extrude(profile, {
        operation: 'add',
        distance: 5,
      });
      
      expect(result.success).toBe(true);
      
      // Get all faces
      const faces = result.body!.getFaces();
      expect(faces.length).toBe(6);
      
      // Each face should have a PersistentRef
      for (const face of faces) {
        const ref = result.body!.getRefForFace(face.id);
        expect(ref).not.toBeNull();
      }
    });
    
    it('should track refs through boolean operations', () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      
      // Create first box
      const profile1 = session.createRectangleProfile(plane, 10, 10, 0, 0);
      const result1 = session.extrude(profile1, {
        operation: 'add',
        distance: 5,
      });
      
      // Save the top cap ref from first extrude
      const originalTopCapRef = result1.topCapRefs![0];
      
      // Create second overlapping box
      const profile2 = session.createRectangleProfile(plane, 10, 10, 5, 0);
      const result2 = session.extrude(profile2, {
        operation: 'add',
        distance: 5,
      });
      
      // Union them
      const unionResult = session.union(result1.body!, result2.body!);
      expect(unionResult.success).toBe(true);
      
      // The original ref should still resolve to a face in the result body
      const resolved = unionResult.body!.resolve(originalTopCapRef);
      expect(resolved).not.toBeNull();
      expect(resolved).toBeInstanceOf(Face);
    });
  });
});
