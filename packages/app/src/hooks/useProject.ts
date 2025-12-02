import { useProjectContext } from '../contexts/ProjectContext';
import { Project } from '../lib/project';

export function useProject(): Project {
  const { project } = useProjectContext();
  return project;
}
