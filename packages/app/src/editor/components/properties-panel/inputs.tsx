/**
 * Properties Panel - Input Components
 *
 * Reusable form input components for the properties panel.
 */

import React, { useState, useEffect } from "react";

// ============================================================================
// Number Input
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

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step: _step,
  unit,
  disabled,
}: NumberInputProps) {
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

// ============================================================================
// Text Input
// ============================================================================

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TextInput({ value, onChange, placeholder, disabled }: TextInputProps) {
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

// ============================================================================
// Select Input
// ============================================================================

interface SelectInputProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
}

export function SelectInput<T extends string>({
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

// ============================================================================
// Checkbox Input
// ============================================================================

interface CheckboxInputProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function CheckboxInput({ checked, onChange, label, disabled }: CheckboxInputProps) {
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

// ============================================================================
// Color Input
// ============================================================================

interface ColorInputProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  defaultColor: string;
  disabled?: boolean;
}

export function ColorInput({ value, onChange, defaultColor, disabled }: ColorInputProps) {
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
// Layout Components
// ============================================================================

interface PropertyRowProps {
  label: string;
  children: React.ReactNode;
}

export function PropertyRow({ label, children }: PropertyRowProps) {
  return (
    <div className="property-row">
      <span className="property-label">{label}</span>
      <div className="property-value">{children}</div>
    </div>
  );
}

interface PropertyGroupProps {
  /** @deprecated Title is no longer rendered (Figma-style) but kept for compatibility */
  title?: string;
  children: React.ReactNode;
}

export function PropertyGroup({ children }: PropertyGroupProps) {
  // Don't render group title - make it more like Figma
  return <div className="property-group">{children}</div>;
}
