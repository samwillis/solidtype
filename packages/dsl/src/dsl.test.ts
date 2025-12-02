/**
 * Tests for the SolidType DSL package
 */

import { describe, it, expect } from 'vitest';
import {
  sjsx,
  Model,
  Sketch,
  Rectangle,
  Circle,
  Extrude,
  Revolve,
  Group,
  interpretModel,
  interpretModelWithMeshes,
} from './index.js';
import type { ModelNode, SketchNode, ExtrudeNode } from './types.js';

describe('sjsx factory', () => {
  it('creates a Model node', () => {
    const node = sjsx('Model', { children: [] });
    expect(node.kind).toBe('Model');
    expect((node as ModelNode).children).toEqual([]);
  });

  it('creates a Sketch node with Rectangle child', () => {
    const rect = sjsx('Rectangle', { width: 10, height: 5 });
    const sketch = sjsx('Sketch', { id: 'base', plane: 'XY', children: [rect] });
    
    expect(sketch.kind).toBe('Sketch');
    expect((sketch as SketchNode).id).toBe('base');
    expect((sketch as SketchNode).plane).toBe('XY');
    expect((sketch as SketchNode).children).toHaveLength(1);
    expect((sketch as SketchNode).children[0].kind).toBe('Rectangle');
  });

  it('creates an Extrude node', () => {
    const extrude = sjsx('Extrude', { sketch: 'base', distance: 20 });
    
    expect(extrude.kind).toBe('Extrude');
    expect((extrude as ExtrudeNode).sketch).toBe('base');
    expect((extrude as ExtrudeNode).distance).toBe(20);
    expect((extrude as ExtrudeNode).op).toBe('add');
  });

  it('handles cut operation', () => {
    const extrude = sjsx('Extrude', { sketch: 'hole', distance: 5, op: 'cut' });
    expect((extrude as ExtrudeNode).op).toBe('cut');
  });
});

describe('component functions', () => {
  it('Model function works', () => {
    const node = Model({ children: [] });
    expect(node.kind).toBe('Model');
  });

  it('Sketch function works', () => {
    const node = Sketch({ id: 'test', plane: 'XY', children: [] });
    expect(node.kind).toBe('Sketch');
    expect(node.id).toBe('test');
  });

  it('Rectangle function works', () => {
    const node = Rectangle({ width: 10, height: 5 });
    expect(node.kind).toBe('Rectangle');
    expect(node.width).toBe(10);
    expect(node.height).toBe(5);
  });

  it('Circle function works', () => {
    const node = Circle({ radius: 5 });
    expect(node.kind).toBe('Circle');
    expect(node.radius).toBe(5);
  });

  it('Extrude function works', () => {
    const node = Extrude({ sketch: 'base', distance: 15 });
    expect(node.kind).toBe('Extrude');
    expect(node.sketch).toBe('base');
    expect(node.distance).toBe(15);
  });

  it('Revolve function works', () => {
    const node = Revolve({ 
      sketch: 'profile', 
      axis: { kind: 'sketchAxis', axis: 'y' } 
    });
    expect(node.kind).toBe('Revolve');
    expect(node.sketch).toBe('profile');
    expect(node.angle).toBe(Math.PI * 2);
  });

  it('Group function works', () => {
    const node = Group({ 
      name: 'features',
      children: [Extrude({ sketch: 'a', distance: 10 })]
    });
    expect(node.kind).toBe('Group');
    expect(node.name).toBe('features');
    expect(node.children).toHaveLength(1);
  });
});

