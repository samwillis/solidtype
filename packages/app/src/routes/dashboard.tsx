/**
 * Dashboard layout route
 *
 * This layout route renders the shared sidebar for all dashboard child routes.
 * Child routes like /dashboard, /dashboard/projects/$projectId render inside the Outlet.
 */

import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useEffect } from "react";
import { useSession } from "../lib/auth-client";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { DocumentProvider } from "../editor/contexts/DocumentContext";
import { SelectionProvider } from "../editor/contexts/SelectionContext";
import { FeatureEditProvider } from "../editor/contexts/FeatureEditContext";
import { SketchProvider } from "../editor/contexts/SketchContext";
import { KernelProvider } from "../editor/contexts/KernelContext";
import { ViewerProvider } from "../editor/contexts/ViewerContext";
import "../styles/dashboard.css";

export const Route = createFileRoute("/dashboard")({
  ssr: false, // Client-only: uses Electric collections and browser APIs
  component: DashboardLayout,
});

function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  // Derive active section from URL
  const activeSection = useMemo(() => {
    const pathname = location.pathname;

    // Match project routes
    const projectMatch = pathname.match(/\/dashboard\/projects\/([^\/]+)/);
    if (projectMatch) {
      return `project-${projectMatch[1]}`;
    }

    // Match recent files route
    if (pathname === "/dashboard/recent") {
      return "recent";
    }

    // Default to all projects (dashboard index)
    return "projects";
  }, [location.pathname]);

  // Extract current project/branch from URL for context-aware dialogs
  const currentProjectId = useMemo(() => {
    const match = location.pathname.match(/\/dashboard\/projects\/([^\/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  const currentBranchId = useMemo(() => {
    const match = location.pathname.match(/\/dashboard\/projects\/[^\/]+\/branches\/([^\/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [session, isPending, navigate]);

  if (isPending) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <DocumentProvider>
      <KernelProvider>
        <SelectionProvider>
          <SketchProvider>
            <FeatureEditProvider>
              <ViewerProvider>
                <div className="dashboard">
                  <DashboardSidebar
                    activeSection={activeSection}
                    onSectionChange={(section) => {
                      if (section === "recent") {
                        navigate({ to: "/dashboard" });
                      } else if (section.startsWith("project-")) {
                        const projectId = section.replace("project-", "");
                        navigate({ to: `/dashboard/projects/${projectId}` });
                      }
                    }}
                    currentProjectId={currentProjectId}
                    currentBranchId={currentBranchId}
                  />
                  <Outlet />
                </div>
              </ViewerProvider>
            </FeatureEditProvider>
          </SketchProvider>
        </SelectionProvider>
      </KernelProvider>
    </DocumentProvider>
  );
}
