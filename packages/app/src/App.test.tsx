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

// Mock the KernelContext to avoid Worker issues in jsdom
vi.mock('./contexts/KernelContext', () => ({
  KernelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useKernel: () => ({
    meshes: new Map(),
    errors: [],
    featureStatus: {},
    bodies: [],
    isRebuilding: false,
    isReady: true,
    previewExtrude: () => {},
    previewRevolve: () => {},
    clearPreview: () => {},
    previewError: null,
  }),
}));

// Mock the SketchContext
vi.mock('./contexts/SketchContext', () => ({
  SketchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSketch: () => ({
    mode: {
      active: false,
      sketchId: null,
      planeId: null,
      activeTool: 'line',
      tempPoints: [],
    },
    startSketch: () => {},
    finishSketch: () => {},
    setTool: () => {},
    addPoint: () => null,
    addLine: () => null,
    addTempPoint: () => {},
    clearTempPoints: () => {},
    getSketchPoints: () => [],
    updatePointPosition: () => {},
    findNearbyPoint: () => null,
    addRectangle: () => {},
  }),
}));

// Mock SketchCanvas
vi.mock('./components/SketchCanvas', () => ({
  default: () => null,
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

  it('shows feature tree with Yjs data', () => {
    renderApp();
    // Check for key elements in the feature tree
    expect(screen.getByText('Bodies')).toBeInTheDocument();
    expect(screen.getByText('Part1')).toBeInTheDocument();
    // Default features from Yjs document
    expect(screen.getByText('origin')).toBeInTheDocument();
    expect(screen.getByText('XY Plane')).toBeInTheDocument();
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
