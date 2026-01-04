/**
 * Origin Properties Component
 *
 * Displays and edits properties for Origin features.
 */

import type { OriginFeature } from "../../../types/document";
import type { FeaturePropertiesProps } from "../types";
import { TextInput, CheckboxInput, PropertyRow, PropertyGroup } from "../inputs";

export function OriginProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const origin = feature as OriginFeature;

  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput value={origin.name || "Origin"} onChange={(name) => onUpdate({ name })} />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="readonly-value">Origin</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="readonly-value">{origin.id}</span>
        </PropertyRow>
      </PropertyGroup>

      <PropertyGroup title="Display">
        <PropertyRow label="Visible">
          <CheckboxInput
            checked={origin.visible ?? false}
            onChange={(visible) => onUpdate({ visible })}
          />
        </PropertyRow>
      </PropertyGroup>
    </>
  );
}
