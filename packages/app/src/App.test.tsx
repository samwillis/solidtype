import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';

// Mock the Viewer component to avoid WebGL issues in jsdom
vi.mock('./components/Viewer', () => ({
  default: () => <div data-testid="viewer">Viewer</div>,
}));

const renderApp = () => {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
};

describe('App', () => {
  it('renders without crashing', () => {
    renderApp();
    expect(screen.getByText('Feature Tree')).toBeInTheDocument();
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  it('renders the toolbar with tool buttons', () => {
    renderApp();
    // Check for some toolbar buttons by aria-label
    expect(screen.getByLabelText('New Sketch')).toBeInTheDocument();
    expect(screen.getByLabelText('Extrude')).toBeInTheDocument();
    expect(screen.getByLabelText('Box')).toBeInTheDocument();
  });

  it('shows empty feature tree message', () => {
    renderApp();
    expect(screen.getByText(/No features/i)).toBeInTheDocument();
  });

  it('renders the properties panel', () => {
    renderApp();
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('renders the status bar with theme toggle', () => {
    renderApp();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByLabelText(/Switch to .* mode/)).toBeInTheDocument();
  });
});
