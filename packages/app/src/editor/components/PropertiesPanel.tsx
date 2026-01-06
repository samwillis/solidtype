/**
 * Properties Panel - displays and edits properties of selected features
 * Phase 13: Properties Panel
 *
 * Also handles feature creation with accept/cancel buttons when in edit mode.
 * Uses Tanstack Form with Zod validation for feature editing.
 *
 * @see ./properties-panel/ for extracted sub-components
 */

import React, { useState, useCallback, useMemo } from "react";
import { useDocument } from "../contexts/DocumentContext";
import { useSelection } from "../contexts/SelectionContext";
import { useFeatureEdit } from "../contexts/FeatureEditContext";
import type { ExtrudeFormData, RevolveFormData } from "../types/featureSchemas";
import type { SketchLine } from "../types/document";
import AIPanel from "./AIPanel";
import { UserProfileDialog } from "../../components/dialogs/UserProfileDialog";
import "./PropertiesPanel.css";

// Import sub-components from properties-panel module
import { PanelHeader } from "./properties-panel/PanelHeader";
import {
  OriginProperties,
  PlaneProperties,
  AxisProperties,
  SketchProperties,
  ExtrudeProperties,
  RevolveProperties,
  GenericProperties,
} from "./properties-panel/feature-properties";
import { ExtrudeEditForm, RevolveEditForm } from "./properties-panel/edit-forms";

// ============================================================================
// Main Component
// ============================================================================

const PropertiesPanel: React.FC = () => {
  const { doc, documentId, getFeatureById, isLoading } = useDocument();
  const { selectedFeatureId, selectedFaces } = useSelection();
  const { editMode, updateFormData, acceptEdit, cancelEdit, isEditing } = useFeatureEdit();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);

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
      if (!effectiveFeature || !doc || isLoading) return;

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
    [effectiveFeature, doc, isLoading]
  );

  // If in edit mode, show the feature creation form
  if (isEditing) {
    return (
      <div className="properties-panel properties-panel-floating properties-panel-editing">
        <PanelHeader
          showAIChat={showAIChat}
          onToggleAIChat={() => setShowAIChat(!showAIChat)}
          onUserProfileClick={() => setShowUserProfile(true)}
        />
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

  const content = showAIChat ? (
    <AIPanel context="editor" documentId={documentId} />
  ) : (
    renderProperties()
  );

  return (
    <>
      <div className="properties-panel properties-panel-floating">
        <PanelHeader
          showAIChat={showAIChat}
          onToggleAIChat={() => setShowAIChat(!showAIChat)}
          onUserProfileClick={() => setShowUserProfile(true)}
        />
        {content && <div className="properties-panel-content">{content}</div>}
      </div>
      <UserProfileDialog open={showUserProfile} onOpenChange={setShowUserProfile} />
    </>
  );
};

export default PropertiesPanel;
