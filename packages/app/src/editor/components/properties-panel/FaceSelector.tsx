/**
 * Face Selector Component
 *
 * Allows users to select a face from the 3D model for features like
 * "extrude to face" extent mode.
 *
 * @see Phase 14: toFace extent
 */

import { useState, useEffect, useCallback } from "react";
import { useSelection } from "../../contexts/SelectionContext";

interface FaceSelectorProps {
  value: string | undefined;
  onChange: (value: string) => void;
}

export function FaceSelector({ value, onChange }: FaceSelectorProps) {
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
