import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { useYFile } from '../hooks/useYFile';
import { useYTextCodeMirror, createYjsSyncExtension } from '../hooks/useYTextCodeMirror';
import './CodeEditor.css';

const CodeEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const yText = useYFile('Part.tsx');
  const isUpdatingRef = useRef(false);

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
  }, [yText]);

  // Bind Y.Text to CodeMirror (handles Yjs -> CodeMirror direction)
  useYTextCodeMirror(viewRef.current, yText);

  return <div ref={editorRef} className="code-editor" />;
};

export default CodeEditor;
