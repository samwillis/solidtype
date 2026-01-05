/**
 * Authorization Tests
 *
 * Tests for the authz module to verify permission checks work correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the repos before importing authz
vi.mock("../../src/repos/workspaces", () => ({
  getMembership: vi.fn(),
  findById: vi.fn(),
  listForUser: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock("../../src/repos/projects", () => ({
  findById: vi.fn(),
  getDirectMembership: vi.fn(),
  getEffectiveAccess: vi.fn(),
  listForWorkspace: vi.fn(),
}));

vi.mock("../../src/repos/documents", () => ({
  findById: vi.fn(),
  findWithBranch: vi.fn(),
  findWithProjectInfo: vi.fn(),
  getBranch: vi.fn(),
  listForBranch: vi.fn(),
}));

vi.mock("../../src/repos/ai-chat", () => ({
  findById: vi.fn(),
  findByIdAndUser: vi.fn(),
  listForUser: vi.fn(),
}));

vi.mock("../../src/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

import * as workspacesRepo from "../../src/repos/workspaces";
import * as projectsRepo from "../../src/repos/projects";
import * as documentsRepo from "../../src/repos/documents";
import * as aiChatRepo from "../../src/repos/ai-chat";
import { auth } from "../../src/lib/auth";
import {
  getSessionOrThrow,
  requireWorkspaceMember,
  requireWorkspaceRole,
  requireProjectAccess,
  requireDocumentAccess,
  requireChatSessionOwner,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
} from "../../src/lib/authz";

// Helper to create a mock session
function createMockSession(userId = "user-123") {
  return {
    user: {
      id: userId,
      email: "test@example.com",
      name: "Test User",
      image: null,
    },
    session: {
      id: "session-123",
      userId,
      expiresAt: new Date(Date.now() + 86400000),
    },
  };
}

// Helper to create a mock request
function createMockRequest() {
  return new Request("http://localhost/api/test", {
    headers: new Headers({ Cookie: "session=test" }),
  });
}

describe("Authorization Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSessionOrThrow", () => {
    it("throws AuthenticationError when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const request = createMockRequest();

      await expect(getSessionOrThrow(request)).rejects.toThrow(AuthenticationError);
    });

    it("returns session when authenticated", async () => {
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any);

      const request = createMockRequest();
      const session = await getSessionOrThrow(request);

      expect(session.user.id).toBe("user-123");
    });
  });

  describe("requireWorkspaceMember", () => {
    it("throws ForbiddenError when not a member", async () => {
      vi.mocked(workspacesRepo.getMembership).mockResolvedValue(null);

      const session = createMockSession();

      await expect(requireWorkspaceMember(session, "workspace-123")).rejects.toThrow(
        ForbiddenError
      );
    });

    it("returns membership when user is a member", async () => {
      const mockMembership = {
        workspaceId: "workspace-123",
        userId: "user-123",
        role: "member" as const,
        joinedAt: new Date(),
      };
      vi.mocked(workspacesRepo.getMembership).mockResolvedValue(mockMembership);

      const session = createMockSession();
      const membership = await requireWorkspaceMember(session, "workspace-123");

      expect(membership.role).toBe("member");
    });
  });

  describe("requireWorkspaceRole", () => {
    it("throws ForbiddenError when user does not have required role", async () => {
      const mockMembership = {
        workspaceId: "workspace-123",
        userId: "user-123",
        role: "member" as const,
        joinedAt: new Date(),
      };
      vi.mocked(workspacesRepo.getMembership).mockResolvedValue(mockMembership);

      const session = createMockSession();

      // Member cannot delete (requires owner)
      await expect(requireWorkspaceRole(session, "workspace-123", ["owner"])).rejects.toThrow(
        ForbiddenError
      );
    });

    it("returns membership when user has required role", async () => {
      const mockMembership = {
        workspaceId: "workspace-123",
        userId: "user-123",
        role: "owner" as const,
        joinedAt: new Date(),
      };
      vi.mocked(workspacesRepo.getMembership).mockResolvedValue(mockMembership);

      const session = createMockSession();
      const membership = await requireWorkspaceRole(session, "workspace-123", ["owner"]);

      expect(membership.role).toBe("owner");
    });

    it("allows admin when owner or admin is required", async () => {
      const mockMembership = {
        workspaceId: "workspace-123",
        userId: "user-123",
        role: "admin" as const,
        joinedAt: new Date(),
      };
      vi.mocked(workspacesRepo.getMembership).mockResolvedValue(mockMembership);

      const session = createMockSession();
      const membership = await requireWorkspaceRole(session, "workspace-123", ["owner", "admin"]);

      expect(membership.role).toBe("admin");
    });
  });

  describe("requireProjectAccess", () => {
    it("throws NotFoundError when project does not exist", async () => {
      vi.mocked(projectsRepo.findById).mockResolvedValue(null);

      const session = createMockSession();

      await expect(requireProjectAccess(session, "project-123")).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user has no access", async () => {
      vi.mocked(projectsRepo.findById).mockResolvedValue({
        id: "project-123",
        workspaceId: "workspace-123",
        name: "Test Project",
        description: null,
        createdBy: "user-456",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(projectsRepo.getEffectiveAccess).mockResolvedValue(null);

      const session = createMockSession();

      await expect(requireProjectAccess(session, "project-123")).rejects.toThrow(ForbiddenError);
    });

    it("returns project and access when user has access", async () => {
      vi.mocked(projectsRepo.findById).mockResolvedValue({
        id: "project-123",
        workspaceId: "workspace-123",
        name: "Test Project",
        description: null,
        createdBy: "user-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(projectsRepo.getEffectiveAccess).mockResolvedValue({
        canEdit: true,
        role: "owner",
      });

      const session = createMockSession();
      const result = await requireProjectAccess(session, "project-123");

      expect(result.project.id).toBe("project-123");
      expect(result.canEdit).toBe(true);
    });
  });

  describe("requireDocumentAccess", () => {
    it("throws NotFoundError when document does not exist", async () => {
      vi.mocked(documentsRepo.findWithBranch).mockResolvedValue(null);

      const session = createMockSession();

      await expect(requireDocumentAccess(session, "doc-123", "view")).rejects.toThrow(
        NotFoundError
      );
    });

    it("throws ForbiddenError when user cannot edit but edit is required", async () => {
      vi.mocked(documentsRepo.findWithBranch).mockResolvedValue({
        id: "doc-123",
        projectId: "project-123",
        branchId: "branch-123",
        baseDocumentId: null,
        folderId: null,
        name: "Test Doc",
        type: "model",
        durableStreamId: null,
        featureCount: 0,
        sortOrder: 0,
        isDeleted: false,
        createdBy: "user-456",
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: {
          id: "branch-123",
          projectId: "project-123",
          name: "main",
          isMain: true,
        },
      });
      vi.mocked(projectsRepo.getEffectiveAccess).mockResolvedValue({
        canEdit: false, // Read-only access
        role: "guest",
      });

      const session = createMockSession();

      await expect(requireDocumentAccess(session, "doc-123", "edit")).rejects.toThrow(
        ForbiddenError
      );
    });

    it("allows read access for read-only user", async () => {
      vi.mocked(documentsRepo.findWithBranch).mockResolvedValue({
        id: "doc-123",
        projectId: "project-123",
        branchId: "branch-123",
        baseDocumentId: null,
        folderId: null,
        name: "Test Doc",
        type: "model",
        durableStreamId: null,
        featureCount: 0,
        sortOrder: 0,
        isDeleted: false,
        createdBy: "user-456",
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: {
          id: "branch-123",
          projectId: "project-123",
          name: "main",
          isMain: true,
        },
      });
      vi.mocked(projectsRepo.getEffectiveAccess).mockResolvedValue({
        canEdit: false,
        role: "guest",
      });

      const session = createMockSession();
      const result = await requireDocumentAccess(session, "doc-123", "view");

      expect(result.doc.id).toBe("doc-123");
      expect(result.canEdit).toBe(false);
    });
  });

  describe("requireChatSessionOwner", () => {
    it("throws ForbiddenError when user does not own session", async () => {
      vi.mocked(aiChatRepo.findByIdAndUser).mockResolvedValue(null);

      const session = createMockSession();

      await expect(requireChatSessionOwner(session, "chat-123")).rejects.toThrow(ForbiddenError);
    });

    it("returns chat session when user is owner", async () => {
      vi.mocked(aiChatRepo.findByIdAndUser).mockResolvedValue({
        id: "chat-123",
        userId: "user-123",
        context: "dashboard",
        documentId: null,
        projectId: null,
        status: "active",
        title: "Test Chat",
        messageCount: 0,
        lastMessageAt: null,
        durableStreamId: "ai-chat/chat-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const session = createMockSession();
      const chatSession = await requireChatSessionOwner(session, "chat-123");

      expect(chatSession.id).toBe("chat-123");
      expect(chatSession.userId).toBe("user-123");
    });
  });
});
