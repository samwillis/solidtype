/**
 * Tests for surface UV inverse mapping
 */

import { describe, it, expect } from 'vitest';
import { surfacePointToUV, canonicalizeUV } from './surfaceUv.js';
import { evalSurface, createPlaneSurface } from './surface.js';
import type { CylinderSurface, SphereSurface } from './surface.js';
import { vec3, normalize3 } from '../num/vec3.js';

describe('surfacePointToUV', () => {
  describe('plane', () => {
    it('should invert evalSurface for plane', () => {
      const plane = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      
      // Test several points
      const testCases = [
        [0, 0],
        [1, 0],
        [0, 1],
        [3.5, -2.1],
        [-1, 5],
      ];
      
      for (const [u, v] of testCases) {
        const point = evalSurface(plane, u, v);
        const uvOut = surfacePointToUV(plane, point);
        
        expect(uvOut[0]).toBeCloseTo(u, 10);
        expect(uvOut[1]).toBeCloseTo(v, 10);
      }
    });
  });
  
  describe('cylinder', () => {
    it('should invert evalSurface for cylinder', () => {
      const cylinder: CylinderSurface = {
        kind: 'cylinder',
        center: vec3(0, 0, 0),
        axis: normalize3([0, 0, 1]),
        radius: 2,
      };
      
      // Test several points (avoid seam issues with small angles)
      const testCases = [
        [0, 0],
        [1, 0.5],
        [-0.5, 1.0],
        [2, Math.PI / 4],
        [0, Math.PI / 2],
      ];
      
      for (const [u, v] of testCases) {
        const point = evalSurface(cylinder, u, v);
        const uvOut = surfacePointToUV(cylinder, point);
        
        expect(uvOut[0]).toBeCloseTo(u, 10);
        // For periodic v, allow for 2π offset
        const vDiff = Math.abs(uvOut[1] - v) % (2 * Math.PI);
        expect(Math.min(vDiff, 2 * Math.PI - vDiff)).toBeCloseTo(0, 10);
      }
    });
  });
  
  describe('sphere', () => {
    it('should invert evalSurface for sphere', () => {
      const sphere: SphereSurface = {
        kind: 'sphere',
        center: vec3(1, 2, 3),
        radius: 5,
      };
      
      // Test several points (avoid poles)
      const testCases = [
        [Math.PI / 4, 0],
        [Math.PI / 2, Math.PI / 4],
        [Math.PI / 3, -Math.PI / 3],
        [2, 1],
      ];
      
      for (const [u, v] of testCases) {
        const point = evalSurface(sphere, u, v);
        const uvOut = surfacePointToUV(sphere, point);
        
        expect(uvOut[0]).toBeCloseTo(u, 10);
        // For periodic v, allow for 2π offset
        const vDiff = Math.abs(uvOut[1] - v) % (2 * Math.PI);
        expect(Math.min(vDiff, 2 * Math.PI - vDiff)).toBeCloseTo(0, 10);
      }
    });
  });
});

describe('canonicalizeUV', () => {
  it('should normalize cylinder v to [0, 2π)', () => {
    const cylinder: CylinderSurface = {
      kind: 'cylinder',
      center: vec3(0, 0, 0),
      axis: normalize3([0, 0, 1]),
      radius: 1,
    };
    
    expect(canonicalizeUV(cylinder, [0, -Math.PI / 2])[1]).toBeCloseTo(3 * Math.PI / 2, 10);
    expect(canonicalizeUV(cylinder, [0, 3 * Math.PI])[1]).toBeCloseTo(Math.PI, 10);
  });
  
  it('should clamp sphere u to [0, π]', () => {
    const sphere: SphereSurface = {
      kind: 'sphere',
      center: vec3(0, 0, 0),
      radius: 1,
    };
    
    expect(canonicalizeUV(sphere, [-0.5, 0])[0]).toBe(0);
    expect(canonicalizeUV(sphere, [4, 0])[0]).toBeCloseTo(Math.PI, 10);
  });
});
