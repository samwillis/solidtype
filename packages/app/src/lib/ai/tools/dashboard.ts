/**
 * Dashboard Tool Definitions
 *
 * Tool definitions for dashboard operations (workspaces, projects, documents, branches).
 * These are Zod schemas that define the tool interfaces.
 */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============ Workspace Tools ============

export const listWorkspacesDef = toolDefinition({
  name: "listWorkspaces",
  description: "List all workspaces the user has access to",
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(["owner", "admin", "member"]),
    })
  ),
});

export const createWorkspaceDef = toolDefinition({
  name: "createWorkspace",
  description: "Create a new workspace",
  inputSchema: z.object({
    name: z.string().min(1).max(100),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().max(500).optional(),
  }),
  outputSchema: z.object({
    workspaceId: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
});

export const getWorkspaceDef = toolDefinition({
  name: "getWorkspace",
  description: "Get details about a specific workspace",
  inputSchema: z.object({
    workspaceId: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    memberCount: z.number(),
    projectCount: z.number(),
  }),
});

// ============ Project Tools ============

export const listProjectsDef = toolDefinition({
  name: "listProjects",
  description: "List projects, optionally filtered by workspace",
  inputSchema: z.object({
    workspaceId: z.string().optional(),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      workspaceId: z.string(),
      workspaceName: z.string(),
      updatedAt: z.string(),
    })
  ),
});

export const createProjectDef = toolDefinition({
  name: "createProject",
  description: "Create a new project in a workspace",
  inputSchema: z.object({
    workspaceId: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    name: z.string(),
  }),
});

export const openProjectDef = toolDefinition({
  name: "openProject",
  description: "Navigate to a project to view its contents",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    url: z.string(),
    navigated: z.boolean(),
  }),
});

export const getProjectDef = toolDefinition({
  name: "getProject",
  description: "Get details about a specific project",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    workspaceId: z.string(),
    workspaceName: z.string(),
    branchCount: z.number(),
    documentCount: z.number(),
    updatedAt: z.string(),
  }),
});

// ============ Document Tools ============

export const listDocumentsDef = toolDefinition({
  name: "listDocuments",
  description: "List documents in a project. Only projectId is required.",
  inputSchema: z.object({
    projectId: z.string().describe("The project ID"),
    branchId: z.string().nullish().describe("Optional - defaults to main branch"),
    folderId: z.string().nullish().describe("Optional - omit to list root documents"),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["part", "assembly"]),
      updatedAt: z.string(),
      folderId: z.string().optional(),
    })
  ),
});

export const createDocumentDef = toolDefinition({
  name: "createDocument",
  description:
    "Create a new CAD document (part or assembly) at the project root. Only 2 parameters needed: branchId and name.",
  inputSchema: z.object({
    branchId: z.string().describe("The branch ID - get from context or listBranches"),
    name: z.string().min(1).max(100).describe("Document name"),
    type: z.enum(["part", "assembly"]).default("part").describe("'part' (default) or 'assembly'"),
    folderId: z
      .string()
      .nullish() // Accept string, null, or undefined
      .describe("DO NOT USE - leave empty to create at project root"),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    name: z.string(),
  }),
});

export const openDocumentDef = toolDefinition({
  name: "openDocument",
  description: "Open a document in the CAD editor",
  inputSchema: z.object({
    documentId: z.string(),
  }),
  outputSchema: z.object({
    url: z.string(),
    navigated: z.boolean(),
  }),
});

export const renameDocumentDef = toolDefinition({
  name: "renameDocument",
  description: "Rename a document",
  inputSchema: z.object({
    documentId: z.string(),
    newName: z.string().min(1).max(100),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    name: z.string(),
  }),
});

