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

  it('renders the main toolbar with mode tabs', () => {
    render(<App />);
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Sketch')).toBeInTheDocument();
    expect(screen.getByText('Primitives')).toBeInTheDocument();
  });

  it('shows empty feature tree message', () => {
    render(<App />);
    expect(screen.getByText(/No features yet/i)).toBeInTheDocument();
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
