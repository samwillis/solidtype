/**
 * Properties Panel - displays and edits properties of selected features
 * Phase 13: Properties Panel
 *
 * Also handles feature creation with accept/cancel buttons when in edit mode.
 * Uses Tanstack Form with Zod validation for feature editing.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Menu } from "@base-ui/react/menu";
import { useForm } from "@tanstack/react-form";
import { useDocument } from "../contexts/DocumentContext";
import { useSelection } from "../contexts/SelectionContext";
import { useFeatureEdit } from "../contexts/FeatureEditContext";
import {
  extrudeFormSchema,
  revolveFormSchema,
  type ExtrudeFormData,
  type RevolveFormData,
} from "../types/featureSchemas";
import type {
  Feature,
  ExtrudeFeature,
  RevolveFeature,
  SketchFeature,
  PlaneFeature,
  AxisFeature,
  OriginFeature,
  SketchLine,
} from "../types/document";
import { useKernel } from "../contexts/KernelContext";
import { useViewer } from "../contexts/ViewerContext";
import { useTheme } from "../contexts/ThemeContext";
import { Tooltip } from "@base-ui/react";
import AIPanel from "./AIPanel";
import { AIIcon } from "./Icons";
import { Avatar } from "../../components/Avatar";
import { UserProfileDialog } from "../../components/dialogs/UserProfileDialog";
import { useSession } from "../../lib/auth-client";
import "./PropertiesPanel.css";

// ============================================================================
// Input Components
// ============================================================================

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

function NumberInput({ value, onChange, min, max, step: _step, unit, disabled }: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
      onChange(clamped);
    } else {
      setLocalValue(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    }
  };

  return (
    <div className="number-input">
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function TextInput({ value, onChange, placeholder, disabled }: TextInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    }
  };

  return (
    <input
      type="text"
      className="text-input"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

interface SelectInputProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
}

function SelectInput<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: SelectInputProps<T>) {
  return (
    <select
      className="select-input"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      disabled={disabled}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

interface CheckboxInputProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

function CheckboxInput({ checked, onChange, label, disabled }: CheckboxInputProps) {
  return (
    <label className="checkbox-input">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      {label && <span>{label}</span>}
    </label>
  );
}

interface ColorInputProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  defaultColor: string;
  disabled?: boolean;
}

function ColorInput({ value, onChange, defaultColor, disabled }: ColorInputProps) {
  const currentColor = value || defaultColor;
  const isDefault = !value;

  return (
    <div className="color-input">
      <input
        type="color"
        value={currentColor}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <span className="color-value">{currentColor}</span>
      {!isDefault && (
        <button className="reset-color" onClick={() => onChange(undefined)} disabled={disabled}>
          Reset
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Face Selector (Phase 14: toFace extent)
// ============================================================================

interface FaceSelectorProps {
  value: string | undefined;
  onChange: (value: string) => void;
}

function FaceSelector({ value, onChange }: FaceSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const { setSelectionMode, setOnFaceSelected } = useSelection();

  const handleStartSelection = useCallback(() => {
    setIsSelecting(true);
    setSelectionMode("selectFace");
    setOnFaceSelected((face) => {
      // Create persistent reference from face selection
      const ref = `face:${face.featureId}:${face.faceIndex}`;
      onChange(ref);
      setIsSelecting(false);
      setSelectionMode("default");
      setOnFaceSelected(undefined);
    });
  }, [setSelectionMode, setOnFaceSelected, onChange]);

  const handleCancelSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectionMode("default");
    setOnFaceSelected(undefined);
  }, [setSelectionMode, setOnFaceSelected]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSelecting) {
        setSelectionMode("default");
        setOnFaceSelected(undefined);
      }
    };
  }, [isSelecting, setSelectionMode, setOnFaceSelected]);

  return (
    <div className="face-selector">
      {isSelecting ? (
        <>
          <span className="face-selector-prompt">Click a face...</span>
          <button className="face-selector-cancel" onClick={handleCancelSelection}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="face-selector-value">{value || "Not selected"}</span>
          <button className="face-selector-btn" onClick={handleStartSelection}>
            Select
          </button>
        </>
      )}
    </div>
  );
}

/** Get default color for a plane ID */
function getDefaultPlaneColorHex(planeId: string): string {
  switch (planeId) {
    case "xy":
      return "#0088ff";
    case "xz":
      return "#00cc44";
    case "yz":
      return "#ff4444";
    default:
      return "#888888";
  }
}

