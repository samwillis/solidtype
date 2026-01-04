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
import { buildDashboardSystemPrompt, type DashboardContext } from "../../src/lib/ai/prompts/dashboard";

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

      // Verify all context is included
      expect(prompt).toContain("User ID: user-abc");
      expect(prompt).toContain('Workspace: "My Workspace"');
      expect(prompt).toContain("ID: ws-123");
      expect(prompt).toContain('Project: "Project 1"');
      expect(prompt).toContain("ID: proj-123");
      expect(prompt).toContain('Branch: "main"');
      expect(prompt).toContain("ID: branch-456");
      expect(prompt).toContain('Current Folder: "/designs"');
      expect(prompt).toContain("ID: folder-789");
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
      expect(prompt).toContain("Branch:");
      // Should have guidance about using branch ID
      expect(prompt).toContain("Branch ID");
    });

    it("handles missing context gracefully", () => {
      const prompt = buildDashboardSystemPrompt("user-abc");

      expect(prompt).toContain("User ID: user-abc");
      expect(prompt).toContain("No project selected");
      expect(prompt).not.toContain("Branch:");
      expect(prompt).not.toContain("Workspace:");
    });

    it("includes instructions to use branch ID for document creation", () => {
      const prompt = buildDashboardSystemPrompt("user-1", "proj-1", {
        branchId: "branch-123",
        branchName: "main",
      });

      // Should have explicit instructions about using branch ID
      expect(prompt.toLowerCase()).toContain("branch id");
      expect(prompt).toContain("Creating Documents");
    });

    it("includes workflow for when no branch context is available", () => {
      const prompt = buildDashboardSystemPrompt("user-1", undefined);

      // Should have instructions for listing projects first
      expect(prompt).toContain("listProjects");
      expect(prompt).toContain("listBranches");
      expect(prompt).toContain("NO Branch ID");
    });

    it("includes tool requirements", () => {
      const prompt = buildDashboardSystemPrompt("user-1", undefined);

      expect(prompt).toContain("createDocument:");
      expect(prompt).toContain("branchId (required)");
      expect(prompt).toContain("listFolders:");
    });

    it("clarifies folderId is optional for root-level documents", () => {
      const prompt = buildDashboardSystemPrompt("user-1", undefined);

      // Prompt should clearly state folderId is optional
      expect(prompt).toContain("folderId (OPTIONAL");
      expect(prompt).toContain("WITHOUT a folder");
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
    expect(prompt).toContain("## User Context");

    // Check context values
    expect(prompt).toContain("user-123");
    expect(prompt).toContain("Test Workspace");
    expect(prompt).toContain("ws-uuid-here");
    expect(prompt).toContain("Test Project");
    expect(prompt).toContain("project-uuid");
    expect(prompt).toContain("branch-uuid-here");
    expect(prompt).toContain("main");
  });

  it("includes project ID when no name is provided", () => {
    const prompt = buildDashboardSystemPrompt("user-123", "project-uuid-only");

    expect(prompt).toContain("Current Project ID: project-uuid-only");
  });

  it("shows no project selected when projectId is undefined", () => {
    const prompt = buildDashboardSystemPrompt("user-123", undefined);

    expect(prompt).toContain("No project selected");
  });

  it("includes viewing context for project page", () => {
    const context: Partial<DashboardContext> = {
      projectName: "My Project",
      branchName: "develop",
      currentPage: "project",
    };

    const prompt = buildDashboardSystemPrompt("user-1", "proj-1", context);

    expect(prompt).toContain('Viewing: Project "My Project" on branch "develop"');
  });

  it("includes viewing context for recent page", () => {
    const context: Partial<DashboardContext> = {
      currentPage: "recent",
    };

    const prompt = buildDashboardSystemPrompt("user-1", undefined, context);

    expect(prompt).toContain("Viewing: Recent files");
  });

  it("includes viewing context for home page", () => {
    const context: Partial<DashboardContext> = {
      currentPage: "home",
    };

    const prompt = buildDashboardSystemPrompt("user-1", undefined, context);

    expect(prompt).toContain("Viewing: Dashboard home");
  });
});

describe("Tool Definition Validation", () => {
  it("createDocument requires branchId", async () => {
    // Import the tool definition
    const { createDocumentDef } = await import("../lib/ai/tools/dashboard");

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
    const { createDocumentDef } = await import("../lib/ai/tools/dashboard");

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
    const { createDocumentDef } = await import("../lib/ai/tools/dashboard");

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
    const { createDocumentDef } = await import("../lib/ai/tools/dashboard");

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
    const { listDocumentsDef } = await import("../lib/ai/tools/dashboard");

    const schema = listDocumentsDef.inputSchema;
    const result = schema.safeParse({
      projectId: "project-123",
    });

    expect(result.success).toBe(true);
  });

  it("listFolders requires branchId", async () => {
    const { listFoldersDef } = await import("../lib/ai/tools/dashboard");

    const schema = listFoldersDef.inputSchema;
    const result = schema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("createFolder requires branchId", async () => {
    const { createFolderDef } = await import("../lib/ai/tools/dashboard");

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
    // It should appear near the word "Branch" and "ID"
    expect(prompt).toMatch(/Branch.*ID.*550e8400-e29b-41d4-a716-446655440000/s);
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

    // Check the format is consistent: "Label: Value (ID: xxx)"
    expect(prompt).toMatch(/Workspace: "WS Name" \(ID: ws-id\)/);
    expect(prompt).toMatch(/Project: "Proj Name" \(ID: proj-1\)/);
    expect(prompt).toMatch(/Branch: "main" \(ID: branch-id\)/);
  });
});
