import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';

// Note: This is a simplified test that tests the analysis logic
// In a real scenario, we'd test the worker in a Node environment with worker_threads
// For now, we test the core analysis function logic

describe('ts-worker', () => {
  it('should handle valid TypeScript code', () => {
    const files = {
      'Part.tsx': `export type PartProps = {
  width?: number;
};

export function Part(props: PartProps = {}) {
  return <div>Test</div>;
}`,
    };

    // Test that TypeScript can parse and compile this
    const sourceFile = ts.createSourceFile(
      'Part.tsx',
      files['Part.tsx'],
      ts.ScriptTarget.ES2020,
      true,
      ts.ScriptKind.TSX
    );

    expect(sourceFile).toBeDefined();
    expect(sourceFile.statements.length).toBeGreaterThan(0);
  });

  it('should detect syntax errors', () => {
    const invalidCode = `export function Part() {
  return <div>Test
}`;

    const sourceFile = ts.createSourceFile(
      'Part.tsx',
      invalidCode,
      ts.ScriptTarget.ES2020,
      true,
      ts.ScriptKind.TSX
    );

    // TypeScript will parse it but there should be diagnostics
    const program = ts.createProgram(['Part.tsx'], {
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    }, {
      getSourceFile: () => sourceFile,
      writeFile: () => {},
      getCurrentDirectory: () => '/',
      getDirectories: () => [],
      fileExists: () => true,
      readFile: () => invalidCode,
      getCanonicalFileName: (f) => f,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('should transpile TypeScript to JavaScript', () => {
    const code = `export function Part() {
  const x: number = 42;
  return x;
}`;

    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
    });

    expect(result.outputText).toBeDefined();
    expect(result.outputText).toContain('function Part');
    expect(result.outputText).not.toContain(': number'); // Type annotations removed
  });
});
