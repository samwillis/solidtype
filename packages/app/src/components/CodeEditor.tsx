import React, { useEffect, useRef, useMemo } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap, linter, Diagnostic } from '@codemirror/lint';
import { useYFile } from '../hooks/useYFile';
import { useYTextCodeMirror, createYjsSyncExtension } from '../hooks/useYTextCodeMirror';
import { useTsAnalysis } from '../hooks/useTsAnalysis';
import { useActiveFileContext } from '../contexts/ActiveFileContext';
import { useNavigateToError } from '../hooks/useNavigateToError';
import './CodeEditor.css';

const CodeEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { activeFilename } = useActiveFileContext();
  const yText = useYFile(activeFilename);
  const isUpdatingRef = useRef(false);
  const { diagnostics } = useTsAnalysis();

  // Create lint extension that updates when diagnostics change
  // Use useMemo to avoid recreating the extension unnecessarily
  const lintExtension = useMemo(() => {
    return linter((view) => {
      // Filter diagnostics for the current file
      // Use exact filename match or path resolution
      const fileDiagnostics = diagnostics.filter((d) => {
        if (!d.file) return false;
        // Exact match
        if (d.file === activeFilename) return true;
        // Check if it's the same file with different path representation
        const dBasename = d.file.split('/').pop() || d.file;
        const activeBasename = activeFilename.split('/').pop() || activeFilename;
        return dBasename === activeBasename;
      });

      const cmDiagnostics: Diagnostic[] = fileDiagnostics
        .filter((d) => d.start && d.end)
        .map((d) => {
          const doc = view.state.doc;
          const startLine = Math.max(0, (d.start!.line - 1));
          const startCol = Math.max(0, (d.start!.column - 1));
          const endLine = Math.max(startLine, Math.min(doc.lines - 1, (d.end!.line - 1)));
          const endCol = Math.max(0, (d.end!.column - 1));

          let from = 0;
          let to = 0;

          try {
            // Convert line/column to positions (1-based to 0-based conversion)
            if (startLine < doc.lines) {
              const lineObj = doc.line(startLine + 1);
              from = lineObj.from + Math.min(startCol, lineObj.length);
            }
            if (endLine < doc.lines) {
              const endLineObj = doc.line(endLine + 1);
              to = endLineObj.from + Math.min(endCol, endLineObj.length);
            } else {
              to = doc.length;
            }
          } catch (e) {
            // Fallback if line numbers are out of range
            from = 0;
            to = doc.length;
          }

          return {
            from,
            to,
            severity: d.category === 'error' ? 'error' : d.category === 'warning' ? 'warning' : 'info',
            message: d.message,
          };
        });

      return cmDiagnostics;
    });
  }, [diagnostics, activeFilename]);

  // Create base extensions that don't change
  const baseExtensions = useMemo<Extension[]>(() => [
    javascript({ jsx: true, typescript: true }),
    history(),
    foldGutter(),
    indentOnInput(),
    bracketMatching(),
    autocompletion(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
    EditorView.theme({
      '&': {
        height: '100%',
      },
      '.cm-editor': {
        height: '100%',
        fontSize: '14px',
      },
      '.cm-scroller': {
        height: '100%',
        overflow: 'auto',
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace',
      },
    }),
  ], []);

  useEffect(() => {
    if (!editorRef.current || !yText) return;

    const initialState = yText.toString();

    // Create extensions array with dynamic parts
    const extensions: Extension[] = [
      ...baseExtensions,
      createYjsSyncExtension(yText, isUpdatingRef),
      lintExtension, // This will update when diagnostics change
    ];

    const state = EditorState.create({
      doc: initialState,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [yText, activeFilename, baseExtensions, lintExtension]);

  // Bind Y.Text to CodeMirror (handles Yjs -> CodeMirror direction)
  useYTextCodeMirror(viewRef.current, yText);

  // Update editor when file changes
  useEffect(() => {
    if (!viewRef.current || !yText) return;
    
    const newContent = yText.toString();
    const currentContent = viewRef.current.state.doc.toString();
    
    if (newContent !== currentContent) {
      // File changed, update editor content
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: newContent,
        },
      });
    }
  }, [activeFilename, yText]);

  // Expose navigation function via ref (can be used by ProblemsPanel)
  const navigateToError = useNavigateToError(viewRef.current);
  
  // Store navigation function in a way that ProblemsPanel can access it
  // For now, we'll use a context or prop drilling - simpler approach: expose via window or context
  useEffect(() => {
    if (viewRef.current) {
      // Store in a way that ProblemsPanel can access
      (window as any).__codeEditorNavigateToError = navigateToError;
      return () => {
        delete (window as any).__codeEditorNavigateToError;
      };
    }
    return undefined;
  }, [navigateToError]);

  return <div ref={editorRef} className="code-editor" />;
};

export default CodeEditor;
