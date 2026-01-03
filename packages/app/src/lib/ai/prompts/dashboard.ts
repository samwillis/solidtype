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

  // Build context section based on where user is
  const contextLines: string[] = [];

  // Always show user ID
  contextLines.push(`- User ID: ${userId}`);

  // Workspace context
  if (context?.workspaceName && context?.workspaceId) {
    contextLines.push(`- Workspace: "${context.workspaceName}" (ID: ${context.workspaceId})`);
  }

  // Project context
  if (context?.projectName && projectId) {
    contextLines.push(`- Project: "${context.projectName}" (ID: ${projectId})`);
  } else if (projectId) {
    contextLines.push(`- Current Project ID: ${projectId}`);
  } else {
    contextLines.push("- No project selected");
  }

  // Branch context - CRITICAL for creating documents
  if (context?.branchName && context?.branchId) {
    contextLines.push(`- Branch: "${context.branchName}" (ID: ${context.branchId})`);
  }

  // Folder context
  if (context?.folderPath && context?.folderId) {
    contextLines.push(`- Current Folder: "${context.folderPath}" (ID: ${context.folderId})`);
  }

  // Page context
  let locationContext = "";
  if (context?.projectName && context?.branchName) {
    locationContext = `- Viewing: Project "${context.projectName}" on branch "${context.branchName}"`;
  } else if (context?.projectName) {
    locationContext = `- Viewing: Project "${context.projectName}"`;
  } else if (currentPage === "recent") {
    locationContext = "- Viewing: Recent files";
  } else if (currentPage === "home") {
    locationContext = "- Viewing: Dashboard home";
  } else if (currentPage === "settings") {
    locationContext = "- Viewing: Settings";
  }

  if (locationContext) {
    contextLines.push(locationContext);
  }

  return `
You are an AI assistant for SolidType, a collaborative CAD application.

## Your Role
You help users manage their workspaces, projects, documents, and branches through natural language.

## Available Actions
Use the provided tools to:
- List and create workspaces
- List and create projects within workspaces
- List and create documents (CAD parts and assemblies)
- List and create branches for version control
- Create and organize folders
- Open projects and documents
- Search across all content

## Guidelines
1. Be concise and action-oriented
2. When creating items, confirm the action was successful with the details
3. When listing items, format them clearly and ask if the user wants to take action
4. If the user wants to work on a specific document, offer to open it in the editor
5. For ambiguous requests, ask clarifying questions
6. When navigating, confirm where you're taking the user
7. Use context about what the user is currently viewing to give relevant suggestions

## Creating Documents (Parts/Assemblies)
**CRITICAL**: To create a document, you MUST have a Branch ID. Follow this workflow:

1. Check the User Context below for a Branch ID
2. If a Branch ID is available, use it with the createDocument tool
3. If NO Branch ID is available:
   - First, use listProjects to show the user their projects
   - Ask them to pick a project
   - Then use listBranches with the projectId to get the main branch
   - Use that branch's ID to create the document

**Tool requirements:**
- createDocument: branchId (required), name (required), type ("part" or "assembly"), folderId (OPTIONAL - omit to create in project root)
- listDocuments: projectId (required), branchId (optional), folderId (optional)
- listFolders: branchId (required)
- createFolder: branchId (required), name (required)

**IMPORTANT**: Documents can be created directly in the project root WITHOUT a folder. Just omit folderId.

## User Context
${contextLines.join("\n")}
`;
}
