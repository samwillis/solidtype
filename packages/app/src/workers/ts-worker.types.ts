/**
 * Types for TypeScript worker communication
 */

export interface TsDiagnostic {
  message: string;
  file?: string;
  start?: {
    line: number;
    column: number;
  };
  end?: {
    line: number;
    column: number;
  };
  code?: number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
}

export interface TsAnalysisResult {
  diagnostics: TsDiagnostic[];
  transpiledFiles: Record<string, string>; // filename -> JS
}

export interface AnalyzeProjectMessage {
  kind: 'analyzeProject';
  files: Record<string, string>; // filename -> content
}

export interface AnalysisResultMessage {
  kind: 'analysisResult';
  result: TsAnalysisResult;
}

export type WorkerMessage = AnalyzeProjectMessage | AnalysisResultMessage;
