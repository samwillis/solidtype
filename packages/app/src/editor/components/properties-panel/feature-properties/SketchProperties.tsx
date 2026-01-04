/**
 * Sketch Properties Component
 *
 * Displays and edits properties for Sketch features.
 */

import type { SketchFeature } from "../../../types/document";
import type { FeaturePropertiesProps } from "../types";
import { TextInput, CheckboxInput, PropertyRow, PropertyGroup } from "../inputs";

export function SketchProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const sketch = feature as SketchFeature;

  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput value={sketch.name || sketch.id} onChange={(name) => onUpdate({ name })} />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="readonly-value">Sketch</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="readonly-value">{sketch.id}</span>
        </PropertyRow>
      </PropertyGroup>

      <PropertyGroup title="Display">
        <PropertyRow label="Visible">
          <CheckboxInput
            checked={sketch.visible ?? false}
            onChange={(visible) => onUpdate({ visible })}
          />
        </PropertyRow>
      </PropertyGroup>

      <PropertyGroup title="Parameters">
        <PropertyRow label="Plane">
          <span className="readonly-value">
            {sketch.plane.kind === "planeFeatureId"
              ? "Datum Plane"
              : sketch.plane.kind === "faceRef"
                ? "Face"
                : "Custom"}
          </span>
        </PropertyRow>
        <PropertyRow label="Points">
          <span className="readonly-value">
            {sketch.data ? Object.keys(sketch.data.pointsById).length : 0}
          </span>
        </PropertyRow>
        <PropertyRow label="Entities">
          <span className="readonly-value">
            {sketch.data ? Object.keys(sketch.data.entitiesById).length : 0}
          </span>
        </PropertyRow>
        <PropertyRow label="Constraints">
          <span className="readonly-value">
            {sketch.data ? Object.keys(sketch.data.constraintsById).length : 0}
          </span>
        </PropertyRow>
      </PropertyGroup>
    </>
  );
}
