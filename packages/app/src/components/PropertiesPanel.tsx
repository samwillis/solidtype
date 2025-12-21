/**
 * Properties Panel - displays and edits properties of selected features
 * Phase 13: Properties Panel
 * 
 * Also handles feature creation with accept/cancel buttons when in edit mode.
 * Uses Tanstack Form with Zod validation for feature editing.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useDocument } from '../contexts/DocumentContext';
import { useSelection } from '../contexts/SelectionContext';
import { useFeatureEdit } from '../contexts/FeatureEditContext';
import { extrudeFormSchema, revolveFormSchema, type ExtrudeFormData, type RevolveFormData } from '../types/featureSchemas';
import type { Feature, ExtrudeFeature, RevolveFeature, SketchFeature, PlaneFeature, OriginFeature, SketchLine } from '../types/document';
import { useKernel } from '../contexts/KernelContext';
import './PropertiesPanel.css';

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
    if (e.key === 'Enter') {
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
    if (e.key === 'Enter') {
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

function SelectInput<T extends string>({ value, onChange, options, disabled }: SelectInputProps<T>) {
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
        <button
          className="reset-color"
          onClick={() => onChange(undefined)}
          disabled={disabled}
        >
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
    setSelectionMode('selectFace');
    setOnFaceSelected((face) => {
      // Create persistent reference from face selection
      const ref = `face:${face.featureId}:${face.faceIndex}`;
      onChange(ref);
      setIsSelecting(false);
      setSelectionMode('default');
      setOnFaceSelected(undefined);
    });
  }, [setSelectionMode, setOnFaceSelected, onChange]);
  
  const handleCancelSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectionMode('default');
    setOnFaceSelected(undefined);
  }, [setSelectionMode, setOnFaceSelected]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSelecting) {
        setSelectionMode('default');
        setOnFaceSelected(undefined);
      }
    };
  }, [isSelecting, setSelectionMode, setOnFaceSelected]);
  
  return (
    <div className="face-selector">
      {isSelecting ? (
        <>
          <span className="face-selector-prompt">Click a face...</span>
          <button 
            className="face-selector-cancel"
            onClick={handleCancelSelection}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="face-selector-value">{value || 'Not selected'}</span>
          <button 
            className="face-selector-btn"
            onClick={handleStartSelection}
          >
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
    case 'xy': return '#0088ff';
    case 'xz': return '#00cc44';
    case 'yz': return '#ff4444';
    default: return '#888888';
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

function PropertyGroup({ title, children }: PropertyGroupProps) {
  return (
    <div className="property-group">
      <div className="property-group-title">{title}</div>
      {children}
    </div>
  );
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
          <TextInput
            value={origin.name || 'Origin'}
            onChange={(name) => onUpdate({ name })}
          />
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
  
  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput
            value={plane.name || plane.id}
            onChange={(name) => onUpdate({ name })}
          />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="readonly-value">Datum Plane</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="readonly-value">{plane.id}</span>
        </PropertyRow>
      </PropertyGroup>
      
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
        <PropertyRow label="Offset X">
          <NumberInput
            value={plane.offsetX ?? 0}
            onChange={(offsetX) => onUpdate({ offsetX })}
            unit="mm"
          />
        </PropertyRow>
        <PropertyRow label="Offset Y">
          <NumberInput
            value={plane.offsetY ?? 0}
            onChange={(offsetY) => onUpdate({ offsetY })}
            unit="mm"
          />
        </PropertyRow>
        <PropertyRow label="Color">
          <ColorInput
            value={plane.color}
            onChange={(color) => onUpdate({ color: color || '' })}
            defaultColor={getDefaultPlaneColorHex(plane.id)}
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
          <TextInput
            value={sketch.name || sketch.id}
            onChange={(name) => onUpdate({ name })}
          />
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
          <span className="readonly-value">{sketch.plane}</span>
        </PropertyRow>
        <PropertyRow label="Points">
          <span className="readonly-value">{sketch.data?.points.length ?? 0}</span>
        </PropertyRow>
        <PropertyRow label="Entities">
          <span className="readonly-value">{sketch.data?.entities.length ?? 0}</span>
        </PropertyRow>
        <PropertyRow label="Constraints">
          <span className="readonly-value">{sketch.data?.constraints.length ?? 0}</span>
        </PropertyRow>
      </PropertyGroup>
    </>
  );
}

function ExtrudeProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const extrude = feature as ExtrudeFeature;
  const extent = extrude.extent ?? 'blind';
  const { bodies } = useKernel();
  const mergeScope = extrude.mergeScope ?? 'auto';
  const isAddOperation = extrude.op === 'add';
  
  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput
            value={extrude.name || extrude.id}
            onChange={(name) => onUpdate({ name })}
          />
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
              { value: 'add', label: 'Add' },
              { value: 'cut', label: 'Cut' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Direction">
          <SelectInput
            value={typeof extrude.direction === 'string' ? extrude.direction : 'normal'}
            onChange={(direction) => onUpdate({ direction })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'reverse', label: 'Reverse' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Extent">
          <SelectInput
            value={extent}
            onChange={(ext) => onUpdate({ extent: ext })}
            options={[
              { value: 'blind', label: 'Distance' },
              { value: 'toFace', label: 'Up to Face' },
              { value: 'throughAll', label: 'Through All' },
            ]}
          />
        </PropertyRow>
        {extent === 'blind' && (
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
        {extent === 'toFace' && (
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
                { value: 'auto', label: 'Auto (merge with intersecting)' },
                { value: 'new', label: 'Create new body' },
                { value: 'specific', label: 'Merge with selected' },
              ]}
            />
          </PropertyRow>
          {mergeScope === 'specific' && bodies.length > 0 && (
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
                          : current.filter(id => id !== body.featureId);
                        onUpdate({ targetBodies: newTargets.join(',') });
                      }}
                    />
                    <span style={{ color: body.color || '#6699cc' }}>●</span>
                    {body.name || body.featureId}
                  </label>
                ))}
              </div>
            </PropertyRow>
          )}
          <PropertyRow label="Body Name">
            <TextInput
              value={extrude.resultBodyName || ''}
              onChange={(name) => onUpdate({ resultBodyName: name })}
              placeholder="Auto"
            />
          </PropertyRow>
          <PropertyRow label="Body Color">
            <ColorInput
              value={extrude.resultBodyColor}
              onChange={(color) => onUpdate({ resultBodyColor: color || '' })}
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
  const mergeScope = revolve.mergeScope ?? 'auto';
  const isAddOperation = revolve.op === 'add';
  
  return (
    <>
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput
            value={revolve.name || revolve.id}
            onChange={(name) => onUpdate({ name })}
          />
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
              { value: 'add', label: 'Add' },
              { value: 'cut', label: 'Cut' },
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
                { value: 'auto', label: 'Auto (merge with intersecting)' },
                { value: 'new', label: 'Create new body' },
                { value: 'specific', label: 'Merge with selected' },
              ]}
            />
          </PropertyRow>
          {mergeScope === 'specific' && bodies.length > 0 && (
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
                          : current.filter(id => id !== body.featureId);
                        onUpdate({ targetBodies: newTargets.join(',') });
                      }}
                    />
                    <span style={{ color: body.color || '#6699cc' }}>●</span>
                    {body.name || body.featureId}
                  </label>
                ))}
              </div>
            </PropertyRow>
          )}
          <PropertyRow label="Body Name">
            <TextInput
              value={revolve.resultBodyName || ''}
              onChange={(name) => onUpdate({ resultBodyName: name })}
              placeholder="Auto"
            />
          </PropertyRow>
          <PropertyRow label="Body Color">
            <ColorInput
              value={revolve.resultBodyColor}
              onChange={(color) => onUpdate({ resultBodyColor: color || '' })}
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
        <TextInput
          value={feature.name || feature.id}
          onChange={(name) => onUpdate({ name })}
        />
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
  const currentMergeScope = form.state.values.mergeScope || 'auto';
  const isAddOperation = currentOp === 'add';

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
                onChange={(op) => field.handleChange(op as 'add' | 'cut')}
                options={[
                  { value: 'add', label: 'Add' },
                  { value: 'cut', label: 'Cut' },
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
                onChange={(dir) => field.handleChange(dir as 'normal' | 'reverse')}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'reverse', label: 'Reverse' },
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
                return 'Distance must be at least 0.1';
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
                  value={field.state.value || 'auto'}
                  onChange={(scope) => field.handleChange(scope as 'auto' | 'new' | 'specific')}
                  options={[
                    { value: 'auto', label: 'Auto (merge with intersecting)' },
                    { value: 'new', label: 'Create new body' },
                    { value: 'specific', label: 'Merge with selected' },
                  ]}
                />
              </PropertyRow>
            )}
          </form.Field>
          
          {currentMergeScope === 'specific' && (
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
                        <span style={{ color: body.color || '#6699cc' }}>●</span>
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
        <button
          type="button"
          className="properties-btn properties-btn-cancel"
          onClick={onCancel}
        >
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
  axisCandidates: Array<{ id: string }>;
  onUpdate: (updates: Partial<RevolveFormData>) => void;
  onAccept: () => void;
  onCancel: () => void;
}

function RevolveEditForm({ data, axisCandidates, onUpdate, onAccept, onCancel }: RevolveEditFormProps) {
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
  const currentMergeScope = form.state.values.mergeScope || 'auto';
  const isAddOperation = currentOp === 'add';

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
                onChange={(op) => field.handleChange(op as 'add' | 'cut')}
                options={[
                  { value: 'add', label: 'Add' },
                  { value: 'cut', label: 'Cut' },
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
                return 'Axis is required';
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
                  options={axisCandidates.length > 0
                    ? axisCandidates.map(l => ({ value: l.id, label: l.id }))
                    : [{ value: '', label: 'No lines in sketch' }]
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
              if (value < 1) return 'Angle must be at least 1°';
              if (value > 360) return 'Angle must be at most 360°';
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
                  value={field.state.value || 'auto'}
                  onChange={(scope) => field.handleChange(scope as 'auto' | 'new' | 'specific')}
                  options={[
                    { value: 'auto', label: 'Auto (merge with intersecting)' },
                    { value: 'new', label: 'Create new body' },
                    { value: 'specific', label: 'Merge with selected' },
                  ]}
                />
              </PropertyRow>
            )}
          </form.Field>
          
          {currentMergeScope === 'specific' && (
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
                        <span style={{ color: body.color || '#6699cc' }}>●</span>
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
        <button
          type="button"
          className="properties-btn properties-btn-cancel"
          onClick={onCancel}
        >
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
  
  // Get axis candidates for revolve
  const axisCandidates = useMemo(() => {
    if (editMode.type !== 'revolve') return [];
    const sketch = getFeatureById(editMode.sketchId);
    if (!sketch || sketch.type !== 'sketch' || !sketch.data) return [];
    return sketch.data.entities.filter((e): e is SketchLine => e.type === 'line');
  }, [editMode, getFeatureById]);
  
  // Get the selected feature
  const selectedFeature = selectedFeatureId ? getFeatureById(selectedFeatureId) : null;
  
  // If a face is selected but no feature, use the face's feature
  const effectiveFeature = selectedFeature || 
    (selectedFaces.length > 0 ? getFeatureById(selectedFaces[0].featureId) : null);
  
  const handleUpdate = useCallback((updates: Record<string, string | number | boolean>) => {
    if (!effectiveFeature) return;
    
    // Update the feature in Yjs
    const features = doc.features;
    for (const child of features.toArray()) {
      if (child instanceof Object && 'getAttribute' in child) {
        const element = child as any;
        if (element.getAttribute('id') === effectiveFeature.id) {
          for (const [key, value] of Object.entries(updates)) {
            element.setAttribute(key, String(value));
          }
          break;
        }
      }
    }
  }, [effectiveFeature, doc]);

  // If in edit mode, show the feature creation form
  if (isEditing) {
    const panelTitle = editMode.type === 'extrude' ? 'New Extrude' : editMode.type === 'revolve' ? 'New Revolve' : 'Edit Feature';
    
    return (
      <div className="properties-panel properties-panel-editing">
        <div className="panel-header">{panelTitle}</div>
        <div className="properties-panel-content">
          {editMode.type === 'extrude' && (
            <ExtrudeEditForm 
              data={editMode.data as ExtrudeFormData} 
              onUpdate={updateFormData}
              onAccept={acceptEdit}
              onCancel={cancelEdit}
            />
          )}
          {editMode.type === 'revolve' && (
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

  if (!effectiveFeature) {
    return (
      <div className="properties-panel">
        <div className="panel-header">Properties</div>
        <div className="properties-panel-content">
          <div className="properties-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <p className="empty-title">No selection</p>
            <p className="empty-hint">Select to edit properties</p>
          </div>
        </div>
      </div>
    );
  }

  const renderProperties = () => {
    switch (effectiveFeature.type) {
      case 'origin':
        return <OriginProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case 'plane':
        return <PlaneProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case 'sketch':
        return <SketchProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case 'extrude':
        return <ExtrudeProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      case 'revolve':
        return <RevolveProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
      default:
        return <GenericProperties feature={effectiveFeature} onUpdate={handleUpdate} />;
    }
  };

  return (
    <div className="properties-panel">
      <div className="panel-header">Properties</div>
      <div className="properties-panel-content">
        {renderProperties()}
      </div>
    </div>
  );
};

export default PropertiesPanel;
