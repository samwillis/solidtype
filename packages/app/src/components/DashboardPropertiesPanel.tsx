/**
 * Dashboard Properties Panel - Simplified version for dashboard
 *
 * Only includes theme options (no projection, display, or share button)
 * Context-aware: when in a project/branch, dialogs open with correct preselected values
 */

import React, { useState } from "react";
import { useTheme } from "../editor/contexts/ThemeContext";
import { Tooltip } from "@base-ui/react";
import { Menu } from "@base-ui/react/menu";
import {
  LuSun,
  LuMoon,
  LuMonitor,
  LuChevronDown,
  LuFolder,
  LuLayoutGrid,
  LuGitBranch,
  LuFileText,
} from "react-icons/lu";
import { useSession } from "../lib/auth-client";
import { generateAvatarColor, getInitials } from "../lib/user-avatar";
import AIPanel from "../editor/components/AIPanel";
import { AIIcon } from "../editor/components/Icons";
import { CreateWorkspaceDialog } from "./dialogs/CreateWorkspaceDialog";
import { CreateProjectDialog } from "./dialogs/CreateProjectDialog";
import { CreateDocumentDialog } from "./dialogs/CreateDocumentDialog";
import { CreateFolderDialog } from "./dialogs/CreateFolderDialog";
import { CreateBranchDialog } from "./dialogs/CreateBranchDialog";
import { UserProfileDialog } from "./dialogs/UserProfileDialog";
import "../editor/components/PropertiesPanel.css";
import "./DashboardPropertiesPanel.css";

interface DashboardPropertiesPanelProps {
  /** Current project ID from URL - used to preselect in dialogs */
  currentProjectId?: string;
  /** Current branch ID from URL - used to preselect in dialogs */
  currentBranchId?: string;
  /** Current folder ID - used to preselect in dialogs */
  currentFolderId?: string | null;
}

const DashboardPropertiesPanel: React.FC<DashboardPropertiesPanelProps> = ({
  currentProjectId,
  currentBranchId,
  currentFolderId,
}) => {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { data: session } = useSession();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);

  const user = session?.user;
  const userInitials = user ? getInitials(user.name, user.email) : "?";
  const userAvatarColor = user ? generateAvatarColor(user.email || user.id) : "#888888";

  const ThemeIcon = () => {
    if (themeMode === "light") {
      return <LuSun size={16} />;
    } else if (themeMode === "dark") {
      return <LuMoon size={16} />;
    } else {
      return <LuMonitor size={16} />;
    }
  };

  const renderHeader = () => (
    <Tooltip.Provider>
      <div className="properties-panel-header">
        <div className="properties-panel-header-left">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className="properties-panel-header-icon-button properties-panel-user-avatar"
              onClick={() => setShowUserProfile(true)}
              render={<button aria-label="User Profile" />}
              style={{ backgroundColor: userAvatarColor, padding: 0 }}
            >
              <span style={{ fontSize: "11px", fontWeight: 500, color: "white" }}>
                {userInitials}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">
                  User Profile
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Menu.Root>
            <Menu.Trigger
              className="properties-panel-header-icon-button"
              aria-label="Theme Options"
            >
              <ThemeIcon />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8}>
                <Menu.Popup className="properties-panel-header-dropdown">
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">
                      Theme
                    </Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "light" ? "active" : ""}`}
                      onClick={() => setThemeMode("light")}
                    >
                      <LuSun />
                      <span>Light</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "dark" ? "active" : ""}`}
                      onClick={() => setThemeMode("dark")}
                    >
                      <LuMoon />
                      <span>Dark</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "auto" ? "active" : ""}`}
                      onClick={() => setThemeMode("auto")}
                    >
                      <LuMonitor />
                      <span>System</span>
                    </Menu.Item>
                  </Menu.Group>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <div className="properties-panel-header-right">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`properties-panel-header-button properties-panel-header-chat ${showAIChat ? "active" : ""}`}
              onClick={() => setShowAIChat(!showAIChat)}
              render={<button aria-label="AI Chat" />}
            >
              <AIIcon />
              <span>Chat</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">AI Chat</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Menu.Root>
            <Menu.Trigger
              className="properties-panel-header-button properties-panel-header-share properties-panel-header-create"
              aria-label="Create"
            >
              Create
              <LuChevronDown size={12} style={{ marginLeft: "4px" }} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8}>
                <Menu.Popup className="properties-panel-header-dropdown">
                  <Menu.Group>
                    <Menu.Item
                      className="properties-panel-header-dropdown-item"
                      onClick={() => {
                        setShowCreateWorkspace(true);
                      }}
                    >
                      <LuFolder />
                      <span>Workspace</span>
                    </Menu.Item>
                    <Menu.Item
                      className="properties-panel-header-dropdown-item"
                      onClick={() => {
                        setShowCreateProject(true);
                      }}
                    >
                      <LuLayoutGrid />
                      <span>Project</span>
                    </Menu.Item>
                    {/* Show Branch option when in a project */}
                    {currentProjectId && (
                      <Menu.Item
                        className="properties-panel-header-dropdown-item"
                        onClick={() => {
                          setShowCreateBranch(true);
                        }}
                      >
                        <LuGitBranch />
                        <span>Branch</span>
                      </Menu.Item>
                    )}
                    <Menu.Item
                      className="properties-panel-header-dropdown-item"
                      onClick={() => {
                        setShowCreateDocument(true);
                      }}
                    >
                      <LuFileText />
                      <span>Document</span>
                    </Menu.Item>
                    <Menu.Item
                      className="properties-panel-header-dropdown-item"
                      onClick={() => {
                        setShowCreateFolder(true);
                      }}
                    >
                      <LuFolder />
                      <span>Folder</span>
                    </Menu.Item>
                  </Menu.Group>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );

  const content = showAIChat ? <AIPanel /> : null;

  return (
    <>
      <div className="properties-panel properties-panel-floating dashboard-properties-panel">
        {renderHeader()}
        {content && <div className="properties-panel-content">{content}</div>}
      </div>
      <CreateWorkspaceDialog open={showCreateWorkspace} onOpenChange={setShowCreateWorkspace} />
      <CreateProjectDialog open={showCreateProject} onOpenChange={setShowCreateProject} />
      <CreateDocumentDialog
        open={showCreateDocument}
        onOpenChange={setShowCreateDocument}
        preselectedProjectId={currentProjectId}
        preselectedBranchId={currentBranchId}
        preselectedFolderId={currentFolderId ?? undefined}
      />
      <CreateFolderDialog
        open={showCreateFolder}
        onOpenChange={setShowCreateFolder}
        preselectedProjectId={currentProjectId}
        preselectedBranchId={currentBranchId}
        preselectedParentFolderId={currentFolderId ?? undefined}
      />
      {currentProjectId && (
        <CreateBranchDialog
          open={showCreateBranch}
          onOpenChange={setShowCreateBranch}
          projectId={currentProjectId}
          parentBranchId={currentBranchId}
        />
      )}
      <UserProfileDialog open={showUserProfile} onOpenChange={setShowUserProfile} />
    </>
  );
};

export default DashboardPropertiesPanel;
