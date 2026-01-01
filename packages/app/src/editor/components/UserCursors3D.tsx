/**
 * UserCursors3D - Displays 3D cursors for other connected users
 *
 * Renders cursor indicators in the 3D scene for users who are being followed.
 * Uses Three.js to create cursor meshes that follow other users' cursor positions.
 * Name labels use CSS2DObject to always face the camera (billboard effect).
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { UserAwarenessState } from "../../lib/awareness-state";
import "./UserCursors3D.css";

interface UserCursors3DProps {
  scene: THREE.Scene | null;
  connectedUsers: UserAwarenessState[];
  requestRender: () => void;
}

// Cursor geometry (small cone pointing at surface)
const CURSOR_RADIUS = 2;
const CURSOR_HEIGHT = 6;
const LABEL_OFFSET = 8; // Distance above cursor for the name label

interface CursorData {
  group: THREE.Group;
  labelElement: HTMLDivElement;
}

/**
 * Creates a cursor mesh for a user with a name label
 */
function createCursorMesh(userName: string, color: string): CursorData {
  const group = new THREE.Group();

  // Main cone cursor
  const coneGeometry = new THREE.ConeGeometry(CURSOR_RADIUS, CURSOR_HEIGHT, 8);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.8,
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);

  // Rotate so cone points "down" (toward the surface)
  cone.rotation.x = Math.PI;
  cone.position.y = CURSOR_HEIGHT / 2;

  group.add(cone);

  // Add a small ring at the base for visibility
  const ringGeometry = new THREE.RingGeometry(CURSOR_RADIUS * 0.8, CURSOR_RADIUS * 1.2, 16);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;

  group.add(ring);

  // Create name label using CSS2DObject (billboards to face camera)
  const labelDiv = document.createElement("div");
  labelDiv.className = "user-cursor-3d-label";
  labelDiv.textContent = userName;
  labelDiv.style.setProperty("--cursor-color", color);

  const labelObject = new CSS2DObject(labelDiv);
  labelObject.position.set(0, CURSOR_HEIGHT + LABEL_OFFSET, 0);
  labelObject.name = "user-label";

  group.add(labelObject);

  return { group, labelElement: labelDiv };
}

/**
 * Properly disposes of a cursor, including its CSS2D label DOM element
 */
function disposeCursor(cursorData: CursorData, scene: THREE.Scene) {
  // Remove the label element from DOM
  if (cursorData.labelElement.parentElement) {
    cursorData.labelElement.parentElement.removeChild(cursorData.labelElement);
  }

  // Dispose of Three.js resources
  cursorData.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });

  scene.remove(cursorData.group);
}

export function UserCursors3D({ scene, connectedUsers, requestRender }: UserCursors3DProps) {
  const cursorsRef = useRef<Map<string, CursorData>>(new Map());

  useEffect(() => {
    if (!scene) return;

    const cursors = cursorsRef.current;

    // Update or create cursors for each user with cursor3D data
    for (const userState of connectedUsers) {
      const userId = userState.user.id;
      const cursor3D = userState.cursor3D;

      if (!cursor3D || !cursor3D.visible) {
        // Remove cursor if not visible
        const existing = cursors.get(userId);
        if (existing) {
          disposeCursor(existing, scene);
          cursors.delete(userId);
          requestRender();
        }
        continue;
      }

      // Get or create cursor mesh
      let cursorData = cursors.get(userId);
      if (!cursorData) {
        cursorData = createCursorMesh(userState.user.name, userState.user.color);
        cursorData.group.name = `user-cursor-${userId}`;
        cursors.set(userId, cursorData);
        scene.add(cursorData.group);
      }

      // Update position
      const [x, y, z] = cursor3D.position;
      cursorData.group.position.set(x, y, z);

      // Orient cursor along surface normal if available
      if (cursor3D.normal) {
        const [nx, ny, nz] = cursor3D.normal;
        const normal = new THREE.Vector3(nx, ny, nz);

        // Create a quaternion that rotates from default up (0, 1, 0) to the normal
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
        cursorData.group.setRotationFromQuaternion(quaternion);
      }

      requestRender();
    }

    // Remove cursors for users who left
    const currentUserIds = new Set(connectedUsers.map((u) => u.user.id));
    for (const [userId, cursorData] of cursors) {
      if (!currentUserIds.has(userId)) {
        disposeCursor(cursorData, scene);
        cursors.delete(userId);
        requestRender();
      }
    }

    // Cleanup on unmount
    return () => {
      for (const [, cursorData] of cursors) {
        disposeCursor(cursorData, scene);
      }
      cursors.clear();
    };
  }, [scene, connectedUsers, requestRender]);

  return null; // This component only manages Three.js objects
}
