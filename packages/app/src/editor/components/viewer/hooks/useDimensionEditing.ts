/**
 * useDimensionEditing - Dimension label editing and dragging hook
 *
 * Handles inline editing of dimension constraint values and
 * dragging to reposition dimension labels.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useKeyboardShortcut, ShortcutPriority } from "../../../contexts/KeyboardShortcutContext";
import type { SketchDataArrays } from "../sketch-helpers";

/** Dimension editing state */
export interface DimensionEditingState {
  id: string | null;
  value: string;
  position: { x: number; y: number } | null;
  type: "distance" | "angle";
}

/** Dimension dragging state */
export interface DimensionDraggingState {
  id: string | null;
  currentOffset: { x: number; y: number } | null;
}

/** Options for useDimensionEditing */
export interface DimensionEditingOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
  /** Whether sketch mode is active */
  sketchModeActive: boolean;
  /** Function to get current sketch data */
  getSketch: () => SketchDataArrays | null;
  /** Function to update constraint value */
  updateConstraintValue: (constraintId: string, value: number) => void;
  /** Function to update constraint offset */
  updateConstraintOffset: (constraintId: string, offsetX: number, offsetY: number) => void;
}

/** Result of useDimensionEditing */
export interface DimensionEditingResult {
  editingState: DimensionEditingState;
  draggingState: DimensionDraggingState;
  /** Ref to the input element for focus management */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Start editing a dimension */
  startEditing: (
    constraintId: string,
    constraintType: "distance" | "angle",
    element: HTMLElement
  ) => void;
  /** Submit the current edit */
  submitEdit: () => void;
  /** Cancel the current edit */
  cancelEdit: () => void;
  /** Update the editing value */
  setEditingValue: (value: string) => void;
}

/**
 * Hook to manage dimension constraint editing and dragging.
 */
