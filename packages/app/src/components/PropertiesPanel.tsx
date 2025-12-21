/**
 * Properties Panel - displays and edits properties of selected features
 * Phase 13: Properties Panel
 * 
 * Also handles feature creation with accept/cancel buttons when in edit mode.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDocument } from '../contexts/DocumentContext';
import { useSelection } from '../contexts/SelectionContext';
import { useFeatureEdit } from '../contexts/FeatureEditContext';
import type { Feature, ExtrudeFeature, RevolveFeature, SketchFeature, PlaneFeature, OriginFeature, SketchLine } from '../types/document';
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
            <span className="readonly-value">{extrude.extentRef || 'Not selected'}</span>
          </PropertyRow>
        )}
      </PropertyGroup>
    </>
  );
}

function RevolveProperties({ feature, onUpdate }: FeaturePropertiesProps) {
  const revolve = feature as RevolveFeature;
  
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
// Feature Edit Forms (for creating new features)
// ============================================================================

interface ExtrudeEditFormProps {
  data: { sketch: string; op: 'add' | 'cut'; direction: 'normal' | 'reverse'; distance?: number };
  onUpdate: (updates: Record<string, string | number | boolean>) => void;
}

function ExtrudeEditForm({ data, onUpdate }: ExtrudeEditFormProps) {
  return (
    <>
      <PropertyGroup title="Extrude">
        <PropertyRow label="Sketch">
          <span className="readonly-value">{data.sketch}</span>
        </PropertyRow>
        <PropertyRow label="Operation">
          <SelectInput
            value={data.op}
            onChange={(op) => onUpdate({ op })}
            options={[
              { value: 'add', label: 'Add' },
              { value: 'cut', label: 'Cut' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Direction">
          <SelectInput
            value={data.direction}
            onChange={(direction) => onUpdate({ direction })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'reverse', label: 'Reverse' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Distance">
          <NumberInput
            value={data.distance ?? 10}
            onChange={(distance) => onUpdate({ distance })}
            min={0.1}
            step={1}
            unit="mm"
          />
        </PropertyRow>
      </PropertyGroup>
    </>
  );
}

interface RevolveEditFormProps {
  data: { sketch: string; axis: string; angle: number; op: 'add' | 'cut' };
  axisCandidates: Array<{ id: string }>;
  onUpdate: (updates: Record<string, string | number | boolean>) => void;
}

function RevolveEditForm({ data, axisCandidates, onUpdate }: RevolveEditFormProps) {
  return (
    <>
      <PropertyGroup title="Revolve">
        <PropertyRow label="Sketch">
          <span className="readonly-value">{data.sketch}</span>
        </PropertyRow>
        <PropertyRow label="Operation">
          <SelectInput
            value={data.op}
            onChange={(op) => onUpdate({ op })}
            options={[
              { value: 'add', label: 'Add' },
              { value: 'cut', label: 'Cut' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Axis">
          <SelectInput
            value={data.axis}
            onChange={(axis) => onUpdate({ axis })}
            options={axisCandidates.length > 0 
              ? axisCandidates.map(l => ({ value: l.id, label: l.id }))
              : [{ value: '', label: 'No lines in sketch' }]
            }
            disabled={axisCandidates.length === 0}
          />
        </PropertyRow>
        <PropertyRow label="Angle">
          <NumberInput
            value={data.angle}
            onChange={(angle) => onUpdate({ angle })}
            min={1}
            max={360}
            step={15}
            unit="°"
          />
        </PropertyRow>
      </PropertyGroup>
    </>
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
              data={editMode.data} 
              onUpdate={updateFormData}
            />
          )}
          {editMode.type === 'revolve' && (
            <RevolveEditForm 
              data={editMode.data}
              axisCandidates={axisCandidates}
              onUpdate={updateFormData}
            />
          )}
        </div>
        <div className="properties-panel-actions">
          <button 
            className="properties-btn properties-btn-cancel"
            onClick={cancelEdit}
          >
            Cancel
          </button>
          <button 
            className="properties-btn properties-btn-accept"
            onClick={acceptEdit}
          >
            Accept
          </button>
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
