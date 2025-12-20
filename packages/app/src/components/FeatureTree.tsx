import React, { useState } from 'react';
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

// Mock data for the feature tree
const mockTreeData: TreeNode[] = [
  {
    id: 'bodies',
    name: 'Bodies',
    type: 'bodies-folder',
    expanded: true,
    children: [
      { id: 'body-1', name: 'Body1', type: 'body' },
    ],
  },
  {
    id: 'part',
    name: 'Part1',
    type: 'part',
    expanded: true,
    children: [
      { id: 'origin', name: 'Origin', type: 'origin' },
      { id: 'plane-xy', name: 'XY Plane (Top)', type: 'plane' },
      { id: 'plane-xz', name: 'XZ Plane (Front)', type: 'plane' },
      { id: 'plane-yz', name: 'YZ Plane (Right)', type: 'plane' },
      { id: 'sketch-1', name: 'Sketch1', type: 'sketch' },
      { id: 'extrude-1', name: 'Extrude1', type: 'extrude' },
      { id: 'sketch-2', name: 'Sketch2', type: 'sketch' },
      { id: 'extrude-2', name: 'Extrude2', type: 'extrude' },
      { id: 'fillet-1', name: 'Fillet1', type: 'fillet' },
      { id: 'sketch-3', name: 'Sketch3', type: 'sketch', suppressed: true },
      { id: 'revolve-1', name: 'Revolve1', type: 'revolve', suppressed: true },
    ],
  },
];

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  expandedNodes: Set<string>;
  selectedId: string | null;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  level,
  expandedNodes,
  selectedId,
  onToggleExpand,
  onSelect,
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <>
      <li
        className={`tree-item ${isSelected ? 'selected' : ''} ${node.suppressed ? 'suppressed' : ''}`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(node.id)}
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
      </li>
      {hasChildren && isExpanded && (
        <ul className="tree-children">
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              selectedId={selectedId}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </>
  );
};

const FeatureTree: React.FC = () => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Initially expand nodes marked as expanded in mock data
    const expanded = new Set<string>();
    const collectExpanded = (nodes: TreeNode[]) => {
      nodes.forEach((node) => {
        if (node.expanded) expanded.add(node.id);
        if (node.children) collectExpanded(node.children);
      });
    };
    collectExpanded(mockTreeData);
    return expanded;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleToggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  return (
    <div className="feature-tree">
      <div className="panel-header">Features</div>
      <div className="feature-tree-content">
        <ul className="tree-list">
          {mockTreeData.map((node) => (
            <TreeNodeItem
              key={node.id}
              node={node}
              level={0}
              expandedNodes={expandedNodes}
              selectedId={selectedId}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelect}
            />
          ))}
        </ul>
      </div>
    </div>
  );
};

export default FeatureTree;
