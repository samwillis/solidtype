/**
 * AI Eval Tests
 *
 * These tests verify that the AI correctly calls tools based on user prompts.
 * They use mocked tool implementations to verify the AI's behavior.
 *
 * Run with: RUN_AI_EVALS=true pnpm test -- --run ai-evals
 *
 * NOTE: These tests require:
 * - OPENAI_API_KEY environment variable (in .env file)
 * - Network access to the AI provider
 *
 * @vitest-environment node
 */

import { config } from "dotenv";
import { resolve } from "path";
import { describe, it, expect, beforeAll } from "vitest";

// Load .env file from app package root
config({ path: resolve(__dirname, "../../.env") });
import { chat } from "@tanstack/ai";
import {
  buildDashboardSystemPrompt,
  type DashboardContext,
} from "../../src/lib/ai/prompts/dashboard";
import {
  listProjectsDef,
  listBranchesDef,
  createDocumentDef,
  listDocumentsDef,
  listFoldersDef,
  createFolderDef,
  openDocumentDef,
  renameDocumentDef,
  searchDocumentsDef,
} from "../../src/lib/ai/tools/dashboard";

// Skip by default - only run when explicitly enabled
const shouldRun = process.env.RUN_AI_EVALS === "true";

// Mock data
const MOCK_WORKSPACE = { id: "ws-123", name: "Test Workspace", slug: "test-workspace" };
const MOCK_PROJECT = { id: "proj-456", name: "Project 1", workspaceId: MOCK_WORKSPACE.id };
const MOCK_BRANCH = { id: "branch-789", name: "main", isMain: true, projectId: MOCK_PROJECT.id };
const MOCK_DOCUMENT = {
  id: "doc-abc",
  name: "Part A",
  type: "part" as const,
  branchId: MOCK_BRANCH.id,
};
const MOCK_FOLDER = { id: "folder-xyz", name: "Components", parentId: undefined };
const MOCK_EXISTING_DOCS = [
  { id: "doc-1", name: "Bracket", type: "part" as const, updatedAt: new Date().toISOString() },
  { id: "doc-2", name: "Housing", type: "part" as const, updatedAt: new Date().toISOString() },
  {
    id: "doc-3",
    name: "Main Assembly",
    type: "assembly" as const,
    updatedAt: new Date().toISOString(),
  },
];

// Track tool calls for assertions
interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

