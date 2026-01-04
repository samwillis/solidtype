/**
 * Extrude Properties Component
 *
 * Displays and edits properties for Extrude features.
 * Includes extent mode, distance, multi-body options, etc.
 */

import type { ExtrudeFeature } from "../../../types/document";
import type { FeaturePropertiesProps } from "../types";
import { useKernel } from "../../../contexts/KernelContext";
import { FaceSelector } from "../FaceSelector";
import {
  TextInput,
  NumberInput,
  SelectInput,
  ColorInput,
  PropertyRow,
  PropertyGroup,
} from "../inputs";

export function ExtrudeProperties({ feature, onUpdate }: FeaturePropertiesProps) {
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
