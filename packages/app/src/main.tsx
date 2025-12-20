import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewerProvider } from './contexts/ViewerContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ViewerProvider>
        <App />
      </ViewerProvider>
    </ThemeProvider>
  </React.StrictMode>
);
