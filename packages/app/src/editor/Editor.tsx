import React, { useState } from "react";
import { FloatingToolbar } from "./components/floating-toolbar";
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
import {
  KeyboardShortcutProvider,
  useKeyboardShortcut,
  ShortcutPriority,
} from "./contexts/KeyboardShortcutContext";
import { UserPresence } from "../components/UserPresence";
import { useFollowing } from "../hooks/useFollowing";
import "./Editor.css";

// Inner component that uses the document context
const EditorContent: React.FC = () => {
  const [_aiPanelVisible, _setAiPanelVisible] = useState(false);
  const { undo, redo, canUndo, canRedo, awareness, isCloudDocument, isLoading } = useDocument();

  // Following hook for user presence
  const { connectedUsers, followers, followingUserId, followUser, stopFollowing } = useFollowing({
    awareness,
  });

  // Keyboard shortcut: Mod+Z to undo
  useKeyboardShortcut({
    id: "global-undo",
    keys: ["Mod+Z"],
    priority: ShortcutPriority.GLOBAL,
    condition: () => canUndo,
    handler: () => {
      undo();
      return true;
    },
    description: "Undo",
    category: "Edit",
  });

  // Keyboard shortcut: Mod+Shift+Z to redo
  useKeyboardShortcut({
    id: "global-redo-shift-z",
    keys: ["Mod+Shift+Z"],
    priority: ShortcutPriority.GLOBAL,
    condition: () => canRedo,
    handler: () => {
      redo();
      return true;
    },
    description: "Redo",
    category: "Edit",
  });

  // Keyboard shortcut: Mod+Y to redo (Windows-style)
  useKeyboardShortcut({
    id: "global-redo-y",
    keys: ["Mod+Y"],
    priority: ShortcutPriority.GLOBAL,
    condition: () => canRedo,
    handler: () => {
      redo();
      return true;
    },
    description: "Redo",
    category: "Edit",
  });

  return (
    <div className="app">
      {/* Main content area - full screen viewer */}
      <div className="app-main">
        {/* Center - Viewer with floating overlays */}
        <main className="app-center">
          <div className="app-viewer">
            {/* Loading overlay - shown while document is loading */}
            {isLoading && (
              <div className="editor-loading-overlay">
                <div className="editor-loading-content">
                  <div className="editor-loading-spinner" />
                  <div className="editor-loading-text">Loading document...</div>
                </div>
              </div>
            )}

            {/* Only render Viewer when document is ready */}
            {!isLoading && <Viewer />}

            {/* Floating Feature Tree Panel (top left) */}
            <FloatingFeatureTreePanel />

            {/* Floating Properties Panel (top right) - always visible */}
            <PropertiesPanel />

            {/* User Presence (top right, below properties panel) - only for cloud documents */}
            {isCloudDocument && (connectedUsers.length > 0 || followers.length > 0) && (
              <div className="user-presence-container">
                <UserPresence
                  connectedUsers={connectedUsers}
                  followingUserId={followingUserId}
                  followers={followers}
                  onFollowUser={followUser}
                  onStopFollowing={stopFollowing}
                />
              </div>
            )}

            {/* Floating Toolbar (bottom center) */}
            <FloatingToolbar />

            {/* Status Overlay (bottom left) */}
            {!isLoading && <StatusOverlay />}

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
    <KeyboardShortcutProvider>
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
    </KeyboardShortcutProvider>
  );
};
