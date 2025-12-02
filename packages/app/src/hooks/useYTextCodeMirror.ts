import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { EditorView } from '@codemirror/view';

/**
 * Hook to bind a Y.Text to a CodeMirror editor view.
 * This synchronizes changes bidirectionally between Yjs and CodeMirror.
 * 
 * @param view - The CodeMirror EditorView instance (can be null during initialization)
 * @param yText - The Y.Text instance to sync with (can be null if file doesn't exist)
 */
export function useYTextCodeMirror(
  view: EditorView | null,
  yText: Y.Text | null
): void {
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (!view || !yText) return;

    // Listen to Yjs changes and update CodeMirror
    const yObserver = () => {
      if (isUpdatingRef.current) return;
      const newContent = yText.toString();
      const currentContent = view.state.doc.toString();
      if (newContent !== currentContent) {
        isUpdatingRef.current = true;
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: newContent,
          },
        });
        isUpdatingRef.current = false;
      }
    };

    yText.observe(yObserver);

    return () => {
      yText.unobserve(yObserver);
    };
  }, [view, yText]);
}

/**
 * Creates a CodeMirror extension that syncs editor changes to Y.Text.
 * This should be added to the editor's extensions array.
 * 
 * @param yText - The Y.Text instance to sync to
 * @param isUpdatingRef - A ref to track if we're currently updating (to prevent loops)
 */
export function createYjsSyncExtension(
  yText: Y.Text,
  isUpdatingRef: React.MutableRefObject<boolean>
) {
  return EditorView.updateListener.of((update) => {
    if (isUpdatingRef.current) return;
    if (update.docChanged) {
      isUpdatingRef.current = true;
      const newContent = update.state.doc.toString();
      const currentYText = yText.toString();
      if (newContent !== currentYText) {
        // For simplicity, full replace. In production, compute proper diffs.
        // TODO: Implement proper diff-based updates for better performance
        yText.delete(0, yText.length);
        yText.insert(0, newContent);
      }
      isUpdatingRef.current = false;
    }
  });
}
