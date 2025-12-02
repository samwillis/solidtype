import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ProjectProvider } from '../contexts/ProjectContext';
import { useTsAnalysis } from './useTsAnalysis';

// Mock the worker
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: ErrorEvent) => void) | null,
};

// Mock Worker constructor
global.Worker = vi.fn(() => mockWorker as any) as any;

describe('useTsAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockWorker.onmessage = null;
    mockWorker.onerror = null;
  });

  it('initializes worker and starts analysis', async () => {
    renderHook(() => useTsAnalysis(), {
      wrapper: ProjectProvider,
    });

    await waitFor(() => {
      expect(Worker).toHaveBeenCalled();
    }, { timeout: 2000 });

    // Wait for debounced analysis to trigger
    await waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    }, { timeout: 2000 });

    // Worker should be created and message sent
    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'analyzeProject',
        files: expect.objectContaining({
          'Part.tsx': expect.any(String),
        }),
      })
    );
  });

  it('handles analysis results', async () => {
    const { result } = renderHook(() => useTsAnalysis(), {
      wrapper: ProjectProvider,
    });

    await waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    }, { timeout: 2000 });

    // Simulate worker response
    const mockResult = {
      kind: 'analysisResult' as const,
      result: {
        diagnostics: [
          {
            message: 'Test error',
            category: 'error' as const,
            file: 'Part.tsx',
            start: { line: 1, column: 1 },
            end: { line: 1, column: 10 },
          },
        ],
        transpiledFiles: {
          'Part.tsx': 'export function Part() {}',
        },
      },
    };

    if (mockWorker.onmessage) {
      mockWorker.onmessage({ data: mockResult } as MessageEvent);
    }

    await waitFor(() => {
      expect(result.current.diagnostics.length).toBeGreaterThan(0);
      expect(result.current.jsBundle).toBeDefined();
    });

    expect(result.current.diagnostics[0].message).toBe('Test error');
    expect(result.current.jsBundle['Part.tsx']).toBe('export function Part() {}');
  });

  it('handles worker errors', async () => {
    const { result } = renderHook(() => useTsAnalysis(), {
      wrapper: ProjectProvider,
    });

    await waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    }, { timeout: 2000 });

    // Simulate worker error
    if (mockWorker.onerror) {
      mockWorker.onerror({ message: 'Worker error' } as ErrorEvent);
    }

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error?.message).toContain('Worker error');
  });
});
