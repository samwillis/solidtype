import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock the Viewer component to avoid WebGL issues in jsdom
vi.mock('./components/Viewer', () => ({
  default: () => <div data-testid="viewer">Viewer</div>,
}));

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Feature Tree')).toBeInTheDocument();
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  it('renders the toolbar with tool buttons', () => {
    render(<App />);
    // Check for some toolbar buttons by aria-label
    expect(screen.getByLabelText('New Sketch')).toBeInTheDocument();
    expect(screen.getByLabelText('Extrude')).toBeInTheDocument();
    expect(screen.getByLabelText('Box')).toBeInTheDocument();
  });

  it('shows empty feature tree message', () => {
    render(<App />);
    expect(screen.getByText(/No features/i)).toBeInTheDocument();
  });

  it('renders the properties panel', () => {
    render(<App />);
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('renders the status bar', () => {
    render(<App />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
