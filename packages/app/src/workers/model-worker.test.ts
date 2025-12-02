/**
 * Tests for Model Worker utilities
 */

import { describe, it, expect } from 'vitest';

// Test the stripModuleStatements function by extracting its logic
function stripModuleStatements(code: string): string {
  // Remove import statements (handles multiline imports too)
  let result = code.replace(/^import\s+.*?['"].*?['"];?\s*$/gm, '');
  result = result.replace(/^import\s*\{[^}]*\}\s*from\s*['"].*?['"];?\s*$/gm, '');
  result = result.replace(/^import\s+\*\s+as\s+\w+\s+from\s+['"].*?['"];?\s*$/gm, '');
  
  // Remove export keywords but keep the function/variable declarations
  result = result.replace(/^export\s+(?=function|const|let|var|class|type|interface)/gm, '');
  result = result.replace(/^export\s+default\s+/gm, '');
  
  return result;
}

describe('stripModuleStatements', () => {
  it('removes simple import statements', () => {
    const code = `import { foo } from 'bar';
function test() {}`;
    const result = stripModuleStatements(code);
    expect(result).toContain('function test()');
    expect(result).not.toContain('import');
  });

  it('removes named imports', () => {
    const code = `import { a, b, c } from '@solidtype/dsl';
function Part() {}`;
    const result = stripModuleStatements(code);
    expect(result).toContain('function Part()');
    expect(result).not.toContain('import');
    expect(result).not.toContain('@solidtype/dsl');
  });

  it('removes namespace imports', () => {
    const code = `import * as THREE from 'three';
const x = 1;`;
    const result = stripModuleStatements(code);
    expect(result).toContain('const x = 1');
    expect(result).not.toContain('import');
  });

  it('removes default imports', () => {
    const code = `import React from 'react';
function Component() {}`;
    const result = stripModuleStatements(code);
    expect(result).toContain('function Component()');
    expect(result).not.toContain('import');
  });

  it('strips export from function declarations', () => {
    const code = `export function Part(props) {
  return null;
}`;
    const result = stripModuleStatements(code);
    expect(result).toContain('function Part(props)');
    expect(result).not.toMatch(/^export\s+function/m);
  });

  it('strips export from const declarations', () => {
    const code = `export const myVar = 42;`;
    const result = stripModuleStatements(code);
    expect(result).toContain('const myVar = 42');
    expect(result).not.toContain('export const');
  });

  it('strips export default', () => {
    const code = `export default function Part() {}`;
    const result = stripModuleStatements(code);
    expect(result).toContain('function Part()');
    expect(result).not.toContain('export default');
  });

  it('handles complex multi-line code', () => {
    const code = `/** @jsx sjsx */
import { sjsx, Model, Sketch } from '@solidtype/dsl';
import type { PartProps } from './types';

export function Part(props = {}) {
  const width = props.width ?? 10;
  return sjsx("Model", null);
}`;
    const result = stripModuleStatements(code);
    expect(result).toContain('function Part(props = {})');
    expect(result).toContain('const width = props.width ?? 10');
    expect(result).toContain('return sjsx("Model", null)');
    expect(result).not.toMatch(/^import/m);
    expect(result).not.toMatch(/^export\s+function/m);
  });
});
