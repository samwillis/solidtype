/**
 * Worker Types Tests
 * 
 * Tests for worker API types and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  generateRequestId,
  isErrorResponse,
  isSuccessResponse,
  getTransferables,
  type SerializedMesh,
  type ErrorResponse,
  type MeshResponse,
  type MeshesResponse,
  type BodyCreatedResponse,
} from './types.js';

describe('Worker Types', () => {
  describe('generateRequestId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(10);
    });
    
    it('should include timestamp prefix', () => {
      const id = generateRequestId();
      const parts = id.split('-');
      
      expect(parts.length).toBe(2);
      expect(Number(parts[0])).toBeGreaterThan(0);
    });
  });
  
  describe('isErrorResponse', () => {
    it('should return true for error responses', () => {
      const errorResponse: ErrorResponse = {
        kind: 'error',
        requestId: 'test-123',
        success: false,
        error: 'Something went wrong',
      };
      
      expect(isErrorResponse(errorResponse)).toBe(true);
    });
    
    it('should return false for success responses', () => {
      const successResponse: BodyCreatedResponse = {
        kind: 'bodyCreated',
        requestId: 'test-123',
        success: true,
        bodyId: 0,
      };
      
      expect(isErrorResponse(successResponse)).toBe(false);
    });
  });
  
  describe('isSuccessResponse', () => {
    it('should return true for success responses', () => {
      const successResponse: BodyCreatedResponse = {
        kind: 'bodyCreated',
        requestId: 'test-123',
        success: true,
        bodyId: 0,
      };
      
      expect(isSuccessResponse(successResponse)).toBe(true);
    });
    
    it('should return false for error responses', () => {
      const errorResponse: ErrorResponse = {
        kind: 'error',
        requestId: 'test-123',
        success: false,
        error: 'Something went wrong',
      };
      
      expect(isSuccessResponse(errorResponse)).toBe(false);
    });
  });
  
  describe('getTransferables', () => {
    it('should return empty array for non-mesh responses', () => {
      const response: BodyCreatedResponse = {
        kind: 'bodyCreated',
        requestId: 'test-123',
        success: true,
        bodyId: 0,
      };
      
      const transferables = getTransferables(response);
      expect(transferables).toEqual([]);
    });
    
    it('should return mesh buffers for mesh response', () => {
      const mesh: SerializedMesh = {
        bodyId: 0,
        positions: new Float32Array([0, 1, 2]),
        normals: new Float32Array([0, 0, 1]),
        indices: new Uint32Array([0, 1, 2]),
      };
      
      const response: MeshResponse = {
        kind: 'mesh',
        requestId: 'test-123',
        success: true,
        mesh,
      };
      
      const transferables = getTransferables(response);
      expect(transferables).toHaveLength(3);
      expect(transferables).toContain(mesh.positions.buffer);
      expect(transferables).toContain(mesh.normals.buffer);
      expect(transferables).toContain(mesh.indices.buffer);
    });
    
    it('should return all mesh buffers for meshes response', () => {
      const mesh1: SerializedMesh = {
        bodyId: 0,
        positions: new Float32Array([0, 1, 2]),
        normals: new Float32Array([0, 0, 1]),
        indices: new Uint32Array([0, 1, 2]),
      };
      
      const mesh2: SerializedMesh = {
        bodyId: 1,
        positions: new Float32Array([3, 4, 5]),
        normals: new Float32Array([1, 0, 0]),
        indices: new Uint32Array([0, 1, 2]),
      };
      
      const response: MeshesResponse = {
        kind: 'meshes',
        requestId: 'test-123',
        success: true,
        meshes: [mesh1, mesh2],
      };
      
      const transferables = getTransferables(response);
      expect(transferables).toHaveLength(6);
    });
    
    it('should return empty array for error response', () => {
      const response: ErrorResponse = {
        kind: 'error',
        requestId: 'test-123',
        success: false,
        error: 'Something went wrong',
      };
      
      const transferables = getTransferables(response);
      expect(transferables).toEqual([]);
    });
  });
});

describe('Serialized Types', () => {
  describe('SerializedMesh', () => {
    it('should have correct structure', () => {
      const mesh: SerializedMesh = {
        bodyId: 42,
        positions: new Float32Array([0, 1, 2, 3, 4, 5]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1]),
        indices: new Uint32Array([0, 1, 2]),
      };
      
      expect(mesh.bodyId).toBe(42);
      expect(mesh.positions.length).toBe(6);
      expect(mesh.normals.length).toBe(6);
      expect(mesh.indices.length).toBe(3);
    });
  });
});
