/**
 * Extrude Edit Form Component
 *
 * Tanstack Form-based form for creating/editing extrude features.
 * Uses Zod validation for form data.
 */

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { extrudeFormSchema, type ExtrudeFormData } from "../../../types/featureSchemas";
import { useKernel } from "../../../contexts/KernelContext";
import { NumberInput, SelectInput, PropertyRow, PropertyGroup } from "../inputs";

interface ExtrudeEditFormProps {
  data: ExtrudeFormData;
  onUpdate: (updates: Partial<ExtrudeFormData>) => void;
  onAccept: () => void;
  onCancel: () => void;
}

export function ExtrudeEditForm({ data, onUpdate, onAccept, onCancel }: ExtrudeEditFormProps) {
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
