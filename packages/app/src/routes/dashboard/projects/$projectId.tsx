/**
 * Project Layout Route
 *
 * This is a layout route that handles project-level loading.
 * When accessed directly (not via a child route), it redirects to the main branch.
 * Child routes (like /branches/$branchId) are rendered via <Outlet />.
 */

import { createFileRoute, useNavigate, Outlet, useMatch } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useLiveQuery, createCollection, liveQueryCollectionOptions, eq } from "@tanstack/react-db";
import { LuChevronDown } from "react-icons/lu";
import { projectsCollection, branchesCollection } from "../../../lib/electric-collections";
import { Select } from "@base-ui/react/select";
import DashboardPropertiesPanel from "../../../components/DashboardPropertiesPanel";
import "../../../styles/dashboard.css";

export const Route = createFileRoute("/dashboard/projects/$projectId")({
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
  component: ProjectLayout,
});

function ProjectLayout() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const { projectBranchesCollection } = Route.useLoaderData();

  // Check if we're on a child route (branch route)
  // If we are, render the child via Outlet and skip the redirect logic
  const branchMatch = useMatch({
    from: "/dashboard/projects/$projectId/branches/$branchId",
    shouldThrow: false,
  });
  const hasChildRoute = !!branchMatch;

  // Track if we've waited long enough for sync
  const [hasWaitedForSync, setHasWaitedForSync] = useState(false);
  // Track if we've already initiated a redirect
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Load project and branches
  const { data: projects, isLoading: projectsLoading } = useLiveQuery(() => projectsCollection as any);
  const { data: branches, isLoading: branchesLoading } = useLiveQuery(
    () => projectBranchesCollection
  );
  const project = useMemo(() => projects?.find((p) => p.id === projectId), [projects, projectId]);
  const mainBranch = useMemo(() => branches?.find((b) => b.is_main), [branches]);

  // Give Electric some time to sync new branches before showing "not found"
  /* eslint-disable react-hooks/set-state-in-effect -- track sync timing and redirect state */
  useEffect(() => {
    if (!hasChildRoute && !mainBranch && !branchesLoading && branches?.length === 0) {
      // Wait a bit for Electric sync before showing error
      const timer = setTimeout(() => {
        setHasWaitedForSync(true);
      }, 3000); // Wait 3 seconds for sync

      return () => clearTimeout(timer);
    } else if (mainBranch) {
      // Reset if main branch appears
      setHasWaitedForSync(false);
    }
    return undefined;
  }, [hasChildRoute, mainBranch, branchesLoading, branches]);

  // Redirect to main branch route when main branch is available (only if not already on a child route)
  useEffect(() => {
    if (!hasChildRoute && mainBranch && !isRedirecting) {
      setIsRedirecting(true);
      // Use replace to avoid back-button issues
      navigate({ to: `/dashboard/projects/${projectId}/branches/${mainBranch.id}`, replace: true });
    }
  }, [hasChildRoute, mainBranch, projectId, navigate, isRedirecting]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // If we're on a child route (branch), render the child
  if (hasChildRoute) {
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
  if (mainBranch || isRedirecting) {
    return (
      <main className="dashboard-main">
        <div className="dashboard-loading-inline">
          <div className="spinner" />
          <p>Opening branch...</p>
        </div>
      </main>
    );
  }

  // Show loading while waiting for Electric sync (before showing "not found")
  if (!hasWaitedForSync) {
    return (
      <main className="dashboard-main">
        <div className="dashboard-loading-inline">
          <div className="spinner" />
          <p>Loading branches...</p>
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
