import React, { useState, useMemo, useCallback } from 'react';
import { useDocument } from '../contexts/DocumentContext';
import { useKernel } from '../contexts/KernelContext';
import { useSelection } from '../contexts/SelectionContext';
import type { Feature, FeatureType } from '../types/document';
import type { FeatureStatus } from '../worker/types';
import './FeatureTree.css';

// Tree node types
type NodeType =
  | 'bodies-folder'
  | 'body'
  | 'part'
  | 'origin'
  | 'plane'
  | 'sketch'
  | 'extrude'
  | 'revolve'
  | 'fillet'
  | 'chamfer'
  | 'boolean';

interface TreeNode {
  id: string;
  name: string;
  type: NodeType;
  children?: TreeNode[];
  expanded?: boolean;
  suppressed?: boolean;
  gated?: boolean;
  status?: FeatureStatus;
  errorMessage?: string;
}

// Map feature types to node types
function featureTypeToNodeType(type: FeatureType): NodeType {
  switch (type) {
    case 'origin':
      return 'origin';
    case 'plane':
      return 'plane';
    case 'sketch':
      return 'sketch';
    case 'extrude':
      return 'extrude';
    case 'revolve':
      return 'revolve';
    default:
      return 'part';
  }
}

// Convert features to tree nodes
function featuresToTreeNodes(
  features: Feature[],
  rebuildGate: string | null,
  kernelStatus: Record<string, FeatureStatus>,
  errorsByFeature: Record<string, string>,
  bodies: Array<{ id: string; featureId: string }>
): TreeNode[] {
  // Find the gate index
  let gateIndex = -1;
  if (rebuildGate) {
    gateIndex = features.findIndex(f => f.id === rebuildGate);
  }

  // Build the feature list nodes
  const featureNodes: TreeNode[] = features.map((feature, index) => {
    const isGatedByGate = gateIndex !== -1 && index > gateIndex;
    const status = kernelStatus[feature.id];
    const errorMessage = errorsByFeature[feature.id];
    const gated = status === 'gated' ? true : isGatedByGate;
    const suppressed = status === 'suppressed' ? true : Boolean(feature.suppressed);
    return {
      id: feature.id,
      name: feature.name || feature.id,
      type: featureTypeToNodeType(feature.type),
      suppressed,
      gated,
      status,
      errorMessage,
    };
  });

  // Create the part node with feature children
  const partNode: TreeNode = {
    id: 'part',
    name: 'Part1',
    type: 'part',
    expanded: true,
    children: featureNodes,
  };

  // Bodies folder
  const bodiesFolder: TreeNode = {
    id: 'bodies',
    name: 'Bodies',
    type: 'bodies-folder',
    expanded: true,
    children: bodies.map((b) => ({
      id: b.id,
      name: b.id,
      type: 'body',
      status: 'computed',
      errorMessage: errorsByFeature[b.featureId],
    })),
  };

  return [bodiesFolder, partNode];
}

