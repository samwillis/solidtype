/**
 * Import/Export Functions
 *
 * STEP and other file format support.
 */

import { getOC } from "./init.js";
import { Shape } from "./Shape.js";

/**
 * Result of an import operation.
 */
export interface ImportResult {
  success: boolean;
  shape?: Shape;
  error?: string;
}

/**
 * Export a shape to STEP format.
 */
export function exportSTEP(shape: Shape): Uint8Array {
  const oc = getOC();

  const writer = new oc.STEPControl_Writer_1();

  // Transfer shape to STEP (no progress parameter needed in this OpenCascade.js version)
  writer.Transfer(shape.raw, oc.STEPControl_StepModelType.STEPControl_AsIs, true);

  // Write to a virtual file
  const filename = `/tmp/export.step`;
  const status = writer.Write(filename);

  if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error(`Failed to export STEP file`);
  }

  // Read the file from Emscripten filesystem
  const fileData = oc.FS.readFile(filename);

  // Clean up
  oc.FS.unlink(filename);
  writer.delete();

  return new Uint8Array(fileData);
}

/**
 * Import a shape from STEP format.
 */
export function importSTEP(data: Uint8Array): ImportResult {
  const oc = getOC();

  try {
    // Write to Emscripten filesystem
    const filename = `/tmp/import.step`;
    oc.FS.writeFile(filename, data);

    const reader = new oc.STEPControl_Reader_1();
    const status = reader.ReadFile(filename);

    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      oc.FS.unlink(filename);
      reader.delete();
      return { success: false, error: `Failed to read STEP file` };
    }

    // Transfer roots (no progress parameter in this OpenCascade.js version)
    reader.TransferRoots();

    const shape = reader.OneShape();

    // Clean up
    oc.FS.unlink(filename);
    reader.delete();

    if (shape.IsNull()) {
      return { success: false, error: `No shapes found in STEP file` };
    }

    return { success: true, shape: new Shape(shape) };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : `Unknown import error`,
    };
  }
}

/**
 * Export a shape to BREP format (OpenCascade native format).
 */
export function exportBREP(shape: Shape): Uint8Array {
  const oc = getOC();

  const filename = `/tmp/export.brep`;
  // Use BRepTools.Write_1 which takes (shape, filename) without progress
  const result = oc.BRepTools.Write_1(shape.raw, filename);

  if (!result) {
    throw new Error(`Failed to export BREP file`);
  }

  const fileData = oc.FS.readFile(filename);
  oc.FS.unlink(filename);

  return new Uint8Array(fileData);
}

/**
 * Import a shape from BREP format.
 */
export function importBREP(data: Uint8Array): ImportResult {
  const oc = getOC();

  try {
    const filename = `/tmp/import.brep`;
    oc.FS.writeFile(filename, data);

    const shape = new oc.TopoDS_Shape();
    const builder = new oc.BRep_Builder();

    // Use BRepTools.Read_1 which takes (shape, filename, builder) without progress
    const result = oc.BRepTools.Read_1(shape, filename, builder);

    oc.FS.unlink(filename);
    builder.delete();

    if (!result || shape.IsNull()) {
      shape.delete();
      return { success: false, error: `Failed to read BREP file` };
    }

    return { success: true, shape: new Shape(shape) };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : `Unknown import error`,
    };
  }
}
