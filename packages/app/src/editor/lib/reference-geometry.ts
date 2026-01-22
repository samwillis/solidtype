/**
 * Reference geometry helpers for planes and axes.
 *
 * These are lightweight math utilities used by reference geometry tools
 * to compute plane/axis previews and feature definitions from selections.
 */

export type Vec3 = [number, number, number];

export interface PlaneBasis {
  origin: Vec3;
  normal: Vec3;
  xDir: Vec3;
  yDir: Vec3;
}

export interface AxisLine {
  origin: Vec3;
  direction: Vec3;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  faceMap?: Uint32Array;
  edges?: Float32Array;
  edgeMap?: Uint32Array;
}

const EPS = 1e-8;

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function mul(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < EPS) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function computeOrthonormalBasis(normal: Vec3): { xDir: Vec3; yDir: Vec3 } {
  const n = normalize(normal);
  const candidate: Vec3 = Math.abs(n[2]) > 0.9999 ? [1, 0, 0] : [0, 0, 1];
  const xDir = normalize(cross(n, candidate));
  const yDir = normalize(cross(n, xDir));
  return { xDir, yDir };
}

export function rotateVectorAroundAxis(vec: Vec3, axisDir: Vec3, angleRad: number): Vec3 {
  const k = normalize(axisDir);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const term1 = mul(vec, cos);
  const term2 = mul(cross(k, vec), sin);
  const term3 = mul(k, dot(k, vec) * (1 - cos));
  return add(add(term1, term2), term3);
}

export function rotatePointAroundAxis(
  point: Vec3,
  axisOrigin: Vec3,
  axisDir: Vec3,
  angleRad: number
): Vec3 {
  const relative = sub(point, axisOrigin);
  const rotated = rotateVectorAroundAxis(relative, axisDir, angleRad);
  return add(axisOrigin, rotated);
}

export function computePlaneFromPoints(p1: Vec3, p2: Vec3, p3: Vec3): PlaneBasis | null {
  const v1 = sub(p2, p1);
  const v2 = sub(p3, p1);
  const normal = cross(v1, v2);
  if (length(normal) < EPS) return null;
  const xDir = normalize(v1);
  const yDir = normalize(cross(normal, xDir));
  return { origin: p1, normal: normalize(normal), xDir, yDir };
}

export function computeMidplane(a: PlaneBasis, b: PlaneBasis): PlaneBasis | null {
  let n1 = normalize(a.normal);
  let n2 = normalize(b.normal);
  if (dot(n1, n2) < 0) {
    n2 = mul(n2, -1);
  }
  if (length(cross(n1, n2)) > EPS) return null;
  const distance = dot(sub(b.origin, a.origin), n1);
  const origin = add(a.origin, mul(n1, distance * 0.5));
  const xDir = length(a.xDir) > EPS ? normalize(a.xDir) : computeOrthonormalBasis(n1).xDir;
  const yDir = normalize(cross(n1, xDir));
  return { origin, normal: n1, xDir, yDir };
}

export function computeAnglePlane(base: PlaneBasis, axis: AxisLine, angleDeg: number): PlaneBasis {
  const angleRad = (angleDeg * Math.PI) / 180;
  const normal = rotateVectorAroundAxis(base.normal, axis.direction, angleRad);
  const xDir = rotateVectorAroundAxis(base.xDir, axis.direction, angleRad);
  const origin = rotatePointAroundAxis(base.origin, axis.origin, axis.direction, angleRad);
  const yDir = normalize(cross(normal, xDir));
  return { origin, normal: normalize(normal), xDir: normalize(xDir), yDir };
}

export function computePlaneFromFaceMesh(mesh: MeshData, faceIndex: number): PlaneBasis | null {
  if (!mesh.faceMap) return null;
  const positions = mesh.positions;
  const normals = mesh.normals;

  let count = 0;
  let centroid: Vec3 = [0, 0, 0];
  let normalSum: Vec3 = [0, 0, 0];

  for (let i = 0; i < mesh.faceMap.length; i++) {
    if (mesh.faceMap[i] !== faceIndex) continue;

    const i0 = mesh.indices[i * 3];
    const i1 = mesh.indices[i * 3 + 1];
    const i2 = mesh.indices[i * 3 + 2];

    for (const idx of [i0, i1, i2]) {
      const px = positions[idx * 3];
      const py = positions[idx * 3 + 1];
      const pz = positions[idx * 3 + 2];
      centroid = add(centroid, [px, py, pz]);
      const nx = normals[idx * 3];
      const ny = normals[idx * 3 + 1];
      const nz = normals[idx * 3 + 2];
      normalSum = add(normalSum, [nx, ny, nz]);
      count += 1;
    }
  }

  if (count === 0) return null;
  centroid = mul(centroid, 1 / count);
  const normal = normalize(normalSum);
  const basis = computeOrthonormalBasis(normal);
  return { origin: centroid, normal, xDir: basis.xDir, yDir: basis.yDir };
}

