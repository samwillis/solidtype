import { useState } from 'react';
import { createProject, initializeProject, Project } from '../lib/project';

export function useProject(): Project {
  const [project] = useState(() => {
    const proj = createProject();
    initializeProject(proj);
    return proj;
  });

  return project;
}
