/**
 * Revolve Properties Component
 *
 * Displays and edits properties for Revolve features.
 */

import type { RevolveFeature } from "../../../types/document";
import type { FeaturePropertiesProps } from "../types";
import { useKernel } from "../../../contexts/KernelContext";
import {
  TextInput,
  NumberInput,
  SelectInput,
  ColorInput,
  PropertyRow,
  PropertyGroup,
} from "../inputs";

export function RevolveProperties({ feature, onUpdate }: FeaturePropertiesProps) {
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
