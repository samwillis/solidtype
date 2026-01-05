/**
 * Document Repository
 *
 * Database access layer for document-related queries.
 * Keep this file focused on data access - no business logic.
 */

import { db } from "../lib/db";
import { documents, branches } from "../db/schema";
import { eq } from "drizzle-orm";

export interface DocumentWithBranch {
  id: string;
  projectId: string;
  branchId: string;
  baseDocumentId: string | null;
  folderId: string | null;
  name: string;
  type: string;
  durableStreamId: string | null;
  featureCount: number;
  sortOrder: number;
  isDeleted: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  branch: {
    id: string;
    projectId: string;
    name: string;
    isMain: boolean;
  };
}

/**
 * Find a document by ID
 */
export async function findById(docId: string) {
  return db.query.documents.findFirst({
    where: eq(documents.id, docId),
  });
}

/**
 * Find a document with its branch information
 */
export async function findWithBranch(docId: string): Promise<DocumentWithBranch | null> {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, docId),
    with: {
      branch: {
        columns: {
          id: true,
          projectId: true,
          name: true,
          isMain: true,
        },
      },
    },
  });

  if (!doc || !doc.branch) return null;

  return {
    id: doc.id,
    projectId: doc.projectId,
    branchId: doc.branchId,
    baseDocumentId: doc.baseDocumentId,
    folderId: doc.folderId,
    name: doc.name,
    type: doc.type,
    durableStreamId: doc.durableStreamId,
    featureCount: doc.featureCount,
    sortOrder: doc.sortOrder,
    isDeleted: doc.isDeleted,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    branch: doc.branch,
  };
}

/**
 * Find a document with full branch and project info for access control
 */
export async function findWithProjectInfo(docId: string) {
  return db.query.documents.findFirst({
    where: eq(documents.id, docId),
    with: {
      branch: {
        with: {
          project: {
            columns: { id: true, workspaceId: true },
          },
        },
      },
    },
  });
}

/**
 * Get a branch by ID
 */
export async function getBranch(branchId: string) {
  return db.query.branches.findFirst({
    where: eq(branches.id, branchId),
  });
}

/**
 * List documents in a branch
 */
export async function listForBranch(branchId: string) {
  return db.query.documents.findMany({
    where: eq(documents.branchId, branchId),
  });
}
