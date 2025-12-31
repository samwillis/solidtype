/**
 * Theme toggle component - can be used anywhere
 */

import React from 'react';
import { Menu } from '@base-ui/react/menu';
import { LuSun, LuMoon, LuMonitor } from 'react-icons/lu';
import { useTheme } from '../editor/contexts/ThemeContext';
import '../editor/components/PropertiesPanel.css';

interface ThemeToggleProps {
  /** Button variant - 'icon' for icon-only, 'button' for button with text */
  variant?: 'icon' | 'button';
  /** CSS class name */
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'icon', className = '' }) => {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  const ThemeIcon = () => {
    if (themeMode === 'light') {
      return <LuSun size={16} />;
    } else if (themeMode === 'dark') {
      return <LuMoon size={16} />;
    } else {
      return <LuMonitor size={16} />;
    }
  };

  if (variant === 'button') {
    return (
      <Menu.Root disableScrollLock>
        <Menu.Trigger className={`home-theme-button ${className}`} aria-label="Theme Options">
          <ThemeIcon />
          <span>Theme</span>
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
                  <LuSun />
                  <span>Light</span>
                </Menu.Item>
                <Menu.Item
                  className={`properties-panel-header-dropdown-item ${themeMode === 'dark' ? 'active' : ''}`}
                  onClick={() => setThemeMode('dark')}
                >
                  <LuMoon />
                  <span>Dark</span>
                </Menu.Item>
                <Menu.Item
                  className={`properties-panel-header-dropdown-item ${themeMode === 'auto' ? 'active' : ''}`}
                  onClick={() => setThemeMode('auto')}
                >
                  <LuMonitor />
                  <span>System</span>
                </Menu.Item>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    );
  }

  return (
    <Menu.Root disableScrollLock>
      <Menu.Trigger className={`home-theme-icon ${className}`} aria-label="Theme Options">
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
                <LuSun />
                <span>Light</span>
              </Menu.Item>
              <Menu.Item
                className={`properties-panel-header-dropdown-item ${themeMode === 'dark' ? 'active' : ''}`}
                onClick={() => setThemeMode('dark')}
              >
                <LuMoon />
                <span>Dark</span>
              </Menu.Item>
              <Menu.Item
                className={`properties-panel-header-dropdown-item ${themeMode === 'auto' ? 'active' : ''}`}
                onClick={() => setThemeMode('auto')}
              >
                <LuMonitor />
                <span>System</span>
              </Menu.Item>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};