/**
 * Properties Panel - Shared Types
 *
 * Common types and interfaces used across properties panel components.
 */

import type { Feature } from "../../types/document";

/**
 * Props for feature-specific property components.
 * Each feature type has a component that displays and edits its properties.
 */
export interface FeaturePropertiesProps {
  feature: Feature;
  onUpdate: (updates: Record<string, string | number | boolean>) => void;
}
