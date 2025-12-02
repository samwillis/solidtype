import * as Y from 'yjs';
export interface Project {
    doc: Y.Doc;
    files: Y.Map<Y.Text>;
}
export declare function createProject(): Project;
export declare function initializeProject(project: Project): void;
//# sourceMappingURL=project.d.ts.map