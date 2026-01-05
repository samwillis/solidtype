/**
 * Project Layout Route
 *
 * This is a layout route that handles project-level loading.
 * When accessed directly (not via a child route), it redirects to the main branch.
 * Child routes (like /branches/$branchId) are rendered via <Outlet />.
 */

import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useLiveQuery, createCollection, liveQueryCollectionOptions, eq } from "@tanstack/react-db";
import { LuChevronDown } from "react-icons/lu";
import { projectsCollection, branchesCollection } from "../../../lib/electric-collections";
import { Select } from "@base-ui/react/select";
import DashboardPropertiesPanel from "../../../components/DashboardPropertiesPanel";
import "../../../styles/dashboard.css";

export const Route = createFileRoute("/dashboard/projects/$projectId")({
  ssr: false,
  loader: async ({ params }) => {
    // Create and preload the branches collection for this project
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
  component: ProjectLayout,
});

function ProjectLayout() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const { projectBranchesCollection } = Route.useLoaderData();
  const router = useRouterState();

  // Check if we're on a branch route
  const currentPath = router.location.pathname;
  const isOnBranchRoute = currentPath.includes(`/projects/${projectId}/branches/`);
  const isOnProjectRoute = currentPath === `/dashboard/projects/${projectId}`;

  // Load data
  const { data: projects, isLoading: projectsLoading } = useLiveQuery((q) =>
    q.from({ projects: projectsCollection }).orderBy(({ projects: p }) => p.updated_at, "desc")
  );
  const { data: branches, isLoading: branchesLoading } = useLiveQuery(projectBranchesCollection);

  const project = projects?.find((p) => p.id === projectId);
  const mainBranch = branches?.find((b) => b.is_main);

  // Redirect to main branch when on project route
  useEffect(() => {
    if (isOnProjectRoute && mainBranch && !branchesLoading && !projectsLoading) {
      navigate({ to: `/dashboard/projects/${projectId}/branches/${mainBranch.id}`, replace: true });
    }
  }, [isOnProjectRoute, mainBranch, branchesLoading, projectsLoading, projectId, navigate]);

  // If we're on a child route (branch), render the child
  if (isOnBranchRoute) {
    return <Outlet />;
  }

  // Show loading while project/branches are loading
  if (projectsLoading || branchesLoading) {
    return (
      <main className="dashboard-main">
        <div className="dashboard-loading-inline">
          <div className="spinner" />
          <p>Loading project...</p>
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
        <DashboardPropertiesPanel />
      </main>
    );
  }

  // Show loading while redirecting to main branch
  if (isOnProjectRoute && mainBranch && !branchesLoading && !projectsLoading) {
    return (
      <main className="dashboard-main">
        <div className="dashboard-loading-inline">
          <div className="spinner" />
          <p>Opening branch...</p>
        </div>
      </main>
    );
  }

  // Fallback view - no main branch found after waiting for sync
  return (
    <main className="dashboard-main">
      {/* Header */}
      <header className="dashboard-content-header">
        <h1 className="dashboard-content-title">{project.name}</h1>

        <div className="dashboard-content-header-actions">
          {/* Branch Selector */}
          {branches && branches.length > 0 && (
            <Select.Root
              value=""
              onValueChange={(value) => {
                if (value) {
                  navigate({ to: `/dashboard/projects/${projectId}/branches/${value}` });
                }
              }}
            >
              <Select.Trigger className="dashboard-select-trigger">
                Select branch...
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
                        {branch.name} {branch.is_main ? "(main)" : ""}
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
          )}
        </div>
      </header>

      {/* Content Area */}
      <div className="dashboard-content">
        <div className="dashboard-empty">
          <p className="dashboard-empty-title">No main branch found</p>
          <p className="dashboard-empty-hint">
            {branches && branches.length > 0
              ? "Select a branch from the dropdown to continue"
              : "This project has no branches. Try refreshing the page."}
          </p>
        </div>
      </div>

      {/* Properties Panel */}
      <DashboardPropertiesPanel />
    </main>
  );
}