// ============================================================================
// Property Row
// ============================================================================

interface PropertyRowProps {
  label: string;
  children: React.ReactNode;
}

function PropertyRow({ label, children }: PropertyRowProps) {
  return (
    <div className="property-row">
      <span className="property-label">{label}</span>
      <div className="property-value">{children}</div>
    </div>
  );
}

interface PropertyGroupProps {
  title: string;
  children: React.ReactNode;
}

function PropertyGroup({ children }: PropertyGroupProps) {
  // Don't render group title - make it more like Figma
  return <div className="property-group">{children}</div>;
}

// ============================================================================
// Feature-Specific Properties
// ============================================================================

interface FeaturePropertiesProps {
  feature: Feature;
  onUpdate: (updates: Record<string, string | number | boolean>) => void;
}

function OriginProperties({ feature, onUpdate }: FeaturePropertiesProps) {
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

function PlaneProperties({ feature, onUpdate }: FeaturePropertiesProps) {
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

function AxisProperties({ feature, onUpdate }: FeaturePropertiesProps) {
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

function SketchProperties({ feature, onUpdate }: FeaturePropertiesProps) {
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

function ExtrudeProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const extrude = feature as ExtrudeFeature;
  const extent = extrude.extent ?? "blind";
  const { bodies } = useKernel();
  const mergeScope = extrude.mergeScope ?? "auto";
  const isAddOperation = extrude.op === "add";

  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput value={extrude.name || extrude.id} onChange={(name) => onUpdate({ name })} />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="readonly-value">Extrude</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="readonly-value">{extrude.id}</span>
        </PropertyRow>
      </PropertyGroup>

      <PropertyGroup title="Parameters">
        <PropertyRow label="Sketch">
          <span className="readonly-value">{extrude.sketch}</span>
        </PropertyRow>
        <PropertyRow label="Operation">
          <SelectInput
            value={extrude.op}
            onChange={(op) => onUpdate({ op })}
            options={[
              { value: "add", label: "Add" },
              { value: "cut", label: "Cut" },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Direction">
          <SelectInput
            value={typeof extrude.direction === "string" ? extrude.direction : "normal"}
            onChange={(direction) => onUpdate({ direction })}
            options={[
              { value: "normal", label: "Normal" },
              { value: "reverse", label: "Reverse" },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Extent">
          <SelectInput
            value={extent}
            onChange={(ext) => onUpdate({ extent: ext })}
            options={[
              { value: "blind", label: "Distance" },
              { value: "toFace", label: "Up to Face" },
              { value: "throughAll", label: "Through All" },
            ]}
          />
        </PropertyRow>
        {extent === "blind" && (
          <PropertyRow label="Distance">
            <NumberInput
              value={extrude.distance ?? 10}
              onChange={(distance) => onUpdate({ distance })}
              min={0.1}
              step={1}
              unit="mm"
            />
          </PropertyRow>
        )}
        {extent === "toFace" && (
          <PropertyRow label="Target Face">
            <FaceSelector
              value={extrude.extentRef}
              onChange={(ref) => onUpdate({ extentRef: ref })}
            />
          </PropertyRow>
        )}
      </PropertyGroup>

      {isAddOperation && (
        <PropertyGroup title="Multi-Body">
          <PropertyRow label="Merge">
            <SelectInput
              value={mergeScope}
              onChange={(scope) => onUpdate({ mergeScope: scope })}
              options={[
                { value: "auto", label: "Auto (merge with intersecting)" },
                { value: "new", label: "Create new body" },
                { value: "specific", label: "Merge with selected" },
              ]}
            />
          </PropertyRow>
          {mergeScope === "specific" && bodies.length > 0 && (
            <PropertyRow label="Target Bodies">
              <div className="body-selector">
                {bodies.map((body) => (
                  <label key={body.featureId} className="body-option">
                    <input
                      type="checkbox"
                      checked={(extrude.targetBodies || []).includes(body.featureId)}
                      onChange={(e) => {
                        const current = extrude.targetBodies || [];
                        const newTargets = e.target.checked
                          ? [...current, body.featureId]
                          : current.filter((id) => id !== body.featureId);
                        onUpdate({ targetBodies: newTargets.join(",") });
                      }}
                    />
                    <span style={{ color: body.color || "#6699cc" }}>●</span>
                    {body.name || body.featureId}
                  </label>
                ))}
              </div>
            </PropertyRow>
          )}
          <PropertyRow label="Body Name">
            <TextInput
              value={extrude.resultBodyName || ""}
              onChange={(name) => onUpdate({ resultBodyName: name })}
              placeholder="Auto"
            />
          </PropertyRow>
          <PropertyRow label="Body Color">
            <ColorInput
              value={extrude.resultBodyColor}
              onChange={(color) => onUpdate({ resultBodyColor: color || "" })}
              defaultColor="#6699cc"
            />
          </PropertyRow>
        </PropertyGroup>
      )}
    </>
  );
}

function RevolveProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const revolve = feature as RevolveFeature;
  const { bodies } = useKernel();
  const mergeScope = revolve.mergeScope ?? "auto";
  const isAddOperation = revolve.op === "add";

  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput value={revolve.name || revolve.id} onChange={(name) => onUpdate({ name })} />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="readonly-value">Revolve</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="readonly-value">{revolve.id}</span>
        </PropertyRow>
      </PropertyGroup>

      <PropertyGroup title="Parameters">
        <PropertyRow label="Sketch">
          <span className="readonly-value">{revolve.sketch}</span>
        </PropertyRow>
        <PropertyRow label="Axis">
          <span className="readonly-value">{revolve.axis}</span>
        </PropertyRow>
        <PropertyRow label="Angle">
          <NumberInput
            value={revolve.angle}
            onChange={(angle) => onUpdate({ angle })}
            min={1}
            max={360}
            step={5}
            unit="°"
          />
        </PropertyRow>
        <PropertyRow label="Operation">
          <SelectInput
            value={revolve.op}
            onChange={(op) => onUpdate({ op })}
            options={[
              { value: "add", label: "Add" },
              { value: "cut", label: "Cut" },
            ]}
          />
        </PropertyRow>
      </PropertyGroup>

      {isAddOperation && (
        <PropertyGroup title="Multi-Body">
          <PropertyRow label="Merge">
            <SelectInput
              value={mergeScope}
              onChange={(scope) => onUpdate({ mergeScope: scope })}
              options={[
                { value: "auto", label: "Auto (merge with intersecting)" },
                { value: "new", label: "Create new body" },
                { value: "specific", label: "Merge with selected" },
              ]}
            />
          </PropertyRow>
          {mergeScope === "specific" && bodies.length > 0 && (
            <PropertyRow label="Target Bodies">
              <div className="body-selector">
                {bodies.map((body) => (
                  <label key={body.featureId} className="body-option">
                    <input
                      type="checkbox"
                      checked={(revolve.targetBodies || []).includes(body.featureId)}
                      onChange={(e) => {
                        const current = revolve.targetBodies || [];
                        const newTargets = e.target.checked
                          ? [...current, body.featureId]
                          : current.filter((id) => id !== body.featureId);
                        onUpdate({ targetBodies: newTargets.join(",") });
                      }}
                    />
                    <span style={{ color: body.color || "#6699cc" }}>●</span>
                    {body.name || body.featureId}
                  </label>
                ))}
              </div>
            </PropertyRow>
          )}
          <PropertyRow label="Body Name">
            <TextInput
              value={revolve.resultBodyName || ""}
              onChange={(name) => onUpdate({ resultBodyName: name })}
              placeholder="Auto"
            />
          </PropertyRow>
          <PropertyRow label="Body Color">
            <ColorInput
              value={revolve.resultBodyColor}
              onChange={(color) => onUpdate({ resultBodyColor: color || "" })}
              defaultColor="#6699cc"
            />
          </PropertyRow>
        </PropertyGroup>
      )}
    </>
  );
}

function GenericProperties({ feature, onUpdate }: FeaturePropertiesProps) {
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

// ============================================================================
// Feature Edit Forms (using Tanstack Form with Zod validation)
// ============================================================================

interface ExtrudeEditFormProps {
  data: ExtrudeFormData;
  onUpdate: (updates: Partial<ExtrudeFormData>) => void;
  onAccept: () => void;
  onCancel: () => void;
}

function ExtrudeEditForm({ data, onUpdate, onAccept, onCancel }: ExtrudeEditFormProps) {
  const { bodies } = useKernel();
  const form = useForm({
    defaultValues: data,
    onSubmit: async () => {
      onAccept();
    },
    validators: {
      onChange: ({ value }) => {
        const result = extrudeFormSchema.safeParse(value);
        if (!result.success) {
          return result.error.issues[0]?.message;
        }
        return undefined;
      },
    },
  });

  // Sync form values to parent on change
  useEffect(() => {
    const subscription = form.store.subscribe(() => {
      const values = form.state.values;
      onUpdate(values);
    });
    return subscription;
  }, [form, onUpdate]);

  const currentOp = form.state.values.op;
  const currentMergeScope = form.state.values.mergeScope || "auto";
  const isAddOperation = currentOp === "add";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <PropertyGroup title="Extrude">
        <PropertyRow label="Sketch">
          <span className="readonly-value">{data.sketch}</span>
        </PropertyRow>

        <form.Field name="op">
          {(field) => (
            <PropertyRow label="Operation">
              <SelectInput
                value={field.state.value}
                onChange={(op) => field.handleChange(op as "add" | "cut")}
                options={[
                  { value: "add", label: "Add" },
                  { value: "cut", label: "Cut" },
                ]}
              />
            </PropertyRow>
          )}
        </form.Field>

        <form.Field name="direction">
          {(field) => (
            <PropertyRow label="Direction">
              <SelectInput
                value={field.state.value}
                onChange={(dir) => field.handleChange(dir as "normal" | "reverse")}
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "reverse", label: "Reverse" },
                ]}
              />
            </PropertyRow>
          )}
        </form.Field>

        <form.Field
          name="distance"
          validators={{
            onChange: ({ value }) => {
              if (value === undefined || value < 0.1) {
                return "Distance must be at least 0.1";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <PropertyRow label="Distance">
              <div className="field-with-error">
                <NumberInput
                  value={field.state.value ?? 10}
                  onChange={(distance) => field.handleChange(distance)}
                  min={0.1}
                  step={1}
                  unit="mm"
                />
                {field.state.meta.errors.length > 0 && (
                  <span className="field-error">{field.state.meta.errors[0]}</span>
                )}
              </div>
            </PropertyRow>
          )}
        </form.Field>
      </PropertyGroup>

      {/* Multi-Body Options - only shown for add operations when bodies exist */}
      {isAddOperation && bodies.length > 0 && (
        <PropertyGroup title="Multi-Body">
          <form.Field name="mergeScope">
            {(field) => (
              <PropertyRow label="Merge">
                <SelectInput
                  value={field.state.value || "auto"}
                  onChange={(scope) => field.handleChange(scope as "auto" | "new" | "specific")}
                  options={[
                    { value: "auto", label: "Auto (merge with intersecting)" },
                    { value: "new", label: "Create new body" },
                    { value: "specific", label: "Merge with selected" },
                  ]}
                />
              </PropertyRow>
            )}
          </form.Field>

          {currentMergeScope === "specific" && (
            <form.Field name="targetBodies">
              {(field) => (
                <PropertyRow label="Target Bodies">
                  <div className="body-selector">
                    {bodies.map((body) => (
                      <label key={body.featureId} className="body-option">
                        <input
                          type="checkbox"
                          checked={(field.state.value || []).includes(body.featureId)}
                          onChange={(e) => {
                            const current = field.state.value || [];
                            const newTargets = e.target.checked
                              ? [...current, body.featureId]
                              : current.filter((id: string) => id !== body.featureId);
                            field.handleChange(newTargets);
                          }}
                        />
                        <span style={{ color: body.color || "#6699cc" }}>●</span>
                        {body.name || body.featureId}
                      </label>
                    ))}
                  </div>
                </PropertyRow>
              )}
            </form.Field>
          )}
        </PropertyGroup>
      )}

      <div className="properties-panel-actions">
        <button type="button" className="properties-btn properties-btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="properties-btn properties-btn-accept"
          disabled={!form.state.canSubmit}
        >
          Accept
        </button>
      </div>
    </form>
  );
}

interface RevolveEditFormProps {
  data: RevolveFormData;
  axisCandidates: Array<{ id: string; label: string }>;
  onUpdate: (updates: Partial<RevolveFormData>) => void;
  onAccept: () => void;
  onCancel: () => void;
}

function RevolveEditForm({
  data,
  axisCandidates,
  onUpdate,
  onAccept,
  onCancel,
}: RevolveEditFormProps) {
  const { bodies } = useKernel();
  const form = useForm({
    defaultValues: data,
    onSubmit: async () => {
      onAccept();
    },
    validators: {
      onChange: ({ value }) => {
        const result = revolveFormSchema.safeParse(value);
        if (!result.success) {
          return result.error.issues[0]?.message;
        }
        return undefined;
      },
    },
  });

  // Sync form values to parent on change
  useEffect(() => {
    const subscription = form.store.subscribe(() => {
      const values = form.state.values;
      onUpdate(values);
    });
    return subscription;
  }, [form, onUpdate]);

  const currentOp = form.state.values.op;
  const currentMergeScope = form.state.values.mergeScope || "auto";
  const isAddOperation = currentOp === "add";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <PropertyGroup title="Revolve">
        <PropertyRow label="Sketch">
          <span className="readonly-value">{data.sketch}</span>
        </PropertyRow>

        <form.Field name="op">
          {(field) => (
            <PropertyRow label="Operation">
              <SelectInput
                value={field.state.value}
                onChange={(op) => field.handleChange(op as "add" | "cut")}
                options={[
                  { value: "add", label: "Add" },
                  { value: "cut", label: "Cut" },
                ]}
              />
            </PropertyRow>
          )}
        </form.Field>

        <form.Field
          name="axis"
          validators={{
            onChange: ({ value }) => {
              if (!value) {
                return "Axis is required";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <PropertyRow label="Axis">
              <div className="field-with-error">
                <SelectInput
                  value={field.state.value}
                  onChange={(axis) => field.handleChange(axis)}
                  options={
                    axisCandidates.length > 0
                      ? axisCandidates.map((l) => ({ value: l.id, label: l.label }))
                      : [{ value: "", label: "No lines in sketch" }]
                  }
                  disabled={axisCandidates.length === 0}
                />
                {field.state.meta.errors.length > 0 && (
                  <span className="field-error">{field.state.meta.errors[0]}</span>
                )}
              </div>
            </PropertyRow>
          )}
        </form.Field>

        <form.Field
          name="angle"
          validators={{
            onChange: ({ value }) => {
              if (value < 1) return "Angle must be at least 1°";
              if (value > 360) return "Angle must be at most 360°";
              return undefined;
            },
          }}
        >
          {(field) => (
            <PropertyRow label="Angle">
              <div className="field-with-error">
                <NumberInput
                  value={field.state.value}
                  onChange={(angle) => field.handleChange(angle)}
                  min={1}
                  max={360}
                  step={15}
                  unit="°"
                />
                {field.state.meta.errors.length > 0 && (
                  <span className="field-error">{field.state.meta.errors[0]}</span>
                )}
              </div>
            </PropertyRow>
          )}
        </form.Field>
      </PropertyGroup>

      {/* Multi-Body Options - only shown for add operations when bodies exist */}
      {isAddOperation && bodies.length > 0 && (
        <PropertyGroup title="Multi-Body">
          <form.Field name="mergeScope">
            {(field) => (
              <PropertyRow label="Merge">
                <SelectInput
                  value={field.state.value || "auto"}
                  onChange={(scope) => field.handleChange(scope as "auto" | "new" | "specific")}
                  options={[
                    { value: "auto", label: "Auto (merge with intersecting)" },
                    { value: "new", label: "Create new body" },
                    { value: "specific", label: "Merge with selected" },
                  ]}
                />
              </PropertyRow>
            )}
          </form.Field>

          {currentMergeScope === "specific" && (
            <form.Field name="targetBodies">
              {(field) => (
                <PropertyRow label="Target Bodies">
                  <div className="body-selector">
                    {bodies.map((body) => (
                      <label key={body.featureId} className="body-option">
                        <input
                          type="checkbox"
                          checked={(field.state.value || []).includes(body.featureId)}
                          onChange={(e) => {
                            const current = field.state.value || [];
                            const newTargets = e.target.checked
                              ? [...current, body.featureId]
                              : current.filter((id: string) => id !== body.featureId);
                            field.handleChange(newTargets);
                          }}
                        />
                        <span style={{ color: body.color || "#6699cc" }}>●</span>
                        {body.name || body.featureId}
                      </label>
                    ))}
                  </div>
                </PropertyRow>
              )}
            </form.Field>
          )}
        </PropertyGroup>
      )}

      <div className="properties-panel-actions">
        <button type="button" className="properties-btn properties-btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="properties-btn properties-btn-accept"
          disabled={!form.state.canSubmit || axisCandidates.length === 0}
        >
          Accept
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Main Component
// ============================================================================

const PropertiesPanel: React.FC = () => {
  const { doc, getFeatureById } = useDocument();
  const { selectedFeatureId, selectedFaces } = useSelection();
  const { editMode, updateFormData, acceptEdit, cancelEdit, isEditing } = useFeatureEdit();
  const { state: viewerState, actions: viewerActions } = useViewer();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { data: session } = useSession();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);

  // Get current user for avatar
  const user = session?.user;

  // Get axis candidates for revolve - prioritize construction lines
  const axisCandidates = useMemo(() => {
    if (editMode.type !== "revolve") return [];
    const sketch = getFeatureById(editMode.sketchId);
    if (!sketch || sketch.type !== "sketch" || !sketch.data) return [];
    const lines = Object.values(sketch.data.entitiesById).filter(
      (e): e is SketchLine => e.type === "line"
    );
    // Sort: construction lines first, then by id
    lines.sort((a, b) => {
      const aConst = a.construction === true;
      const bConst = b.construction === true;
      if (aConst && !bConst) return -1;
      if (!aConst && bConst) return 1;
      return a.id.localeCompare(b.id);
    });
    // Add friendly labels
    return lines.map((line, idx) => ({
      ...line,
      label: line.construction ? `Axis Line ${idx + 1} (construction)` : `Line ${idx + 1}`,
    }));
  }, [editMode, getFeatureById]);

  // Get the selected feature
  const selectedFeature = selectedFeatureId ? getFeatureById(selectedFeatureId) : null;

  // If a face is selected but no feature, use the face's feature
  const effectiveFeature =
    selectedFeature ||
    (selectedFaces.length > 0 ? getFeatureById(selectedFaces[0].featureId) : null);

  const handleUpdate = useCallback(
    (updates: Record<string, string | number | boolean>) => {
      if (!effectiveFeature || !doc) return;

      // Update the feature in Yjs
      const featureMap = doc.featuresById.get(effectiveFeature.id);
      if (featureMap) {
        doc.ydoc.transact(() => {
          for (const [key, value] of Object.entries(updates)) {
            featureMap.set(key, value);
          }
        });
      }
    },
    [effectiveFeature, doc]
  );

  // Render header with user, display dropdown, chat, and share buttons
  const renderHeader = () => (
    <Tooltip.Provider>
      <div className="properties-panel-header">
        <div className="properties-panel-header-left">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className="properties-panel-header-icon-button properties-panel-user-avatar"
              onClick={() => setShowUserProfile(true)}
              render={<button aria-label="User Profile" />}
              style={{ padding: 0 }}
            >
              {user ? (
                <Avatar user={user} size={28} fontSize={11} />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">
                  {user ? user.name || user.email || "User Profile" : "Sign In"}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Menu.Root>
            <Menu.Trigger
              className="properties-panel-header-icon-button"
              aria-label="Display Options"
            >
              {viewerState.projectionMode === "perspective" ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
                  <path d="M12 22V10M12 10L4 6M12 10l8-4" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="4" y="4" width="16" height="16" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
              )}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8}>
                <Menu.Popup className="properties-panel-header-dropdown">
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">
                      Projection
                    </Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.projectionMode === "perspective" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.projectionMode !== "perspective") {
                          viewerActions.toggleProjection();
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
                        <path d="M12 22V10M12 10L4 6M12 10l8-4" />
                      </svg>
                      <span>Perspective</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.projectionMode === "orthographic" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.projectionMode !== "orthographic") {
                          viewerActions.toggleProjection();
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="4" y="4" width="16" height="16" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="12" y1="4" x2="12" y2="20" />
                      </svg>
                      <span>Orthographic</span>
                    </Menu.Item>
                  </Menu.Group>
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">
                      Display
                    </Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.displayMode === "shaded" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.displayMode !== "shaded") {
                          viewerActions.setDisplayMode("shaded");
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="1"
                      >
                        <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
                      </svg>
                      <span>Shaded</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.displayMode === "wireframe" ? "active" : ""}`}
                      onClick={() => {
                        if (viewerState.displayMode !== "wireframe") {
                          viewerActions.setDisplayMode("wireframe");
                        }
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
                        <path d="M12 21V12M3 8l9 4 9-4" />
                      </svg>
                      <span>Wireframe</span>
                    </Menu.Item>
                    <Menu.Separator className="properties-panel-header-dropdown-separator" />
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.ambientOcclusion ? "active" : ""}`}
                      onClick={() => viewerActions.toggleAmbientOcclusion()}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a10 10 0 0 0 0 20" fill="currentColor" opacity="0.3" />
                      </svg>
                      <span>Ambient Occlusion</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${viewerState.showEdges ? "active" : ""}`}
                      onClick={() => viewerActions.toggleShowEdges()}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M3 3h18v18H3z" />
                        <path d="M3 3l18 18M21 3L3 21" />
                      </svg>
                      <span>Show Edges</span>
                    </Menu.Item>
                  </Menu.Group>
                  <Menu.Group>
                    <Menu.GroupLabel className="properties-panel-header-dropdown-label">
                      Theme
                    </Menu.GroupLabel>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "light" ? "active" : ""}`}
                      onClick={() => setThemeMode("light")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                      </svg>
                      <span>Light</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "dark" ? "active" : ""}`}
                      onClick={() => setThemeMode("dark")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      <span>Dark</span>
                    </Menu.Item>
                    <Menu.Item
                      className={`properties-panel-header-dropdown-item ${themeMode === "auto" ? "active" : ""}`}
                      onClick={() => setThemeMode("auto")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="2" y="3" width="20" height="18" rx="2" />
                        <path d="M8 3v4M16 3v4M2 9h20" />
                        <path d="M9 13h6M9 17h6" />
                      </svg>
                      <span>System</span>
                    </Menu.Item>
                  </Menu.Group>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <div className="properties-panel-header-right">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`properties-panel-header-button properties-panel-header-chat ${showAIChat ? "active" : ""}`}
              onClick={() => setShowAIChat(!showAIChat)}
              render={<button aria-label="AI Chat" />}
            >
              <AIIcon />
              <span>Chat</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">AI Chat</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className="properties-panel-header-button properties-panel-header-share"
              onClick={() => {}}
              render={<button aria-label="Share" />}
            >
              Share
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="properties-panel-header-tooltip">Share</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );

  // If in edit mode, show the feature creation form
  if (isEditing) {
    return (
      <div className="properties-panel properties-panel-floating properties-panel-editing">
        {renderHeader()}
        <div className="properties-panel-content">
          {editMode.type === "extrude" && (
            <ExtrudeEditForm
              data={editMode.data as ExtrudeFormData}
              onUpdate={updateFormData}
              onAccept={acceptEdit}
              onCancel={cancelEdit}
            />
          )}
          {editMode.type === "revolve" && (
            <RevolveEditForm
              data={editMode.data as RevolveFormData}
              axisCandidates={axisCandidates}
              onUpdate={updateFormData}
              onAccept={acceptEdit}
              onCancel={cancelEdit}
            />
          )}
        </div>
      </div>
    );
  }

  // Panel is always visible - show empty state if no feature selected

  const renderProperties = () => {
    // Don't show properties when no feature is selected
    if (!effectiveFeature) {
      return null;
    }

    switch (effectiveFeature.type) {
      case "origin":
        return <OriginProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case "plane":
        return <PlaneProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case "axis":
        return <AxisProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case "sketch":
        return <SketchProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case "extrude":
        return <ExtrudeProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case "revolve":
        return <RevolveProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      default:
        return <GenericProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
    }
  };

  const content = showAIChat ? <AIPanel context="editor" /> : renderProperties();

  return (
    <>
      <div className="properties-panel properties-panel-floating">
        {renderHeader()}
        {content && <div className="properties-panel-content">{content}</div>}
      </div>
      <UserProfileDialog open={showUserProfile} onOpenChange={setShowUserProfile} />
    </>
  );
};

export default PropertiesPanel;
