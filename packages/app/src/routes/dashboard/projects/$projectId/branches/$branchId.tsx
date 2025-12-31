/**
 * Branch View Route
 * 
 * Displays a specific branch of a project with file/folder tree view.
 * Features:
 * - Branch dropdown with "View all branches" button
 * - Folder navigation with breadcrumbs
 * - Create menu with Document and Folder options
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useMemo, useEffect } from 'react';
import { useSession } from '../../../../../lib/auth-client';
import { useLiveQuery, createCollection, liveQueryCollectionOptions, eq } from '@tanstack/react-db';
import { LuGitBranch, LuChevronDown, LuLayoutGrid, LuList, LuFolder, LuFileText, LuGitBranch as LuGitNetwork } from 'react-icons/lu';
import { 
  projectsCollection, 
  branchesCollection, 
  foldersCollection, 
  documentsCollection 
} from '../../../../../lib/electric-collections';
import { Select } from '@base-ui/react/select';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { Dialog } from '@base-ui/react/dialog';
import { BranchVisualization } from '../../../../../components/BranchVisualization';
import { FolderBreadcrumbs } from '../../../../../components/FolderBreadcrumbs';
import DashboardPropertiesPanel from '../../../../../components/DashboardPropertiesPanel';
import '../../../../../styles/dashboard.css';

// Format time ago helper
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

export const Route = createFileRoute('/dashboard/projects/$projectId/branches/$branchId')({
  ssr: false,
  loader: async ({ params }) => {
    // Create filtered collections for this project
    const projectBranchesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ branches: branchesCollection })
            .where(({ branches: b }) => eq(b.project_id, params.projectId))
            .orderBy(({ branches: b }) => b.is_main, 'desc')
            .orderBy(({ branches: b }) => b.created_at, 'desc'),
      })
    );

    await projectBranchesCollection.preload();
    
    return { projectBranchesCollection };
  },
  component: BranchView,
});

function BranchView() {
  const navigate = useNavigate();
  const { projectId, branchId } = Route.useParams();
  const { projectBranchesCollection } = Route.useLoaderData();
  useSession(); // Ensure user is authenticated
  
  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  // Filter/sort state
  const [fileFilter, setFileFilter] = useState('all');
  const [sortBy, setSortBy] = useState('last-modified');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Dialog state (only branch visualization is handled locally)
  const [showBranchVisualization, setShowBranchVisualization] = useState(false);

  // Load project and branches
  const { data: projects, isLoading: projectsLoading } = useLiveQuery(() => projectsCollection);
  const { data: branches, isLoading: branchesLoading } = useLiveQuery(() => projectBranchesCollection);
  const project = useMemo(() => projects?.find((p) => p.id === projectId), [projects, projectId]);
  const currentBranch = useMemo(() => branches?.find((b) => b.id === branchId), [branches, branchId]);

  // Reset current folder when branch changes
  useEffect(() => {
    setCurrentFolderId(null);
  }, [branchId]);

  // Load folders and documents for current branch
  const { data: allFolders, isLoading: foldersLoading } = useLiveQuery(() => foldersCollection);
  const { data: allDocuments, isLoading: documentsLoading } = useLiveQuery(() => documentsCollection);
  
  const isLoading = projectsLoading || branchesLoading || foldersLoading || documentsLoading;

  // Get folders for current location (respecting parent_id)
  const branchFolders = useMemo(() => {
    if (!currentBranch || !allFolders) return [];
    return allFolders.filter(
      (f) => f.branch_id === currentBranch.id && f.parent_id === currentFolderId
    );
  }, [currentBranch, allFolders, currentFolderId]);

  // Get documents for current location (respecting folder_id)
  const branchDocuments = useMemo(() => {
    if (!currentBranch || !allDocuments) return [];
    return allDocuments.filter(
      (d) => d.project_id === projectId && d.branch_id === currentBranch.id && !d.is_deleted && d.folder_id === currentFolderId
    );
  }, [currentBranch, allDocuments, projectId, currentFolderId]);

  // Filter folders and documents based on fileFilter
  const filteredFolders = useMemo(() => {
    if (fileFilter === 'documents') return [];
    return branchFolders;
  }, [branchFolders, fileFilter]);

  const filteredDocuments = useMemo(() => {
    if (fileFilter === 'folders') return [];
    return branchDocuments;
  }, [branchDocuments, fileFilter]);

  // Handle folder click - navigate into folder
  const handleFolderClick = (folderId: string) => {
    setCurrentFolderId(folderId);
  };

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
  };

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <main className="dashboard-main">
        <div className="dashboard-loading-inline">
          <div className="spinner" />
          <p>Loading branch...</p>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="dashboard-main">
        <div className="dashboard-empty">
          <p className="dashboard-empty-title">Project not found</p>
        </div>
      </main>
    );
  }

  if (!currentBranch) {
    return (
      <main className="dashboard-main">
        <div className="dashboard-empty">
          <p className="dashboard-empty-title">Branch not found</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="dashboard-main">
        {/* Header */}
        <header className="dashboard-content-header">
          <h1 className="dashboard-content-title">{project.name}</h1>
          
          <div className="dashboard-content-header-actions">
            {/* Branch Selector with View All button */}
            <div className="dashboard-branch-selector">
              {branches && branches.length > 0 && (
                <Select.Root
                  value={currentBranch.id}
                  onValueChange={(value) => {
                    if (value) {
                      navigate({ to: `/dashboard/projects/${projectId}/branches/${value}` });
                    }
                  }}
                >
                  <Select.Trigger className="dashboard-select-trigger">
                    <LuGitBranch size={14} style={{ marginRight: '6px' }} />
                    {currentBranch.name}
                    <LuChevronDown size={12} />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner>
                      <Select.Popup className="dashboard-select-popup">
                        {branches.map((branch) => (
                          <Select.Item
                            key={branch.id}
                            value={branch.id}
                            className="dashboard-select-option"
                          >
                            {branch.name}
                          </Select.Item>
                        ))}
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              )}
              
              {/* View All Branches button */}
              <button
                className="dashboard-view-branches-btn"
                onClick={() => setShowBranchVisualization(true)}
                title="View all branches"
              >
                <LuGitNetwork size={14} />
              </button>
            </div>

            {/* Separator */}
            <div className="dashboard-header-separator" />

            {/* Sort and Filter */}
            <div className="dashboard-sort-filter">
              <Select.Root
                value={fileFilter}
                onValueChange={(value) => setFileFilter(value || 'all')}
              >
                <Select.Trigger className="dashboard-select-trigger">
                  {fileFilter === 'all' ? 'All files' : fileFilter === 'folders' ? 'Folders' : 'Documents'}
                  <LuChevronDown size={12} />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner>
                    <Select.Popup className="dashboard-select-popup">
                      <Select.Item value="all" className="dashboard-select-option">All files</Select.Item>
                      <Select.Item value="folders" className="dashboard-select-option">Folders</Select.Item>
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

        {/* Folder Breadcrumbs */}
        <FolderBreadcrumbs
          branchId={branchId}
          currentFolderId={currentFolderId}
          onNavigate={handleBreadcrumbNavigate}
        />

        {/* Content Area */}
        <div className="dashboard-content">
          {filteredFolders.length === 0 && filteredDocuments.length === 0 ? (
            <div className="dashboard-empty">
              <p className="dashboard-empty-title">
                {currentFolderId ? 'This folder is empty' : 'No files or folders'}
              </p>
              <p className="dashboard-empty-hint">Create a folder or document to get started</p>
            </div>
          ) : (
            <div className={`dashboard-${viewMode === 'grid' ? 'grid' : 'list'}`}>
              {/* Folders */}
              {filteredFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="dashboard-item-card"
                  onClick={() => handleFolderClick(folder.id)}
                >
                  <div className="dashboard-item-icon">
                    <LuFolder size={24} />
                  </div>
                  <div className="dashboard-item-content">
                    <h3 className="dashboard-item-title">{folder.name}</h3>
                    <span className="dashboard-item-meta">Folder</span>
                  </div>
                </div>
              ))}
              
              {/* Documents */}
              {filteredDocuments.map((document) => (
                <div
                  key={document.id}
                  className="dashboard-item-card"
                  onClick={() => {
                    navigate({ to: '/editor', search: { documentId: document.id } });
                  }}
                >
                  <div className="dashboard-item-icon">
                    <LuFileText size={24} />
                  </div>
                  <div className="dashboard-item-content">
                    <h3 className="dashboard-item-title">{document.name}</h3>
                    <span className="dashboard-item-meta">
                      Updated {formatTimeAgo(document.updated_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Properties Panel - context-aware for dialogs */}
        <DashboardPropertiesPanel
          currentProjectId={projectId}
          currentBranchId={branchId}
          currentFolderId={currentFolderId}
        />
      </main>

      {/* Branch Visualization Dialog */}
      <Dialog.Root open={showBranchVisualization} onOpenChange={setShowBranchVisualization}>
        <Dialog.Portal>
          <Dialog.Backdrop className="create-dialog-backdrop" />
          <Dialog.Popup className="branch-visualization-dialog">
            <Dialog.Title className="branch-visualization-dialog-title">
              Branch Overview
            </Dialog.Title>
            <BranchVisualization
              projectId={projectId}
              selectedBranchId={branchId}
              onBranchSelect={(selectedBranchId) => {
                setShowBranchVisualization(false);
                navigate({ to: `/dashboard/projects/${projectId}/branches/${selectedBranchId}` });
              }}
            />
            <div className="branch-visualization-dialog-actions">
              <button
                className="create-dialog-button create-dialog-button-cancel"
                onClick={() => setShowBranchVisualization(false)}
              >
                Close
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
