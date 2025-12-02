import { jsx as _jsx } from "react/jsx-runtime";
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
// Mock the Viewer component to avoid WebGL issues in jsdom
vi.mock('./components/Viewer', () => ({
    default: () => _jsx("div", { "data-testid": "viewer", children: "Viewer" }),
}));
describe('App', () => {
    it('renders without crashing', () => {
        render(_jsx(App, {}));
        expect(screen.getByText('Feature Tree')).toBeInTheDocument();
        expect(screen.getByText('Files & Code')).toBeInTheDocument();
        expect(screen.getByTestId('viewer')).toBeInTheDocument();
    });
    it('shows Feature Tree tab by default', () => {
        render(_jsx(App, {}));
        const featureTreeContent = screen.getByText(/No features yet/i);
        expect(featureTreeContent).toBeInTheDocument();
    });
});
//# sourceMappingURL=App.test.js.map