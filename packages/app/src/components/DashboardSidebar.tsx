/**
 * Dashboard Sidebar Component
 *
 * Shared sidebar for the dashboard layout displaying workspaces, projects, and navigation.
 * Used across dashboard index, project view, and branch view routes.
 */

import React, { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { Menu } from "@base-ui/react/menu";
import { useLiveQuery, createCollection, liveQueryCollectionOptions } from "@tanstack/react-db";
import { LuLayoutGrid, LuClock, LuEllipsis, LuSettings } from "react-icons/lu";
import {
  workspacesCollection,
  projectsCollection,
  type Workspace,
  type Project,
} from "../lib/electric-collections";
import { CreateProjectDialog } from "./dialogs/CreateProjectDialog";
import { WorkspaceSettingsDialog } from "./dialogs/WorkspaceSettingsDialog";
import "../styles/dashboard.css";
import logo from "../../../../artwork/colour-icon-bold.svg";

interface DashboardSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  currentProjectId?: string;
  currentBranchId?: string;
  currentFolderId?: string | null;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const navigate = useNavigate();

  // Dialog state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [selectedWorkspaceForCreate, setSelectedWorkspaceForCreate] = useState<
    string | undefined
  >();

  // Query workspaces and projects
  const { data: workspaces } = useLiveQuery(() => {
    const orderedWorkspacesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ workspaces: workspacesCollection })
            .orderBy(({ workspaces: w }) => w.created_at, "desc"),
      })
    );
    return orderedWorkspacesCollection;
  });

  const { data: allProjects } = useLiveQuery(() => {
    const allProjectsCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ projects: projectsCollection })
            .orderBy(({ projects: p }) => p.updated_at, "desc"),
      })
    );
    return allProjectsCollection;
  });

  // Group projects by workspace
  const projectsByWorkspace = React.useMemo(() => {
    if (!allProjects || !workspaces) return {};

    const grouped: Record<string, typeof allProjects> = {};
    for (const project of allProjects) {
      if (!grouped[project.workspace_id]) {
        grouped[project.workspace_id] = [];
      }
      grouped[project.workspace_id].push(project);
    }
    return grouped;
  }, [allProjects, workspaces]);

  return (
    <>
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-header">
          <Link to="/" className="dashboard-logo-link">
            <img src={logo} alt="SolidType" className="dashboard-logo" />
          </Link>
        </div>

        <div className="dashboard-sidebar-content">
          {/* Navigation */}
          <nav className="dashboard-nav">
            <button
              className={`dashboard-nav-item ${activeSection === "projects" ? "active" : ""}`}
              onClick={() => {
                onSectionChange("projects");
                navigate({ to: "/dashboard" });
              }}
            >
              <LuLayoutGrid />
              <span>All Projects</span>
            </button>

            <button
              className={`dashboard-nav-item ${activeSection === "recent" ? "active" : ""}`}
              onClick={() => {
                onSectionChange("recent");
                navigate({ to: "/dashboard/recent" });
              }}
            >
              <LuClock />
              <span>Recent Files</span>
            </button>

            {/* Separator */}
            <div className="dashboard-nav-separator" />

            {/* Workspaces */}
            {workspaces && workspaces.length > 0 && (
              <>
                {workspaces.map((workspace) => {
                  const workspaceProjects = projectsByWorkspace[workspace.id] || [];
                  return (
                    <WorkspaceSection
                      key={workspace.id}
                      workspace={workspace}
                      projects={workspaceProjects}
                      activeSection={activeSection}
                      onProjectClick={(projectId) => {
                        onSectionChange(`project-${projectId}`);
                        // Always navigate to project route - it will redirect to main branch when ready
                        navigate({ to: `/dashboard/projects/${projectId}` });
                      }}
                      onCreateProject={() => {
                        setSelectedWorkspaceForCreate(workspace.id);
                        setShowCreateProject(true);
                      }}
                      onOpenWorkspaceSettings={() => {
                        setSelectedWorkspaceForCreate(workspace.id);
                        setShowWorkspaceSettings(true);
                      }}
                    />
                  );
                })}
              </>
            )}
          </nav>
        </div>
      </aside>

      {/* Create Dialogs */}
      <CreateProjectDialog
        open={showCreateProject}
        onOpenChange={setShowCreateProject}
        preselectedWorkspaceId={selectedWorkspaceForCreate}
        onSuccess={() => {
          setSelectedWorkspaceForCreate(undefined);
        }}
      />
      {selectedWorkspaceForCreate && (
        <WorkspaceSettingsDialog
          open={showWorkspaceSettings}
          onOpenChange={setShowWorkspaceSettings}
          workspaceId={selectedWorkspaceForCreate}
        />
      )}
    </>
  );
};

interface WorkspaceSectionProps {
  workspace: Workspace;
  projects: Project[];
  activeSection: string;
  onProjectClick: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenWorkspaceSettings: () => void;
}

function WorkspaceSection({
  workspace,
  projects,
  activeSection,
  onProjectClick,
  onCreateProject,
  onOpenWorkspaceSettings,
}: WorkspaceSectionProps) {
  return (
    <div className="dashboard-workspace-section">
      <div className="dashboard-workspace-header">
        <span className="dashboard-workspace-name">{workspace.name}</span>
        <Menu.Root>
          <Menu.Trigger className="dashboard-workspace-menu-btn" aria-label="Workspace options">
            <LuEllipsis />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup className="dashboard-create-dropdown">
                <Menu.Group>
                  <Menu.Item
                    className="dashboard-create-dropdown-item"
                    onClick={() => onCreateProject()}
                  >
                    <LuLayoutGrid />
                    <span>New Project</span>
                  </Menu.Item>
                  <Menu.Item
                    className="dashboard-create-dropdown-item"
                    onClick={() => onOpenWorkspaceSettings()}
                  >
                    <LuSettings />
                    <span>Workspace Settings</span>
                  </Menu.Item>
                </Menu.Group>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      {projects.length > 0 ? (
        <div className="dashboard-workspace-projects">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`dashboard-nav-item dashboard-project-item ${activeSection === `project-${project.id}` ? "active" : ""}`}
              onClick={() => onProjectClick(project.id)}
            >
              <span>{project.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="dashboard-workspace-empty">
          <span>no project yet</span>
        </div>
      )}
    </div>
  );
}

export default DashboardSidebar;
