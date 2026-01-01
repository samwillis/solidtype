/**
 * Move Dialog
 *
 * Dialog for moving documents or folders to another folder within the same branch
 */

import React, { useState, useMemo } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useLiveQuery, createCollection, liveQueryCollectionOptions, eq } from "@tanstack/react-db";
import { foldersCollection } from "../../lib/electric-collections";
import { updateDocumentMutation, updateFolderMutation } from "../../lib/server-functions";
import { LuFolder, LuFolderOpen } from "react-icons/lu";
import "./CreateDialog.css";
import "./MoveDialog.css";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  itemId: string;
  itemType: "document" | "folder";
  itemName: string;
  currentFolderId: string | null;
  onSuccess?: () => void;
}

export const MoveDialog: React.FC<MoveDialogProps> = ({
  open,
  onOpenChange,
  branchId,
  itemId,
  itemType,
  itemName,
  currentFolderId,
  onSuccess,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);
  const [isMoving, setIsMoving] = useState(false);

  // Reset selected folder when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setSelectedFolderId(currentFolderId);
    } else {
      setSelectedFolderId(null);
    }
  }, [open, currentFolderId]);

  // Load all folders for this branch
  const { data: allFolders } = useLiveQuery(() => {
    return createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ folders: foldersCollection })
            .where(({ folders: f }) => eq(f.branch_id, branchId)),
      })
    );
  });

  // Build folder tree structure
  const folderTree = useMemo(() => {
    if (!allFolders) return [];

    // Filter out the current folder if moving a folder (can't move into itself or its children)
    const validFolders =
      itemType === "folder"
        ? allFolders.filter((f) => f.id !== itemId && f.parent_id !== itemId)
        : allFolders;

    // Build tree structure
    const buildTree = (
      parentId: string | null,
      level: number = 0
    ): Array<{ folder: (typeof allFolders)[0]; level: number }> => {
      const children = validFolders.filter((f) => f.parent_id === parentId);
      const result: Array<{ folder: (typeof allFolders)[0]; level: number }> = [];

      for (const folder of children) {
        result.push({ folder, level });
        result.push(...buildTree(folder.id, level + 1));
      }

      return result;
    };

    return buildTree(null);
  }, [allFolders, itemId, itemType]);

  const handleMove = async () => {
    setIsMoving(true);
    try {
      if (itemType === "document") {
        await updateDocumentMutation({
          data: {
            documentId: itemId,
            updates: {
              folderId: selectedFolderId ?? null,
            },
          },
        });
      } else {
        await updateFolderMutation({
          data: {
            folderId: itemId,
            updates: {
              parentId: selectedFolderId ?? null,
            },
          },
        });
      }

      onOpenChange(false);
      setSelectedFolderId(null);
      onSuccess?.();
    } catch (error) {
      console.error("Failed to move item:", error);
      alert("Failed to move item. Please try again.");
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup move-dialog">
          <Dialog.Title className="create-dialog-title">
            Move {itemType === "document" ? "Document" : "Folder"}
          </Dialog.Title>
          <Dialog.Description className="create-dialog-description">
            Move &quot;{itemName}&quot; to a different folder
          </Dialog.Description>

          <div className="move-dialog-content">
            <div className="move-dialog-folder-list">
              <button
                className={`move-dialog-folder-option ${selectedFolderId === null ? "selected" : ""}`}
                onClick={() => setSelectedFolderId(null)}
              >
                <LuFolderOpen size={16} />
                <span>Root (no folder)</span>
              </button>

              {folderTree.map(({ folder, level }) => (
                <button
                  key={folder.id}
                  className={`move-dialog-folder-option ${selectedFolderId === folder.id ? "selected" : ""}`}
                  onClick={() => setSelectedFolderId(folder.id)}
                  style={{ paddingLeft: `${12 + level * 20}px` }}
                >
                  <LuFolder size={16} />
                  <span>{folder.name}</span>
                </button>
              ))}

              {folderTree.length === 0 && <p className="move-dialog-empty">No folders available</p>}
            </div>

            <div className="create-dialog-actions">
              <button
                type="button"
                className="create-dialog-button create-dialog-button-cancel"
                onClick={() => {
                  onOpenChange(false);
                  setSelectedFolderId(null);
                }}
                disabled={isMoving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="create-dialog-button create-dialog-button-submit"
                onClick={handleMove}
                disabled={isMoving || selectedFolderId === currentFolderId}
              >
                {isMoving ? "Moving..." : "Move"}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
