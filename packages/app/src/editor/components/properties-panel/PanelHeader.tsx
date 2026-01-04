/**
 * Panel Header Component
 *
 * Header for the properties panel with user avatar, display options dropdown,
 * AI chat toggle, and share button.
 */

import { Menu } from "@base-ui/react/menu";
import { Tooltip } from "@base-ui/react";
import { useViewer } from "../../contexts/ViewerContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useSession } from "../../../lib/auth-client";
import { Avatar } from "../../../components/Avatar";
import { AIIcon } from "../Icons";

interface PanelHeaderProps {
  showAIChat: boolean;
  onToggleAIChat: () => void;
  onUserProfileClick: () => void;
}

export function PanelHeader({ showAIChat, onToggleAIChat, onUserProfileClick }: PanelHeaderProps) {
  const { state: viewerState, actions: viewerActions } = useViewer();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { data: session } = useSession();

  const user = session?.user;

  return (
    <Tooltip.Provider>
      <div className="properties-panel-header">
        <div className="properties-panel-header-left">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className="properties-panel-header-icon-button properties-panel-user-avatar"
              onClick={onUserProfileClick}
              render={<button aria-label="User Profile" />}
              style={{ padding: 0 }}
            >
              {user ? (
                <Avatar user={user} size={28} fontSize={11} />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">
                  {user ? user.name || user.email || "User Profile" : "Sign In"}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Menu.Root>
            <Menu.Trigger
              className="properties-panel-header-icon-button"
              aria-label="Display Options"
            >
              {viewerState.projectionMode === "perspective" ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
                  <path d="M12 22V10M12 10L4 6M12 10l8-4" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="4" y="4" width="16" height="16" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
              )}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8}>
                <Menu.Popup className="properties-panel-header-dropdown">
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">
                      Projection
                    </Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.projectionMode === "perspective" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.projectionMode !== "perspective") {
                          viewerActions.toggleProjection();
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
                        <path d="M12 22V10M12 10L4 6M12 10l8-4" />
                      </svg>
                      <span>Perspective</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.projectionMode === "orthographic" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.projectionMode !== "orthographic") {
                          viewerActions.toggleProjection();
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="4" y="4" width="16" height="16" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="12" y1="4" x2="12" y2="20" />
                      </svg>
                      <span>Orthographic</span>
                    </Menu.Item>
                  </Menu.Group>
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">
                      Display
                    </Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.displayMode === "shaded" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.displayMode !== "shaded") {
                          viewerActions.setDisplayMode("shaded");
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="1"
                      >
                        <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
                      </svg>
                      <span>Shaded</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.displayMode === "wireframe" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.displayMode !== "wireframe") {
                          viewerActions.setDisplayMode("wireframe");
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
                        <path d="M12 21V12M3 8l9 4 9-4" />
                      </svg>
                      <span>Wireframe</span>
                    </Menu.Item>
                    <Menu.Separator className="properties-panel-header-dropdown-separator" />
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.ambientOcclusion ? "active" : ""}`}
                      onClick={() => viewerActions.toggleAmbientOcclusion()}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a10 10 0 0 0 0 20" fill="currentColor" opacity="0.3" />
                      </svg>
                      <span>Ambient Occlusion</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.showEdges ? "active" : ""}`}
                      onClick={() => viewerActions.toggleShowEdges()}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M3 3h18v18H3z" />
                        <path d="M3 3l18 18M21 3L3 21" />
                      </svg>
                      <span>Show Edges</span>
                    </Menu.Item>
                  </Menu.Group>
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">
                      Theme
                    </Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "light" ? "active" : ""}`}
                      onClick={() => setThemeMode("light")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                      </svg>
                      <span>Light</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "dark" ? "active" : ""}`}
                      onClick={() => setThemeMode("dark")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      <span>Dark</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "auto" ? "active" : ""}`}
                      onClick={() => setThemeMode("auto")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="2" y="3" width="20" height="18" rx="2" />
                        <path d="M8 3v4M16 3v4M2 9h20" />
                        <path d="M9 13h6M9 17h6" />
                      </svg>
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
              onClick={onToggleAIChat}
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
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className="properties-panel-header-button properties-panel-header-share"
              onClick={() => {}}
              render={<button aria-label="Share" />}
            >
              Share
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">Share</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
