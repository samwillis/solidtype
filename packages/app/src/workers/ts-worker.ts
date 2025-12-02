/**
 * TypeScript Worker - Runs TypeScript compiler in a Web Worker
 * 
 * This worker receives file contents, parses and type-checks them,
 * and returns diagnostics and transpiled JavaScript.
 */

// @ts-ignore - typescript module will be available at runtime
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

  // Create source files
  const sourceFiles: ts.SourceFile[] = [];
  const fileMap = new Map<string, string>();

  for (const [filename, content] of Object.entries(files)) {
    fileMap.set(filename, content);
    const sourceFile = ts.createSourceFile(
      filename,
      content,
      ts.ScriptTarget.ES2020,
      true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    sourceFiles.push(sourceFile);
  }

  // Create a compiler host that provides file contents
  const host: ts.CompilerHost = {
    getSourceFile: (fileName: string) => {
      const content = fileMap.get(fileName);
      if (content === undefined) return undefined;
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
    getDirectories: () => [],
    fileExists: (fileName: string) => fileMap.has(fileName),
    readFile: (fileName: string) => fileMap.get(fileName),
    getCanonicalFileName: (fileName: string) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    getDefaultLibFileName: (options: ts.CompilerOptions) =>
      ts.getDefaultLibFilePath(options),
  };

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
    try {
      const result = analyzeProject(event.data.files);
      const response: AnalysisResultMessage = {
        kind: 'analysisResult',
        result,
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
      };
      self.postMessage(response);
    }
  }
});
