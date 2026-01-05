/**
 * Dashboard index page - shows all projects
 *
 * Uses TanStack DB with Electric collections for real-time sync.
 * Redesigned to match Figma's clean, minimalist style.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLiveQuery, createCollection, liveQueryCollectionOptions } from "@tanstack/react-db";
import { LuChevronDown, LuLayoutGrid, LuList, LuTable } from "react-icons/lu";
import { workspacesCollection, projectsCollection } from "../../lib/electric-collections";
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

export const Route = createFileRoute("/dashboard/")({
  ssr: false, // Client-only: uses Electric collections and browser APIs
  component: DashboardIndexPage,
});

function DashboardIndexPage() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState("last-modified");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("grid");

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

  // Query workspaces
  const { data: workspaces, isLoading: workspacesLoading } = useLiveQuery(() => {
    return createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ workspaces: workspacesCollection })
            .orderBy(({ workspaces: w }) => w.created_at, "desc"),
      })
    );
  });

  // Query projects with dynamic sorting
  const { data: allProjects, isLoading: projectsLoading } = useLiveQuery(() => {
    return createCollection(
      liveQueryCollectionOptions({
        query: (q) => {
          let query = q.from({ projects: projectsCollection });

          // Apply sorting based on sortBy state
          if (sortBy === "name") {
            query = query.orderBy(({ projects: p }) => p.name, "asc");
          } else if (sortBy === "created") {
            query = query.orderBy(({ projects: p }) => p.created_at, "desc");
          } else {
            // Default: last-modified
            query = query.orderBy(({ projects: p }) => p.updated_at, "desc");
          }

          return query;
        },
      })
    );
  }, [sortBy]);

  // Get all projects for display
  const displayedProjects = allProjects || [];

  // Define table columns
  type ProjectRow = {
    id: string;
    name: string;
    workspace: string;
    description: string | null;
    updatedAt: string;
    project: (typeof displayedProjects)[0];
  };

  const columns: ColumnDef<ProjectRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: true,
      cell: (info) => (
        <div
          className="dashboard-table-cell-name"
          onClick={() => navigate({ to: `/dashboard/projects/${info.row.original.project.id}` })}
        >
          {info.getValue() as string}
        </div>
      ),
    },
    {
      accessorKey: "workspace",
      header: "Workspace",
      enableSorting: false,
      cell: (info) => (
        <span className="dashboard-table-cell-type">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      enableSorting: false,
      cell: (info) =>
        (info.getValue() as string | null) || (
          <span style={{ color: "var(--color-text-tertiary)" }}>—</span>
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
  const tableData: ProjectRow[] = displayedProjects.map((project) => {
    const workspace = workspaces?.find((w) => w.id === project.workspace_id);
    return {
      id: project.id,
      name: project.name,
      workspace: workspace?.name || "Unknown",
      description: project.description,
      updatedAt:
        project.updated_at instanceof Date ? project.updated_at.toISOString() : project.updated_at,
      project,
    };
  });

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
        ) : viewMode === "table" ? (
          <DashboardTableView
            data={tableData}
            columns={columns}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        ) : viewMode === "list" ? (
          <DashboardListView
            items={displayedProjects.map((project) => {
              const workspace = workspaces?.find((w) => w.id === project.workspace_id);
              return {
                id: project.id,
                name: project.name,
                path: workspace?.name,
                updatedAt: project.updated_at,
                onClick: () => navigate({ to: `/dashboard/projects/${project.id}` }),
              };
            })}
          />
        ) : (
          <DashboardGridView
            items={displayedProjects.map((project) => {
              const workspace = workspaces?.find((w) => w.id === project.workspace_id);
              return {
                id: project.id,
                name: project.name,
                description: project.description,
                workspace: workspace?.name,
                updatedAt: project.updated_at,
                onClick: () => navigate({ to: `/dashboard/projects/${project.id}` }),
              };
            })}
          />
        )}
      </div>

      {/* Properties Panel - floating on right */}
      <DashboardPropertiesPanel />
    </main>
  );
}
