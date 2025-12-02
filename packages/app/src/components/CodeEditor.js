import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
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
import './CodeEditor.css';
const CodeEditor = () => {
    const editorRef = useRef(null);
    const viewRef = useRef(null);
    const yText = useYFile('Part.tsx');
    const isUpdatingRef = useRef(false);
    useEffect(() => {
        if (!editorRef.current || !yText)
            return;
        const initialState = yText.toString();
        // Create update listener for Yjs sync
        const createYjsSyncExtension = (yText) => {
            return EditorView.updateListener.of((update) => {
                if (isUpdatingRef.current)
                    return;
                if (update.docChanged) {
                    isUpdatingRef.current = true;
                    const newContent = update.state.doc.toString();
                    const currentYText = yText.toString();
                    if (newContent !== currentYText) {
                        // For simplicity, full replace. In production, compute proper diffs.
                        yText.delete(0, yText.length);
                        yText.insert(0, newContent);
                    }
                    isUpdatingRef.current = false;
                }
            });
        };
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
                createYjsSyncExtension(yText),
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
        // Listen to Yjs changes and update CodeMirror
        const yObserver = () => {
            if (isUpdatingRef.current || !viewRef.current)
                return;
            const newContent = yText.toString();
            const currentContent = viewRef.current.state.doc.toString();
            if (newContent !== currentContent) {
                isUpdatingRef.current = true;
                viewRef.current.dispatch({
                    changes: {
                        from: 0,
                        to: viewRef.current.state.doc.length,
                        insert: newContent,
                    },
                });
                isUpdatingRef.current = false;
            }
        };
        yText.observe(yObserver);
        return () => {
            yText.unobserve(yObserver);
            view.destroy();
        };
    }, [yText]);
    return _jsx("div", { ref: editorRef, className: "code-editor" });
};
export default CodeEditor;
//# sourceMappingURL=CodeEditor.js.map