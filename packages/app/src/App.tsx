import React, { useState } from 'react';
import Toolbar from './components/Toolbar';
import ViewToolbar from './components/ViewToolbar';
import ViewCube from './components/ViewCube';
import Viewer from './components/Viewer';
import FeatureTree from './components/FeatureTree';
import PropertiesPanel from './components/PropertiesPanel';
import AIPanel from './components/AIPanel';
import StatusBar from './components/StatusBar';
import { ResizablePanel, ResizableSplit } from './components/ResizablePanel';
import './App.css';

const App: React.FC = () => {
  const [aiPanelVisible, setAiPanelVisible] = useState(false);

  const toggleAIPanel = () => {
    setAiPanelVisible((prev) => !prev);
  };

  return (
    <div className="app">
      {/* Main toolbar */}
      <Toolbar onToggleAIPanel={toggleAIPanel} aiPanelVisible={aiPanelVisible} />
      
      {/* Main content area */}
      <div className="app-main">
        {/* Left sidebar - Feature Tree + Properties with resizable split */}
        <ResizablePanel defaultWidth={240} minWidth={180} maxWidth={400} side="left">
          <ResizableSplit
            defaultRatio={0.6}
            minTopHeight={120}
            minBottomHeight={120}
            topChild={<FeatureTree />}
            bottomChild={<PropertiesPanel />}
          />
        </ResizablePanel>
        
        {/* Center - Viewer with overlay controls */}
        <main className="app-center">
          <div className="app-viewer">
            <Viewer />
            <ViewCube />
            <ViewToolbar />
          </div>
        </main>
        
        {/* Right sidebar - AI Panel (toggleable) */}
        <ResizablePanel 
          defaultWidth={320} 
          minWidth={280} 
          maxWidth={600} 
          side="right"
          visible={aiPanelVisible}
        >
          <AIPanel />
        </ResizablePanel>
      </div>
      
      {/* Status bar at bottom */}
      <StatusBar status="Ready" />
    </div>
  );
};

export default App;
