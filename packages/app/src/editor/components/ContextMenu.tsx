import React from 'react';
import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import './ContextMenu.css';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, children, onOpenChange }) => {
  return (
    <BaseContextMenu.Root onOpenChange={onOpenChange}>
      <BaseContextMenu.Trigger className="context-menu-trigger">
        {children}
      </BaseContextMenu.Trigger>
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className="context-menu-positioner">
          <BaseContextMenu.Popup className="context-menu">
            {items.map((item, index) => {
              if (item.separator) {
                return <BaseContextMenu.Separator key={`sep-${index}`} className="context-menu-separator" />;
              }
              
              return (
                <BaseContextMenu.Item
                  key={item.id}
                  className={`context-menu-item ${item.danger ? 'danger' : ''}`}
                  disabled={item.disabled}
                  onClick={item.onClick}
                >
                  {item.icon && <span className="context-menu-icon">{item.icon}</span>}
                  <span className="context-menu-label">{item.label}</span>
                  {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
                </BaseContextMenu.Item>
              );
            })}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
};

// Standalone version that can be positioned anywhere (for when trigger wrapping isn't possible)
interface StandaloneContextMenuProps {
  items: ContextMenuItem[];
  open: boolean;
  onClose: () => void;
}

export const StandaloneContextMenu: React.FC<StandaloneContextMenuProps> = ({ items, open, onClose }) => {
  if (!open) return null;
  
  return (
    <div className="context-menu" onClick={onClose}>
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="context-menu-separator" />;
        }
        
        return (
          <button
            key={item.id}
            className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.();
                onClose();
              }
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default ContextMenu;
