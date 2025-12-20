import React from 'react';
import Toolbar from './components/Toolbar';
import ViewToolbar from './components/ViewToolbar';
import Viewer from './components/Viewer';
import FeatureTree from './components/FeatureTree';
import PropertiesPanel from './components/PropertiesPanel';
import StatusBar from './components/StatusBar';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="app">
      {/* Main toolbar at top with multi-modal tabs */}
      <Toolbar />
      
      {/* Main content area */}
      <div className="app-main">
        {/* Left sidebar - Feature Tree */}
        <aside className="app-sidebar app-sidebar-left">
          <FeatureTree />
        </aside>
        
        {/* Center - Viewer with view toolbar */}
        <main className="app-center">
          <ViewToolbar />
          <div className="app-viewer">
            <Viewer />
          </div>
        </main>
        
        {/* Right sidebar - Properties */}
        <aside className="app-sidebar app-sidebar-right">
          <PropertiesPanel />
        </aside>
      </div>
      
      {/* Status bar at bottom */}
      <StatusBar status="Ready" />
    </div>
  );
};

export default App;
