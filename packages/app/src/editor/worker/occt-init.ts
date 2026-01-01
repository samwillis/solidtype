/**
 * OpenCascade.js Browser Initialization
 *
 * Uses static imports that Vite can process correctly.
 * This file should only be imported in browser/worker context.
 */

// Static imports - Vite processes these correctly
// The package has opencascade.wasm.js and opencascade.wasm.wasm (not .full)
import opencascade from "opencascade.js/dist/opencascade.wasm.js";
import opencascadeWasm from "opencascade.js/dist/opencascade.wasm.wasm?url";

console.log("[OCCT] occt-init.ts loaded");
console.log("[OCCT] opencascade module:", typeof opencascade);
console.log("[OCCT] opencascadeWasm URL:", opencascadeWasm);

let oc: any = null;
let initPromise: Promise<any> | null = null;

/**
 * Initialize OpenCascade.js for browser/worker environment.
 * Uses static imports that Vite can process.
 */
export async function initOCCTBrowser(): Promise<any> {
  console.log("[OCCT] initOCCTBrowser called");

  if (oc) {
    console.log("[OCCT] Returning cached instance");
    return oc;
  }

  if (!initPromise) {
    initPromise = (async () => {
      console.log("[OCCT] Starting OpenCascade.js initialization...");
      console.log("[OCCT] WASM URL:", opencascadeWasm);

      try {
        // The module uses `new opencascade()` constructor pattern
        const instance = await new opencascade({
          locateFile: (path: string) => {
            console.log("[OCCT] locateFile called for:", path);
            if (path.endsWith(".wasm")) {
              return opencascadeWasm;
            }
            return path;
          },
        });
        oc = instance;
        console.log("[OCCT] OpenCascade.js initialized (browser mode)");
        return instance;
      } catch (err) {
        console.error("[OCCT] Failed to initialize OpenCascade.js:", err);
        throw err;
      }
    })();
  }

  return initPromise;
}

/**
 * Get the OCCT instance. Throws if not initialized.
 */
export function getOCBrowser(): any {
  if (!oc) {
    throw new Error("OCCT not initialized. Call initOCCTBrowser() first.");
  }
  return oc;
}
