import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createProject, initializeProject } from './project';

describe('project', () => {
  it('creates a new project with Y.Doc', () => {
    const project = createProject();
    expect(project.doc).toBeInstanceOf(Y.Doc);
    expect(project.files).toBeInstanceOf(Y.Map);
  });

  it('initializes project with Part.tsx file', () => {
    const project = createProject();
    initializeProject(project);
    
    const partFile = project.files.get('Part.tsx');
    expect(partFile).toBeInstanceOf(Y.Text);
    expect(partFile?.toString()).toContain('export function Part');
    expect(partFile?.toString()).toContain('PartProps');
  });

  it('allows editing files in Yjs', () => {
    const project = createProject();
    initializeProject(project);
    
    const partFile = project.files.get('Part.tsx');
    expect(partFile).not.toBeNull();
    
    if (partFile) {
      partFile.insert(0, '// Test comment\n');
      expect(partFile.toString()).toContain('// Test comment');
    }
  });
});
