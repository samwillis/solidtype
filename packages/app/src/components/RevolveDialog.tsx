/**
 * RevolveDialog - dialog for creating revolve features
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useDocument } from '../contexts/DocumentContext';
import { useKernel } from '../contexts/KernelContext';
import { useSelection } from '../contexts/SelectionContext';
import type { SketchEntity, SketchLine } from '../types/document';
import './RevolveDialog.css';

interface RevolveDialogProps {
  open: boolean;
  sketchId: string;
  onConfirm: (axis: string, angleDeg: number, op: 'add' | 'cut') => void;
  onCancel: () => void;
}

function isLine(entity: SketchEntity): entity is SketchLine {
  return entity.type === 'line';
}

const RevolveDialog: React.FC<RevolveDialogProps> = ({
  open,
  sketchId,
  onConfirm,
  onCancel,
}) => {
  const { getFeatureById } = useDocument();
  const { previewRevolve, clearPreview, previewError } = useKernel();
  const { setHighlightedEntities, clearHighlightedEntities } = useSelection();

  const sketch = useMemo(() => {
    const feature = getFeatureById(sketchId);
    return feature?.type === 'sketch' ? feature : null;
  }, [getFeatureById, sketchId]);

  const axisCandidates = useMemo(() => {
    const entities = sketch?.data?.entities ?? [];
    return entities.filter(isLine);
  }, [sketch]);

  const [angle, setAngle] = useState(360);
  const [operation, setOperation] = useState<'add' | 'cut'>('add');
  const [axis, setAxis] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setAngle(360);
    setOperation('add');
    setAxis(axisCandidates[0]?.id ?? '');
  }, [open, axisCandidates]);

  // Highlight selected axis line in the sketch UI while dialog is open
  useEffect(() => {
    if (!open) {
      clearHighlightedEntities();
      return;
    }
    if (!axis) return;
    setHighlightedEntities({ sketchId, entityIds: [axis] });
  }, [open, axis, sketchId, setHighlightedEntities, clearHighlightedEntities]);

  // Live preview while open
  useEffect(() => {
    if (!open) {
      clearPreview();
      return;
    }
    if (!sketchId || !axis) return;
    const timer = window.setTimeout(() => {
      previewRevolve({
        sketchId,
        axis,
        angle,
        op: operation,
      });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [open, sketchId, axis, angle, operation]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!axis) return;
    if (angle <= 0) return;
    onConfirm(axis, angle, operation);
  };

  return (
    <div className="revolve-dialog-overlay" onClick={onCancel}>
      <div className="revolve-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Revolve</h3>
        <form onSubmit={handleSubmit}>
          <div className="revolve-dialog-info">
            <span className="label">Sketch:</span>
            <span className="value">{sketchId}</span>
          </div>

          <div className="revolve-dialog-field">
            <label htmlFor="revolve-operation">Operation</label>
            <div className="revolve-dialog-toggle">
              <button
                type="button"
                className={operation === 'add' ? 'active' : ''}
                onClick={() => setOperation('add')}
              >
                Add
              </button>
              <button
                type="button"
                className={operation === 'cut' ? 'active' : ''}
                onClick={() => setOperation('cut')}
              >
                Cut
              </button>
            </div>
          </div>

          <div className="revolve-dialog-field">
            <label htmlFor="revolve-axis">Axis</label>
            <select
              id="revolve-axis"
              value={axis}
              onChange={(e) => setAxis(e.target.value)}
              disabled={axisCandidates.length === 0}
            >
              {axisCandidates.length === 0 ? (
                <option value="">No lines in sketch</option>
              ) : (
                <>
                  {axisCandidates.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div className="revolve-dialog-field">
            <label htmlFor="revolve-angle">Angle</label>
            <div className="revolve-dialog-input-group">
              <input
                type="number"
                id="revolve-angle"
                value={angle}
                onChange={(e) => setAngle(Math.max(1, Math.min(360, parseFloat(e.target.value) || 0)))}
                min="1"
                max="360"
                step="15"
              />
              <span className="revolve-dialog-unit">°</span>
            </div>
          </div>

          <div className="revolve-dialog-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-confirm" disabled={!axis}>
              OK
            </button>
          </div>

          {previewError && (
            <div className="revolve-dialog-error" role="alert">
              {previewError}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default RevolveDialog;

