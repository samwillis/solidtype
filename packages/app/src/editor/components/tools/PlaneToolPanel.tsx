import { useMemo, useState } from "react";
import { useDocument } from "../../contexts/DocumentContext";
import { useKernel } from "../../contexts/KernelContext";
import { useSelection } from "../../contexts/SelectionContext";
import type { PlaneToolFormData } from "../../types/featureSchemas";
import {
  PropertyGroup,
  PropertyRow,
  TextInput,
  NumberInput,
  SelectInput,
  CheckboxInput,
} from "../properties-panel/inputs";
import {
  computeAnglePlane,
  computeMidplane,
  computePlaneFromFaceMesh,
  computePlaneFromPoints,
  computeAxisFromEdgeMesh,
  computeOrthonormalBasis,
  cross,
  normalize,
  parseFaceRef,
  parseEdgeRef,
  parsePointRef,
  type PlaneBasis,
  type AxisLine,
} from "../../lib/reference-geometry";
import { findDatumPlaneByRole } from "../../document/createDocument";

export interface PlaneToolPanelProps {
  data: PlaneToolFormData;
  onUpdate: (update: Partial<PlaneToolFormData>) => void;
  onCancel: () => void;
}

const modeOptions = [
  { value: "auto", label: "Auto-detect" },
  { value: "offset", label: "Offset" },
  { value: "midplane", label: "Midplane" },
  { value: "angle", label: "Angle" },
  { value: "threePoint", label: "3-Point" },
] as const;