export function computeAxisFromEdgeMesh(mesh: MeshData, edgeIndex: number): AxisLine | null {
  if (!mesh.edges || !mesh.edgeMap) return null;

  let sumDir: Vec3 = [0, 0, 0];
  let originSum: Vec3 = [0, 0, 0];
  let count = 0;

  for (let i = 0; i < mesh.edgeMap.length; i++) {
    if (mesh.edgeMap[i] !== edgeIndex) continue;
    const x1 = mesh.edges[i * 6 + 0];
    const y1 = mesh.edges[i * 6 + 1];
    const z1 = mesh.edges[i * 6 + 2];
    const x2 = mesh.edges[i * 6 + 3];
    const y2 = mesh.edges[i * 6 + 4];
    const z2 = mesh.edges[i * 6 + 5];

    const v = sub([x2, y2, z2], [x1, y1, z1]);
    const vLen = length(v);
    if (vLen < EPS) continue;

    let dir = normalize(v);
    if (dot(sumDir, dir) < 0) {
      dir = mul(dir, -1);
    }
    sumDir = add(sumDir, dir);

    const mid = mul(add([x1, y1, z1], [x2, y2, z2]), 0.5);
    originSum = add(originSum, mid);
    count += 1;
  }

  if (count === 0) return null;
  const direction = normalize(sumDir);
  const origin = mul(originSum, 1 / count);
  return { origin, direction };
}

export function computeAxisFromTwoPoints(p1: Vec3, p2: Vec3): AxisLine | null {
  const dir = sub(p2, p1);
  if (length(dir) < EPS) return null;
  return { origin: p1, direction: normalize(dir) };
}

export function computeAxisFromTwoPlanes(a: PlaneBasis, b: PlaneBasis): AxisLine | null {
  const n1 = normalize(a.normal);
  const n2 = normalize(b.normal);
  const direction = cross(n1, n2);
  if (length(direction) < EPS) return null;

  // Solve for a point on the intersection line using plane equations.
  const d1 = dot(n1, a.origin);
  const d2 = dot(n2, b.origin);

  const abs = direction.map((v) => Math.abs(v));
  let origin: Vec3 = [0, 0, 0];

  if (abs[0] >= abs[1] && abs[0] >= abs[2]) {
    // x = 0, solve for y,z
    const det = n1[1] * n2[2] - n1[2] * n2[1];
    if (Math.abs(det) < EPS) return null;
    const y = (d1 * n2[2] - d2 * n1[2]) / det;
    const z = (d2 * n1[1] - d1 * n2[1]) / det;
    origin = [0, y, z];
  } else if (abs[1] >= abs[2]) {
    // y = 0, solve for x,z
    const det = n1[0] * n2[2] - n1[2] * n2[0];
    if (Math.abs(det) < EPS) return null;
    const x = (d1 * n2[2] - d2 * n1[2]) / det;
    const z = (d2 * n1[0] - d1 * n2[0]) / det;
    origin = [x, 0, z];
  } else {
    // z = 0, solve for x,y
    const det = n1[0] * n2[1] - n1[1] * n2[0];
    if (Math.abs(det) < EPS) return null;
    const x = (d1 * n2[1] - d2 * n1[1]) / det;
    const y = (d2 * n1[0] - d1 * n2[0]) / det;
    origin = [x, y, 0];
  }

  return { origin, direction: normalize(direction) };
}

export function parsePointRef(ref: string): Vec3 | null {
  if (!ref.startsWith("point:")) return null;
  const raw = ref.slice("point:".length);
  const parts = raw.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) return null;
  return [parts[0], parts[1], parts[2]];
}

export function parseFaceRef(ref: string): { featureId: string; faceIndex: number } | null {
  if (!ref.startsWith("face:")) return null;
  const parts = ref.split(":");
  if (parts.length !== 3) return null;
  const faceIndex = Number(parts[2]);
  if (Number.isNaN(faceIndex)) return null;
  return { featureId: parts[1], faceIndex };
}

export function parseEdgeRef(ref: string): { featureId: string; edgeIndex: number } | null {
  if (!ref.startsWith("edge:")) return null;
  const parts = ref.split(":");
  if (parts.length !== 3) return null;
  const edgeIndex = Number(parts[2]);
  if (Number.isNaN(edgeIndex)) return null;
  return { featureId: parts[1], edgeIndex };
}
