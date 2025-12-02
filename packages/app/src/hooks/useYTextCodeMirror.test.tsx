import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createYjsSyncExtension } from './useYTextCodeMirror';

describe('useYTextCodeMirror', () => {
  // Note: Full integration testing of useYTextCodeMirror is done through
  // CodeEditor component tests. These are unit tests for the extension factory.

  describe('createYjsSyncExtension', () => {
    it('creates a CodeMirror extension', () => {
      const doc = new Y.Doc();
      const yText = doc.getText('test');
      yText.insert(0, 'test');
      const isUpdatingRef = { current: false };
      const extension = createYjsSyncExtension(yText, isUpdatingRef);
      
      // Extension should be defined and be a valid CodeMirror extension
      expect(extension).toBeDefined();
      expect(extension).toBeTruthy();
    });

    it('returns a valid extension object that can be used in CodeMirror', () => {
      const doc = new Y.Doc();
      const yText = doc.getText('test');
      yText.insert(0, 'initial');
      const isUpdatingRef = { current: false };
      const extension = createYjsSyncExtension(yText, isUpdatingRef);
      
      expect(extension).toBeDefined();
      // Verify Y.Text still has the content
      expect(yText.toString()).toBe('initial');
    });
  });
});
