/**
 * Axis Properties Component
 *
 * Displays and edits properties for Axis features.
 */

import { useMemo } from "react";
import type { AxisFeature } from "../../../types/document";
import type { FeaturePropertiesProps } from "../types";
import {
  TextInput,
  NumberInput,
  CheckboxInput,
  ColorInput,
  PropertyRow,
  PropertyGroup,
} from "../inputs";

export function AxisProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const axis = feature as AxisFeature;

  // Get the definition
  const definition = (axis as { definition?: { kind: string; [key: string]: unknown } }).definition;
  const definitionKind = definition?.kind ?? "datum";

  // Get definition-specific display info
  const definitionInfo = useMemo(() => {
    if (!definition) return { type: "Axis", details: null };

    switch (definition.kind) {
      case "datum":
        return {
          type: "Datum Axis",
          details: `Role: ${(definition.role as string).toUpperCase()}`,
        };
      case "twoPoints":
        return {
          type: "Two Points",
          details: null,
        };
      case "twoPlanes":
        return {
          type: "Two Planes",
          details: `Planes: ${definition.plane1Ref} / ${definition.plane2Ref}`,
        };
      case "sketchLine":
        return {
          type: "Sketch Line",
          details: `Sketch: ${definition.sketchId}`,
        };
      case "edge":
        return {
          type: "Along Edge",
          details: `Edge: ${definition.edgeRef}`,
        };
      case "surfaceNormal":
        return {
          type: "Surface Normal",
          details: `Face: ${definition.faceRef}`,
        };
      default:
        return { type: "Axis", details: null };
    }
  }, [definition]);

  const isDatumAxis = definitionKind === "datum";

  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput value={axis.name || axis.id} onChange={(name) => onUpdate({ name })} />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="readonly-value">{definitionInfo.type}</span>
        </PropertyRow>
        {definitionInfo.details && (
          <PropertyRow label="Definition">
            <span className="readonly-value">{definitionInfo.details}</span>
          </PropertyRow>
        )}
        <PropertyRow label="ID">
          <span className="readonly-value">{axis.id}</span>
        </PropertyRow>
      </PropertyGroup>

      <PropertyGroup title="Display">
        <PropertyRow label="Visible">
          <CheckboxInput
            checked={axis.visible ?? true}
            onChange={(visible) => onUpdate({ visible })}
          />
        </PropertyRow>
        <PropertyRow label="Length">
          <NumberInput
            value={(axis as { length?: number }).length ?? 100}
            onChange={(length) => onUpdate({ length })}
            min={1}
            unit="mm"
          />
        </PropertyRow>
        {!isDatumAxis && (
          <PropertyRow label="Display Offset">
            <NumberInput
              value={(axis as { displayOffset?: number }).displayOffset ?? 0}
              onChange={(displayOffset) => onUpdate({ displayOffset })}
              unit="mm"
            />
          </PropertyRow>
        )}
        <PropertyRow label="Color">
          <ColorInput
            value={(axis as { color?: string }).color}
            onChange={(color) => onUpdate({ color: color || "" })}
            defaultColor="#ff8800"
          />
        </PropertyRow>
      </PropertyGroup>
    </>
  );
}
