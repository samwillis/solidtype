/**
 * Dashboard page - shows workspaces and projects
 * 
 * Uses TanStack DB with Electric collections for real-time workspace sync.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSession, signOut } from '../lib/auth-client';
import { useLiveQuery, createCollection, liveQueryCollectionOptions } from '@tanstack/react-db';
import { workspacesCollection } from '../lib/electric-collections';
import '../styles/dashboard.css';

export const Route = createFileRoute('/dashboard')({
  ssr: false, // Client-only: uses Electric collections and browser APIs
  loader: async () => {
    // Create live query collection for ordered workspaces
    const orderedWorkspacesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ workspaces: workspacesCollection })
            .orderBy(({ workspaces: w }) => w.created_at, 'desc'),
      })
    );
    
    // Preload the collection in the loader
    await orderedWorkspacesCollection.preload();
    return { collection: orderedWorkspacesCollection };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const { collection } = Route.useLoaderData();
  
  // Collection is already loaded, so data is immediately available
  const { data: workspaces, isLoading } = useLiveQuery(() => collection);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: '/login' });
    }
  }, [session, isPending, navigate]);

  if (isPending || !session) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <h1>SolidType</h1>
        </div>
        <div className="dashboard-user">
          <span>{session.user.name || session.user.email}</span>
          <button onClick={() => signOut()} className="dashboard-signout">
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <h2>Workspaces</h2>
            <button className="dashboard-create-btn" onClick={() => openCreateWorkspace()}>
              + New Workspace
            </button>
          </div>

          {isLoading ? (
            <div className="dashboard-loading-inline">Loading workspaces...</div>
          ) : !workspaces || workspaces.length === 0 ? (
            <div className="dashboard-empty">
              <p>You don't have any workspaces yet.</p>
              <button className="dashboard-create-btn" onClick={() => openCreateWorkspace()}>
                Create your first workspace
              </button>
            </div>
          ) : (
            <div className="dashboard-grid">
              {(workspaces || []).map((workspace) => (
                <a
                  key={workspace.id}
                  href={`/workspace/${workspace.slug}`}
                  className="dashboard-card"
                >
                  <div className="dashboard-card-icon">📁</div>
                  <div className="dashboard-card-content">
                    <h3>{workspace.name}</h3>
                    {workspace.description && <p>{workspace.description}</p>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="dashboard-quick-actions">
            <Link to="/editor" className="dashboard-quick-action">
              <span className="dashboard-quick-action-icon">🎨</span>
              <span>Open Local Editor</span>
              <span className="dashboard-quick-action-desc">Work offline without saving</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function openCreateWorkspace() {
  // TODO: Implement create workspace modal
  alert('Create workspace modal - TODO');
}
