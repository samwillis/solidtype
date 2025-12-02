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
 * 
 * Uses request IDs to prevent race conditions - only the latest request's
 * result is accepted.
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
  const requestIdRef = useRef<number>(0);
  const currentRequestIdRef = useRef<number>(0);

  // Initialize worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/ts-worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent) => {
        if (event.data.kind === 'analysisResult') {
          // Only accept results from the latest request to prevent race conditions
          const requestId = event.data.requestId;
          if (requestId !== undefined && requestId < currentRequestIdRef.current) {
            // This is a stale result, ignore it
            return;
          }
          
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

  // Efficient file change detection using content hashing
  const getFilesHash = useCallback((files: Record<string, string>): string => {
    // Create a stable hash by sorting keys and hashing content
    const sortedKeys = Object.keys(files).sort();
    const hashParts = sortedKeys.map((key) => `${key}:${files[key].length}:${files[key].slice(0, 100)}`);
    return hashParts.join('|');
  }, []);

  // Function to trigger analysis
  const analyze = useCallback(() => {
    if (!workerRef.current) return;

    // Get current file contents
    const files: Record<string, string> = {};
    project.files.forEach((yText, filename) => {
      files[filename] = yText.toString();
    });

    // Check if files have changed using efficient hash comparison
    const currentHash = getFilesHash(files);
    const snapshotHash = getFilesHash(filesSnapshotRef.current);
    if (currentHash === snapshotHash) {
      return; // No changes
    }

    filesSnapshotRef.current = files;
    setIsLoading(true);

    // Increment request ID to track latest request
    const requestId = ++requestIdRef.current;
    currentRequestIdRef.current = requestId;

    workerRef.current.postMessage({
      kind: 'analyzeProject',
      files,
      requestId, // Include request ID to prevent race conditions
    });
  }, [project, getFilesHash]);

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
      // Clear debounce timer to prevent memory leaks
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
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
