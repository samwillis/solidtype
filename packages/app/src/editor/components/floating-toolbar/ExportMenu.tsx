import React, { useState, useCallback } from "react";
import { Tooltip } from "@base-ui/react";
import { Menu } from "@base-ui/react/menu";
import { ExportIcon, ChevronDownIcon } from "../Icons";

export interface ExportMenuProps {
  /** Whether there are bodies to export */
  canExport: boolean;
  /** Export as STL function */
  exportStl: (options?: { binary?: boolean; name?: string }) => Promise<string | ArrayBuffer>;
  /** Export as STEP function */
  exportStep: (options?: { name?: string }) => Promise<ArrayBuffer>;
}

/**
 * ExportMenu - Export dropdown with STL/STEP options
 */
export const ExportMenu: React.FC<ExportMenuProps> = ({ canExport, exportStl, exportStep }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingStep, setIsExportingStep] = useState(false);

  const handleExportStl = useCallback(async () => {
    if (!canExport || isExporting) return;

    setIsExporting(true);
    try {
      const result = await exportStl({ binary: true, name: "model" });

      if (result instanceof ArrayBuffer) {
        const blob = new Blob([result], { type: "model/stl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "model.stl";
        a.click();
        URL.revokeObjectURL(url);
      } else if (typeof result === "string") {
        const blob = new Blob([result], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "model.stl";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  }, [canExport, isExporting, exportStl]);

  const handleExportStep = useCallback(async () => {
    if (!canExport || isExportingStep) return;

    setIsExportingStep(true);
    try {
      const result = await exportStep({ name: "model" });

      const blob = new Blob([result], { type: "application/step" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "model.step";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("STEP export failed:", err);
      alert(`STEP export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExportingStep(false);
    }
  }, [canExport, isExportingStep, exportStep]);

  const isLoading = isExporting || isExportingStep;
  const tooltipText = isLoading
    ? "Exporting..."
    : canExport
      ? "Export Model"
      : "Export (no bodies)";

  return (
    <div className="floating-toolbar-group">
      <Menu.Root>
        <Tooltip.Root>
          <Tooltip.Trigger
            delay={300}
            render={
              <Menu.Trigger
                className={`floating-toolbar-button has-dropdown ${!canExport ? "disabled" : ""} ${isLoading ? "loading" : ""}`}
                disabled={!canExport}
                aria-label="Export"
              />
            }
          >
            <ExportIcon />
            <ChevronDownIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="top" sideOffset={6}>
              <Tooltip.Popup className="floating-toolbar-tooltip">{tooltipText}</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Menu.Portal>
          <Menu.Positioner side="top" sideOffset={8}>
            <Menu.Popup className="floating-toolbar-dropdown">
              <Menu.Item
                className="floating-toolbar-dropdown-item"
                onClick={handleExportStl}
                disabled={!canExport || isExporting}
              >
                <span>STL (Mesh)</span>
                <span className="floating-toolbar-dropdown-hint">.stl</span>
              </Menu.Item>
              <Menu.Item
                className="floating-toolbar-dropdown-item"
                onClick={handleExportStep}
                disabled={!canExport || isExportingStep}
              >
                <span>STEP (CAD)</span>
                <span className="floating-toolbar-dropdown-hint">.step</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
};
