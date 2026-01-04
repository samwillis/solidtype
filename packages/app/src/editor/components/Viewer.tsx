/**
 * Viewer - 3D CAD Viewport Component
 *
 * This file re-exports the refactored Viewer component from the viewer module.
 * The component has been split into:
 * - hooks/ - Custom hooks for scene setup, controls, selection, etc.
 * - renderers/ - Effect hooks for rendering meshes, planes, sketches, etc.
 * - viewer-utils.ts - Pure utility functions
 * - sketch-helpers.ts - Sketch geometry helpers
 * - plane-transform.ts - Plane coordinate transforms
 *
 * @see ./viewer/Viewer.tsx for the main component
 * @see ./viewer/hooks/ for the extracted hooks
 * @see ./viewer/renderers/ for the rendering logic
 */

export { default } from "./viewer/Viewer";
