import { useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import type { TsDiagnostic } from '../workers/ts-worker.types';

/**
 * Hook to navigate to error location in CodeMirror editor
 * This can be used by ProblemsPanel to scroll to and highlight errors
 */
export function useNavigateToError(
  editorView: EditorView | null
) {
  const navigateToError = useCallback(
    (diagnostic: TsDiagnostic) => {
      if (!editorView || !diagnostic.start) return;

      const { line, column } = diagnostic.start;
      const doc = editorView.state.doc;

      try {
        // Convert 1-based line/column to 0-based position
        const lineIndex = Math.max(0, line - 1);
        if (lineIndex < doc.lines) {
          const lineObj = doc.line(lineIndex + 1);
          const position = lineObj.from + Math.min(column - 1, lineObj.length);

          // Scroll to position and select it
          editorView.dispatch({
            selection: { anchor: position, head: position },
            effects: [
              EditorView.scrollIntoView(position, { y: 'center' }),
            ],
          });
        }
      } catch (e) {
        // Ignore errors in navigation
        console.warn('Failed to navigate to error:', e);
      }
    },
    [editorView]
  );

  return navigateToError;
}
