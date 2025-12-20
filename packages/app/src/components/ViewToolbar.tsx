import React from 'react';
import { Tooltip, Separator } from '@base-ui/react';
import './ViewToolbar.css';

// View control icons
const FrontViewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" />
  </svg>
);

const TopViewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
  </svg>
);

const IsoViewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
    <path d="M12 22V10M12 10L4 6M12 10l8-4" />
  </svg>
);

const WireframeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
    <path d="M12 21V12M3 8l9 4 9-4" />
  </svg>
);

const ShadedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
  </svg>
);

interface ViewButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}

const ViewButton: React.FC<ViewButtonProps> = ({ icon, label, onClick, active }) => {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <button
              className={`view-button ${active ? 'active' : ''}`}
              onClick={onClick}
              aria-label={label}
            >
              {icon}
            </button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner side="top" sideOffset={4}>
            <Tooltip.Popup className="view-tooltip">
              {label}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

const ViewToolbar: React.FC = () => {
  return (
    <div className="view-toolbar">
      <ViewButton icon={<FrontViewIcon />} label="Front" />
      <ViewButton icon={<TopViewIcon />} label="Top" />
      <ViewButton icon={<IsoViewIcon />} label="Isometric" />
      <Separator orientation="vertical" className="view-separator" />
      <ViewButton icon={<WireframeIcon />} label="Wireframe" />
      <ViewButton icon={<ShadedIcon />} label="Shaded" active />
    </div>
  );
};

export default ViewToolbar;
