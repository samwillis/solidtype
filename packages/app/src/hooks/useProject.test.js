import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProject } from './useProject';
describe('useProject', () => {
    it('returns a project instance', () => {
        const { result } = renderHook(() => useProject());
        expect(result.current.doc).toBeDefined();
        expect(result.current.files).toBeDefined();
    });
    it('initializes project with Part.tsx', () => {
        const { result } = renderHook(() => useProject());
        const partFile = result.current.files.get('Part.tsx');
        expect(partFile).toBeDefined();
        expect(partFile?.toString()).toContain('export function Part');
    });
});
//# sourceMappingURL=useProject.test.js.map