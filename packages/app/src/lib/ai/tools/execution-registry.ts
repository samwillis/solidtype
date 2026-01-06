/**
 * Tool Execution Registry
 *
 * Defines where tools execute: on the server or locally in the worker.
 * This is used by the run endpoint to determine how to handle tool calls.
 *
 * Server tools:
 * - Execute on the server (database operations, API calls)
 * - Result returned directly to the LLM
 *
 * Local tools:
 * - Execute in the SharedWorker (CAD kernel operations)
 * - Server writes pending tool_call, waits for tool_result
 * - Worker observes pending calls, executes, writes result
 */

export type ToolExecutionMode = "server" | "local";

/**
 * Registry of tool execution modes
 * Default is "server" for any unlisted tool
 */
const TOOL_EXECUTION_REGISTRY: Record<string, ToolExecutionMode> = {
  // ============ Dashboard Tools ============
  // All dashboard tools execute on the server
  listWorkspaces: "server",
  createWorkspace: "server",
  getWorkspace: "server",
  listProjects: "server",
  createProject: "server",
  openProject: "server",
  getProject: "server",
  listDocuments: "server",
  createDocument: "server",
  openDocument: "server",
  renameDocument: "server",
  moveDocument: "server",
  deleteDocument: "server",
  listBranches: "server",
  createBranch: "server",
  switchBranch: "server",
  deleteBranch: "server",
  mergeBranch: "server",
  resolveMergeConflict: "server",
  getBranchDiff: "server",
  listFolders: "server",
  createFolder: "server",
  renameFolder: "server",
  deleteFolder: "server",
  searchDocuments: "server",
  searchProjects: "server",

  // ============ Sketch Tools (Phase 25) ============
  // These execute locally in the browser where Yjs document is available
  createSketch: "local",
  enterSketch: "local",
  exitSketch: "local",
  getSketchStatus: "local",
  addLine: "local",
  addCircle: "local",
  addArc: "local",
  addRectangle: "local",
  addPolygon: "local",
  addSlot: "local",
  addPoint: "local",
  movePoint: "local",
  mergePoints: "local",
  addConstraint: "local",
  removeConstraint: "local",
  modifyConstraintValue: "local",
  deleteEntity: "local",
  deletePoint: "local",
  toggleConstruction: "local",

  // ============ Sketch Helper Tools (Phase 25) ============
  createCenteredRectangle: "local",
  createCircleWithRadius: "local",
  createSymmetricProfile: "local",
  createBoltCircle: "local",
  createCenterlinesAtOrigin: "local",
  createChamferedRectangle: "local",
  createRoundedRectangle: "local",

  // ============ 3D Modeling Query Tools (Phase 26) ============
  // Query tools execute locally to access OCCT kernel state
  getCurrentSelection: "local",
  getModelContext: "local",
  findFaces: "local",
  findEdges: "local",
  measureDistance: "local",
  getBoundingBox: "local",
  measureAngle: "local",

  // ============ 3D Modeling Feature Tools (Phase 26) ============
  // Feature creation executes locally in the worker with OCCT kernel
  createExtrude: "local",
  createRevolve: "local",
  createLoft: "local",
  createSweep: "local",
  createFillet: "local",
  createChamfer: "local",
  createDraft: "local",
  createLinearPattern: "local",
  createCircularPattern: "local",
  createMirror: "local",

  // ============ 3D Modeling Modify Tools (Phase 26) ============
  modifyFeature: "local",
  deleteFeature: "local",
  reorderFeature: "local",
  suppressFeature: "local",
  renameFeature: "local",
  duplicateFeature: "local",
  undo: "local",
  redo: "local",

  // ============ 3D Modeling Helper Tools (Phase 26) ============
  createBox: "local",
  createCylinder: "local",
  createSphere: "local",
  createCone: "local",
  createHole: "local",
  createPocket: "local",
  createBoss: "local",
  createShell: "local",
  createRib: "local",
  filletAllEdges: "local",
};

/**
 * Get the execution mode for a tool
 *
 * @param toolName - The name of the tool
 * @returns The execution mode ("server" or "local")
 */
export function getToolExecutionMode(toolName: string): ToolExecutionMode {
  return TOOL_EXECUTION_REGISTRY[toolName] || "server";
}

/**
 * Check if a tool executes locally
 */
export function isLocalTool(toolName: string): boolean {
  return getToolExecutionMode(toolName) === "local";
}

/**
 * Check if a tool executes on the server
 */
export function isServerTool(toolName: string): boolean {
  return getToolExecutionMode(toolName) === "server";
}

/**
 * Register a tool's execution mode
 * Used for dynamic tool registration
 */
export function registerToolExecutionMode(toolName: string, mode: ToolExecutionMode): void {
  TOOL_EXECUTION_REGISTRY[toolName] = mode;
}
