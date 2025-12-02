import { createContext, useContext, useState, ReactNode } from 'react';
import { createProject, initializeProject, Project } from '../lib/project';

interface ProjectContextValue {
  project: Project;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project] = useState(() => {
    const proj = createProject();
    initializeProject(proj);
    return proj;
  });

  return (
    <ProjectContext.Provider value={{ project }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}
