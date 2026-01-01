/**
 * Folder Breadcrumbs Component
 * 
 * Displays breadcrumb navigation for folder hierarchy.
 * Each segment is clickable to navigate up the folder tree.
 */

import React, { useMemo } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { LuHouse, LuChevronRight, LuFolder } from 'react-icons/lu';
import { foldersCollection, type Folder } from '../lib/electric-collections';
import './FolderBreadcrumbs.css';

interface FolderBreadcrumbsProps {
  branchId: string;
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}

export const FolderBreadcrumbs: React.FC<FolderBreadcrumbsProps> = ({
  branchId,
  currentFolderId,
  onNavigate,
}) => {
  const { data: allFolders } = useLiveQuery(() => foldersCollection);

  // Build breadcrumb path from current folder to root
  const breadcrumbPath = useMemo(() => {
    if (!currentFolderId || !allFolders) return [];
    
    const path: Folder[] = [];
    let folderId: string | null = currentFolderId;
    
    // Walk up the folder tree
    while (folderId) {
      const folder = allFolders.find(
        (f) => f.id === folderId && f.branch_id === branchId
      );
      if (folder) {
        path.unshift(folder);
        folderId = folder.parent_id;
      } else {
        break;
      }
    }
    
    return path;
  }, [currentFolderId, allFolders, branchId]);

  // Don't show breadcrumbs if at root
  if (!currentFolderId) {
    return null;
  }

  return (
    <nav className="folder-breadcrumbs" aria-label="Folder navigation">
      <ol className="folder-breadcrumbs-list">
        {/* Root folder */}
        <li className="folder-breadcrumbs-item">
          <button
            className="folder-breadcrumbs-link"
            onClick={() => onNavigate(null)}
            type="button"
          >
            <LuHouse size={14} />
            <span>Root</span>
          </button>
        </li>

        {/* Folder path */}
        {breadcrumbPath.map((folder, index) => {
          const isLast = index === breadcrumbPath.length - 1;
          
          return (
            <li key={folder.id} className="folder-breadcrumbs-item">
              <LuChevronRight size={12} className="folder-breadcrumbs-separator" />
              {isLast ? (
                <span className="folder-breadcrumbs-current">
                  <LuFolder size={14} />
                  <span>{folder.name}</span>
                </span>
              ) : (
                <button
                  className="folder-breadcrumbs-link"
                  onClick={() => onNavigate(folder.id)}
                  type="button"
                >
                  <LuFolder size={14} />
                  <span>{folder.name}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default FolderBreadcrumbs;
