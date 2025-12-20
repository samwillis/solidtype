import React from 'react';
import { Tooltip, Separator } from '@base-ui/react';
import { useViewer, DisplayMode } from '../contexts/ViewerContext';
import './ViewToolbar.css';

// View control icons
const PerspectiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
    <path d="M12 22V10M12 10L4 6M12 10l8-4" />
  </svg>
);

const OrthographicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="16" height="16" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const WireframeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
    <path d="M12 21V12M3 8l9 4 9-4" />
  </svg>
);

const ShadedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
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
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={300}
        className={`view-button ${active ? 'active' : ''}`}
        onClick={onClick}
        render={<button aria-label={label} />}
      >
        {icon}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6}>
          <Tooltip.Popup className="view-tooltip">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

const ViewToolbar: React.FC = () => {
  const { state, actions } = useViewer();

  const handleDisplayModeChange = (mode: DisplayMode) => {
    actions.setDisplayMode(mode);
  };

  return (
    <Tooltip.Provider>
      <div className="view-toolbar">
        <ViewButton 
          icon={state.projectionMode === 'perspective' ? <PerspectiveIcon /> : <OrthographicIcon />} 
          label={state.projectionMode === 'perspective' ? 'Perspective (click for orthographic)' : 'Orthographic (click for perspective)'} 
          onClick={() => actions.toggleProjection()}
          active={false}
        />
        <Separator orientation="vertical" className="view-separator" />
        <ViewButton 
          icon={<WireframeIcon />} 
          label="Wireframe" 
          onClick={() => handleDisplayModeChange('wireframe')}
          active={state.displayMode === 'wireframe'}
        />
        <ViewButton 
          icon={<ShadedIcon />} 
          label="Shaded" 
          onClick={() => handleDisplayModeChange('shaded')}
          active={state.displayMode === 'shaded'}
        />
      </div>
    </Tooltip.Provider>
  );
};

export default ViewToolbar;
