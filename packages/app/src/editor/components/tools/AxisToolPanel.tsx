import { useMemo, useState } from "react";
import { useDocument } from "../../contexts/DocumentContext";
import { useKernel } from "../../contexts/KernelContext";
import { useSelection } from "../../contexts/SelectionContext";
import type { AxisToolFormData } from "../../types/featureSchemas";
import {
  PropertyGroup,
  PropertyRow,
  TextInput,
  NumberInput,
  SelectInput,
} from "../properties-panel/inputs";
import {
  computeAxisFromEdgeMesh,
  computeAxisFromTwoPlanes,
  computeAxisFromTwoPoints,
  computePlaneFromFaceMesh,
  computeOrthonormalBasis,
  cross,
  normalize,
  parseEdgeRef,
  parseFaceRef,
  parsePointRef,
  type PlaneBasis,
  type AxisLine,
} from "../../lib/reference-geometry";
import { findDatumPlaneByRole } from "../../document/createDocument";

export interface AxisToolPanelProps {
  data: AxisToolFormData;
  onUpdate: (update: Partial<AxisToolFormData>) => void;
  onCancel: () => void;
}

const modeOptions = [
  { value: "auto", label: "Auto-detect" },
  { value: "linear", label: "Linear entity" },
  { value: "twoPoints", label: "Two points" },
  { value: "twoPlanes", label: "Two planes" },
] as const;

