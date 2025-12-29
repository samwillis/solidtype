/**
 * useRaycast hook - provides raycasting for 3D selection
 */

import { useCallback, useMemo } from 'react';
import * as THREE from 'three';

export interface RaycastHit {
  bodyId: string;
  featureId: string;
  faceIndex: number;
  point: THREE.Vector3;
  normal: THREE.Vector3 | null;
  distance: number;
}

export interface UseRaycastOptions {
  camera: React.RefObject<THREE.Camera | null>;
  scene: React.RefObject<THREE.Scene | null>;
  container: React.RefObject<HTMLElement | null>;
  meshes: Map<string, { positions: Float32Array; normals: Float32Array; indices: Uint32Array; faceMap?: Uint32Array }>;
  bodies: Array<{ id: string; featureId: string }>;
}

export function useRaycast({
  camera,
  scene,
  container,
  meshes,
  bodies,
}: UseRaycastOptions) {
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const raycast = useCallback(
    (clientX: number, clientY: number): RaycastHit | null => {
      const cam = camera.current;
      const scn = scene.current;
      const cont = container.current;

      if (!cam || !scn || !cont) return null;

      // Convert to normalized device coordinates
      const rect = cont.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(ndc, cam);

      // Find all body meshes
      const meshGroup = scn.getObjectByName('kernel-meshes');
      if (!meshGroup) return null;

      const meshObjects: THREE.Mesh[] = [];
      meshGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name && !child.name.startsWith('__preview')) {
          meshObjects.push(child);
        }
      });

      const intersects = raycaster.intersectObjects(meshObjects);

      if (intersects.length === 0) return null;

      const hit = intersects[0];
      const bodyId = hit.object.name;
      const faceIndex = hit.faceIndex ?? 0;
      
      // Find the featureId for this body
      const bodyInfo = bodies.find((b) => b.id === bodyId);
      const featureId = bodyInfo?.featureId ?? '';

      // Get face normal from hit
      const normal = hit.face?.normal ?? null;

      return {
        bodyId,
        featureId,
        faceIndex,
        point: hit.point.clone(),
        normal: normal ? normal.clone() : null,
        distance: hit.distance,
      };
    },
    [camera, scene, container, raycaster, bodies]
  );

  /**
   * Get the actual face ID from triangle index using face map
   */
  const getFaceId = useCallback(
    (bodyId: string, triangleIndex: number): number => {
      const meshData = meshes.get(bodyId);
      if (!meshData || !meshData.faceMap) {
        // Fallback: assume each face is one triangle (not accurate, but better than nothing)
        return triangleIndex;
      }
      return meshData.faceMap[triangleIndex] ?? triangleIndex;
    },
    [meshes]
  );

  return { raycast, getFaceId };
}
