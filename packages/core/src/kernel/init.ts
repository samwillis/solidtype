/**
 * OpenCascade.js Initialization
 *
 * Handles async loading of the OCCT WASM module.
 *
 * For browser/worker:
 *   The app package should initialize OpenCascade.js using static imports
 *   (which Vite can process) and then call setOC() to set the instance.
 *
 * For Node.js/tests:
 *   Call initOCCT() which will load the WASM file directly using fs
 *   and pass it to the module via wasmBinary option.
 */

// Type declarations are in ../../../../types/opencascade.d.ts
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../../types/opencascade.d.ts" />
type OpenCascadeInstance = any;

let oc: OpenCascadeInstance | null = null;
let initPromise: Promise<OpenCascadeInstance> | null = null;

/**
 * Set the OpenCascade.js instance from external initialization.
 * Use this when the OC instance is initialized externally (e.g., in the app package
 * using static imports that Vite can process).
 */
export function setOC(instance: OpenCascadeInstance): void {
  oc = instance;
  console.log("[OCCT] OpenCascade.js instance set externally");
}

/**
 * Initialize OpenCascade.js. Call this once at app startup.
 * Safe to call multiple times - will return cached instance.
 *
 * For Node.js/tests: Loads WASM file directly and passes via wasmBinary.
 * For browser/worker: The app should call setOC() with an externally-initialized instance.
 *
 * @param externalInstance - Optional pre-initialized OC instance to use
 */
export async function initOCCT(
  externalInstance?: OpenCascadeInstance
): Promise<OpenCascadeInstance> {
  // If an external instance is provided, use it
  if (externalInstance) {
    oc = externalInstance;
    console.log("[OCCT] Using externally provided OpenCascade.js instance");
    return oc;
  }

  // If already initialized, return the cached instance
  if (oc) return oc;

  // If initialization is in progress, wait for it
  if (initPromise) return initPromise;

  // Start initialization
  initPromise = (async () => {
    // Check if we're in a browser/worker environment
    const isBrowser =
      typeof (globalThis as any).window !== "undefined" ||
      typeof (globalThis as any).self !== "undefined";

    if (isBrowser) {
      // In browser, the app should have called setOC() before this
      // If not, throw an error with instructions
      throw new Error(
        "OpenCascade.js not initialized in browser context. " +
          "The app package should initialize OCCT using static imports and call setOC() " +
          "before using SolidSession. See packages/app/src/editor/worker/occt-init.ts"
      );
    }

    // Node.js environment - load WASM file directly and pass via wasmBinary
    try {
      console.log("[OCCT] Initializing OpenCascade.js for Node.js...");

      // Import Node.js fs and path modules
      const fs = await import("fs");
      const path = await import("path");
      const { createRequire } = await import("module");

      // Find the opencascade.js package location
      const require = createRequire(import.meta.url);
      const opencascadePackagePath = path.dirname(require.resolve("opencascade.js/package.json"));

      // Load the WASM file directly
      const wasmPath = path.join(opencascadePackagePath, "dist", "opencascade.wasm.wasm");
      console.log("[OCCT] Loading WASM from:", wasmPath);
      const wasmBuffer = fs.readFileSync(wasmPath);

      // Import the JS module (this doesn't trigger the problematic WASM import in Node.js
      // because we're providing wasmBinary directly)
      const opencascadeModule = await import("opencascade.js/dist/opencascade.wasm.js");
      const OpenCascade = opencascadeModule.default;

      // Initialize with the WASM binary
      const instance = await new OpenCascade({
        wasmBinary: wasmBuffer.buffer,
      });

      oc = instance;
      console.log("[OCCT] OpenCascade.js initialized (Node.js mode with wasmBinary)");
      return instance;
    } catch (err) {
      throw new Error(`Failed to initialize OpenCascade.js: ${err}`);
    }
  })();

  return initPromise;
}

/**
 * Get the OCCT instance. Throws if not initialized.
 */
export function getOC(): OpenCascadeInstance {
  if (!oc) {
    throw new Error("OCCT not initialized. Call initOCCT() or setOC() first.");
  }
  return oc;
}

/**
 * Check if OCCT is initialized.
 */
export function isOCCTInitialized(): boolean {
  return oc !== null;
}
