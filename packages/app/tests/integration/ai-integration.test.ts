/**
 * AI Integration Tests
 *
 * These tests verify the AI chat functionality works correctly end-to-end.
 * Run with: pnpm test -- --run ai-integration
 *
 * These tests are NOT run by default in the main test suite.
 * They require proper setup and may make actual API calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildDashboardSystemPrompt,
  type DashboardContext,
} from "../../src/lib/ai/prompts/dashboard";

// Mark as integration test - skipped by default
const isIntegrationTest = process.env.RUN_AI_INTEGRATION !== "true";

describe.skipIf(isIntegrationTest)("AI Integration Tests", () => {
  describe("Dashboard System Prompt", () => {
    it("includes all context fields when provided", () => {
      const context: Partial<DashboardContext> = {
        workspaceId: "ws-123",
        workspaceName: "My Workspace",
        projectName: "Project 1",
        branchId: "branch-456",
        branchName: "main",
        folderId: "folder-789",
        folderPath: "/designs",
        currentPage: "project",
      };

      const prompt = buildDashboardSystemPrompt("user-abc", "proj-123", context);

      // Verify all context is included with new format
      expect(prompt).toContain('WORKSPACE: "My Workspace"');
      expect(prompt).toContain("ws-123");
      expect(prompt).toContain('PROJECT: "Project 1"');
      expect(prompt).toContain("proj-123");
      expect(prompt).toContain('BRANCH: "main"');
      expect(prompt).toContain("branch-456");
      expect(prompt).toContain('FOLDER: "/designs"');
      expect(prompt).toContain("folder-789");
    });

    it("includes branch ID prominently for document creation", () => {
      const context: Partial<DashboardContext> = {
        workspaceName: "Workspace",
        workspaceId: "ws-1",
        projectName: "Project",
        branchId: "branch-xyz-789",
        branchName: "main",
      };

      const prompt = buildDashboardSystemPrompt("user-1", "proj-1", context);

      // The branch ID should be clearly visible
      expect(prompt).toContain("branch-xyz-789");
      expect(prompt).toContain("BRANCH:");
      // Should have guidance about using branch ID with exact ID in example
      expect(prompt).toContain("branchId");
      expect(prompt).toContain("branch-xyz-789");
    });

    it("handles missing context gracefully", () => {
      const prompt = buildDashboardSystemPrompt("user-abc");

      expect(prompt).toContain("No project or branch is currently selected");
      expect(prompt).not.toContain("BRANCH:");
      expect(prompt).not.toContain("WORKSPACE:");
    });

    it("includes instructions to use branch ID for document creation", () => {
      const prompt = buildDashboardSystemPrompt("user-1", "proj-1", {
        branchId: "branch-123",
        branchName: "main",
      });

      // Should have explicit instructions about using branch ID
      expect(prompt.toLowerCase()).toContain("branchid");
      expect(prompt).toContain("Creating Documents");
    });

    it("includes workflow for when no branch context is available", () => {
      const prompt = buildDashboardSystemPrompt("user-1", undefined);

      // Should have instructions for listing projects first
      expect(prompt).toContain("listProjects");
      expect(prompt).toContain("listBranches");
    });

    it("includes tool requirements", () => {
      const prompt = buildDashboardSystemPrompt("user-1", undefined);

      expect(prompt).toContain("createDocument");
      expect(prompt).toContain("branchId (required)");
      expect(prompt).toContain("listFolders");
    });

    it("clarifies folderId is optional for root-level documents", () => {
      const prompt = buildDashboardSystemPrompt("user-1", "proj-1", {
        branchId: "branch-123",
        branchName: "main",
      });

      // Prompt should mention folderId is optional
      expect(prompt).toContain("folderId");
      expect(prompt).toContain("Optional");
    });
  });
});

describe("Dashboard Prompt Unit Tests", () => {
  it("builds prompt with full context", () => {
    const context: Partial<DashboardContext> = {
      workspaceId: "ws-uuid-here",
      workspaceName: "Test Workspace",
      projectName: "Test Project",
      branchId: "branch-uuid-here",
      branchName: "main",
    };

    const prompt = buildDashboardSystemPrompt("user-123", "project-uuid", context);

    // Check structure
    expect(prompt).toContain("SolidType");
    expect(prompt).toContain("## Your Role");
    expect(prompt).toContain("## Available Actions");
    expect(prompt).toContain("## Guidelines");
    expect(prompt).toContain("## CURRENT CONTEXT");

    // Check context values
    expect(prompt).toContain("Test Workspace");
    expect(prompt).toContain("ws-uuid-here");
    expect(prompt).toContain("Test Project");
    expect(prompt).toContain("project-uuid");
    expect(prompt).toContain("branch-uuid-here");
    expect(prompt).toContain("main");
  });

  it("handles projectId without projectName", () => {
    const prompt = buildDashboardSystemPrompt("user-123", "project-uuid-only");

    // With projectId but no name, the ID should still be shown for tool calls
    expect(prompt).toContain("## CURRENT CONTEXT");
    expect(prompt).toContain("project-uuid-only");
    expect(prompt).toContain("listBranches");
  });

  it("shows no project selected when projectId is undefined", () => {
    const prompt = buildDashboardSystemPrompt("user-123", undefined);

    expect(prompt).toContain("No project or branch is currently selected");
  });

  it("includes viewing context for project page", () => {
    const context: Partial<DashboardContext> = {
      projectName: "My Project",
      branchName: "develop",
      currentPage: "project",
    };

    const prompt = buildDashboardSystemPrompt("user-1", "proj-1", context);

    expect(prompt).toContain('Project "My Project" on branch "develop"');
  });

  it("includes viewing context for recent page", () => {
    const context: Partial<DashboardContext> = {
      currentPage: "recent",
    };

    const prompt = buildDashboardSystemPrompt("user-1", undefined, context);

    expect(prompt).toContain("Recent files");
  });

  it("includes viewing context for home page", () => {
    const context: Partial<DashboardContext> = {
      currentPage: "home",
    };

    const prompt = buildDashboardSystemPrompt("user-1", undefined, context);

    expect(prompt).toContain("Dashboard home");
  });
});

describe("Tool Definition Validation", () => {
  it("createDocument requires branchId", async () => {
    // Import the tool definition
    const { createDocumentDef } = await import("../../src/lib/ai/tools/dashboard");

    // Check the input schema requires branchId
    const schema = createDocumentDef.inputSchema;
    const result = schema.safeParse({
      name: "Part A",
      type: "part",
      // Missing branchId
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("branchId"))).toBe(true);
    }
  });

  it("createDocument accepts valid input with branchId (folderId is optional)", async () => {
    const { createDocumentDef } = await import("../../src/lib/ai/tools/dashboard");

    const schema = createDocumentDef.inputSchema;

    // Without folderId - should be valid (creates in project root)
    const resultWithoutFolder = schema.safeParse({
      branchId: "branch-123",
      name: "Part A",
      type: "part",
    });
    expect(resultWithoutFolder.success).toBe(true);

    // With folderId - should also be valid
    const resultWithFolder = schema.safeParse({
      branchId: "branch-123",
      name: "Part A",
      type: "part",
      folderId: "folder-456",
    });
    expect(resultWithFolder.success).toBe(true);
  });

  it("createDocument works without folderId for root-level documents", async () => {
    const { createDocumentDef } = await import("../../src/lib/ai/tools/dashboard");

    const schema = createDocumentDef.inputSchema;
    const result = schema.safeParse({
      branchId: "branch-123",
      name: "Part A",
      type: "part",
      // No folderId - document goes in project root
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branchId).toBe("branch-123");
      expect(result.data.name).toBe("Part A");
      expect(result.data.type).toBe("part");
    }
  });

  it("createDocument accepts optional folderId", async () => {
    const { createDocumentDef } = await import("../../src/lib/ai/tools/dashboard");

    const schema = createDocumentDef.inputSchema;
    const result = schema.safeParse({
      branchId: "branch-123",
      name: "Part A",
      type: "part",
      folderId: "folder-456",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.folderId).toBe("folder-456");
    }
  });

  it("listDocuments accepts projectId without branchId", async () => {
    const { listDocumentsDef } = await import("../../src/lib/ai/tools/dashboard");

    const schema = listDocumentsDef.inputSchema;
    const result = schema.safeParse({
      projectId: "project-123",
    });

    expect(result.success).toBe(true);
  });

  it("listFolders requires branchId", async () => {
    const { listFoldersDef } = await import("../../src/lib/ai/tools/dashboard");

    const schema = listFoldersDef.inputSchema;
    const result = schema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("createFolder requires branchId", async () => {
    const { createFolderDef } = await import("../../src/lib/ai/tools/dashboard");

    const schema = createFolderDef.inputSchema;
    const result = schema.safeParse({
      name: "New Folder",
    });

    expect(result.success).toBe(false);
  });
});

describe("Context Extraction Verification", () => {
  it("prompt contains extractable branch ID pattern", () => {
    const branchId = "550e8400-e29b-41d4-a716-446655440000";
    const context: Partial<DashboardContext> = {
      branchId,
      branchName: "main",
    };

    const prompt = buildDashboardSystemPrompt("user-1", "proj-1", context);

    // The branch ID should be extractable by an LLM
    // It should appear with BRANCH: label and branchId: format
    expect(prompt).toContain("BRANCH:");
    expect(prompt).toContain("550e8400-e29b-41d4-a716-446655440000");
    // The ID should be clearly labeled
    expect(prompt).toMatch(/branchId.*550e8400-e29b-41d4-a716-446655440000/s);
  });

  it("prompt format is consistent for parsing", () => {
    const context: Partial<DashboardContext> = {
      workspaceId: "ws-id",
      workspaceName: "WS Name",
      projectName: "Proj Name",
      branchId: "branch-id",
      branchName: "main",
    };

    const prompt = buildDashboardSystemPrompt("user-1", "proj-1", context);

    // Check the new format: "LABEL: "Value" → idField: "xxx""
    expect(prompt).toContain('WORKSPACE: "WS Name"');
    expect(prompt).toContain("ws-id");
    expect(prompt).toContain('PROJECT: "Proj Name"');
    expect(prompt).toContain("proj-1");
    expect(prompt).toContain('BRANCH: "main"');
    expect(prompt).toContain("branch-id");
  });
});
