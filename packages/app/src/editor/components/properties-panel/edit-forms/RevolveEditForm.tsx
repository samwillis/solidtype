/**
 * Revolve Edit Form Component
 *
 * Tanstack Form-based form for creating/editing revolve features.
 * Uses Zod validation for form data.
 */

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { revolveFormSchema, type RevolveFormData } from "../../../types/featureSchemas";
import { useKernel } from "../../../contexts/KernelContext";
import { NumberInput, SelectInput, PropertyRow, PropertyGroup } from "../inputs";

interface RevolveEditFormProps {
  data: RevolveFormData;
  axisCandidates: Array<{ id: string; label: string }>;
  onUpdate: (updates: Partial<RevolveFormData>) => void;
  onAccept: () => void;
  onCancel: () => void;
}

export function RevolveEditForm({
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
