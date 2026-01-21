/**
 * Dashboard System Prompt
 *
 * System prompt for AI assistant in dashboard context.
 */

export interface DashboardContext {
  userId: string;
  projectId?: string;
  workspaceId?: string;
  workspaceName?: string;
  projectName?: string;
  branchId?: string;
  branchName?: string;
  folderId?: string;
  folderPath?: string;
  currentPage?: "home" | "recent" | "project" | "branch" | "settings";
}

export function buildDashboardSystemPrompt(
  userId: string,
  projectId?: string,
  context?: Partial<DashboardContext>
): string {
  const currentPage = context?.currentPage || "home";

  // Build location description
  let locationDescription = "";
  if (context?.projectName && context?.branchName) {
    locationDescription = `Project "${context.projectName}" on branch "${context.branchName}"`;
  } else if (context?.projectName) {
    locationDescription = `Project "${context.projectName}"`;
  } else if (currentPage === "recent") {
    locationDescription = "Recent files";
  } else if (currentPage === "home") {
    locationDescription = "Dashboard home";
  } else if (currentPage === "settings") {
    locationDescription = "Settings";
  } else {
    locationDescription = "Dashboard";
  }

  // Build the current context block - placed FIRST for visibility
  // Use a clear, structured format that's easy for the LLM to parse
  const hasProjectContext = !!(context?.projectName && projectId);
  const hasProjectIdOnly = !!projectId && !context?.projectName;
  const hasBranchContext = !!(context?.branchId && context?.branchName);

  let currentContextBlock = "";
  if (hasProjectContext || hasBranchContext) {
    currentContextBlock = `
## CURRENT CONTEXT (Use these IDs when available)

You are viewing: ${locationDescription}

`;
    if (context?.workspaceName && context?.workspaceId) {
      currentContextBlock += `WORKSPACE: "${context.workspaceName}" → workspaceId: "${context.workspaceId}"
`;
    }
    if (context?.projectName && projectId) {
      currentContextBlock += `PROJECT: "${context.projectName}" → projectId: "${projectId}"
`;
    }
    if (context?.branchId && context?.branchName) {
      currentContextBlock += `BRANCH: "${context.branchName}" → branchId: "${context.branchId}"
`;
    }
    if (context?.folderPath && context?.folderId) {
      currentContextBlock += `FOLDER: "${context.folderPath}" → folderId: "${context.folderId}"
`;
    }
  } else if (hasProjectIdOnly) {
    // We have a projectId but no project details - still useful for tool calls
    currentContextBlock = `
## CURRENT CONTEXT

You are viewing: ${locationDescription}
PROJECT ID: "${projectId}" (use with listBranches to get the branch, then create documents)

`;
  } else {
    currentContextBlock = `
## CURRENT CONTEXT

You are viewing: ${locationDescription}
No project or branch is currently selected.

`;
  }

  // Build creation instructions based on available context
  let creationInstructions = "";
  if (hasBranchContext && context?.branchId) {
    // Branch ID is available - direct instruction to use it
    creationInstructions = `
## Creating Documents

Since you have the branch context, you can create documents directly:

**To create a document:** Use \`createDocument\` with:
- \`branchId\`: "${context.branchId}" (REQUIRED - use this exact value)
- \`name\`: The document name (REQUIRED)
- \`type\`: "part" or "assembly" (defaults to "part")

**DO NOT include folderId** - documents are created at the project root by default.
Only include folderId if the user specifically asks to put the document in a folder.

Example: createDocument({ branchId: "${context.branchId}", name: "Part B", type: "part" })
`;
  } else if ((hasProjectContext || hasProjectIdOnly) && projectId) {
    // Project but no branch - need to get branch first
    creationInstructions = `
## Creating Documents

You have project context but need the branch ID:

1. Call \`listBranches\` with projectId: "${projectId}"
2. Use the main branch's ID with \`createDocument\`

**Do NOT guess or make up branch IDs** - always get them from listBranches first.
`;
  } else {
    // No context - need full workflow
    creationInstructions = `
## Creating Documents

No project is currently selected. To create a document:

1. Ask the user which project they want to use, OR call \`listProjects\` to show options
2. Once you have a projectId, call \`listBranches\` to get the main branch
3. Use that branchId with \`createDocument\`

**Do NOT guess or make up project/branch IDs** - always get them from tools first.
`;
  }

  return `You are an AI assistant for SolidType, a collaborative CAD application.
${currentContextBlock}${creationInstructions}
## Your Role
Help users manage their workspaces, projects, documents, and branches through natural language.

## Available Actions
- List and create workspaces, projects, documents (parts/assemblies)
- List and create branches for version control
- Create and organize folders
- Open projects and documents
- Search across all content

## Guidelines
1. Be concise and action-oriented
2. When creating items, confirm success with details
3. When listing items, format clearly and ask if user wants to take action
4. For ambiguous requests, ask clarifying questions
5. **CRITICAL**: Always use IDs from the CURRENT CONTEXT above or from tool results - never invent UUIDs

## Tool Reference
- \`createDocument\`: branchId (required), name (required), type ("part"/"assembly") - **omit folderId for root level**
- \`listDocuments\`: projectId (required), branchId (optional), folderId (optional)
- \`listBranches\`: projectId (required) - use to get branchId when not in context
- \`listFolders\`: branchId (required)
- \`createFolder\`: branchId (required), name (required)
`;
}