// Icons for each node type
const NodeIcon: React.FC<{ type: NodeType }> = ({ type }) => {
  switch (type) {
    case 'bodies-folder':
      return (
        <svg className="tree-icon tree-icon-bodies" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      );
    case 'body':
      return (
        <svg className="tree-icon tree-icon-body" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'part':
      return (
        <svg className="tree-icon tree-icon-part" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      );
    case 'origin':
      return (
        <svg className="tree-icon tree-icon-origin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
        </svg>
      );
    case 'plane':
      return (
        <svg className="tree-icon tree-icon-plane" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6l8 4 8-4" />
          <path d="M4 6v8l8 4 8-4V6" />
        </svg>
      );
    case 'sketch':
      return (
        <svg className="tree-icon tree-icon-sketch" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        </svg>
      );
    case 'extrude':
      return (
        <svg className="tree-icon tree-icon-extrude" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2v10" />
          <path d="M5 12l7-4 7 4" />
          <path d="M5 12v6l7 4 7-4v-6" />
        </svg>
      );
    case 'revolve':
      return (
        <svg className="tree-icon tree-icon-revolve" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 12a9 9 0 11-9-9" />
          <path d="M12 3v9l5 5" />
        </svg>
      );
    case 'fillet':
      return (
        <svg className="tree-icon tree-icon-fillet" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 19h8a8 8 0 008-8V3" />
        </svg>
      );
    case 'chamfer':
      return (
        <svg className="tree-icon tree-icon-chamfer" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 19h8l8-8V3" />
        </svg>
      );
    case 'boolean':
      return (
        <svg className="tree-icon tree-icon-boolean" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="9" cy="9" r="6" />
          <circle cx="15" cy="15" r="6" />
        </svg>
      );
    default:
      return null;
  }
};

// Expand/collapse chevron
const Chevron: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg
    className={`tree-chevron ${expanded ? 'expanded' : ''}`}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// Rebuild gate bar component
const RebuildGateBar: React.FC<{
  afterFeatureId: string | null;
  onDragStart: () => void;
}> = ({ afterFeatureId, onDragStart }) => {
  return (
    <div
      className="rebuild-gate-bar"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', afterFeatureId || 'top');
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      title="Drag to change rebuild position"
    >
      <div className="rebuild-gate-line" />
      <div className="rebuild-gate-handle">⊣</div>
    </div>
  );
};

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  expandedNodes: Set<string>;
  selectedId: string | null;
  rebuildGate: string | null;
  showGateAfter: boolean;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onGateDrop: (afterId: string | null) => void;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  level,
  expandedNodes,
  selectedId,
  rebuildGate,
  showGateAfter,
  onToggleExpand,
  onSelect,
  onHover,
  onGateDrop,
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedId === node.id;
  const [isDragOver, setIsDragOver] = useState(false);
  const isError = Boolean(node.errorMessage) || node.status === 'error';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // Drop sets gate to this feature
    onGateDrop(node.id);
  }, [node.id, onGateDrop]);

  return (
    <>
      <li
        className={`tree-item ${isSelected ? 'selected' : ''} ${node.suppressed ? 'suppressed' : ''} ${node.gated ? 'gated' : ''} ${isError ? 'error' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(node.id)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {hasChildren ? (
          <span
            className="tree-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            <Chevron expanded={isExpanded} />
          </span>
        ) : (
          <span className="tree-expand-placeholder" />
        )}
        <NodeIcon type={node.type} />
        <span className="tree-item-name">{node.name}</span>
        {isError && (
          <span className="tree-item-badge tree-item-badge-error" title={node.errorMessage || 'Build error'}>
            !
          </span>
        )}
        {node.gated && !isError && (
          <span className="tree-item-badge tree-item-badge-gated" title="Gated by rebuild gate">
            ⏸
          </span>
        )}
      </li>
      {/* Show rebuild gate bar after this item if it's the gate position */}
      {showGateAfter && rebuildGate === node.id && (
            <RebuildGateBar
              afterFeatureId={node.id}
              onDragStart={() => {}}
            />
      )}
      {hasChildren && isExpanded && (
        <ul className="tree-children">
          {node.children!.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                level={level + 1}
                expandedNodes={expandedNodes}
                selectedId={selectedId}
                rebuildGate={rebuildGate}
                showGateAfter={true}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                onHover={onHover}
                onGateDrop={onGateDrop}
              />
          ))}
          {/* Show gate at end if no gate is set */}
          {rebuildGate === null && (
            <RebuildGateBar
              afterFeatureId={null}
              onDragStart={() => {}}
            />
          )}
        </ul>
      )}
    </>
  );
};

const FeatureTree: React.FC = () => {
  const { features, rebuildGate, setRebuildGate } = useDocument();
  const { featureStatus, errors, bodies } = useKernel();
  const { selectedFeatureId, selectFeature, setHoveredFeature } = useSelection();

  const errorsByFeature = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of errors) {
      map[e.featureId] = e.message;
    }
    return map;
  }, [errors]);

  // Convert features to tree structure
  const treeData = useMemo(() => {
    return featuresToTreeNodes(
      features,
      rebuildGate,
      featureStatus,
      errorsByFeature,
      bodies.map((b) => ({ id: b.id, featureId: b.featureId }))
    );
  }, [features, rebuildGate, featureStatus, errorsByFeature, bodies]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Initially expand part and bodies folder
    return new Set(['part', 'bodies']);
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    // Don't select folder nodes
    if (id === 'part' || id === 'bodies') return;
    selectFeature(id);
  }, [selectFeature]);

  const handleHover = useCallback((id: string | null) => {
    // Don't track hover for folder nodes
    if (id === 'part' || id === 'bodies') {
      setHoveredFeature(null);
      return;
    }
    setHoveredFeature(id);
  }, [setHoveredFeature]);

  const handleGateDrop = useCallback((afterId: string | null) => {
    setRebuildGate(afterId);
  }, [setRebuildGate]);

  return (
    <div className="feature-tree">
      <div className="panel-header">Features</div>
      <div className="feature-tree-content">
        <ul className="tree-list">
          {treeData.map((node) => (
            <TreeNodeItem
              key={node.id}
              node={node}
              level={0}
              expandedNodes={expandedNodes}
              selectedId={selectedFeatureId}
              rebuildGate={rebuildGate}
              showGateAfter={false}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelect}
              onHover={handleHover}
              onGateDrop={handleGateDrop}
            />
          ))}
        </ul>
      </div>
    </div>
  );
};

export default FeatureTree;
