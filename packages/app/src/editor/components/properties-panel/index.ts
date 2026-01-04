/**
 * Properties Panel Module
 *
 * Exports sub-components for the properties panel.
 */

// Input components
export {
  NumberInput,
  TextInput,
  SelectInput,
  CheckboxInput,
  ColorInput,
  PropertyRow,
  PropertyGroup,
} from "./inputs";

// Shared types
export type { FeaturePropertiesProps } from "./types";

// Utility functions
export { getDefaultPlaneColorHex } from "./utils";

// Face selector
export { FaceSelector } from "./FaceSelector";

// Panel header
export { PanelHeader } from "./PanelHeader";

// Feature properties (re-export from subdirectory)
export {
  OriginProperties,
  PlaneProperties,
  AxisProperties,
  SketchProperties,
  ExtrudeProperties,
  RevolveProperties,
  GenericProperties,
} from "./feature-properties";

// Edit forms (re-export from subdirectory)
export { ExtrudeEditForm, RevolveEditForm } from "./edit-forms";
