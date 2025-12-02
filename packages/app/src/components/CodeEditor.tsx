import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
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
import './CodeEditor.css';

const CodeEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const yText = useYFile('Part.tsx');
  const isUpdatingRef = useRef(false);
  const { diagnostics } = useTsAnalysis();
  const currentFilename = 'Part.tsx';

  // Create lint extension from diagnostics
  const createLintExtension = () => {
    return linter((view) => {
      const fileDiagnostics = diagnostics.filter(
        (d) => !d.file || d.file === currentFilename || d.file.endsWith(currentFilename)
      );

      const cmDiagnostics: Diagnostic[] = fileDiagnostics
        .filter((d) => d.start && d.end)
        .map((d) => {
          const doc = view.state.doc;
          const startLine = (d.start!.line - 1) || 0;
          const startCol = (d.start!.column - 1) || 0;
          const endLine = (d.end!.line - 1) || startLine;
          const endCol = (d.end!.column - 1) || startCol;

          let from = 0;
          let to = 0;

          try {
            // Convert line/column to positions
            if (startLine < doc.lines) {
              from = doc.line(startLine + 1).from + Math.min(startCol, doc.line(startLine + 1).length);
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
  };

  useEffect(() => {
    if (!editorRef.current || !yText) return;

    const initialState = yText.toString();

    const state = EditorState.create({
      doc: initialState,
      extensions: [
        javascript({ jsx: true, typescript: true }),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        autocompletion(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle),
        createYjsSyncExtension(yText, isUpdatingRef),
        createLintExtension(),
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
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [yText, diagnostics]);

  // Bind Y.Text to CodeMirror (handles Yjs -> CodeMirror direction)
  useYTextCodeMirror(viewRef.current, yText);

  // Update lint diagnostics when they change
  useEffect(() => {
    if (!viewRef.current) return;
    // Force lint update by dispatching a transaction
    viewRef.current.dispatch({
      effects: [],
    });
  }, [diagnostics]);

  return <div ref={editorRef} className="code-editor" />;
};

export default CodeEditor;
