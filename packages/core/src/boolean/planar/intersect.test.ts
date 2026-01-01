import { describe, expect, it } from "vitest";
import { createPlaneSurface } from "../../geom/surface.js";
import type { FacePolygon2D } from "./types.js";
import { computeFaceIntersection } from "./intersect.js";

describe(`planar intersect`, () => {
  it(`returns overlap segment when intersection line lies on polygon edge`, () => {
    const planeA = createPlaneSurface([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const planeB = createPlaneSurface([1, 0, 0], [1, 0, 0], [0, 1, 0]);

    const faceA: FacePolygon2D = {
      faceId: 0 as any,
      outer: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
      holes: [],
      surface: planeA,
    };

    const faceB: FacePolygon2D = {
      faceId: 1 as any,
      outer: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
      holes: [],
      surface: planeB,
    };

    const ctx = { tol: { length: 1e-6, angle: 1e-6 } } as any;
    const intersection = computeFaceIntersection(faceA, faceB, ctx, `subtract`);

    expect(intersection).not.toBeNull();
    const segmentsA = intersection!.segmentsA;
    expect(segmentsA.length).toBeGreaterThan(0);

    // Segment should run along the x=1 edge of faceA (u=1 in its UV space)
    const [a, b] = [segmentsA[0].a, segmentsA[0].b];
    expect(Math.abs(a[0] - 1)).toBeLessThan(1e-6);
    expect(Math.abs(b[0] - 1)).toBeLessThan(1e-6);
    expect(Math.abs(a[1] + 1)).toBeLessThan(1e-6);
    expect(Math.abs(b[1] - 1)).toBeLessThan(1e-6);
  });
});
