import React from 'react';
import { Separator, Tooltip } from '@base-ui/react';
import './ViewToolbar.css';

// View control icons
const ZoomFitIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
  </svg>
);

const ZoomInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35M8 11h6" />
  </svg>
);

const FrontViewIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" />
    <text x="12" y="15" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none">F</text>
  </svg>
);

const TopViewIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
    <text x="12" y="14" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none">T</text>
  </svg>
);

const IsoViewIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
    <path d="M12 22V10M12 10L4 6M12 10l8-4" />
  </svg>
);

const WireframeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
    <path d="M12 21V12M3 8l9 4 9-4" />
  </svg>
);

const ShadedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
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
              className={`view-toolbar-button ${active ? 'active' : ''}`}
              onClick={onClick}
              aria-label={label}
            >
              {icon}
            </button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6}>
            <Tooltip.Popup className="view-toolbar-tooltip">
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
      <div className="view-toolbar-group">
        <ViewButton icon={<ZoomFitIcon />} label="Zoom to Fit" />
        <ViewButton icon={<ZoomInIcon />} label="Zoom In" />
        <ViewButton icon={<ZoomOutIcon />} label="Zoom Out" />
      </div>
      
      <Separator className="view-toolbar-separator" />
      
      <div className="view-toolbar-group">
        <ViewButton icon={<FrontViewIcon />} label="Front View" />
        <ViewButton icon={<TopViewIcon />} label="Top View" />
        <ViewButton icon={<IsoViewIcon />} label="Isometric View" />
      </div>
      
      <Separator className="view-toolbar-separator" />
      
      <div className="view-toolbar-group">
        <ViewButton icon={<WireframeIcon />} label="Wireframe" />
        <ViewButton icon={<ShadedIcon />} label="Shaded" active />
      </div>
    </div>
  );
};

export default ViewToolbar;
