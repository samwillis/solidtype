/**
 * Dashboard page - shows workspaces and projects
 * 
 * Uses TanStack DB with Electric collections for real-time workspace sync.
 * Redesigned to match Figma's clean, minimalist style.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useMemo, useEffect } from 'react';
import { Menu } from '@base-ui/react/menu';
import { useSession } from '../lib/auth-client';
import { useLiveQuery, createCollection, liveQueryCollectionOptions } from '@tanstack/react-db';
import { workspacesCollection, projectsCollection } from '../lib/electric-collections';
import DashboardPropertiesPanel from '../components/DashboardPropertiesPanel';
import { DocumentProvider } from '../editor/contexts/DocumentContext';
import { SelectionProvider } from '../editor/contexts/SelectionContext';
import { FeatureEditProvider } from '../editor/contexts/FeatureEditContext';
import { SketchProvider } from '../editor/contexts/SketchContext';
import { KernelProvider } from '../editor/contexts/KernelContext';
import { ViewerProvider } from '../editor/contexts/ViewerContext';
import { Select } from '@base-ui/react/select';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import '../styles/dashboard.css';

export const Route = createFileRoute('/dashboard')({
  ssr: false, // Client-only: uses Electric collections and browser APIs
  loader: async () => {
    // Create live query collections and preload them
    const orderedWorkspacesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ workspaces: workspacesCollection })
            .orderBy(({ workspaces: w }) => w.created_at, 'desc'),
      })
    );

    const allProjectsCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ projects: projectsCollection })
            .orderBy(({ projects: p }) => p.updated_at, 'desc'),
      })
    );
    
    await orderedWorkspacesCollection.preload();
    await allProjectsCollection.preload();
    
    return { 
      workspacesCollection: orderedWorkspacesCollection,
      projectsCollection: allProjectsCollection,
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const { workspacesCollection: orderedWorkspacesCollection, projectsCollection: allProjectsCollection } = Route.useLoaderData();
  const [activeSection, setActiveSection] = useState<'recent' | string>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('all');
  const [sortBy, setSortBy] = useState('last-modified');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Query workspaces and projects
  const { data: workspaces, isLoading: workspacesLoading } = useLiveQuery(
    () => orderedWorkspacesCollection
  );
  
  const { data: allProjects, isLoading: projectsLoading } = useLiveQuery(
    () => allProjectsCollection
  );

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: '/login' });
    }
  }, [session, isPending, navigate]);

  // Group projects by workspace
  const projectsByWorkspace = useMemo(() => {
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

  // Filter projects based on active section (for main content area)
  const displayedProjects = useMemo(() => {
    if (activeSection === 'recent') {
      // Show all projects, sorted by updated_at
      return allProjects || [];
    } else if (activeSection.startsWith('workspace-')) {
      // Show projects for selected workspace
      const workspaceId = activeSection.replace('workspace-', '');
      return projectsByWorkspace[workspaceId] || [];
    } else if (activeSection.startsWith('project-')) {
      // Show single project (when a project is selected)
      const projectId = activeSection.replace('project-', '');
      return allProjects?.filter(p => p.id === projectId) || [];
    }
    return [];
  }, [activeSection, allProjects, projectsByWorkspace]);

  // Filter by search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return displayedProjects;
    const query = searchQuery.toLowerCase();
    return displayedProjects.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
  }, [displayedProjects, searchQuery]);

  if (isPending || !session) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <DocumentProvider>
      <KernelProvider>
        <SelectionProvider>
          <SketchProvider>
            <FeatureEditProvider>
              <ViewerProvider>
                <div className="dashboard">
                  {/* Left Sidebar */}
                  <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-header">
          <div className="dashboard-logo">
            <span className="logo-solid">Solid</span>
            <span className="logo-type">Type</span>
          </div>
        </div>
        
        <div className="dashboard-sidebar-content">
          {/* Search */}
          <div className="dashboard-search">
            <div className="dashboard-search-wrapper">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dashboard-search-input"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="dashboard-nav">
            <button
              className={`dashboard-nav-item ${activeSection === 'recent' ? 'active' : ''}`}
              onClick={() => setActiveSection('recent')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Recents</span>
            </button>

            {/* Separator */}
            <div className="dashboard-nav-separator" />

            {/* Workspaces */}
            {workspaces && workspaces.length > 0 && (
              <>
                {workspaces.map((workspace) => {
                  const workspaceProjects = projectsByWorkspace[workspace.id] || [];
                  return (
                    <WorkspaceHeader
                      key={workspace.id}
                      workspace={workspace}
                      projects={workspaceProjects}
                      activeSection={activeSection}
                      onProjectClick={(projectId) => setActiveSection(`project-${projectId}`)}
                    />
                  );
                })}
              </>
            )}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Header */}
        <header className="dashboard-content-header">
          <h1 className="dashboard-content-title">
            {activeSection === 'recent' 
              ? 'Recent Files' 
              : activeSection.startsWith('project-')
                ? allProjects?.find(p => p.id === activeSection.replace('project-', ''))?.name || 'Project'
                : workspaces?.find(w => w.id === activeSection.replace('workspace-', ''))?.name || 'Projects'}
          </h1>
          
          <div className="dashboard-content-header-actions">
            {/* Sort and Filter */}
            <div className="dashboard-sort-filter">
              <Select.Root
                value={fileFilter}
                onValueChange={(value) => setFileFilter(value || 'all')}
              >
                <Select.Trigger className="dashboard-select-trigger">
                  {fileFilter === 'all' ? 'All files' : fileFilter === 'projects' ? 'Projects' : 'Documents'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner>
                    <Select.Popup className="dashboard-select-popup">
                      <Select.Item value="all" className="dashboard-select-option">All files</Select.Item>
                      <Select.Item value="projects" className="dashboard-select-option">Projects</Select.Item>
                      <Select.Item value="documents" className="dashboard-select-option">Documents</Select.Item>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>

              <Select.Root
                value={sortBy}
                onValueChange={(value) => setSortBy(value || 'last-modified')}
              >
                <Select.Trigger className="dashboard-select-trigger">
                  {sortBy === 'last-modified' ? 'Last modified' : sortBy === 'name' ? 'Name' : 'Created'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner>
                    <Select.Popup className="dashboard-select-popup">
                      <Select.Item value="last-modified" className="dashboard-select-option">Last modified</Select.Item>
                      <Select.Item value="name" className="dashboard-select-option">Name</Select.Item>
                      <Select.Item value="created" className="dashboard-select-option">Created</Select.Item>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>

              {/* View Toggle */}
              <ToggleGroup
                value={[viewMode]}
                onValueChange={(groupValue) => {
                  if (groupValue && groupValue.length > 0) {
                    setViewMode(groupValue[0] as 'grid' | 'list');
                  }
                }}
                className="dashboard-view-toggle"
                aria-label="View mode"
              >
                <Toggle
                  value="grid"
                  className="dashboard-view-toggle-btn"
                  aria-label="Grid view"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </Toggle>
                <Toggle
                  value="list"
                  className="dashboard-view-toggle-btn"
                  aria-label="List view"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </Toggle>
              </ToggleGroup>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="dashboard-content">
          {projectsLoading || workspacesLoading ? (
            <div className="dashboard-loading-inline">
              <div className="spinner" />
              <p>Loading projects...</p>
            </div>
          ) : activeSection.startsWith('project-') ? (
            // Show single project view when a project is selected
            <div className="dashboard-empty">
              <p className="dashboard-empty-title">Project View</p>
              <p className="dashboard-empty-hint">Project details will be shown here</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="dashboard-empty">
              {searchQuery ? (
                <>
                  <p className="dashboard-empty-title">No projects found</p>
                  <p className="dashboard-empty-hint">Try a different search term</p>
                </>
              ) : (
                <>
                  <p className="dashboard-empty-title">No projects yet</p>
                  <p className="dashboard-empty-hint">Create your first project to get started</p>
                </>
              )}
            </div>
          ) : (
            <div className="dashboard-grid">
              {filteredProjects.map((project) => {
                const workspace = workspaces?.find(w => w.id === project.workspace_id);
                return (
                  <Link
                    key={project.id}
                    to="/editor"
                    search={{ projectId: project.id }}
                    className="dashboard-card"
                  >
                    <div className="dashboard-card-thumbnail">
                      {/* Placeholder thumbnail - could show project preview */}
                      <div className="dashboard-card-thumbnail-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      </div>
                    </div>
                    <div className="dashboard-card-content">
                      <div className="dashboard-card-header">
                        <h3 className="dashboard-card-title">{project.name}</h3>
                        {workspace && (
                          <span className="dashboard-card-workspace">{workspace.name}</span>
                        )}
                      </div>
                      {project.description && (
                        <p className="dashboard-card-description">{project.description}</p>
                      )}
                      <div className="dashboard-card-meta">
                        <span className="dashboard-card-time">
                          Updated {formatTimeAgo(project.updated_at)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Properties Panel - floating on right */}
        <DashboardPropertiesPanel />
      </main>
                </div>
              </ViewerProvider>
            </FeatureEditProvider>
          </SketchProvider>
        </SelectionProvider>
      </KernelProvider>
    </DocumentProvider>
  );
}

function WorkspaceHeader({ 
  workspace, 
  projects, 
  activeSection, 
  onProjectClick 
}: { 
  workspace: any; 
  projects: any[]; 
  activeSection: string;
  onProjectClick: (projectId: string) => void;
}) {

  return (
    <div className="dashboard-workspace-section">
      <div className="dashboard-workspace-header">
        <span className="dashboard-workspace-name">{workspace.name}</span>
        <Menu.Root>
          <Menu.Trigger className="dashboard-workspace-create-btn" aria-label="Create">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup className="dashboard-create-dropdown">
                <Menu.Group>
                  <Menu.Item
                    className="dashboard-create-dropdown-item"
                    onClick={() => {
                      // TODO: Implement create project in workspace
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    <span>Project</span>
                  </Menu.Item>
                  <Menu.Item
                    className="dashboard-create-dropdown-item"
                    onClick={() => {
                      // TODO: Implement create document in workspace
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span>Document</span>
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
              className={`dashboard-nav-item dashboard-project-item ${activeSection === `project-${project.id}` ? 'active' : ''}`}
              onClick={() => onProjectClick(project.id)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
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

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}