describe('interpretModel', () => {
  it('rejects non-Model root', () => {
    const badNode = { kind: 'Sketch', id: 'test', plane: 'XY', children: [] };
    const result = interpretModel(badNode as any);
    
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Root node must be a <Model>');
  });

  it('interprets empty model', () => {
    const model = Model({ children: [] });
    const result = interpretModel(model);
    
    expect(result.success).toBe(true);
    expect(result.bodies).toHaveLength(0);
    expect(result.checkpoints).toHaveLength(0);
  });

  it('interprets sketch without body', () => {
    const model = Model({
      children: [
        Sketch({
          id: 'base',
          plane: 'XY',
          children: [Rectangle({ width: 10, height: 5 })]
        })
      ]
    });
    const result = interpretModel(model);
    
    expect(result.success).toBe(true);
    expect(result.bodies).toHaveLength(0);
    expect(result.checkpoints).toHaveLength(1);
    expect(result.checkpoints[0].kind).toBe('Sketch');
  });

  it('interprets sketch + extrude', () => {
    const model = Model({
      children: [
        Sketch({
          id: 'base',
          plane: 'XY',
          children: [Rectangle({ width: 10, height: 5 })]
        }),
        Extrude({ id: 'body1', sketch: 'base', distance: 20 })
      ]
    });
    const result = interpretModel(model);
    
    expect(result.success).toBe(true);
    expect(result.bodies).toHaveLength(1);
    expect(result.bodies[0].id).toBe('body1');
    expect(result.checkpoints).toHaveLength(2);
  });

  it('reports error for missing sketch reference', () => {
    const model = Model({
      children: [
        Extrude({ sketch: 'nonexistent', distance: 10 })
      ]
    });
    const result = interpretModel(model);
    
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('not found');
  });

  it('interprets circle profile', () => {
    const model = Model({
      children: [
        Sketch({
          id: 'circle',
          plane: 'XY',
          children: [Circle({ radius: 5 })]
        }),
        Extrude({ sketch: 'circle', distance: 10 })
      ]
    });
    const result = interpretModel(model);
    
    expect(result.success).toBe(true);
    expect(result.bodies).toHaveLength(1);
  });

  it('interprets revolve', () => {
    const model = Model({
      children: [
        Sketch({
          id: 'profile',
          plane: 'XY',
          children: [Rectangle({ width: 2, height: 5, centerX: 5 })]
        }),
        Revolve({ 
          sketch: 'profile', 
          axis: { kind: 'sketchAxis', axis: 'y' },
          angle: Math.PI * 2
        })
      ]
    });
    const result = interpretModel(model);
    
    expect(result.success).toBe(true);
    expect(result.bodies).toHaveLength(1);
    expect(result.checkpoints[1].kind).toBe('Revolve');
  });

  it('interprets nested groups', () => {
    const model = Model({
      children: [
        Group({
          name: 'base_features',
          children: [
            Sketch({
              id: 'base',
              plane: 'XY',
              children: [Rectangle({ width: 10, height: 10 })]
            }),
            Extrude({ sketch: 'base', distance: 5 })
          ]
        })
      ]
    });
    const result = interpretModel(model);
    
    expect(result.success).toBe(true);
    expect(result.checkpoints.some(c => c.kind === 'Group')).toBe(true);
  });
});

describe('interpretModelWithMeshes', () => {
  it('returns meshes for built bodies', () => {
    const model = Model({
      children: [
        Sketch({
          id: 'base',
          plane: 'XY',
          children: [Rectangle({ width: 10, height: 5 })]
        }),
        Extrude({ id: 'box', sketch: 'base', distance: 20 })
      ]
    });
    const { result, meshes } = interpretModelWithMeshes(model);
    
    expect(result.success).toBe(true);
    expect(meshes.size).toBe(1);
    expect(meshes.has('box')).toBe(true);
    
    const mesh = meshes.get('box')!;
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it('handles multiple bodies', () => {
    const model = Model({
      children: [
        Sketch({
          id: 'base1',
          plane: 'XY',
          children: [Rectangle({ width: 5, height: 5 })]
        }),
        Extrude({ id: 'body1', sketch: 'base1', distance: 10 }),
        Sketch({
          id: 'base2',
          plane: 'XY',
          children: [Circle({ radius: 2, centerX: 10 })]
        }),
        Extrude({ id: 'body2', sketch: 'base2', distance: 15 })
      ]
    });
    const { result, meshes } = interpretModelWithMeshes(model);
    
    expect(result.success).toBe(true);
    expect(meshes.size).toBe(2);
    expect(meshes.has('body1')).toBe(true);
    expect(meshes.has('body2')).toBe(true);
  });
});

describe('plane handling', () => {
  it('supports XY plane', () => {
    const model = Model({
      children: [
        Sketch({ id: 's', plane: 'XY', children: [Rectangle({ width: 1, height: 1 })] }),
        Extrude({ sketch: 's', distance: 1 })
      ]
    });
    const result = interpretModel(model);
    expect(result.success).toBe(true);
  });

  it('supports YZ plane', () => {
    const model = Model({
      children: [
        Sketch({ id: 's', plane: 'YZ', children: [Rectangle({ width: 1, height: 1 })] }),
        Extrude({ sketch: 's', distance: 1 })
      ]
    });
    const result = interpretModel(model);
    expect(result.success).toBe(true);
  });

  it('supports ZX plane', () => {
    const model = Model({
      children: [
        Sketch({ id: 's', plane: 'ZX', children: [Rectangle({ width: 1, height: 1 })] }),
        Extrude({ sketch: 's', distance: 1 })
      ]
    });
    const result = interpretModel(model);
    expect(result.success).toBe(true);
  });

  it('supports custom plane', () => {
    const model = Model({
      children: [
        Sketch({ 
          id: 's', 
          plane: { origin: [0, 0, 5], normal: [0, 0, 1] },
          children: [Rectangle({ width: 1, height: 1 })] 
        }),
        Extrude({ sketch: 's', distance: 1 })
      ]
    });
    const result = interpretModel(model);
    expect(result.success).toBe(true);
  });
});
