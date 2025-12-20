/**
 * ExtrudeDialog - dialog for creating extrude features
 */

import React, { useState, useEffect } from 'react';
import './ExtrudeDialog.css';

interface ExtrudeDialogProps {
  open: boolean;
  sketchId: string;
  onConfirm: (distance: number, direction: 'normal' | 'reverse', op: 'add' | 'cut') => void;
  onCancel: () => void;
}

const ExtrudeDialog: React.FC<ExtrudeDialogProps> = ({
  open,
  sketchId,
  onConfirm,
  onCancel,
}) => {
  const [distance, setDistance] = useState(10);
  const [direction, setDirection] = useState<'normal' | 'reverse'>('normal');
  const [operation, setOperation] = useState<'add' | 'cut'>('add');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDistance(10);
      setDirection('normal');
      setOperation('add');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (distance > 0) {
      onConfirm(distance, direction, operation);
    }
  };

  return (
    <div className="extrude-dialog-overlay" onClick={onCancel}>
      <div className="extrude-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Extrude</h3>
        <form onSubmit={handleSubmit}>
          <div className="extrude-dialog-info">
            <span className="label">Sketch:</span>
            <span className="value">{sketchId}</span>
          </div>

          <div className="extrude-dialog-field">
            <label htmlFor="extrude-operation">Operation</label>
            <div className="extrude-dialog-toggle">
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

          <div className="extrude-dialog-field">
            <label htmlFor="extrude-distance">Distance</label>
            <div className="extrude-dialog-input-group">
              <input
                type="number"
                id="extrude-distance"
                value={distance}
                onChange={(e) => setDistance(Math.max(0.1, parseFloat(e.target.value) || 0))}
                min="0.1"
                step="1"
              />
              <span className="extrude-dialog-unit">mm</span>
            </div>
          </div>

          <div className="extrude-dialog-field">
            <label htmlFor="extrude-direction">Direction</label>
            <select
              id="extrude-direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'normal' | 'reverse')}
            >
              <option value="normal">Normal</option>
              <option value="reverse">Reverse</option>
            </select>
          </div>

          <div className="extrude-dialog-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-confirm">
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExtrudeDialog;