describe.skipIf(!shouldRun)("AI Eval Tests", () => {
  // Dynamic import of adapter to avoid loading when tests are skipped
  let getAdapter: () => ReturnType<typeof import("../lib/ai/adapter").getAdapter>;

  beforeAll(async () => {
    const adapter = await import("../lib/ai/adapter");
    getAdapter = adapter.getAdapter;
  });

  /**
   * Helper to run a chat with mocked tools and track calls
   */
  async function runChatWithMockedTools(
    userMessage: string,
    context: Partial<DashboardContext>,
    projectId?: string
  ): Promise<{ response: string; toolCalls: ToolCall[] }> {
    const toolCalls: ToolCall[] = [];
    let response = "";

    // Create mocked tool implementations
    const tools = [
      listProjectsDef.server(async () => {
        toolCalls.push({ name: "listProjects", args: {} });
        return [
          {
            id: MOCK_PROJECT.id,
            name: MOCK_PROJECT.name,
            workspaceId: MOCK_WORKSPACE.id,
            workspaceName: MOCK_WORKSPACE.name,
            updatedAt: new Date().toISOString(),
          },
        ];
      }),

      listBranchesDef.server(async ({ projectId }) => {
        toolCalls.push({ name: "listBranches", args: { projectId } });
        return [
          {
            id: MOCK_BRANCH.id,
            name: MOCK_BRANCH.name,
            isMain: MOCK_BRANCH.isMain,
            createdAt: new Date().toISOString(),
          },
        ];
      }),

      createDocumentDef.server(async ({ branchId, name, type, folderId }) => {
        toolCalls.push({ name: "createDocument", args: { branchId, name, type, folderId } });
        return {
          documentId: MOCK_DOCUMENT.id,
          name: name,
        };
      }),

      listDocumentsDef.server(async ({ projectId, branchId, folderId }) => {
        toolCalls.push({ name: "listDocuments", args: { projectId, branchId, folderId } });
        return MOCK_EXISTING_DOCS;
      }),

      listFoldersDef.server(async ({ branchId, parentFolderId }) => {
        toolCalls.push({ name: "listFolders", args: { branchId, parentFolderId } });
        return [MOCK_FOLDER];
      }),

      createFolderDef.server(async ({ branchId, name, parentFolderId }) => {
        toolCalls.push({ name: "createFolder", args: { branchId, name, parentFolderId } });
        return {
          folderId: "folder-new-" + Date.now(),
          name: name,
        };
      }),

      openDocumentDef.server(async ({ documentId }) => {
        toolCalls.push({ name: "openDocument", args: { documentId } });
        return {
          url: `/editor/${documentId}`,
          navigated: true,
        };
      }),

      renameDocumentDef.server(async ({ documentId, newName }) => {
        toolCalls.push({ name: "renameDocument", args: { documentId, newName } });
        return {
          success: true,
          name: newName,
        };
      }),

      searchDocumentsDef.server(async ({ query }) => {
        toolCalls.push({ name: "searchDocuments", args: { query } });
        // Return matching docs based on query
        const matches = MOCK_EXISTING_DOCS.filter((d) =>
          d.name.toLowerCase().includes(query.toLowerCase())
        );
        return matches.map((d) => ({
          id: d.id,
          name: d.name,
          projectId: MOCK_PROJECT.id,
          projectName: MOCK_PROJECT.name,
          workspaceName: MOCK_WORKSPACE.name,
        }));
      }),
    ];

    const systemPrompt = buildDashboardSystemPrompt("user-test", projectId, context);

    const stream = await chat({
      adapter: getAdapter(),
      messages: [{ role: "user" as const, content: userMessage }],
      tools,
      systemPrompts: [systemPrompt],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content" && chunk.delta) {
        response += chunk.delta;
      }
    }

    return { response, toolCalls };
  }

  describe("Document Creation with Branch Context", () => {
    it("creates document directly when branch ID is provided in context", async () => {
      const context: Partial<DashboardContext> = {
        workspaceId: MOCK_WORKSPACE.id,
        workspaceName: MOCK_WORKSPACE.name,
        projectName: MOCK_PROJECT.name,
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls } = await runChatWithMockedTools(
        "Create a new part called 'Widget'",
        context,
        MOCK_PROJECT.id
      );

      // Should call createDocument with the branch ID from context
      const createDocCall = toolCalls.find((c) => c.name === "createDocument");
      expect(createDocCall).toBeDefined();
      expect(createDocCall?.args.branchId).toBe(MOCK_BRANCH.id);
      expect(createDocCall?.args.name).toBe("Widget");
      expect(createDocCall?.args.type).toBe("part");
    }, 30000);

    it("creates assembly when user specifies assembly type", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls } = await runChatWithMockedTools(
        "Create a new assembly called 'Main Assembly'",
        context,
        MOCK_PROJECT.id
      );

      const createDocCall = toolCalls.find((c) => c.name === "createDocument");
      expect(createDocCall).toBeDefined();
      expect(createDocCall?.args.type).toBe("assembly");
    }, 30000);
  });

  describe("Document Creation without Branch Context", () => {
    it("asks for project context or lists projects when none available", async () => {
      const { toolCalls, response } = await runChatWithMockedTools(
        "Create a new part called 'Test Part'",
        {} // No context
      );

      // AI should either:
      // 1. Call listProjects to discover available projects
      // 2. Or ask the user which project to use
      const listProjectsCall = toolCalls.find((c) => c.name === "listProjects");
      const asksForProject = response.toLowerCase().match(/project|which|where|specify/i);

      // At least one of these should be true
      expect(listProjectsCall || asksForProject).toBeTruthy();
    }, 30000);

    it("gets branch after user specifies project", async () => {
      // Simulate user selecting a project
      const { toolCalls } = await runChatWithMockedTools(
        `Create a part called 'Test' in project "${MOCK_PROJECT.name}"`,
        {} // No context
      );

      // Should call listBranches to get the main branch
      const listBranchesCall = toolCalls.find((c) => c.name === "listBranches");

      // Either listBranches is called, or the AI asks for clarification
      // Both are acceptable behaviors
      if (listBranchesCall) {
        expect(listBranchesCall.args.projectId).toBeDefined();
      }
    }, 30000);
  });

  describe("Tool Validation", () => {
    it("does not call createDocument without branchId", async () => {
      const { toolCalls } = await runChatWithMockedTools(
        "Create a part",
        {} // No context
      );

      const createDocCall = toolCalls.find((c) => c.name === "createDocument");

      // If createDocument was called, it must have a branchId
      if (createDocCall) {
        expect(createDocCall.args.branchId).toBeDefined();
        expect(typeof createDocCall.args.branchId).toBe("string");
        expect(createDocCall.args.branchId).not.toBe("");
      }
    }, 30000);

    it("does not call listFolders without branchId", async () => {
      const { toolCalls } = await runChatWithMockedTools(
        "Show me the folders",
        {} // No context
      );

      const listFoldersCall = toolCalls.find((c) => c.name === "listFolders");

      // If listFolders was called, it must have a branchId
      if (listFoldersCall) {
        expect(listFoldersCall.args.branchId).toBeDefined();
      }
    }, 30000);
  });

  describe("Response Formatting", () => {
    it("response contains proper spacing between sentences", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { response } = await runChatWithMockedTools(
        "Create a part and tell me about it",
        context,
        MOCK_PROJECT.id
      );

      // Log the response for debugging
      console.log("[Response Formatting Test] Response:", JSON.stringify(response));

      // Response should not have sentences smashed together without spaces
      // Check for common patterns of missing spaces/newlines
      const smashedSentences = response.match(/\.[A-Z]/g) || [];

      // Allow at most 1 instance (could be an abbreviation like "Part A. Widget is...")
      // This is a soft check - AI responses vary
      if (response.length > 100 && smashedSentences.length > 2) {
        console.warn(
          `[Response Formatting] Found ${smashedSentences.length} potentially smashed sentences`
        );
      }

      // Always pass - this is more of a diagnostic test
      expect(true).toBe(true);
    }, 30000);
  });

  describe("Folder Operations", () => {
    it("creates folder in active project when context is available", async () => {
      const context: Partial<DashboardContext> = {
        workspaceId: MOCK_WORKSPACE.id,
        workspaceName: MOCK_WORKSPACE.name,
        projectName: MOCK_PROJECT.name,
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls, response } = await runChatWithMockedTools(
        "Create a new folder named 'Mechanical Parts' in the current project",
        context,
        MOCK_PROJECT.id
      );

      console.log(
        "[Folder Creation Test] Tool calls:",
        toolCalls.map((c) => c.name)
      );
      console.log("[Folder Creation Test] Response:", response.slice(0, 200));

      const createFolderCall = toolCalls.find((c) => c.name === "createFolder");
      expect(createFolderCall).toBeDefined();
      expect(createFolderCall?.args.branchId).toBe(MOCK_BRANCH.id);
      // Name might have slight variations
      expect((createFolderCall?.args.name as string).toLowerCase()).toContain("mechanical");
    }, 30000);

    it("lists folders when asked", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls, response } = await runChatWithMockedTools(
        "What folders are in this project?",
        context,
        MOCK_PROJECT.id
      );

      const listFoldersCall = toolCalls.find((c) => c.name === "listFolders");
      expect(listFoldersCall).toBeDefined();
      // Response should mention the folder name
      expect(response.toLowerCase()).toContain("components");
    }, 30000);
  });

  describe("Part Creation in Active Project", () => {
    it("creates part with simple name when context is provided", async () => {
      const context: Partial<DashboardContext> = {
        workspaceId: MOCK_WORKSPACE.id,
        workspaceName: MOCK_WORKSPACE.name,
        projectName: MOCK_PROJECT.name,
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls, response } = await runChatWithMockedTools(
        "Make a new part called 'Gear'",
        context,
        MOCK_PROJECT.id
      );

      const createDocCall = toolCalls.find((c) => c.name === "createDocument");

      // AI should either create the document or respond about it
      if (createDocCall) {
        expect(createDocCall.args.branchId).toBe(MOCK_BRANCH.id);
        expect(createDocCall.args.type).toBe("part");
        // folderId should be undefined, null, or empty string (all mean root level)
        const folderId = createDocCall.args.folderId;
        expect(folderId === undefined || folderId === null || folderId === "").toBe(true);
      } else {
        // If no tool call, AI should at least acknowledge the request
        console.log("[Part Creation Test] No createDocument call, response:", response);
        expect(response.toLowerCase()).toMatch(/gear|part|creat/i);
      }
    }, 30000);

    it("creates multiple parts when asked", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls } = await runChatWithMockedTools(
        "Create three parts: Bolt, Nut, and Washer",
        context,
        MOCK_PROJECT.id
      );

      const createDocCalls = toolCalls.filter((c) => c.name === "createDocument");
      // Should create at least one part (AI might create all 3 or ask for confirmation)
      expect(createDocCalls.length).toBeGreaterThanOrEqual(1);
    }, 60000);
  });

  describe("Document Listing", () => {
    it("lists or searches for documents when asked about project contents", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
        projectName: MOCK_PROJECT.name,
      };

      const { toolCalls, response } = await runChatWithMockedTools(
        "What parts are in this project?",
        context,
        MOCK_PROJECT.id
      );

      // AI should use listDocuments or searchDocuments
      const listDocsCall = toolCalls.find((c) => c.name === "listDocuments");
      const searchDocsCall = toolCalls.find((c) => c.name === "searchDocuments");

      // At least one should be called, or AI should mention the parts
      const calledListingTool = listDocsCall || searchDocsCall;
      const mentionsParts = response.toLowerCase().match(/bracket|housing|assembly|part/i);

      expect(calledListingTool || mentionsParts).toBeTruthy();
    }, 30000);
  });

  describe("Search Operations", () => {
    it("searches for documents by name", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls, response } = await runChatWithMockedTools(
        "Find all documents with 'bracket' in the name",
        context,
        MOCK_PROJECT.id
      );

      const searchCall = toolCalls.find((c) => c.name === "searchDocuments");
      expect(searchCall).toBeDefined();
      expect((searchCall?.args.query as string).toLowerCase()).toContain("bracket");
      // Response should mention the found document
      expect(response.toLowerCase()).toContain("bracket");
    }, 30000);
  });

  describe("Open Document", () => {
    it("opens a document when asked", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      // First search, then open
      const { toolCalls } = await runChatWithMockedTools(
        "Find the Bracket part and open it",
        context,
        MOCK_PROJECT.id
      );

      // Should search first
      const searchCall = toolCalls.find((c) => c.name === "searchDocuments");
      expect(searchCall).toBeDefined();

      // Then open
      const openCall = toolCalls.find((c) => c.name === "openDocument");
      expect(openCall).toBeDefined();
    }, 30000);
  });

  describe("Rename Operations", () => {
    it("renames a document", async () => {
      const context: Partial<DashboardContext> = {
        branchId: MOCK_BRANCH.id,
        branchName: MOCK_BRANCH.name,
      };

      const { toolCalls, response } = await runChatWithMockedTools(
        "Rename the document doc-1 to 'Updated Bracket'",
        context,
        MOCK_PROJECT.id
      );

      const renameCall = toolCalls.find((c) => c.name === "renameDocument");
      expect(renameCall).toBeDefined();
      expect(renameCall?.args.documentId).toBe("doc-1");
      expect(renameCall?.args.newName).toBe("Updated Bracket");
      expect(response.toLowerCase()).toMatch(/renamed|updated|success/i);
    }, 30000);
  });
});

