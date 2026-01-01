/**
 * Branching utilities
 *
 * Handles branch creation, switching, and merging.
 */

import * as Y from "yjs";
import { db } from "./db";
import { branches, documents, folders } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Branch, Document } from "../db/schema";

const DURABLE_STREAMS_URL = process.env.DURABLE_STREAMS_URL || "http://localhost:3200";

/**
 * Create a new branch from an existing branch
 */
export async function createBranch(
  projectId: string,
  parentBranchId: string,
  branchName: string,
  userId: string,
  description?: string
): Promise<Branch> {
  // 1. Create branch record
  const [branch] = await db
    .insert(branches)
    .values({
      projectId,
      parentBranchId,
      name: branchName,
      description,
      isMain: false,
      forkedAt: new Date(),
      createdBy: userId,
      ownerId: userId,
    })
    .returning();

  // 2. Copy folders to new branch
  const parentFolders = await db.select().from(folders).where(eq(folders.branchId, parentBranchId));

  const folderIdMap = new Map<string, string>();

  for (const folder of parentFolders) {
    const newFolderId = crypto.randomUUID();
    folderIdMap.set(folder.id, newFolderId);

    await db.insert(folders).values({
      id: newFolderId,
      projectId: folder.projectId,
      branchId: branch.id,
      parentId: folder.parentId ? (folderIdMap.get(folder.parentId) ?? null) : null,
      name: folder.name,
      sortOrder: folder.sortOrder,
      createdBy: userId,
    });
  }

  // 3. Copy documents and fork their Yjs streams
  const parentDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.branchId, parentBranchId));

  for (const doc of parentDocs) {
    if (doc.isDeleted) continue;

    const newDurableStreamId = `project/${projectId}/doc/${doc.id}/branch/${branch.id}`;

    // Create new document record for this branch (same doc ID for merge tracking)
    await db.insert(documents).values({
      id: doc.id,
      projectId: doc.projectId,
      branchId: branch.id,
      folderId: doc.folderId ? (folderIdMap.get(doc.folderId) ?? null) : null,
      name: doc.name,
      type: doc.type,
      durableStreamId: newDurableStreamId,
      featureCount: doc.featureCount,
      sortOrder: doc.sortOrder,
      createdBy: userId,
    });

    // Fork the Yjs stream
    if (doc.durableStreamId) {
      await forkDurableStream(doc.durableStreamId, newDurableStreamId);
    }
  }

  return branch;
}

/**
 * Fork a Durable Stream by copying its current state to a new stream
 */
async function forkDurableStream(sourceStreamId: string, targetStreamId: string) {
  // Read full state from source stream
  const sourceUrl = new URL(`/v1/stream/${sourceStreamId}`, DURABLE_STREAMS_URL);
  sourceUrl.searchParams.set("offset", "-1");

  const sourceRes = await fetch(sourceUrl.toString());
  if (!sourceRes.ok) {
    console.error("Failed to read source stream:", sourceRes.statusText);
    return;
  }

  // Build a Yjs doc from the updates
  const doc = new Y.Doc();
  const data = await sourceRes.json();

  if (data.items) {
    for (const item of data.items) {
      const update = decodeUpdate(item);
      if (update) {
        Y.applyUpdate(doc, update);
      }
    }
  }

  // Write full document state as initial entry in target stream
  const fullState = Y.encodeStateAsUpdate(doc);
  const base64 = btoa(String.fromCharCode(...fullState));

  const targetUrl = new URL(`/v1/stream/${targetStreamId}`, DURABLE_STREAMS_URL);
  await fetch(targetUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: base64 }),
  });
}

/**
 * Merge a branch into another branch
 */
