import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { useYFile } from './useYFile';
import { useProject } from './useProject';

// Mock useProject to return a controlled project
vi.mock('./useProject', () => ({
  useProject: vi.fn(),
}));

describe('useYFile', () => {
  it('returns Y.Text for existing file', async () => {
    const doc = new Y.Doc();
    const files = doc.getMap<Y.Text>();
    const testText = new Y.Text('test content');
    files.set('test.tsx', testText);

    (useProject as any).mockReturnValue({ doc, files });

    const { result } = renderHook(() => useYFile('test.tsx'));

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(Y.Text);
      expect(result.current?.toString()).toBe('test content');
    });
  });

  it('returns null for non-existent file', async () => {
    const doc = new Y.Doc();
    const files = doc.getMap<Y.Text>();

    (useProject as any).mockReturnValue({ doc, files });

    const { result } = renderHook(() => useYFile('nonexistent.tsx'));

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });

  it('updates when file is added', async () => {
    const doc = new Y.Doc();
    const files = doc.getMap<Y.Text>();

    (useProject as any).mockReturnValue({ doc, files });

    const { result } = renderHook(() => useYFile('new.tsx'));

    await waitFor(() => {
      expect(result.current).toBeNull();
    });

    const newText = new Y.Text('new content');
    files.set('new.tsx', newText);

    await waitFor(() => {
      expect(result.current).toBeInstanceOf(Y.Text);
      expect(result.current?.toString()).toBe('new content');
    });
  });
});
