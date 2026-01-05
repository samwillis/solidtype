/**
 * Merge Branch Dialog
 *
 * Dialog for merging one branch into another.
 * Uses Yjs CRDT merge with "edit wins" strategy.
 */

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { LuChevronDown, LuGitMerge, LuTriangleAlert } from "react-icons/lu";
import { useSession } from "../../lib/auth-client";
import { useLiveQuery, eq, createCollection, liveQueryCollectionOptions } from "@tanstack/react-db";
import { branchesCollection } from "../../lib/electric-collections";
import { mergeBranchMutation } from "../../lib/server-functions";
import { formatTimeAgo } from "../../lib/utils/format";
import { z } from "zod";
import "./CreateDialog.css";

const mergeSchema = z.object({
  targetBranchId: z.string().uuid("Target branch is required"),
});

interface MergeBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sourceBranchId: string;
  onSuccess?: () => void;
}

export const MergeBranchDialog: React.FC<MergeBranchDialogProps> = ({
  open,
  onOpenChange,
  projectId,
  sourceBranchId,
  onSuccess,
}) => {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mergePreview, setMergePreview] = useState<{
    documentsToMerge: number;
    documentsToRestore: number;
  } | null>(null);

  // Get available branches for this project
  const { data: allBranches } = useLiveQuery(() => {
    const projectBranchesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ branches: branchesCollection })
            .where(({ branches: b }) => eq(b.project_id, projectId))
            .orderBy(({ branches: b }) => b.is_main, "desc")
            .orderBy(({ branches: b }) => b.created_at, "desc"),
      })
    );
    return projectBranchesCollection;
  });

  // Get source and target branches info
  const sourceBranch = useMemo(
    () => allBranches?.find((b) => b.id === sourceBranchId),
    [allBranches, sourceBranchId]
  );

  // Available target branches (all except source branch)
  const targetBranches = useMemo(
    () => allBranches?.filter((b) => b.id !== sourceBranchId && !b.merged_at) || [],
    [allBranches, sourceBranchId]
  );

  // Default target: parent branch or main branch
  const defaultTargetId = useMemo(() => {
    if (sourceBranch?.parent_branch_id) {
      return sourceBranch.parent_branch_id;
    }
    const mainBranch = allBranches?.find((b) => b.is_main);
    return mainBranch?.id || "";
  }, [sourceBranch, allBranches]);

  const form = useForm({
    defaultValues: {
      targetBranchId: defaultTargetId,
    },
    onSubmit: async ({ value }) => {
      if (!session?.user?.id) {
        console.error("User not authenticated");
        return;
      }

      setIsSubmitting(true);
      try {
        await mergeBranchMutation({
          data: {
            sourceBranchId,
            targetBranchId: value.targetBranchId,
          },
        });

        form.reset();
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        console.error("Failed to merge branch:", error);
        // TODO: Show error toast/message
        alert(
          `Failed to merge branch: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Update default target when branches load
  useEffect(() => {
    if (open && defaultTargetId) {
      form.setFieldValue("targetBranchId", defaultTargetId);
    }
  }, [open, defaultTargetId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (defaultTargetId) {
        form.setFieldValue("targetBranchId", defaultTargetId);
      }
      setMergePreview(null);
    }
  }, [open]);

  // Check if source branch is already merged
  const isAlreadyMerged = sourceBranch?.merged_at !== null;
  const isMainBranch = sourceBranch?.is_main;

  if (!sourceBranch) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup">
          <Dialog.Title className="create-dialog-title">
            <LuGitMerge size={20} style={{ marginRight: "8px" }} />
            Merge Branch
          </Dialog.Title>
          <Dialog.Description className="create-dialog-description">
            Merge changes from <strong>{sourceBranch.name}</strong> into another branch.
            {isMainBranch && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  background: "var(--color-warning-bg)",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <LuTriangleAlert size={16} color="var(--color-warning)" />
                <span style={{ color: "var(--color-warning)" }}>
                  This is the main branch. Merging it into another branch is unusual.
                </span>
              </div>
            )}
            {isAlreadyMerged && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  background: "var(--color-info-bg)",
                  borderRadius: "4px",
                }}
              >
                This branch was already merged {formatTimeAgo(sourceBranch.merged_at!)}.
              </div>
            )}
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="create-dialog-form"
          >
            {/* Source Branch (read-only) */}
            <div className="create-dialog-field">
              <label className="create-dialog-label">Source Branch</label>
              <div className="create-dialog-input" style={{ background: "var(--color-muted-bg)" }}>
                {sourceBranch.name}
                {sourceBranch.is_main && (
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "11px",
                      background: "var(--color-primary)",
                      color: "white",
                      padding: "2px 6px",
                      borderRadius: "3px",
                    }}
                  >
                    main
                  </span>
                )}
              </div>
            </div>

            {/* Target Branch */}
            <form.Field
              name="targetBranchId"
              validators={{
                onChange: ({ value }) => {
                  const result = mergeSchema.shape.targetBranchId.safeParse(value);
                  return result.success ? undefined : result.error.issues[0]?.message;
                },
              }}
              children={(field) => (
                <div className="create-dialog-field">
                  <label htmlFor={field.name} className="create-dialog-label">
                    Merge Into <span className="create-dialog-required">*</span>
                  </label>
                  <Select.Root
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value || "")}
                    disabled={isSubmitting}
                  >
                    <Select.Trigger
                      id={field.name}
                      className="create-dialog-select-trigger"
                      aria-label="Select target branch"
                    >
                      {targetBranches?.find((b) => b.id === field.state.value)?.name ||
                        "Select branch..."}
                      <LuChevronDown size={12} />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Positioner className="create-dialog-select-positioner">
                        <Select.Popup className="create-dialog-select-popup">
                          {targetBranches && targetBranches.length > 0 ? (
                            targetBranches.map((branch) => (
                              <Select.Item
                                key={branch.id}
                                value={branch.id}
                                className="create-dialog-select-option"
                              >
                                {branch.name} {branch.is_main ? "(main)" : ""}
                              </Select.Item>
                            ))
                          ) : (
                            <div className="create-dialog-select-option" style={{ opacity: 0.6 }}>
                              No branches available
                            </div>
                          )}
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <div className="create-dialog-error">{field.state.meta.errors.join(", ")}</div>
                  )}
                </div>
              )}
            />

            {/* Merge Preview */}
            {mergePreview && (
              <div
                style={{
                  padding: "12px",
                  background: "var(--color-muted-bg)",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <div>Documents to merge: {mergePreview.documentsToMerge}</div>
                <div>Documents to restore: {mergePreview.documentsToRestore}</div>
              </div>
            )}

            {/* Info */}
            <div
              style={{
                padding: "12px",
                background: "var(--color-muted-bg)",
                borderRadius: "6px",
                fontSize: "13px",
                color: "var(--color-text-muted)",
              }}
            >
              <p style={{ margin: 0 }}>
                <strong>How merge works:</strong>
              </p>
              <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                <li>Documents edited in source are merged with CRDT (concurrent edits combine)</li>
                <li>Documents deleted in target but edited in source are restored</li>
                <li>Documents created in source are added to target</li>
              </ul>
            </div>

            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit]) => (
                <div className="create-dialog-actions">
                  <button
                    type="button"
                    className="create-dialog-button create-dialog-button-cancel"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="create-dialog-button create-dialog-button-submit"
                    disabled={!canSubmit || isSubmitting || targetBranches.length === 0}
                    style={{ background: "var(--color-success)" }}
                  >
                    {isSubmitting ? "Merging..." : "Merge Branch"}
                  </button>
                </div>
              )}
            />
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
