import { useState } from 'react';
import { createProject, initializeProject } from '../lib/project';
export function useProject() {
    const [project] = useState(() => {
        const proj = createProject();
        initializeProject(proj);
        return proj;
    });
    return project;
}
//# sourceMappingURL=useProject.js.map