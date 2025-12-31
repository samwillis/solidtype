/**
 * Dashboard index page - shows all projects
 * 
 * Uses TanStack DB with Electric collections for real-time sync.
 * Redesigned to match Figma's clean, minimalist style.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useLiveQuery, createCollection, liveQueryCollectionOptions } from '@tanstack/react-db';
import { LuChevronDown, LuLayoutGrid, LuList, LuFileText } from 'react-icons/lu';
import { workspacesCollection, projectsCollection } from '../../lib/electric-collections';
import DashboardPropertiesPanel from '../../components/DashboardPropertiesPanel';
import { Select } from '@base-ui/react/select';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import '../../styles/dashboard.css';

export const Route = createFileRoute('/dashboard/')({
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
  component: DashboardIndexPage,
});

function DashboardIndexPage() {
  const navigate = useNavigate();
  const { workspacesCollection: orderedWorkspacesCollection, projectsCollection: allProjectsCollection } = Route.useLoaderData();
  const [sortBy, setSortBy] = useState('last-modified');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Query workspaces and projects
  const { data: workspaces, isLoading: workspacesLoading } = useLiveQuery(
    () => orderedWorkspacesCollection
  );
  
  const { data: allProjects, isLoading: projectsLoading } = useLiveQuery(
    () => allProjectsCollection
  );

  // Get all projects for the recents view
  const displayedProjects = allProjects || [];

  return (
    <main className="dashboard-main">
      {/* Header */}
      <header className="dashboard-content-header">
        <h1 className="dashboard-content-title">All Projects</h1>
        
        <div className="dashboard-content-header-actions">
          {/* Sort and View Controls */}
          <div className="dashboard-sort-filter">
            <Select.Root
              value={sortBy}
              onValueChange={(value) => setSortBy(value || 'last-modified')}
            >
              <Select.Trigger className="dashboard-select-trigger">
                {sortBy === 'last-modified' ? 'Last modified' : sortBy === 'name' ? 'Name' : 'Created'}
                <LuChevronDown size={12} />
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
                <LuLayoutGrid size={16} />
              </Toggle>
              <Toggle
                value="list"
                className="dashboard-view-toggle-btn"
                aria-label="List view"
              >
                <LuList size={16} />
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
        ) : displayedProjects.length === 0 ? (
          <div className="dashboard-empty">
            <p className="dashboard-empty-title">No projects yet</p>
            <p className="dashboard-empty-hint">Create your first project to get started</p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {displayedProjects.map((project) => {
              const workspace = workspaces?.find(w => w.id === project.workspace_id);
              return (
                <div
                  key={project.id}
                  className="dashboard-card"
                  onClick={() => navigate({ to: `/dashboard/projects/${project.id}` })}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="dashboard-card-thumbnail">
                    {/* Placeholder thumbnail - could show project preview */}
                    <div className="dashboard-card-thumbnail-placeholder">
                      <LuFileText size={48} />
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Properties Panel - floating on right */}
      <DashboardPropertiesPanel />
    </main>
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