export function useDimensionEditing(options: DimensionEditingOptions): DimensionEditingResult {
  const {
    containerRef,
    cameraRef,
    sketchModeActive,
    getSketch,
    updateConstraintValue,
    updateConstraintOffset,
  } = options;

  // Editing state
  const [editingDimensionId, setEditingDimensionId] = useState<string | null>(null);
  const [editingDimensionValue, setEditingDimensionValue] = useState<string>("");
  const [editingDimensionPos, setEditingDimensionPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [editingDimensionType, setEditingDimensionType] = useState<"distance" | "angle">(
    "distance"
  );
  const editingDimensionWorldPos = useRef<THREE.Vector3 | null>(null);
  const dimensionInputRef = useRef<HTMLInputElement | null>(null);

  // Dragging state
  const [draggingDimensionId, setDraggingDimensionId] = useState<string | null>(null);
  const [dragCurrentOffset, setDragCurrentOffset] = useState<{ x: number; y: number } | null>(null);

  // Start editing a dimension
  const startEditing = useCallback(
    (constraintId: string, constraintType: "distance" | "angle", element: HTMLElement) => {
      const sketch = getSketch();
      if (!sketch) return;

      const constraint = sketch.constraints.find((c) => c.id === constraintId);
      if (!constraint || (constraint.type !== "distance" && constraint.type !== "angle")) return;

      const container = containerRef.current;
      if (!container) return;

      // Store the 3D world position for camera tracking
      const worldX = parseFloat(element.dataset.worldX ?? "0");
      const worldY = parseFloat(element.dataset.worldY ?? "0");
      const worldZ = parseFloat(element.dataset.worldZ ?? "0");
      editingDimensionWorldPos.current = new THREE.Vector3(worldX, worldY, worldZ);

      // Get the label's screen position for inline editing
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setEditingDimensionPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
      });
      setEditingDimensionId(constraintId);
      setEditingDimensionValue(String((constraint as { value?: number }).value ?? 0));
      setEditingDimensionType(constraintType);
    },
    [containerRef, getSketch]
  );

  // Submit the current edit
  const submitEdit = useCallback(() => {
    if (!editingDimensionId) return;
    const value = parseFloat(editingDimensionValue);
    if (!isNaN(value) && value > 0) {
      updateConstraintValue(editingDimensionId, value);
    }
    setEditingDimensionId(null);
    setEditingDimensionValue("");
    setEditingDimensionPos(null);
  }, [editingDimensionId, editingDimensionValue, updateConstraintValue]);

  // Cancel the current edit
  const cancelEdit = useCallback(() => {
    setEditingDimensionId(null);
    setEditingDimensionValue("");
    setEditingDimensionPos(null);
  }, []);

  // Focus the dimension input when it appears
  useEffect(() => {
    if (editingDimensionId && dimensionInputRef.current) {
      dimensionInputRef.current.focus();
      dimensionInputRef.current.select();
    }
  }, [editingDimensionId]);

  // Update dimension input position as camera moves
  useEffect(() => {
    if (!editingDimensionId || !editingDimensionWorldPos.current) return;
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    let animationId: number | null = null;

    const updatePosition = () => {
      if (!editingDimensionWorldPos.current || !camera || !container) {
        animationId = requestAnimationFrame(updatePosition);
        return;
      }

      // Project 3D world position to screen coordinates
      const worldPos = editingDimensionWorldPos.current.clone();
      worldPos.project(camera);

      // Convert normalized device coordinates to screen coordinates
      const containerRect = container.getBoundingClientRect();
      const screenX = ((worldPos.x + 1) / 2) * containerRect.width;
      const screenY = ((-worldPos.y + 1) / 2) * containerRect.height;

      setEditingDimensionPos({ x: screenX, y: screenY });
      animationId = requestAnimationFrame(updatePosition);
    };

    animationId = requestAnimationFrame(updatePosition);

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [editingDimensionId, containerRef, cameraRef]);

  // Clear world position ref when editing ends
  useEffect(() => {
    if (!editingDimensionId) {
      editingDimensionWorldPos.current = null;
    }
  }, [editingDimensionId]);

  // Keyboard shortcut: Enter to submit dimension edit
  useKeyboardShortcut({
    id: "dimension-edit-submit",
    keys: ["Enter"],
    priority: ShortcutPriority.INLINE_EDIT,
    condition: () => editingDimensionId !== null,
    handler: () => {
      submitEdit();
      return true;
    },
    description: "Submit dimension value",
    category: "Sketch",
    editable: "allow", // Should work even when input is focused
  });

  // Keyboard shortcut: Escape to cancel dimension edit
  useKeyboardShortcut({
    id: "dimension-edit-cancel",
    keys: ["Escape"],
    priority: ShortcutPriority.INLINE_EDIT,
    condition: () => editingDimensionId !== null,
    handler: () => {
      cancelEdit();
      return true;
    },
    description: "Cancel dimension edit",
    category: "Sketch",
    editable: "allow", // Should work even when input is focused
  });

  // Handle dimension label dragging for repositioning
  useEffect(() => {
    if (!sketchModeActive) return;

    let isPotentialDrag = false;
    let isDragging = false;
    let currentDragId: string | null = null;
    let startX = 0;
    let startY = 0;
    let initialOffsetX = 0;
    let initialOffsetY = 0;
    const DRAG_THRESHOLD = 5;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("draggable-dimension") && e.button === 0) {
        const constraintId = target.dataset.constraintId;
        if (constraintId) {
          isPotentialDrag = true;
          currentDragId = constraintId;
          startX = e.clientX;
          startY = e.clientY;
          initialOffsetX = parseFloat(target.dataset.storedOffsetX ?? "0");
          initialOffsetY = parseFloat(target.dataset.storedOffsetY ?? "15");
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPotentialDrag || !currentDragId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!isDragging && distance >= DRAG_THRESHOLD) {
        isDragging = true;
        setDraggingDimensionId(currentDragId);
        setDragCurrentOffset({ x: initialOffsetX, y: initialOffsetY });
      }

      if (isDragging) {
        const deltaX = dx * 0.5;
        const deltaY = -dy * 0.5;

        setDragCurrentOffset({
          x: initialOffsetX + deltaX,
          y: initialOffsetY + deltaY,
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging && currentDragId) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const deltaX = dx * 0.5;
        const deltaY = -dy * 0.5;
        const finalOffsetX = initialOffsetX + deltaX;
        const finalOffsetY = initialOffsetY + deltaY;

        updateConstraintOffset(currentDragId, finalOffsetX, finalOffsetY);
      }

      isPotentialDrag = false;
      isDragging = false;
      currentDragId = null;
      setDraggingDimensionId(null);
      setDragCurrentOffset(null);
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
    };
  }, [sketchModeActive, updateConstraintOffset]);

  return {
    editingState: {
      id: editingDimensionId,
      value: editingDimensionValue,
      position: editingDimensionPos,
      type: editingDimensionType,
    },
    draggingState: {
      id: draggingDimensionId,
      currentOffset: dragCurrentOffset,
    },
    inputRef: dimensionInputRef,
    startEditing,
    submitEdit,
    cancelEdit,
    setEditingValue: setEditingDimensionValue,
  };
}
