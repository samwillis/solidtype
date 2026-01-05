/**
 * Recent Files page - shows recently edited documents across all branches
 *
 * Uses TanStack DB with Electric collections for real-time sync.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useLiveQuery, createCollection, liveQueryCollectionOptions, eq } from "@tanstack/react-db";
import { LuChevronDown, LuLayoutGrid, LuList, LuTable } from "react-icons/lu";
import {
  documentsCollection,
  projectsCollection,
  branchesCollection,
} from "../../lib/electric-collections";
import DashboardPropertiesPanel from "../../components/DashboardPropertiesPanel";
import { Select } from "@base-ui/react/select";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { formatTimeAgo } from "../../lib/utils/format";
import { type ColumnDef, type SortingState } from "@tanstack/react-table";
import { DashboardTableView } from "../../components/dashboard/DashboardTableView";
import { DashboardGridView } from "../../components/dashboard/DashboardGridView";
import { DashboardListView } from "../../components/dashboard/DashboardListView";
import "../../styles/dashboard.css";

export const Route = createFileRoute("/dashboard/recent")({
  ssr: false, // Client-only: uses Electric collections and browser APIs
  loader: async () => {
    // Create live query collections and preload them
    const recentDocumentsCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ documents: documentsCollection })
            .where(({ documents: d }) => eq(d.is_deleted, false))
            .orderBy(({ documents: d }) => d.updated_at, "desc")
            .limit(50), // Show last 50 recent files
      })
    );

    const allProjectsCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q.from({ projects: projectsCollection }).orderBy(({ projects: p }) => p.name, "asc"),
      })
    );

    const allBranchesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q.from({ branches: branchesCollection }).orderBy(({ branches: b }) => b.name, "asc"),
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

  const [sortBy, setSortBy] = useState("last-modified");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("list");

  // Sync table sorting with sortBy state
  const [sorting, setSorting] = useState<SortingState>(() => {
    if (sortBy === "name") {
      return [{ id: "name", desc: false }];
    } else if (sortBy === "created") {
      return [{ id: "updatedAt", desc: true }];
    } else {
      return [{ id: "updatedAt", desc: true }];
    }
  });

  // Sync sortBy when sorting changes (from table header clicks)
  useEffect(() => {
    if (sorting.length > 0 && viewMode === "table") {
      const sort = sorting[0];
      if (sort.id === "name") {
        setSortBy("name");
      } else if (sort.id === "updatedAt") {
        setSortBy("last-modified");
      }
    }
  }, [sorting, viewMode]);

  // Sync sorting when sortBy changes (from dropdown)
  useEffect(() => {
    if (viewMode === "table") {
      if (sortBy === "name") {
        setSorting([{ id: "name", desc: false }]);
      } else if (sortBy === "created") {
        setSorting([{ id: "updatedAt", desc: true }]);
      } else {
        setSorting([{ id: "updatedAt", desc: true }]);
      }
    }
  }, [sortBy, viewMode]);

  // Query documents, projects, and branches
  const { data: documents, isLoading: documentsLoading } = useLiveQuery(
    () => recentDocumentsCollection
  );

  const { data: projects } = useLiveQuery(() => allProjectsCollection);

  const { data: branches } = useLiveQuery(() => allBranchesCollection);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    if (!documents) return [];

    const docs = [...documents];

    switch (sortBy) {
      case "name":
        return docs.sort((a, b) => a.name.localeCompare(b.name));
      case "created":
        return docs.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case "last-modified":
      default:
        return docs.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
    }
  }, [documents, sortBy]);

  // Helper to get project and branch names
  const getProjectName = (projectId: string) => {
    return projects?.find((p) => p.id === projectId)?.name || "Unknown Project";
  };

  const getBranchName = (branchId: string) => {
    return branches?.find((b) => b.id === branchId)?.name || "Unknown Branch";
  };

  const handleDocumentClick = (doc: (typeof sortedDocuments)[0]) => {
    // Navigate to the document in its branch context
    navigate({
      to: `/dashboard/projects/${doc.project_id}/branches/${doc.branch_id}`,
    });
  };

  // Define table columns
  type DocumentRow = {
    id: string;
    name: string;
    project: string;
    branch: string;
    updatedAt: string;
    document: (typeof sortedDocuments)[0];
  };

  const columns: ColumnDef<DocumentRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: true,
      cell: (info) => (
        <div
          className="dashboard-table-cell-name"
          onClick={() => handleDocumentClick(info.row.original.document)}
        >
          {info.getValue() as string}
        </div>
      ),
    },
    {
      accessorKey: "project",
      header: "Project",
      enableSorting: false,
      cell: (info) => (
        <span className="dashboard-table-cell-type">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: "branch",
      header: "Branch",
      enableSorting: false,
      cell: (info) => (
        <span className="dashboard-table-cell-type">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Last Modified",
      enableSorting: true,
      cell: (info) => (
        <span className="dashboard-table-cell-time">
          {formatTimeAgo(info.getValue() as string)}
        </span>
      ),
    },
  ];

  // Prepare table data
  const tableData: DocumentRow[] = sortedDocuments.map((doc) => ({
    id: doc.id,
    name: doc.name,
    project: getProjectName(doc.project_id),
    branch: getBranchName(doc.branch_id),
    updatedAt: doc.updated_at instanceof Date ? doc.updated_at.toISOString() : doc.updated_at,
    document: doc,
  }));

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
              onValueChange={(value) => setSortBy(value || "last-modified")}
            >
              <Select.Trigger className="dashboard-select-trigger">
                {sortBy === "last-modified"
                  ? "Last modified"
                  : sortBy === "name"
                    ? "Name"
                    : "Created"}
                <LuChevronDown size={12} />
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner>
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
                  setViewMode(groupValue[0] as "grid" | "list" | "table");
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
              <Toggle value="table" className="dashboard-view-toggle-btn" aria-label="Table view">
                <LuTable size={16} />
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
        ) : viewMode === "table" ? (
          <DashboardTableView
            data={tableData}
            columns={columns}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        ) : viewMode === "list" ? (
          <DashboardListView
            items={sortedDocuments.map((doc) => ({
              id: doc.id,
              name: doc.name,
              path: `${getProjectName(doc.project_id)} / ${getBranchName(doc.branch_id)}`,
              updatedAt: doc.updated_at,
              onClick: () => handleDocumentClick(doc),
            }))}
          />
        ) : (
          <DashboardGridView
            items={sortedDocuments.map((doc) => ({
              id: doc.id,
              name: doc.name,
              workspace: getProjectName(doc.project_id),
              meta: `${getBranchName(doc.branch_id)} · ${formatTimeAgo(doc.updated_at)}`,
              onClick: () => handleDocumentClick(doc),
            }))}
          />
        )}
      </div>

      {/* Properties Panel - floating on right */}
      <DashboardPropertiesPanel />
    </main>
  );
}
