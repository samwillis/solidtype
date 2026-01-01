import React, { useState, useEffect } from "react";
import FloatingToolbar from "./components/FloatingToolbar";
import FloatingFeatureTreePanel from "./components/FloatingFeatureTreePanel";
import ViewCube from "./components/ViewCube";
import Viewer from "./components/Viewer";
import PropertiesPanel from "./components/PropertiesPanel";
import StatusOverlay from "./components/StatusOverlay";
import { DocumentProvider, useDocument } from "./contexts/DocumentContext";
import { KernelProvider } from "./contexts/KernelContext";
import { SketchProvider } from "./contexts/SketchContext";
import { SelectionProvider } from "./contexts/SelectionContext";
import { FeatureEditProvider } from "./contexts/FeatureEditContext";
import { UserPresence } from "../components/UserPresence";
import { useFollowing } from "../hooks/useFollowing";
import "./Editor.css";

// Inner component that uses the document context
const EditorContent: React.FC = () => {
  const [_aiPanelVisible, _setAiPanelVisible] = useState(false);
  const { undo, redo, canUndo, canRedo, awareness, isCloudDocument } = useDocument();

  // Following hook for user presence
  const { connectedUsers, followingUserId, followUser, stopFollowing } = useFollowing({
    awareness,
  });

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if (modKey && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        if (canRedo) redo();
      } else if (modKey && e.key === "y") {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  return (
    <div className="app">
      {/* Main content area - full screen viewer */}
      <div className="app-main">
        {/* Center - Viewer with floating overlays */}
        <main className="app-center">
          <div className="app-viewer">
            <Viewer />

            {/* Floating Feature Tree Panel (top left) */}
            <FloatingFeatureTreePanel />

            {/* Floating Properties Panel (top right) - always visible */}
            <PropertiesPanel />

            {/* User Presence (top right, below properties panel) - only for cloud documents */}
            {isCloudDocument && connectedUsers.length > 0 && (
              <div className="user-presence-container">
                <UserPresence
                  connectedUsers={connectedUsers}
                  followingUserId={followingUserId}
                  onFollowUser={followUser}
                  onStopFollowing={stopFollowing}
                />
              </div>
            )}

            {/* Floating Toolbar (bottom center) */}
            <FloatingToolbar />

            {/* Status Overlay (bottom left) */}
            <StatusOverlay />

            {/* View Cube (bottom right) */}
            <ViewCube />
          </div>
        </main>
      </div>
    </div>
  );
};

// Main Editor component wraps everything with providers
export const Editor: React.FC<{ documentId?: string }> = ({ documentId }) => {
  return (
    <DocumentProvider documentId={documentId}>
      <KernelProvider>
        <SelectionProvider>
          <SketchProvider>
            <FeatureEditProvider>
              <EditorContent />
            </FeatureEditProvider>
          </SketchProvider>
        </SelectionProvider>
      </KernelProvider>
    </DocumentProvider>
  );
};
