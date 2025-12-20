import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from './contexts/ThemeContext';
import { ViewerProvider } from './contexts/ViewerContext';
import App from './App';

// Mock the Viewer and ViewCube components to avoid WebGL issues in jsdom
vi.mock('./components/Viewer', () => ({
  default: () => <div data-testid="viewer">Viewer</div>,
}));

vi.mock('./components/ViewCube', () => ({
  default: () => <div data-testid="viewcube">ViewCube</div>,
}));

const renderApp = () => {
  return render(
    <ThemeProvider>
      <ViewerProvider>
        <App />
      </ViewerProvider>
    </ThemeProvider>
  );
};

describe('App', () => {
  it('renders without crashing', () => {
    renderApp();
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  it('renders the toolbar with tool buttons', () => {
    renderApp();
    // Check for some toolbar buttons by aria-label
    expect(screen.getByLabelText('New Sketch')).toBeInTheDocument();
    expect(screen.getByLabelText('Extrude')).toBeInTheDocument();
    expect(screen.getByLabelText('Box')).toBeInTheDocument();
  });

  it('shows feature tree with mock data', () => {
    renderApp();
    // Check for key elements in the feature tree
    expect(screen.getByText('Bodies')).toBeInTheDocument();
    expect(screen.getByText('Part1')).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
  });

  it('renders the properties panel', () => {
    renderApp();
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('renders the status bar with theme toggle', () => {
    renderApp();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    // Theme toggle button - matches any of the three modes
    expect(screen.getByLabelText(/(Light|Dark|Auto) mode/)).toBeInTheDocument();
  });
});
