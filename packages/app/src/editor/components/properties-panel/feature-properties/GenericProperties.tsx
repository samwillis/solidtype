/**
 * Generic Properties Component
 *
 * Fallback properties display for unknown or unsupported feature types.
 */

import type { FeaturePropertiesProps } from "../types";
import { TextInput, PropertyRow, PropertyGroup } from "../inputs";

export function GenericProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  return (
    <PropertyGroup title="General">
      <PropertyRow label="Name">
        <TextInput value={feature.name || feature.id} onChange={(name) => onUpdate({ name })} />
      </PropertyRow>
      <PropertyRow label="Type">
        <span className="readonly-value">{feature.type}</span>
      </PropertyRow>
      <PropertyRow label="ID">
        <span className="readonly-value">{feature.id}</span>
      </PropertyRow>
    </PropertyGroup>
  );
}