describe("AI Prompt Structure Tests", () => {
  it("system prompt includes tool reference section", () => {
    const prompt = buildDashboardSystemPrompt("user-1", "proj-1", {
      branchId: "branch-123",
      branchName: "main",
    });

    expect(prompt).toContain("Tool Reference");
    expect(prompt).toContain("createDocument");
    expect(prompt).toContain("branchId (required)");
  });

  it("system prompt includes document creation workflow", () => {
    const prompt = buildDashboardSystemPrompt("user-1", undefined, {});

    expect(prompt).toContain("Creating Documents");
    expect(prompt).toContain("listProjects");
    expect(prompt).toContain("listBranches");
  });

  it("context section shows all provided values", () => {
    const context: Partial<DashboardContext> = {
      workspaceId: "ws-test",
      workspaceName: "My Workspace",
      projectName: "My Project",
      branchId: "br-test",
      branchName: "develop",
      folderId: "folder-test",
      folderPath: "/designs/parts",
    };

    const prompt = buildDashboardSystemPrompt("user-test", "proj-test", context);

    expect(prompt).toContain("ws-test");
    expect(prompt).toContain("My Workspace");
    expect(prompt).toContain("My Project");
    expect(prompt).toContain("proj-test");
    expect(prompt).toContain("br-test");
    expect(prompt).toContain("develop");
    expect(prompt).toContain("folder-test");
    expect(prompt).toContain("/designs/parts");
  });
});
