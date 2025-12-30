/**
 * Dashboard Properties Panel - Simplified version for dashboard
 * 
 * Only includes theme options (no projection, display, or share button)
 */

import React, { useState } from 'react';
import { useTheme } from '../editor/contexts/ThemeContext';
import { Tooltip } from '@base-ui/react';
import { Menu } from '@base-ui/react/menu';
import AIPanel from '../editor/components/AIPanel';
import { AIIcon } from '../editor/components/Icons';
import '../editor/components/PropertiesPanel.css';
import './DashboardPropertiesPanel.css';

const DashboardPropertiesPanel: React.FC = () => {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [showAIChat, setShowAIChat] = useState(false);

  const ThemeIcon = () => {
    if (themeMode === 'light') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      );
    } else if (themeMode === 'dark') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    } else {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <path d="M8 3v4M16 3v4M2 9h20" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    }
  };

  const renderHeader = () => (
    <Tooltip.Provider>
      <div className="properties-panel-header">
        <div className="properties-panel-header-left">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className="properties-panel-header-icon-button"
              onClick={() => {}}
              render={<button aria-label="User" />}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">User</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Menu.Root>
            <Menu.Trigger className="properties-panel-header-icon-button" aria-label="Theme Options">
              <ThemeIcon />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8}>
                <Menu.Popup className="properties-panel-header-dropdown">
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">Theme</Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === 'light' ? 'active' : ''}`}
                      onClick={() => setThemeMode('light')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                      </svg>
                      <span>Light</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === 'dark' ? 'active' : ''}`}
                      onClick={() => setThemeMode('dark')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      <span>Dark</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === 'auto' ? 'active' : ''}`}
                      onClick={() => setThemeMode('auto')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
              className={`properties-panel-header-button properties-panel-header-chat ${showAIChat ? 'active' : ''}`}
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
            <Menu.Trigger className="properties-panel-header-button properties-panel-header-share properties-panel-header-create" aria-label="Create">
              Create
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8}>
                <Menu.Popup className="properties-panel-header-dropdown">
                  <Menu.Group>
                    <Menu.Item
                      className="properties-panel-header-dropdown-item"
                      onClick={() => {
                        // TODO: Implement create workspace
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>Workspace</span>
                    </Menu.Item>
                    <Menu.Item
                      className="properties-panel-header-dropdown-item"
                      onClick={() => {
                        // TODO: Implement create project
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                      <span>Project</span>
                    </Menu.Item>
                    <Menu.Item
                      className="properties-panel-header-dropdown-item"
                      onClick={() => {
                        // TODO: Implement create document
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span>Document</span>
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
    <div className="properties-panel properties-panel-floating dashboard-properties-panel">
      {renderHeader()}
      {content && (
        <div className="properties-panel-content">
          {content}
        </div>
      )}
    </div>
  );
};

export default DashboardPropertiesPanel;
