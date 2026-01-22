/**
 * Plane Properties Component
 *
 * Displays and edits properties for Plane features.
 * Handles various plane definition types: datum, offsetPlane, offsetFace,
 * onFace, threePoints, axisPoint, axisAngle, sketchPoints, sketchLinePoint.
 */

import { useMemo, useCallback } from "react";
import type { PlaneFeature } from "../../../types/document";
import type { FeaturePropertiesProps } from "../types";
import { useDocument } from "../../../contexts/DocumentContext";
import { getDefaultPlaneColorHex } from "../utils";
import {
  TextInput,
  NumberInput,
  CheckboxInput,
  ColorInput,
  PropertyRow,
  PropertyGroup,
} from "../inputs";

export function PlaneProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const plane = feature as PlaneFeature;
  const { doc, features } = useDocument();

  // Get the definition (with fallback for legacy data)
  const definition = (plane as { definition?: { kind: string; [key: string]: unknown } })
    .definition;
  const definitionKind = definition?.kind ?? "datum";
  const isDatumPlane = definitionKind === "datum";

  // Get definition-specific display info
  const definitionInfo = useMemo(() => {
    if (!definition) return { type: "Datum Plane", details: null };

    switch (definition.kind) {
      case "datum":
        return {
          type: "Datum Plane",
          details: `Role: ${(definition.role as string).toUpperCase()}`,
        };
      case "offsetPlane": {
        const basePlaneId = definition.basePlaneId as string;
        const basePlane = features.find((f) => f.id === basePlaneId);
        return {
          type: "Offset Plane",
          details: basePlane ? `From: ${basePlane.name || basePlaneId}` : null,
          basePlaneId,
          distance: definition.distance as number,
        };
      }
      case "offsetFace":
        return {
          type: "Offset from Face",
          details: `Face: ${definition.faceRef}`,
          distance: definition.distance as number,
        };
      case "midplane":
        return {
          type: "Midplane",
          details: `Between: ${definition.plane1Ref} / ${definition.plane2Ref}`,
        };
      case "onFace":
        return {
          type: "On Face",
          details: `Face: ${definition.faceRef}`,
        };
      case "threePoints":
        return {
          type: "Through 3 Points",
          details: null,
        };
      case "axisPoint":
        return {
          type: "Axis + Point",
          details: null,
        };
      case "axisAngle":
        return {
          type: "Axis + Angle",
          details: `Angle: ${definition.angle}°`,
          angle: definition.angle as number,
        };
      case "sketchPoints":
        return {
          type: "Sketch Points",
          details: null,
        };
      case "sketchLinePoint":
        return {
          type: "Sketch Line + Point",
          details: null,
        };
      default:
        return { type: "Unknown", details: null };
    }
  }, [definition, features]);

  // Handle offset distance change - recalculates origin based on base plane
  const handleOffsetDistanceChange = useCallback(
    (newOffset: number) => {
      if (!doc || !definition) return;

      const featureMap = doc.featuresById.get(plane.id);
      if (!featureMap) return;

      if (definition.kind === "offsetPlane") {
        // Get base plane to recalculate origin
        const basePlaneId = definition.basePlaneId as string;
        const basePlaneFeature = doc.featuresById.get(basePlaneId);
        if (!basePlaneFeature) return;

        const baseNormal = basePlaneFeature.get("normal") as [number, number, number] | undefined;
        const baseOrigin = basePlaneFeature.get("origin") as [number, number, number] | undefined;

        if (!baseNormal || !baseOrigin) return;

        // Calculate new origin
        const newOrigin: [number, number, number] = [
          baseOrigin[0] + baseNormal[0] * newOffset,
          baseOrigin[1] + baseNormal[1] * newOffset,
          baseOrigin[2] + baseNormal[2] * newOffset,
        ];

        // Update definition and origin
        doc.ydoc.transact(() => {
          const newDef = { ...definition, distance: newOffset };
          featureMap.set("definition", newDef);
          featureMap.set("origin", newOrigin);
        });
      } else if (definition.kind === "offsetFace") {
        // For face offset, update the definition - kernel will recalculate origin
        doc.ydoc.transact(() => {
          const newDef = { ...definition, distance: newOffset };
          featureMap.set("definition", newDef);
        });
      }
    },
    [doc, definition, plane.id]
  );

  // Handle angle change for axisAngle planes
  const handleAngleChange = useCallback(
    (newAngle: number) => {
      if (!doc || !definition || definition.kind !== "axisAngle") return;

      const featureMap = doc.featuresById.get(plane.id);
      if (!featureMap) return;

      doc.ydoc.transact(() => {
        const newDef = { ...definition, angle: newAngle };
        featureMap.set("definition", newDef);
      });
    },
    [doc, definition, plane.id]
  );

  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput value={plane.name || plane.id} onChange={(name) => onUpdate({ name })} />
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
          <span className="readonly-value">{plane.id}</span>
        </PropertyRow>
      </PropertyGroup>

      {/* Definition-specific settings */}
      {(definitionKind === "offsetPlane" || definitionKind === "offsetFace") && (
        <PropertyGroup title="Offset">
          <PropertyRow label="Distance">
            <NumberInput
              value={(definitionInfo as { distance?: number }).distance ?? 0}
              onChange={handleOffsetDistanceChange}
              unit="mm"
            />
          </PropertyRow>
        </PropertyGroup>
      )}

      {definitionKind === "axisAngle" && (
        <PropertyGroup title="Rotation">
          <PropertyRow label="Angle">
            <NumberInput
              value={(definitionInfo as { angle?: number }).angle ?? 0}
              onChange={handleAngleChange}
              unit="°"
            />
          </PropertyRow>
        </PropertyGroup>
      )}

      <PropertyGroup title="Display">
        <PropertyRow label="Visible">
          <CheckboxInput
            checked={plane.visible ?? true}
            onChange={(visible) => onUpdate({ visible })}
          />
        </PropertyRow>
        <PropertyRow label="Width">
          <NumberInput
            value={plane.width ?? 100}
            onChange={(width) => onUpdate({ width })}
            min={1}
            unit="mm"
          />
        </PropertyRow>
        <PropertyRow label="Height">
          <NumberInput
            value={plane.height ?? 100}
            onChange={(height) => onUpdate({ height })}
            min={1}
            unit="mm"
          />
        </PropertyRow>
        {isDatumPlane && (
          <>
            <PropertyRow label="Display Offset X">
              <NumberInput
                value={(plane as { displayOffsetX?: number }).displayOffsetX ?? 0}
                onChange={(displayOffsetX) => onUpdate({ displayOffsetX })}
                unit="mm"
              />
            </PropertyRow>
            <PropertyRow label="Display Offset Y">
              <NumberInput
                value={(plane as { displayOffsetY?: number }).displayOffsetY ?? 0}
                onChange={(displayOffsetY) => onUpdate({ displayOffsetY })}
                unit="mm"
              />
            </PropertyRow>
          </>
        )}
        <PropertyRow label="Color">
          <ColorInput
            value={plane.color}
            onChange={(color) => onUpdate({ color: color || "" })}
            defaultColor={getDefaultPlaneColorHex(plane.id)}
          />
        </PropertyRow>
      </PropertyGroup>
    </>
  );
}
