/**
 * TypeScript Worker - Runs TypeScript compiler in a Web Worker
 * 
 * This worker receives file contents, parses and type-checks them,
 * and returns diagnostics and transpiled JavaScript.
 * 
 * Note: TypeScript lib files are not included. We use skipLibCheck: true
 * and isolatedModules: true to work around this limitation. For full type
 * checking with standard library types, lib files would need to be bundled.
 */

import * as ts from 'typescript';
import type {
  AnalyzeProjectMessage,
  AnalysisResultMessage,
  TsAnalysisResult,
  TsDiagnostic,
} from './ts-worker.types';

// Convert TypeScript diagnostic to our format
function convertDiagnostic(diagnostic: ts.Diagnostic): TsDiagnostic {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const category =
    diagnostic.category === ts.DiagnosticCategory.Error
      ? 'error'
      : diagnostic.category === ts.DiagnosticCategory.Warning
      ? 'warning'
      : diagnostic.category === ts.DiagnosticCategory.Suggestion
      ? 'suggestion'
      : 'message';

  let start: { line: number; column: number } | undefined;
  let end: { line: number; column: number } | undefined;

  if (diagnostic.file && diagnostic.start !== undefined) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    start = { line: line + 1, column: character + 1 }; // Convert to 1-based

    if (diagnostic.length !== undefined) {
      const endPos = diagnostic.start + diagnostic.length;
      const { line: endLine, character: endChar } = diagnostic.file.getLineAndCharacterOfPosition(
        endPos
      );
      end = { line: endLine + 1, column: endChar + 1 };
    }
  }

  return {
    message,
    file: diagnostic.file?.fileName,
    start,
    end,
    code: diagnostic.code,
    category,
  };
}

function analyzeProject(files: Record<string, string>): TsAnalysisResult {
  const diagnostics: TsDiagnostic[] = [];
  const transpiledFiles: Record<string, string> = {};

  // Create a compiler host
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
    skipLibCheck: true,
    strict: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    isolatedModules: true,
  };

  // Create file map
  const fileMap = new Map<string, string>();

  for (const [filename, content] of Object.entries(files)) {
    fileMap.set(filename, content);
  }

  // Create a compiler host that provides file contents
  // Note: TypeScript lib files are not available in the worker.
  // We rely on skipLibCheck: true to avoid needing them for basic checking.
  const host: ts.CompilerHost = {
    getSourceFile: (fileName: string) => {
      // Check if this is a lib file request
      if (fileName.startsWith('lib.') && fileName.endsWith('.d.ts')) {
        // Return undefined for lib files - we use skipLibCheck to avoid needing them
        return undefined;
      }
      
      const content = fileMap.get(fileName);
      if (content === undefined) {
        // Try to resolve relative imports within the project
        // This is a simple implementation - full module resolution would be more complex
        const resolved = resolveModuleName(fileName, fileMap);
        if (resolved) {
          return ts.createSourceFile(
            resolved,
            fileMap.get(resolved)!,
            ts.ScriptTarget.ES2020,
            true,
            resolved.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
          );
        }
        return undefined;
      }
      return ts.createSourceFile(
        fileName,
        content,
        ts.ScriptTarget.ES2020,
        true,
        fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
    },
    writeFile: () => {
      // Not used in this context
    },
    getCurrentDirectory: () => '/',
    getDirectories: (path: string) => {
      // Return directories that exist in our file map
      const dirs = new Set<string>();
      for (const file of fileMap.keys()) {
        const dir = file.substring(0, file.lastIndexOf('/'));
        if (dir && dir.startsWith(path)) {
          dirs.add(dir);
        }
      }
      return Array.from(dirs);
    },
    fileExists: (fileName: string) => {
      // Check if it's a lib file (we don't have those)
      if (fileName.startsWith('lib.') && fileName.endsWith('.d.ts')) {
        return false;
      }
      // Check our file map or try to resolve relative imports
      return fileMap.has(fileName) || resolveModuleName(fileName, fileMap) !== null;
    },
    readFile: (fileName: string) => {
      // Lib files not available
      if (fileName.startsWith('lib.') && fileName.endsWith('.d.ts')) {
        return undefined;
      }
      const resolved = resolveModuleName(fileName, fileMap) || fileName;
      return fileMap.get(resolved);
    },
    getCanonicalFileName: (fileName: string) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    getDefaultLibFileName: (options: ts.CompilerOptions) =>
      ts.getDefaultLibFilePath(options),
  };

  // Simple module resolution helper - resolves relative imports within the project
  function resolveModuleName(
    moduleName: string,
    files: Map<string, string>
  ): string | null {
    // If it's already in the map, return it
    if (files.has(moduleName)) {
      return moduleName;
    }

    // Try common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    for (const ext of extensions) {
      if (moduleName.endsWith(ext)) {
        const withoutExt = moduleName.slice(0, -ext.length);
        for (const ext2 of extensions) {
          const candidate = withoutExt + ext2;
          if (files.has(candidate)) {
            return candidate;
          }
        }
      } else {
        const candidate = moduleName + ext;
        if (files.has(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  // Create a program
  const program = ts.createProgram(
    Array.from(fileMap.keys()),
    compilerOptions,
    host
  );

  // Get all diagnostics
  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(program.getSemanticDiagnostics())
    .concat(program.getSyntacticDiagnostics());

  // Convert diagnostics
  for (const diagnostic of allDiagnostics) {
    diagnostics.push(convertDiagnostic(diagnostic));
  }

  // Transpile each file
  for (const [filename, content] of Object.entries(files)) {
    const sourceFile = program.getSourceFile(filename);
    if (sourceFile) {
      const result = ts.transpileModule(content, {
        compilerOptions,
        fileName: filename,
      });
      transpiledFiles[filename] = result.outputText;
    }
  }

  return {
    diagnostics,
    transpiledFiles,
  };
}

// Worker message handler
self.addEventListener('message', (event: MessageEvent<AnalyzeProjectMessage>) => {
  if (event.data.kind === 'analyzeProject') {
    const requestId = event.data.requestId;
    try {
      const result = analyzeProject(event.data.files);
      const response: AnalysisResultMessage = {
        kind: 'analysisResult',
        result,
        requestId, // Echo back request ID
      };
      self.postMessage(response);
    } catch (error) {
      const errorResult: TsAnalysisResult = {
        diagnostics: [
          {
            message: error instanceof Error ? error.message : String(error),
            category: 'error',
          },
        ],
        transpiledFiles: {},
      };
      const response: AnalysisResultMessage = {
        kind: 'analysisResult',
        result: errorResult,
        requestId, // Echo back request ID
      };
      self.postMessage(response);
    }
  }
});