export async function mergeBranch(
  sourceBranchId: string,
  targetBranchId: string,
  userId: string
): Promise<MergeResult> {
  const [sourceBranch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, sourceBranchId))
    .limit(1);

  if (!sourceBranch) {
    throw new Error("Source branch not found");
  }

  const sourceDocsMap = new Map(
    (await db.select().from(documents).where(eq(documents.branchId, sourceBranchId))).map((d) => [
      d.id,
      d,
    ])
  );

  const targetDocsMap = new Map(
    (await db.select().from(documents).where(eq(documents.branchId, targetBranchId))).map((d) => [
      d.id,
      d,
    ])
  );

  const results: MergeDocResult[] = [];

  // Process each document in source branch
  for (const [docId, sourceDoc] of sourceDocsMap) {
    const targetDoc = targetDocsMap.get(docId);

    if (!targetDoc) {
      // Document created in source branch - add to target
      await copyDocumentToBranch(sourceDoc, targetBranchId, userId);
      results.push({ docId, action: "created" });
    } else if (targetDoc.isDeleted && !sourceDoc.isDeleted) {
      // Deleted in target but exists in source - RESTORE (edit wins)
      await restoreDocument(targetDoc.id, targetBranchId);
      if (sourceDoc.durableStreamId && targetDoc.durableStreamId) {
        await mergeYjsDocument(sourceDoc.durableStreamId, targetDoc.durableStreamId);
      }
      results.push({ docId, action: "restored" });
    } else if (!sourceDoc.isDeleted && !targetDoc.isDeleted) {
      // Both exist - merge Yjs states
      if (sourceDoc.durableStreamId && targetDoc.durableStreamId) {
        await mergeYjsDocument(sourceDoc.durableStreamId, targetDoc.durableStreamId);
      }
      results.push({ docId, action: "merged" });
    }
  }

  // Mark source branch as merged
  await db
    .update(branches)
    .set({
      mergedAt: new Date(),
      mergedBy: userId,
      mergedIntoBranchId: targetBranchId,
    })
    .where(eq(branches.id, sourceBranchId));

  return { branch: sourceBranch, results };
}

async function copyDocumentToBranch(doc: Document, targetBranchId: string, userId: string) {
  const newDurableStreamId = `project/${doc.projectId}/doc/${doc.id}/branch/${targetBranchId}`;

  await db.insert(documents).values({
    id: doc.id,
    projectId: doc.projectId,
    branchId: targetBranchId,
    folderId: null, // TODO: map folder IDs
    name: doc.name,
    type: doc.type,
    durableStreamId: newDurableStreamId,
    featureCount: doc.featureCount,
    sortOrder: doc.sortOrder,
    createdBy: userId,
  });

  if (doc.durableStreamId) {
    await forkDurableStream(doc.durableStreamId, newDurableStreamId);
  }
}

async function restoreDocument(docId: string, _branchId: string) {
  await db
    .update(documents)
    .set({
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    })
    .where(eq(documents.id, docId));
}

async function mergeYjsDocument(sourceStreamId: string, targetStreamId: string) {
  // Load source document state
  const sourceDoc = new Y.Doc();
  const sourceUrl = new URL(`/v1/stream/${sourceStreamId}`, DURABLE_STREAMS_URL);
  sourceUrl.searchParams.set("offset", "-1");

  const sourceRes = await fetch(sourceUrl.toString());
  if (!sourceRes.ok) return;

  const sourceData = await sourceRes.json();
  if (sourceData.items) {
    for (const item of sourceData.items) {
      const update = decodeUpdate(item);
      if (update) Y.applyUpdate(sourceDoc, update);
    }
  }

  // Load target document state
  const targetDoc = new Y.Doc();
  const targetUrl = new URL(`/v1/stream/${targetStreamId}`, DURABLE_STREAMS_URL);
  targetUrl.searchParams.set("offset", "-1");

  const targetRes = await fetch(targetUrl.toString());
  if (!targetRes.ok) return;

  const targetData = await targetRes.json();
  if (targetData.items) {
    for (const item of targetData.items) {
      const update = decodeUpdate(item);
      if (update) Y.applyUpdate(targetDoc, update);
    }
  }

  // Compute diff: changes in source that target doesn't have
  const diff = Y.encodeStateAsUpdate(sourceDoc, Y.encodeStateVector(targetDoc));

  // Append the diff to target stream
  if (diff.length > 0) {
    const base64 = btoa(String.fromCharCode(...diff));
    await fetch(targetUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: base64 }),
    });
  }
}

function decodeUpdate(item: unknown): Uint8Array | null {
  if (typeof item === "string") {
    try {
      const binary = atob(item);
      return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  } else if (item && typeof item === "object" && "data" in item) {
    return new Uint8Array(item.data as ArrayBuffer);
  }
  return null;
}

// Types
interface MergeDocResult {
  docId: string;
  action: "created" | "restored" | "merged";
}

interface MergeResult {
  branch: Branch;
  results: MergeDocResult[];
}

export type { MergeResult, MergeDocResult };
