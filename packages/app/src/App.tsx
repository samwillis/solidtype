import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import Viewer from './components/Viewer';
import CodeEditor from './components/CodeEditor';
import FeatureTree from './components/FeatureTree';
import PropertiesPanel from './components/PropertiesPanel';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="app">
      <div className="app-left-panel">
        <Tabs.Root defaultValue="feature-tree" className="tabs-root">
          <Tabs.List className="tabs-list">
            <Tabs.Trigger value="feature-tree" className="tabs-trigger">
              Feature Tree
            </Tabs.Trigger>
            <Tabs.Trigger value="files-code" className="tabs-trigger">
              Files & Code
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="feature-tree" className="tabs-content">
            <FeatureTree />
          </Tabs.Content>
          <Tabs.Content value="files-code" className="tabs-content">
            <CodeEditor />
          </Tabs.Content>
        </Tabs.Root>
      </div>
      <div className="app-center">
        <Viewer />
      </div>
      <div className="app-right-panel">
        <PropertiesPanel />
      </div>
    </div>
  );
};

export default App;
