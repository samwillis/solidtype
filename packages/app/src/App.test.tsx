import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectProvider } from './contexts/ProjectContext';
import App from './App';

// Mock the Viewer component to avoid WebGL issues in jsdom
vi.mock('./components/Viewer', () => ({
  default: () => <div data-testid="viewer">Viewer</div>,
}));

describe('App', () => {
  it('renders without crashing', () => {
    render(
      <ProjectProvider>
        <App />
      </ProjectProvider>
    );
    expect(screen.getByText('Feature Tree')).toBeInTheDocument();
    expect(screen.getByText('Files & Code')).toBeInTheDocument();
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  it('shows Feature Tree tab by default', () => {
    render(
      <ProjectProvider>
        <App />
      </ProjectProvider>
    );
    const featureTreeContent = screen.getByText(/No features yet/i);
    expect(featureTreeContent).toBeInTheDocument();
  });
});
