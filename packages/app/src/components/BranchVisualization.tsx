/**
 * Branch Visualization Component
 * 
 * Displays a tree/graph visualization of branches showing relationships.
 * Shows parent-child relationships and merge relationships.
 */

import React, { useMemo } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { branchesCollection } from '../lib/electric-collections';
import './BranchVisualization.css';

// Import Branch type from schema - using inline type for now

interface Branch {
  id: string;
  name: string;
  is_main: boolean;
  parent_branch_id: string | null;
  created_at: string;
  created_by: string;
  merged_at: string | null;
  merged_by: string | null;
}

interface BranchVisualizationProps {
  projectId: string;
  selectedBranchId?: string;
  onBranchSelect?: (branchId: string) => void;
}

export const BranchVisualization: React.FC<BranchVisualizationProps> = ({
  projectId,
  selectedBranchId,
  onBranchSelect,
}) => {
  const { data: allBranches } = useLiveQuery(() => branchesCollection);

  // Filter branches for this project
  const branches = useMemo(() => {
    if (!allBranches) return [];
    return allBranches.filter((b) => b.project_id === projectId);
  }, [allBranches, projectId]);

  // Build tree structure
  const branchTree = useMemo(() => {
    if (!branches || branches.length === 0) return null;

    const mainBranch = branches.find((b) => b.is_main);
    if (!mainBranch) return null;

    const branchMap = new Map<string, Branch & { children: Branch[] }>();
    
    // Initialize all branches with empty children arrays
    branches.forEach((branch) => {
      branchMap.set(branch.id, {
        ...branch,
        children: [],
      });
    });

    // Build parent-child relationships
    branches.forEach((branch) => {
      if (branch.parent_branch_id && branchMap.has(branch.parent_branch_id)) {
        const parent = branchMap.get(branch.parent_branch_id)!;
        const child = branchMap.get(branch.id)!;
        parent.children.push(child);
      }
    });

    // Sort children by creation date
    branchMap.forEach((branch) => {
      branch.children.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    return branchMap.get(mainBranch.id)!;
  }, [branches]);

  // Build branchMap for children rendering
  const branchMap = useMemo(() => {
    const map = new Map<string, Branch & { children: Branch[] }>();
    branches.forEach((branch) => {
      map.set(branch.id, {
        ...branch,
        children: [],
      });
    });
    branches.forEach((branch) => {
      if (branch.parent_branch_id && map.has(branch.parent_branch_id)) {
        const parent = map.get(branch.parent_branch_id)!;
        const child = map.get(branch.id)!;
        parent.children.push(child);
      }
    });
    // Sort children by creation date
    map.forEach((branch) => {
      branch.children.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
    return map;
  }, [branches]);

  if (!branchTree || branches.length === 0) {
    return (
      <div className="branch-visualization-empty">
        <p>No branches to display</p>
      </div>
    );
  }

  const renderBranch = (branch: Branch & { children: Branch[] }, level: number = 0): React.ReactNode => {
    const isSelected = branch.id === selectedBranchId;
    const isMain = branch.is_main;
    const hasMerged = branch.merged_at !== null;

    return (
      <div key={branch.id} className="branch-visualization-item">
        <div 
          className={`branch-visualization-node ${isSelected ? 'selected' : ''} ${isMain ? 'main' : ''} ${hasMerged ? 'merged' : ''}`}
          style={{ paddingLeft: `${level * 24 + 8}px` }}
          onClick={() => onBranchSelect?.(branch.id)}
        >
          <div className="branch-visualization-node-content">
            <div className="branch-visualization-node-indicator">
              {isMain ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              ) : hasMerged ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12h8" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              )}
            </div>
            <div className="branch-visualization-node-info">
              <span className="branch-visualization-node-name">{branch.name}</span>
              {isMain && <span className="branch-visualization-node-badge">main</span>}
              {hasMerged && <span className="branch-visualization-node-badge merged">merged</span>}
            </div>
          </div>
        </div>
        
        {branch.children.length > 0 && (
          <div className="branch-visualization-children">
            {branch.children.map((child) => {
              const childWithChildren = branchMap.get(child.id);
              if (!childWithChildren) return null;
              return renderBranch(childWithChildren, level + 1);
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="branch-visualization">
      <div className="branch-visualization-header">
        <h3 className="branch-visualization-title">Branches</h3>
      </div>
      <div className="branch-visualization-tree">
        {renderBranch(branchTree, 0)}
      </div>
    </div>
  );
};