export function PlaneToolPanel({ data, onUpdate, onCancel }: PlaneToolPanelProps) {
  const { getFeatureById, addPlane, doc } = useDocument();
  const { meshes } = useKernel();
  const { selectedFaces, selectedEdges, selectedFeatureId } = useSelection();
  const [error, setError] = useState<string | null>(null);

  const effectiveMode = useMemo(() => {
    if (data.mode !== "auto") return data.mode;
    if (data.ref1 && data.ref2 && data.ref3) return "threePoint";
    if (data.ref1 && data.ref2) {
      if (data.ref2.startsWith("edge:")) return "angle";
      return "midplane";
    }
    return "offset";
  }, [data.mode, data.ref1, data.ref2, data.ref3]);

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
    if (effectiveMode === "angle" && slot === "ref2") {
      const edgeRef = getSelectedEdgeRef();
      if (edgeRef) onUpdate({ ref2: edgeRef });
      return;
    }

    const planeRef = getSelectedPlaneRef();
    if (planeRef) {
      onUpdate({ [slot]: planeRef } as Partial<PlaneToolFormData>);
    }
  };

  const handleAccept = () => {
    setError(null);
    const mode = effectiveMode;

    if (mode === "threePoint") {
      const p1 = parsePointRef(data.ref1 ?? "");
      const p2 = parsePointRef(data.ref2 ?? "");
      const p3 = parsePointRef(data.ref3 ?? "");
      if (!p1 || !p2 || !p3) {
        setError("Provide three valid point coordinates.");
        return;
      }
      const plane = computePlaneFromPoints(p1, p2, p3);
      if (!plane) {
        setError("Points are collinear - cannot create plane.");
        return;
      }
      const normal = data.flipNormal ? [-plane.normal[0], -plane.normal[1], -plane.normal[2]] : plane.normal;
      const xDir = data.flipNormal ? [-plane.xDir[0], -plane.xDir[1], -plane.xDir[2]] : plane.xDir;
      addPlane({
        name: data.name,
        definition: {
          kind: "threePoints",
          point1Ref: data.ref1 ?? "",
          point2Ref: data.ref2 ?? "",
          point3Ref: data.ref3 ?? "",
        },
        origin: plane.origin,
        normal,
        xDir,
        width: data.width,
        height: data.height,
      });
      onCancel();
      return;
    }

    if (mode === "offset") {
      const base = resolvePlaneBasis(data.ref1);
      if (!base) {
        setError("Select a planar face or plane for Reference 1.");
        return;
      }
      const offset = data.flipNormal ? -data.offset : data.offset;
      const origin = [
        base.origin[0] + base.normal[0] * offset,
        base.origin[1] + base.normal[1] * offset,
        base.origin[2] + base.normal[2] * offset,
      ] as [number, number, number];

      const definition = data.ref1?.startsWith("face:")
        ? { kind: "offsetFace", faceRef: data.ref1, distance: data.offset }
        : { kind: "offsetPlane", basePlaneId: data.ref1 ?? "", distance: data.offset };

      addPlane({
        name: data.name,
        definition,
        origin,
        normal: base.normal,
        xDir: base.xDir,
        width: data.width,
        height: data.height,
      });
      onCancel();
      return;
    }

    if (mode === "midplane") {
      const p1 = resolvePlaneBasis(data.ref1);
      const p2 = resolvePlaneBasis(data.ref2);
      if (!p1 || !p2) {
        setError("Select two planar references for midplane.");
        return;
      }
      const plane = computeMidplane(p1, p2);
      if (!plane) {
        setError("Selected planes are not parallel.");
        return;
      }
      const normal = data.flipNormal ? [-plane.normal[0], -plane.normal[1], -plane.normal[2]] : plane.normal;
      const xDir = data.flipNormal ? [-plane.xDir[0], -plane.xDir[1], -plane.xDir[2]] : plane.xDir;
      addPlane({
        name: data.name,
        definition: {
          kind: "midplane",
          plane1Ref: data.ref1 ?? "",
          plane2Ref: data.ref2 ?? "",
        },
        origin: plane.origin,
        normal,
        xDir,
        width: data.width,
        height: data.height,
      });
      onCancel();
      return;
    }

    if (mode === "angle") {
      const basePlane = resolvePlaneBasis(data.ref1);
      const axis = resolveAxis(data.ref2);
      if (!basePlane || !axis) {
        setError("Select a plane and a linear reference for angle.");
        return;
      }
      const plane = computeAnglePlane(basePlane, axis, data.angle);
      const normal = data.flipNormal ? [-plane.normal[0], -plane.normal[1], -plane.normal[2]] : plane.normal;
      const xDir = data.flipNormal ? [-plane.xDir[0], -plane.xDir[1], -plane.xDir[2]] : plane.xDir;
      addPlane({
        name: data.name,
        definition: {
          kind: "axisAngle",
          axisRef: data.ref2 ?? "",
          angle: data.angle,
          basePlaneRef: data.ref1 ?? "",
        },
        origin: plane.origin,
        normal,
        xDir,
        width: data.width,
        height: data.height,
      });
      onCancel();
    }
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

      {(effectiveMode === "offset" || effectiveMode === "midplane" || effectiveMode === "angle") && (
        <PropertyRow label="Reference 1">
          <div className="reference-row">
            <TextInput value={data.ref1 ?? ""} onChange={(ref1) => onUpdate({ ref1 })} />
            <button className="reference-pick" onClick={() => handleUseSelection("ref1")}>
              Use Selection
            </button>
          </div>
        </PropertyRow>
      )}

      {(effectiveMode === "midplane" || effectiveMode === "angle") && (
        <PropertyRow label="Reference 2">
          <div className="reference-row">
            <TextInput value={data.ref2 ?? ""} onChange={(ref2) => onUpdate({ ref2 })} />
            <button className="reference-pick" onClick={() => handleUseSelection("ref2")}>
              Use Selection
            </button>
          </div>
        </PropertyRow>
      )}

      {effectiveMode === "threePoint" && (
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
          <PropertyRow label="Point 3">
            <TextInput
              value={data.ref3 ?? ""}
              onChange={(ref3) => onUpdate({ ref3 })}
              placeholder="point:x,y,z"
            />
          </PropertyRow>
        </>
      )}

      {effectiveMode === "offset" && (
        <PropertyRow label="Offset">
          <NumberInput value={data.offset} onChange={(offset) => onUpdate({ offset })} unit="mm" />
        </PropertyRow>
      )}

      {effectiveMode === "angle" && (
        <PropertyRow label="Angle">
          <NumberInput value={data.angle} onChange={(angle) => onUpdate({ angle })} unit="°" />
        </PropertyRow>
      )}

      <PropertyRow label="Flip Normal">
        <CheckboxInput
          checked={data.flipNormal}
          onChange={(flipNormal) => onUpdate({ flipNormal })}
        />
      </PropertyRow>

      <PropertyRow label="Width">
        <NumberInput value={data.width} onChange={(width) => onUpdate({ width })} unit="mm" />
      </PropertyRow>
      <PropertyRow label="Height">
        <NumberInput value={data.height} onChange={(height) => onUpdate({ height })} unit="mm" />
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