export function AxisToolPanel({ data, onUpdate, onCancel }: AxisToolPanelProps) {
  const { getFeatureById, addAxis, doc } = useDocument();
  const { meshes } = useKernel();
  const { selectedEdges, selectedFaces, selectedFeatureId } = useSelection();
  const [error, setError] = useState<string | null>(null);

  const effectiveMode = useMemo(() => {
    if (data.mode !== "auto") return data.mode;
    if (data.ref1 && data.ref2) {
      if (data.ref1.startsWith("point:") && data.ref2.startsWith("point:")) {
        return "twoPoints";
      }
      return "twoPlanes";
    }
    if (data.ref1) return "linear";
    return "linear";
  }, [data.mode, data.ref1, data.ref2]);

  const getSelectedPlaneRef = (): string | null => {
    if (!doc) return null;
    const feature = selectedFeatureId ? getFeatureById(selectedFeatureId) : null;
    if (feature?.type === "plane") return feature.id;
    if (selectedFaces.length === 1) {
      const face = selectedFaces[0];
      return `face:${face.featureId}:${face.faceIndex}`;
    }
    return null;
  };

  const getSelectedEdgeRef = (): string | null => {
    if (selectedEdges.length !== 1) return null;
    const edge = selectedEdges[0];
    return `edge:${edge.featureId}:${edge.edgeIndex}`;
  };

  const resolvePlaneBasis = (ref?: string): PlaneBasis | null => {
    if (!ref) return null;
    const face = parseFaceRef(ref);
    if (face) {
      const mesh = meshes.get(face.featureId);
      if (!mesh) return null;
      return computePlaneFromFaceMesh(mesh, face.faceIndex);
    }
    if (ref === "xy" || ref === "xz" || ref === "yz") {
      if (!doc) return null;
      const planeId = findDatumPlaneByRole(doc, ref);
      if (!planeId) return null;
      ref = planeId;
    }
    const feature = getFeatureById(ref);
    if (feature?.type === "plane") {
      const normal = feature.normal;
      const basis = computeOrthonormalBasis(normal);
      const xDir = feature.xDir ?? basis.xDir;
      const yDir = normalize(cross(normal, xDir));
      return { origin: feature.origin, normal, xDir, yDir };
    }
    return null;
  };

  const resolveAxis = (ref?: string): AxisLine | null => {
    if (!ref) return null;
    const edge = parseEdgeRef(ref);
    if (edge) {
      const mesh = meshes.get(edge.featureId);
      if (!mesh) return null;
      return computeAxisFromEdgeMesh(mesh, edge.edgeIndex);
    }
    const feature = getFeatureById(ref);
    if (feature?.type === "axis") {
      return { origin: feature.origin, direction: feature.direction };
    }
    return null;
  };

  const handleUseSelection = (slot: "ref1" | "ref2") => {
    if (effectiveMode === "linear") {
      const edgeRef = getSelectedEdgeRef();
      if (edgeRef && slot === "ref1") onUpdate({ ref1: edgeRef });
      return;
    }

    const planeRef = getSelectedPlaneRef();
    if (planeRef) onUpdate({ [slot]: planeRef } as Partial<AxisToolFormData>);
  };

  const handleAccept = () => {
    setError(null);
    const mode = effectiveMode;

    if (mode === "twoPoints") {
      const p1 = parsePointRef(data.ref1 ?? "");
      const p2 = parsePointRef(data.ref2 ?? "");
      if (!p1 || !p2) {
        setError("Provide two valid point coordinates.");
        return;
      }
      const axis = computeAxisFromTwoPoints(p1, p2);
      if (!axis) {
        setError("Points are identical - cannot create axis.");
        return;
      }
      addAxis({
        name: data.name,
        definition: { kind: "twoPoints", point1Ref: data.ref1 ?? "", point2Ref: data.ref2 ?? "" },
        origin: axis.origin,
        direction: axis.direction,
        length: data.length,
      });
      onCancel();
      return;
    }

    if (mode === "twoPlanes") {
      const p1 = resolvePlaneBasis(data.ref1);
      const p2 = resolvePlaneBasis(data.ref2);
      if (!p1 || !p2) {
        setError("Select two planar references.");
        return;
      }
      const axis = computeAxisFromTwoPlanes(p1, p2);
      if (!axis) {
        setError("Planes are parallel - no intersection axis.");
        return;
      }
      addAxis({
        name: data.name,
        definition: { kind: "twoPlanes", plane1Ref: data.ref1 ?? "", plane2Ref: data.ref2 ?? "" },
        origin: axis.origin,
        direction: axis.direction,
        length: data.length,
      });
      onCancel();
      return;
    }

    const axis = resolveAxis(data.ref1);
    if (!axis) {
      setError("Select a linear reference for the axis.");
      return;
    }
    if (!data.ref1?.startsWith("edge:")) {
      setError("Linear axis requires an edge reference (edge:featureId:edgeIndex).");
      return;
    }
    addAxis({
      name: data.name,
      definition: { kind: "edge", edgeRef: data.ref1 },
      origin: axis.origin,
      direction: axis.direction,
      length: data.length,
    });
    onCancel();
  };

  return (
    <PropertyGroup>
      <PropertyRow label="Name">
        <TextInput value={data.name} onChange={(name) => onUpdate({ name })} />
      </PropertyRow>
      <PropertyRow label="Type">
        <SelectInput
          value={data.mode}
          onChange={(mode) => onUpdate({ mode })}
          options={modeOptions}
        />
      </PropertyRow>

      {(effectiveMode === "linear" || effectiveMode === "twoPlanes") && (
        <PropertyRow label="Reference 1">
          <div className="reference-row">
            <TextInput value={data.ref1 ?? ""} onChange={(ref1) => onUpdate({ ref1 })} />
            <button className="reference-pick" onClick={() => handleUseSelection("ref1")}>
              Use Selection
            </button>
          </div>
        </PropertyRow>
      )}

      {effectiveMode === "twoPlanes" && (
        <PropertyRow label="Reference 2">
          <div className="reference-row">
            <TextInput value={data.ref2 ?? ""} onChange={(ref2) => onUpdate({ ref2 })} />
            <button className="reference-pick" onClick={() => handleUseSelection("ref2")}>
              Use Selection
            </button>
          </div>
        </PropertyRow>
      )}

      {effectiveMode === "twoPoints" && (
        <>
          <PropertyRow label="Point 1">
            <TextInput
              value={data.ref1 ?? ""}
              onChange={(ref1) => onUpdate({ ref1 })}
              placeholder="point:x,y,z"
            />
          </PropertyRow>
          <PropertyRow label="Point 2">
            <TextInput
              value={data.ref2 ?? ""}
              onChange={(ref2) => onUpdate({ ref2 })}
              placeholder="point:x,y,z"
            />
          </PropertyRow>
        </>
      )}

      <PropertyRow label="Length">
        <NumberInput value={data.length} onChange={(length) => onUpdate({ length })} unit="mm" />
      </PropertyRow>

      {error && <div className="reference-error">{error}</div>}

      <div className="properties-panel-actions">
        <button className="properties-btn properties-btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button className="properties-btn properties-btn-accept" onClick={handleAccept}>
          OK
        </button>
      </div>
    </PropertyGroup>
  );
}
