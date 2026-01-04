/**
 * Tests for integer-based geometry
 *
 * The key test: when we compute an intersection point, both faces
 * get the EXACT SAME integer coordinates, not "slightly different" values.
 */

import { describe, it, expect } from "vitest";
import {
  Vec3I,
  Vec2I,
  mmToNano,
  nanoToMm,
  vec3ToFloat,
  segmentIntersection2I,
  lineLineClosestPoints3I,
  planePlaneIntersection,
  equalsI,
} from "../../src/num/integer-geometry.js";

describe("integer-geometry", () => {
  describe("conversion", () => {
    it("converts mm to nanometers", () => {
      expect(mmToNano(1)).toBe(1_000_000);
      expect(mmToNano(0.001)).toBe(1_000); // 1 micrometer
      expect(mmToNano(0.000001)).toBe(1); // 1 nanometer
    });

    it("converts nanometers back to mm", () => {
      expect(nanoToMm(1_000_000)).toBe(1);
      expect(nanoToMm(1_000)).toBe(0.001);
      expect(nanoToMm(1)).toBe(0.000001);
    });

    it("round-trips with minimal error", () => {
      const original = 123.456789;
      const roundTrip = nanoToMm(mmToNano(original));
      // Error should be at most 0.5nm = 0.0000005mm
      expect(Math.abs(roundTrip - original)).toBeLessThan(0.000001);
    });
  });

  describe("segment intersection 2D", () => {
    it("finds intersection of crossing segments", () => {
      // Two segments crossing at (1.5mm, 1.5mm) in mm
      // In nanometers: (1500000, 1500000)
      const p1: Vec2I = [0, 0];
      const p2: Vec2I = [3_000_000, 3_000_000]; // 3mm
      const p3: Vec2I = [0, 3_000_000];
      const p4: Vec2I = [3_000_000, 0];

      const result = segmentIntersection2I(p1, p2, p3, p4);

      expect(result).not.toBeNull();
      expect(result![0]).toBe(1_500_000); // 1.5mm in nm
      expect(result![1]).toBe(1_500_000);
    });

    it("returns null for parallel segments", () => {
      const p1: Vec2I = [0, 0];
      const p2: Vec2I = [1_000_000, 0];
      const p3: Vec2I = [0, 1_000_000];
      const p4: Vec2I = [1_000_000, 1_000_000];

      const result = segmentIntersection2I(p1, p2, p3, p4);
      expect(result).toBeNull();
    });

    it("returns null for non-intersecting segments", () => {
      const p1: Vec2I = [0, 0];
      const p2: Vec2I = [1_000_000, 1_000_000];
      const p3: Vec2I = [2_000_000, 0];
      const p4: Vec2I = [3_000_000, 1_000_000];

      const result = segmentIntersection2I(p1, p2, p3, p4);
      expect(result).toBeNull();
    });

    it("handles tilted lines with non-integer intersection", () => {
      // Line 1: (0, 0) to (10mm, 7mm) - tilted
      // Line 2: (0, 5mm) to (10mm, 2mm) - tilted opposite
      // Intersection is at some non-integer point
      const p1: Vec2I = [0, 0];
      const p2: Vec2I = [10_000_000, 7_000_000];
      const p3: Vec2I = [0, 5_000_000];
      const p4: Vec2I = [10_000_000, 2_000_000];

      const result = segmentIntersection2I(p1, p2, p3, p4);
      expect(result).not.toBeNull();

      // The key property: result is an integer (snapped to grid)
      expect(Number.isInteger(result![0])).toBe(true);
      expect(Number.isInteger(result![1])).toBe(true);
    });
  });

  describe("THE KEY TEST: same intersection point for both faces", () => {
    it("gives identical points when computed from both directions", () => {
      // Simulate computing the same intersection from two different faces
      // In floating point, these would give slightly different results
      // With integer snapping, they must be IDENTICAL

      // Face A has edge: (0, 0) to (10mm, 7mm)
      const faceA_p1: Vec2I = [0, 0];
      const faceA_p2: Vec2I = [10_000_000, 7_000_000];

      // Face B has edge: (0, 5mm) to (10mm, 2mm)
      const faceB_p1: Vec2I = [0, 5_000_000];
      const faceB_p2: Vec2I = [10_000_000, 2_000_000];

      // Compute intersection from Face A's perspective
      const resultFromA = segmentIntersection2I(faceA_p1, faceA_p2, faceB_p1, faceB_p2);

      // Compute intersection from Face B's perspective (arguments swapped)
      const resultFromB = segmentIntersection2I(faceB_p1, faceB_p2, faceA_p1, faceA_p2);

      expect(resultFromA).not.toBeNull();
      expect(resultFromB).not.toBeNull();

      // THE KEY ASSERTION: Both computations give the EXACT SAME point
      expect(resultFromA![0]).toBe(resultFromB![0]);
      expect(resultFromA![1]).toBe(resultFromB![1]);

      console.log("Intersection point (nm):", resultFromA);
      console.log("Intersection point (mm):", [
        nanoToMm(resultFromA![0]),
        nanoToMm(resultFromA![1]),
      ]);
    });

    it("gives identical 3D intersection points from both lines", () => {
      // Two 3D lines that intersect
      // Line 1: passes through (0,0,0) in direction (1, 0.7, 0.3)
      // Line 2: passes through (5mm, 0, 0) in direction (0, 1, 0.5)

      const line1Point: Vec3I = [0, 0, 0];
      const line1Dir: Vec3I = [1_000_000, 700_000, 300_000];

      const line2Point: Vec3I = [5_000_000, 0, 0];
      const line2Dir: Vec3I = [0, 1_000_000, 500_000];

      const result = lineLineClosestPoints3I(line1Point, line1Dir, line2Point, line2Dir);

      expect(result).not.toBeNull();

      const [pointOnLine1, pointOnLine2] = result!;

      // THE KEY ASSERTION: Both lines get the SAME point
      expect(equalsI(pointOnLine1, pointOnLine2)).toBe(true);

      console.log("3D intersection point (nm):", pointOnLine1);
      console.log("3D intersection point (mm):", vec3ToFloat(pointOnLine1));
    });
  });

  describe("plane-plane intersection", () => {
    it("computes intersection of XY and XZ planes", () => {
      // XY plane: normal (0, 0, 1), point (0, 0, 0)
      const n1: Vec3I = [0, 0, 1_000_000];
      const p1: Vec3I = [0, 0, 0];

      // XZ plane: normal (0, 1, 0), point (0, 0, 0)
      const n2: Vec3I = [0, 1_000_000, 0];
      const p2: Vec3I = [0, 0, 0];

      const result = planePlaneIntersection(n1, p1, n2, p2);

      expect(result).not.toBeNull();

      // Direction should be along X axis (cross product of normals)
      // (0,0,1) × (0,1,0) = (-1, 0, 0)
      expect(result!.direction[0]).not.toBe(0);
      expect(result!.direction[1]).toBe(0);
      expect(result!.direction[2]).toBe(0);

      console.log("Plane intersection:", result);
    });

    it("computes intersection of tilted planes", () => {
      // Plane 1: normal tilted 20° around Y
      const angle = (20 * Math.PI) / 180;
      const n1: Vec3I = [mmToNano(Math.sin(angle)), 0, mmToNano(Math.cos(angle))];
      const p1: Vec3I = [0, 0, 0];

      // Plane 2: vertical YZ plane
      const n2: Vec3I = [1_000_000, 0, 0];
      const p2: Vec3I = [5_000_000, 0, 0]; // 5mm along X

      const result = planePlaneIntersection(n1, p1, n2, p2);

      expect(result).not.toBeNull();

      // The intersection point is snapped to integer grid
      expect(Number.isInteger(result!.point[0])).toBe(true);
      expect(Number.isInteger(result!.point[1])).toBe(true);
      expect(Number.isInteger(result!.point[2])).toBe(true);

      console.log("Tilted plane intersection:", {
        point: vec3ToFloat(result!.point),
        direction: vec3ToFloat(result!.direction as Vec3I),
      });
    });
  });

  describe("practical CAD scenarios", () => {
    it("handles the problematic 20° angled cut", () => {
      // This is the scenario that was failing with floating point:
      // A vertical face (x=0 plane) intersecting a tilted face (20° rotation around Y)

      // Face 1: vertical plane at x=0
      const n1: Vec3I = [1_000_000, 0, 0]; // normal in +X
      const p1: Vec3I = [0, 0, 0];

      // Face 2: plane tilted 20° around Y axis
      const angle = (20 * Math.PI) / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const n2: Vec3I = [mmToNano(sinA), mmToNano(-cosA), 0];
      const p2: Vec3I = [mmToNano(5), mmToNano(2), 0]; // Some point on the plane

      const result = planePlaneIntersection(n1, p1, n2, p2);

      expect(result).not.toBeNull();

      // The intersection line should be along Y (since both normals are in XY plane)
      // Direction should have only Z component (cross of X-facing and tilted normals)

      console.log("Angled cut intersection:", {
        point_mm: vec3ToFloat(result!.point),
        direction_mm: vec3ToFloat(result!.direction as Vec3I),
      });

      // Verify the point is exactly an integer (no floating point fuzz)
      expect(result!.point[0]).toBe(Math.round(result!.point[0]));
      expect(result!.point[1]).toBe(Math.round(result!.point[1]));
      expect(result!.point[2]).toBe(Math.round(result!.point[2]));
    });
  });
});
