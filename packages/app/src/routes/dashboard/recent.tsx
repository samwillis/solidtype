/**
 * Recent Files page - shows recently edited documents across all branches
 * 
 * Uses TanStack DB with Electric collections for real-time sync.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useLiveQuery, createCollection, liveQueryCollectionOptions, eq } from '@tanstack/react-db';
import { LuChevronDown, LuLayoutGrid, LuList, LuFileText } from 'react-icons/lu';
import { 
  documentsCollection, 
  projectsCollection, 
  branchesCollection 
} from '../../lib/electric-collections';
import DashboardPropertiesPanel from '../../components/DashboardPropertiesPanel';
import { Select } from '@base-ui/react/select';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import '../../styles/dashboard.css';

export const Route = createFileRoute('/dashboard/recent')({
  ssr: false, // Client-only: uses Electric collections and browser APIs
  loader: async () => {
    // Create live query collections and preload them
    const recentDocumentsCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ documents: documentsCollection })
            .where(({ documents: d }) => eq(d.is_deleted, false))
            .orderBy(({ documents: d }) => d.updated_at, 'desc')
            .limit(50), // Show last 50 recent files
      })
    );

    const allProjectsCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ projects: projectsCollection })
            .orderBy(({ projects: p }) => p.name, 'asc'),
      })
    );

    const allBranchesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ branches: branchesCollection })
            .orderBy(({ branches: b }) => b.name, 'asc'),
      })
    );
    
    await Promise.all([
      recentDocumentsCollection.preload(),
      allProjectsCollection.preload(),
      allBranchesCollection.preload(),
    ]);
    
    return { 
      documentsCollection: recentDocumentsCollection,
      projectsCollection: allProjectsCollection,
      branchesCollection: allBranchesCollection,
    };
  },
  component: RecentFilesPage,
});

function RecentFilesPage() {
  const navigate = useNavigate();
  const { 
    documentsCollection: recentDocumentsCollection, 
    projectsCollection: allProjectsCollection,
    branchesCollection: allBranchesCollection,
  } = Route.useLoaderData();
  
  const [sortBy, setSortBy] = useState('last-modified');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
  // Query documents, projects, and branches
  const { data: documents, isLoading: documentsLoading } = useLiveQuery(
    () => recentDocumentsCollection
  );
  
  const { data: projects } = useLiveQuery(
    () => allProjectsCollection
  );

  const { data: branches } = useLiveQuery(
    () => allBranchesCollection
  );

  // Sort documents
  const sortedDocuments = useMemo(() => {
    if (!documents) return [];
    
    const docs = [...documents];
    
    switch (sortBy) {
      case 'name':
        return docs.sort((a, b) => a.name.localeCompare(b.name));
      case 'created':
        return docs.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case 'last-modified':
      default:
        return docs.sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
    }
  }, [documents, sortBy]);

  // Helper to get project and branch names
  const getProjectName = (projectId: string) => {
    return projects?.find(p => p.id === projectId)?.name || 'Unknown Project';
  };

  const getBranchName = (branchId: string) => {
    return branches?.find(b => b.id === branchId)?.name || 'Unknown Branch';
  };

  const handleDocumentClick = (doc: typeof sortedDocuments[0]) => {
    // Navigate to the document in its branch context
    navigate({ 
      to: `/dashboard/projects/${doc.project_id}/branches/${doc.branch_id}` 
    });
  };

  return (
    <main className="dashboard-main">
      {/* Header */}
      <header className="dashboard-content-header">
        <h1 className="dashboard-content-title">Recent Files</h1>
        
        <div className="dashboard-content-header-actions">
          {/* Sort and Filter */}
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
        {documentsLoading ? (
          <div className="dashboard-loading-inline">
            <div className="spinner" />
            <p>Loading recent files...</p>
          </div>
        ) : sortedDocuments.length === 0 ? (
          <div className="dashboard-empty">
            <p className="dashboard-empty-title">No recent files</p>
            <p className="dashboard-empty-hint">Files you edit will appear here</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="dashboard-list">
            {sortedDocuments.map((doc) => (
              <div
                key={doc.id}
                className="dashboard-list-item"
                onClick={() => handleDocumentClick(doc)}
              >
                <div className="dashboard-list-item-icon">
                  <LuFileText size={20} />
                </div>
                <div className="dashboard-list-item-content">
                  <span className="dashboard-list-item-name">{doc.name}</span>
                  <span className="dashboard-list-item-path">
                    {getProjectName(doc.project_id)} / {getBranchName(doc.branch_id)}
                  </span>
                </div>
                <div className="dashboard-list-item-meta">
                  <span className="dashboard-list-item-time">
                    {formatTimeAgo(doc.updated_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-grid">
            {sortedDocuments.map((doc) => (
              <div
                key={doc.id}
                className="dashboard-card"
                onClick={() => handleDocumentClick(doc)}
                style={{ cursor: 'pointer' }}
              >
                <div className="dashboard-card-thumbnail">
                  <div className="dashboard-card-thumbnail-placeholder">
                    <LuFileText size={48} />
                  </div>
                </div>
                <div className="dashboard-card-content">
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">{doc.name}</h3>
                    <span className="dashboard-card-workspace">
                      {getProjectName(doc.project_id)}
                    </span>
                  </div>
                  <div className="dashboard-card-meta">
                    <span className="dashboard-card-time">
                      {getBranchName(doc.branch_id)} · {formatTimeAgo(doc.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
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
