import React, { useState, useEffect } from 'react';
import Toolbar from './components/Toolbar';
import ViewCube from './components/ViewCube';
import Viewer from './components/Viewer';
import FeatureTree from './components/FeatureTree';
import PropertiesPanel from './components/PropertiesPanel';
import AIPanel from './components/AIPanel';
import StatusBar from './components/StatusBar';
import { ResizablePanel, ResizableSplit } from './components/ResizablePanel';
import { DocumentProvider, useDocument } from './contexts/DocumentContext';
import { KernelProvider } from './contexts/KernelContext';
import { SketchProvider } from './contexts/SketchContext';
import { SelectionProvider } from './contexts/SelectionContext';
import SketchCanvas from './components/SketchCanvas';
import './App.css';

// Inner component that uses the document context
const AppContent: React.FC = () => {
  const [aiPanelVisible, setAiPanelVisible] = useState(false);
  const { undo, redo, canUndo, canRedo } = useDocument();

  const toggleAIPanel = () => {
    setAiPanelVisible((prev) => !prev);
  };

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if (modKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedo) redo();
      } else if (modKey && e.key === 'y') {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

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
            <SketchCanvas />
            <ViewCube />
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
      <StatusBar />
    </div>
  );
};

// Main App component wraps everything with providers
const App: React.FC = () => {
  return (
    <DocumentProvider>
      <KernelProvider>
        <SelectionProvider>
          <SketchProvider>
            <AppContent />
          </SketchProvider>
        </SelectionProvider>
      </KernelProvider>
    </DocumentProvider>
  );
};

export default App;
