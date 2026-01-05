/**
 * Branch View Route
 *
 * Displays a specific branch of a project with file/folder tree view.
 * Features:
 * - Branch dropdown with "View all branches" button
 * - Folder navigation with breadcrumbs
 * - Create menu with Document and Folder options
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useSession } from "../../../../../lib/auth-client";
import {
  useLiveQuery,
  createCollection,
  liveQueryCollectionOptions,
  eq,
  and,
  isNull,
} from "@tanstack/react-db";
import {
  LuGitBranch,
  LuChevronDown,
  LuLayoutGrid,
  LuList,
  LuFolder,
  LuFileText,
  LuGitBranch as LuGitNetwork,
  LuSettings,
  LuEllipsis,
  LuTrash2,
  LuMove,
  LuGitMerge,
} from "react-icons/lu";
import {
  projectsCollection,
  branchesCollection,
  foldersCollection,
  documentsCollection,
} from "../../../../../lib/electric-collections";
import { deleteDocumentMutation, deleteFolderMutation } from "../../../../../lib/server-functions";
import { Select } from "@base-ui/react/select";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { BranchVisualization } from "../../../../../components/BranchVisualization";
import { FolderBreadcrumbs } from "../../../../../components/FolderBreadcrumbs";
import DashboardPropertiesPanel from "../../../../../components/DashboardPropertiesPanel";
import { DashboardHeader } from "../../../../../components/DashboardHeader";
import { ProjectSettingsDialog } from "../../../../../components/dialogs/ProjectSettingsDialog";
import { MoveDialog } from "../../../../../components/dialogs/MoveDialog";
import { DeleteConfirmDialog } from "../../../../../components/dialogs/DeleteConfirmDialog";
import { MergeBranchDialog } from "../../../../../components/dialogs/MergeBranchDialog";
import "../../../../../styles/dashboard.css";

// Format time ago helper
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

export const Route = createFileRoute("/dashboard/projects/$projectId/branches/$branchId")({
  ssr: false,
  loader: async ({ params }) => {
    // Create filtered collections for this project
    const projectBranchesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ branches: branchesCollection })
            .where(({ branches: b }) => eq(b.project_id, params.projectId))
            .orderBy(({ branches: b }) => b.is_main, "desc")
            .orderBy(({ branches: b }) => b.created_at, "desc"),
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
  const [fileFilter, setFileFilter] = useState("all");
  const [sortBy, setSortBy] = useState("last-modified");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Dialog state
  const [showBranchVisualization, setShowBranchVisualization] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMergeBranch, setShowMergeBranch] = useState(false);
  const [moveItem, setMoveItem] = useState<{
    id: string;
    type: "document" | "folder";
    name: string;
    folderId: string | null;
  } | null>(null);
  const [deleteItem, setDeleteItem] = useState<{
    id: string;
    type: "document" | "folder";
    name: string;
  } | null>(null);

  // Handle delete document/folder
  const handleDeleteDocument = async () => {
    if (!deleteItem || deleteItem.type !== "document") return;
    try {
      await deleteDocumentMutation({ data: { documentId: deleteItem.id } });
      setDeleteItem(null);
    } catch (error) {
      console.error("Failed to delete document:", error);
      alert("Failed to delete document. Please try again.");
      throw error; // Re-throw so dialog can handle it
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteItem || deleteItem.type !== "folder") return;
    try {
      await deleteFolderMutation({ data: { folderId: deleteItem.id } });
      setDeleteItem(null);
    } catch (error) {
      console.error("Failed to delete folder:", error);
      alert("Failed to delete folder. Please try again.");
      throw error; // Re-throw so dialog can handle it
    }
  };

  const handleDelete = async () => {
    if (deleteItem?.type === "document") {
      await handleDeleteDocument();
    } else if (deleteItem?.type === "folder") {
      await handleDeleteFolder();
    }
  };

  // Load project and branches
  const { data: projects, isLoading: projectsLoading } = useLiveQuery(() => projectsCollection);
  const { data: branches, isLoading: branchesLoading } = useLiveQuery(
    () => projectBranchesCollection
  );
  const project = useMemo(() => projects?.find((p) => p.id === projectId), [projects, projectId]);
  const currentBranch = useMemo(
    () => branches?.find((b) => b.id === branchId),
    [branches, branchId]
  );

  // Reset current folder when branch changes
  /* eslint-disable react-hooks/set-state-in-effect -- reset state on route change */
  useEffect(() => {
    setCurrentFolderId(null);
  }, [branchId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load folders for current branch with filtering and sorting
  const { data: branchFolders, isLoading: foldersLoading } = useLiveQuery(() => {
    if (!currentBranch) return null;

    return createCollection(
      liveQueryCollectionOptions({
        query: (q) => {
          let query = q.from({ folders: foldersCollection });

          // Apply filtering
          if (currentFolderId === null) {
            query = query.where(({ folders: f }) =>
              and(eq(f.branch_id, currentBranch.id), isNull(f.parent_id))
            );
          } else {
            query = query.where(({ folders: f }) =>
              and(eq(f.branch_id, currentBranch.id), eq(f.parent_id, currentFolderId))
            );
          }

          // Apply sorting
          if (sortBy === "name") {
            query = query.orderBy(({ folders: f }) => f.name, "asc");
          } else if (sortBy === "created") {
            query = query.orderBy(({ folders: f }) => f.created_at, "desc");
          } else {
            // Default: last-modified
            query = query.orderBy(({ folders: f }) => f.updated_at, "desc");
          }

          return query;
        },
      })
    );
  }, [currentBranch, currentFolderId, sortBy]);

  // Load documents for current branch with filtering and sorting
  const { data: branchDocuments, isLoading: documentsLoading } = useLiveQuery(() => {
    if (!currentBranch) return null;

    return createCollection(
      liveQueryCollectionOptions({
        query: (q) => {
          let query = q.from({ documents: documentsCollection });

          // Apply filtering
          if (currentFolderId === null) {
            query = query.where(({ documents: d }) =>
              and(
                eq(d.project_id, projectId),
                eq(d.branch_id, currentBranch.id),
                eq(d.is_deleted, false),
                isNull(d.folder_id)
              )
            );
          } else {
            query = query.where(({ documents: d }) =>
              and(
                eq(d.project_id, projectId),
                eq(d.branch_id, currentBranch.id),
                eq(d.is_deleted, false),
                eq(d.folder_id, currentFolderId)
              )
            );
          }

          // Apply sorting
          if (sortBy === "name") {
            query = query.orderBy(({ documents: d }) => d.name, "asc");
          } else if (sortBy === "created") {
            query = query.orderBy(({ documents: d }) => d.created_at, "desc");
          } else {
            // Default: last-modified
            query = query.orderBy(({ documents: d }) => d.updated_at, "desc");
          }

          return query;
        },
      })
    );
  }, [currentBranch, projectId, currentFolderId, sortBy]);

  const isLoading = projectsLoading || branchesLoading || foldersLoading || documentsLoading;

  // Filter folders and documents based on fileFilter
  const filteredFolders = useMemo(() => {
    if (fileFilter === "documents" || !branchFolders) return [];
    return branchFolders;
  }, [branchFolders, fileFilter]);

  const filteredDocuments = useMemo(() => {
    if (fileFilter === "folders" || !branchDocuments) return [];
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

  // Build view controls JSX
  const viewControls = (
    <>
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
              <LuGitBranch size={14} style={{ marginRight: "6px" }} />
              {currentBranch.name}
              <LuChevronDown size={12} />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner className="dashboard-select-positioner">
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

        {/* Merge Branch button - only show for non-main branches */}
        {currentBranch && !currentBranch.is_main && !currentBranch.merged_at && (
          <button
            className="dashboard-view-branches-btn dashboard-merge-btn"
            onClick={() => setShowMergeBranch(true)}
            title="Merge this branch"
          >
            <LuGitMerge size={14} />
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="dashboard-header-separator" />

      {/* Sort and Filter */}
      <div className="dashboard-sort-filter">
        <Select.Root value={fileFilter} onValueChange={(value) => setFileFilter(value || "all")}>
          <Select.Trigger className="dashboard-select-trigger">
            {fileFilter === "all"
              ? "All files"
              : fileFilter === "folders"
                ? "Folders"
                : "Documents"}
            <LuChevronDown size={12} />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="dashboard-select-positioner">
              <Select.Popup className="dashboard-select-popup">
                <Select.Item value="all" className="dashboard-select-option">
                  All files
                </Select.Item>
                <Select.Item value="folders" className="dashboard-select-option">
                  Folders
                </Select.Item>
                <Select.Item value="documents" className="dashboard-select-option">
                  Documents
                </Select.Item>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>

        <Select.Root value={sortBy} onValueChange={(value) => setSortBy(value || "last-modified")}>
          <Select.Trigger className="dashboard-select-trigger">
            {sortBy === "last-modified" ? "Last modified" : sortBy === "name" ? "Name" : "Created"}
            <LuChevronDown size={12} />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="dashboard-select-positioner">
              <Select.Popup className="dashboard-select-popup">
                <Select.Item value="last-modified" className="dashboard-select-option">
                  Last modified
                </Select.Item>
                <Select.Item value="name" className="dashboard-select-option">
                  Name
                </Select.Item>
                <Select.Item value="created" className="dashboard-select-option">
                  Created
                </Select.Item>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>

        {/* View Toggle */}
        <ToggleGroup
          value={[viewMode]}
          onValueChange={(groupValue) => {
            if (groupValue && groupValue.length > 0) {
              setViewMode(groupValue[0] as "grid" | "list");
            }
          }}
          className="dashboard-view-toggle"
          aria-label="View mode"
        >
          <Toggle value="grid" className="dashboard-view-toggle-btn" aria-label="Grid view">
            <LuLayoutGrid size={16} />
          </Toggle>
          <Toggle value="list" className="dashboard-view-toggle-btn" aria-label="List view">
            <LuList size={16} />
          </Toggle>
        </ToggleGroup>
      </div>
    </>
  );

  return (
    <>
      <main className="dashboard-main dashboard-main--with-header">
        {/* Responsive Header */}
        <DashboardHeader
          title={project.name}
          titleAction={
            <button
              className="dashboard-project-settings-btn"
              onClick={() => setShowProjectSettings(true)}
              title="Project Settings"
              aria-label="Project Settings"
            >
              <LuSettings size={16} />
            </button>
          }
          viewControls={viewControls}
          propertiesPanel={
            <DashboardPropertiesPanel
              currentProjectId={projectId}
              currentBranchId={branchId}
              currentFolderId={currentFolderId}
              inline
            />
          }
        />

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
                {currentFolderId ? "This folder is empty" : "No files or folders"}
              </p>
              <p className="dashboard-empty-hint">Create a folder or document to get started</p>
            </div>
          ) : (
            <div className={`dashboard-${viewMode === "grid" ? "grid" : "list"}`}>
              {/* Folders */}
              {filteredFolders.map((folder) => (
                <div key={folder.id} className="dashboard-item-card">
                  <div
                    className="dashboard-item-card-main"
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
                  <Menu.Root>
                    <Menu.Trigger
                      className="dashboard-item-menu-btn"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Folder options"
                    >
                      <LuEllipsis size={16} />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Positioner sideOffset={4}>
                        <Menu.Popup className="dashboard-item-menu-popup">
                          <Menu.Group>
                            <Menu.Item
                              className="dashboard-item-menu-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveItem({
                                  id: folder.id,
                                  type: "folder",
                                  name: folder.name,
                                  folderId: folder.parent_id,
                                });
                                setShowMoveDialog(true);
                              }}
                            >
                              <LuMove size={16} />
                              <span>Move</span>
                            </Menu.Item>
                            <Menu.Item
                              className="dashboard-item-menu-item dashboard-item-menu-item-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteItem({
                                  id: folder.id,
                                  type: "folder",
                                  name: folder.name,
                                });
                                setShowDeleteDialog(true);
                              }}
                            >
                              <LuTrash2 size={16} />
                              <span>Delete</span>
                            </Menu.Item>
                          </Menu.Group>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                </div>
              ))}

              {/* Documents */}
              {filteredDocuments.map((document) => (
                <div key={document.id} className="dashboard-item-card">
                  <div
                    className="dashboard-item-card-main"
                    onClick={() => {
                      navigate({ to: "/editor", search: { documentId: document.id } });
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
                  <Menu.Root>
                    <Menu.Trigger
                      className="dashboard-item-menu-btn"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Document options"
                    >
                      <LuEllipsis size={16} />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Positioner sideOffset={4}>
                        <Menu.Popup className="dashboard-item-menu-popup">
                          <Menu.Group>
                            <Menu.Item
                              className="dashboard-item-menu-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveItem({
                                  id: document.id,
                                  type: "document",
                                  name: document.name,
                                  folderId: document.folder_id,
                                });
                                setShowMoveDialog(true);
                              }}
                            >
                              <LuMove size={16} />
                              <span>Move</span>
                            </Menu.Item>
                            <Menu.Item
                              className="dashboard-item-menu-item dashboard-item-menu-item-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteItem({
                                  id: document.id,
                                  type: "document",
                                  name: document.name,
                                });
                                setShowDeleteDialog(true);
                              }}
                            >
                              <LuTrash2 size={16} />
                              <span>Delete</span>
                            </Menu.Item>
                          </Menu.Group>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {/* Project Settings Dialog */}
      <ProjectSettingsDialog
        open={showProjectSettings}
        onOpenChange={setShowProjectSettings}
        projectId={projectId}
      />

      {/* Move Dialog */}
      {moveItem && (
        <MoveDialog
          open={showMoveDialog}
          onOpenChange={setShowMoveDialog}
          branchId={branchId}
          itemId={moveItem.id}
          itemType={moveItem.type}
          itemName={moveItem.name}
          currentFolderId={moveItem.folderId}
          onSuccess={() => {
            setMoveItem(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteItem && (
        <DeleteConfirmDialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            setShowDeleteDialog(open);
            if (!open) {
              setDeleteItem(null);
            }
          }}
          itemType={deleteItem.type}
          itemName={deleteItem.name}
          onConfirm={handleDelete}
        />
      )}

      {/* Merge Branch Dialog */}
      {currentBranch && !currentBranch.is_main && (
        <MergeBranchDialog
          open={showMergeBranch}
          onOpenChange={setShowMergeBranch}
          projectId={projectId}
          sourceBranchId={branchId}
          onSuccess={() => {
            // Navigate to main branch or refresh
            const mainBranch = branches?.find((b) => b.is_main);
            if (mainBranch) {
              navigate({ to: `/dashboard/projects/${projectId}/branches/${mainBranch.id}` });
            }
          }}
        />
      )}
    </>
  );
}
