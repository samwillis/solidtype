import React from 'react';
import ReactDOM from 'react-dom/client';
import { ProjectProvider } from './contexts/ProjectContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </React.StrictMode>
);