export const moveDocumentDef = toolDefinition({
  name: "moveDocument",
  description: "Move a document to a different folder",
  inputSchema: z.object({
    documentId: z.string(),
    folderId: z.string().nullable(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

export const deleteDocumentDef = toolDefinition({
  name: "deleteDocument",
  description: "Delete a document (requires confirmation)",
  inputSchema: z.object({
    documentId: z.string(),
    confirm: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

// ============ Branch Tools ============

export const listBranchesDef = toolDefinition({
  name: "listBranches",
  description: "List branches in a project",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isMain: z.boolean(),
      createdAt: z.string(),
    })
  ),
});

export const createBranchDef = toolDefinition({
  name: "createBranch",
  description: "Create a new branch from an existing branch",
  inputSchema: z.object({
    projectId: z.string(),
    parentBranchId: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
  }),
  outputSchema: z.object({
    branchId: z.string(),
    name: z.string(),
  }),
});

export const switchBranchDef = toolDefinition({
  name: "switchBranch",
  description: "Switch to a different branch",
  inputSchema: z.object({
    branchId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branchName: z.string(),
  }),
});

export const deleteBranchDef = toolDefinition({
  name: "deleteBranch",
  description: "Delete a branch (cannot delete main branch)",
  inputSchema: z.object({
    branchId: z.string(),
    confirm: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branchName: z.string(),
  }),
});

export const mergeBranchDef = toolDefinition({
  name: "mergeBranch",
  description: "Merge a source branch into a target branch. Returns conflicts if any exist.",
  inputSchema: z.object({
    sourceBranchId: z.string(),
    targetBranchId: z.string(),
    dryRun: z.boolean().optional().describe("If true, only check for conflicts without merging"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    merged: z.boolean(),
    conflicts: z.array(
      z.object({
        documentId: z.string(),
        documentName: z.string(),
        type: z.enum(["modified-both", "deleted-modified", "modified-deleted"]),
      })
    ),
    mergedDocumentCount: z.number(),
  }),
});

export const resolveMergeConflictDef = toolDefinition({
  name: "resolveMergeConflict",
  description: "Resolve a merge conflict by choosing which version to keep",
  inputSchema: z.object({
    sourceBranchId: z.string(),
    targetBranchId: z.string(),
    documentId: z.string(),
    resolution: z.enum(["keep-source", "keep-target", "keep-both"]),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    documentName: z.string(),
  }),
});

export const getBranchDiffDef = toolDefinition({
  name: "getBranchDiff",
  description: "Get a summary of differences between two branches",
  inputSchema: z.object({
    sourceBranchId: z.string(),
    targetBranchId: z.string(),
  }),
  outputSchema: z.object({
    added: z.array(z.object({ id: z.string(), name: z.string() })),
    modified: z.array(z.object({ id: z.string(), name: z.string() })),
    deleted: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

// ============ Folder Tools ============

export const listFoldersDef = toolDefinition({
  name: "listFolders",
  description: "List folders in a branch. Only branchId is required.",
  inputSchema: z.object({
    branchId: z.string().describe("The branch ID"),
    parentFolderId: z.string().nullish().describe("Optional - omit to list root folders"),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      parentId: z.string().optional(),
    })
  ),
});

export const createFolderDef = toolDefinition({
  name: "createFolder",
  description:
    "Create a folder to organize documents at project root. Only 2 parameters needed: branchId and name.",
  inputSchema: z.object({
    branchId: z.string().describe("The branch ID"),
    name: z.string().min(1).max(100).describe("Folder name"),
    parentFolderId: z.string().nullish().describe("DO NOT USE - leave empty to create at root"),
  }),
  outputSchema: z.object({
    folderId: z.string(),
    name: z.string(),
  }),
});

export const renameFolderDef = toolDefinition({
  name: "renameFolder",
  description: "Rename a folder",
  inputSchema: z.object({
    folderId: z.string(),
    newName: z.string().min(1).max(100),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    name: z.string(),
  }),
});

export const deleteFolderDef = toolDefinition({
  name: "deleteFolder",
  description: "Delete an empty folder",
  inputSchema: z.object({
    folderId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

// ============ Search Tools ============

export const searchDocumentsDef = toolDefinition({
  name: "searchDocuments",
  description: "Search for documents by name across all accessible projects",
  inputSchema: z.object({
    query: z.string().min(1),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      projectId: z.string(),
      projectName: z.string(),
      workspaceName: z.string(),
    })
  ),
});

export const searchProjectsDef = toolDefinition({
  name: "searchProjects",
  description: "Search for projects by name",
  inputSchema: z.object({
    query: z.string().min(1),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      workspaceId: z.string(),
      workspaceName: z.string(),
    })
  ),
});

// Export all dashboard tool definitions
export const dashboardToolDefs = [
  // Workspaces
  listWorkspacesDef,
  createWorkspaceDef,
  getWorkspaceDef,
  // Projects
  listProjectsDef,
  createProjectDef,
  openProjectDef,
  getProjectDef,
  // Documents
  listDocumentsDef,
  createDocumentDef,
  openDocumentDef,
  renameDocumentDef,
  moveDocumentDef,
  deleteDocumentDef,
  // Branches
  listBranchesDef,
  createBranchDef,
  switchBranchDef,
  deleteBranchDef,
  mergeBranchDef,
  resolveMergeConflictDef,
  getBranchDiffDef,
  // Folders
  listFoldersDef,
  createFolderDef,
  renameFolderDef,
  deleteFolderDef,
  // Search
  searchDocumentsDef,
  searchProjectsDef,
];
