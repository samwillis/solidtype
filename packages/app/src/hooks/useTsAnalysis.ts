import { useState, useEffect, useRef, useCallback } from 'react';
import type { TsDiagnostic } from '../workers/ts-worker.types';
import { useProject } from './useProject';

interface UseTsAnalysisResult {
  diagnostics: TsDiagnostic[];
  jsBundle: Record<string, string>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook that analyzes TypeScript files in the project using a Web Worker.
 * Debounces analysis requests and subscribes to Yjs file changes.
 */
export function useTsAnalysis(): UseTsAnalysisResult {
  const project = useProject();
  const [diagnostics, setDiagnostics] = useState<TsDiagnostic[]>([]);
  const [jsBundle, setJsBundle] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const filesSnapshotRef = useRef<Record<string, string>>({});

  // Initialize worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/ts-worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent) => {
        if (event.data.kind === 'analysisResult') {
          setDiagnostics(event.data.result.diagnostics);
          setJsBundle(event.data.result.transpiledFiles);
          setIsLoading(false);
          setError(null);
        }
      };

      worker.onerror = (err) => {
        setError(new Error(`Worker error: ${err.message}`));
        setIsLoading(false);
      };

      workerRef.current = worker;

      return () => {
        worker.terminate();
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create worker'));
      return undefined;
    }
  }, []);

  // Function to trigger analysis
  const analyze = useCallback(() => {
    if (!workerRef.current) return;

    // Get current file contents
    const files: Record<string, string> = {};
    project.files.forEach((yText, filename) => {
      files[filename] = yText.toString();
    });

    // Check if files have changed
    const filesStr = JSON.stringify(files);
    const snapshotStr = JSON.stringify(filesSnapshotRef.current);
    if (filesStr === snapshotStr) {
      return; // No changes
    }

    filesSnapshotRef.current = files;
    setIsLoading(true);

    workerRef.current.postMessage({
      kind: 'analyzeProject',
      files,
    });
  }, [project]);

  // Debounced analysis function
  const debouncedAnalyze = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      analyze();
    }, 500); // 500ms debounce
  }, [analyze]);

  // Subscribe to file changes
  useEffect(() => {
    const observer = () => {
      debouncedAnalyze();
    };

    project.files.observe(observer);

    // Initial analysis
    debouncedAnalyze();

    return () => {
      project.files.unobserve(observer);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [project, debouncedAnalyze]);

  return {
    diagnostics,
    jsBundle,
    isLoading,
    error,
  };
}
