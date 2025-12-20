import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';

export type ViewPreset = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'isometric' | 
  'front-top' | 'front-bottom' | 'front-left' | 'front-right' |
  'back-top' | 'back-bottom' | 'back-left' | 'back-right' |
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' |
  'front-top-left' | 'front-top-right' | 'front-bottom-left' | 'front-bottom-right' |
  'back-top-left' | 'back-top-right' | 'back-bottom-left' | 'back-bottom-right';

export type DisplayMode = 'wireframe' | 'shaded';
export type ProjectionMode = 'perspective' | 'orthographic';

interface ViewerState {
  displayMode: DisplayMode;
  projectionMode: ProjectionMode;
  currentView: ViewPreset | null;
}

interface ViewerActions {
  setView: (preset: ViewPreset) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  toggleProjection: () => void;
  zoomToFit: () => void;
}

// Shared camera state ref for real-time sync between Viewer and ViewCube
export interface CameraStateRef {
  position: THREE.Vector3;  // Camera position relative to target
  up: THREE.Vector3;        // Camera up vector
  version: number;          // Incremented on each update to trigger checks
}

interface ViewerRefs {
  camera: React.MutableRefObject<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>;
  scene: React.MutableRefObject<THREE.Scene | null>;
  target: React.MutableRefObject<THREE.Vector3>;
  container: React.MutableRefObject<HTMLDivElement | null>;
  updateCamera: (projection: ProjectionMode) => void;
  requestRender: () => void;
}

interface ViewerContextValue {
  state: ViewerState;
  actions: ViewerActions;
  registerRefs: (refs: ViewerRefs) => void;
  cameraStateRef: React.MutableRefObject<CameraStateRef>;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export const useViewer = (): ViewerContextValue => {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewer must be used within a ViewerProvider');
  }
  return context;
};

// Camera distance for standard views
const VIEW_DISTANCE = 8;

// Calculate position from face/edge/corner name
function getViewPosition(preset: ViewPreset): { position: THREE.Vector3; up: THREE.Vector3 } {
  const d = VIEW_DISTANCE;
  const c = d * 0.577; // For corners (normalized)
  const e = d * 0.707; // For edges (normalized)

  const positions: Record<ViewPreset, { position: THREE.Vector3; up: THREE.Vector3 }> = {
    // Faces
    front: { position: new THREE.Vector3(0, 0, d), up: new THREE.Vector3(0, 1, 0) },
    back: { position: new THREE.Vector3(0, 0, -d), up: new THREE.Vector3(0, 1, 0) },
    top: { position: new THREE.Vector3(0, d, 0), up: new THREE.Vector3(0, 0, -1) },
    bottom: { position: new THREE.Vector3(0, -d, 0), up: new THREE.Vector3(0, 0, 1) },
    left: { position: new THREE.Vector3(-d, 0, 0), up: new THREE.Vector3(0, 1, 0) },
    right: { position: new THREE.Vector3(d, 0, 0), up: new THREE.Vector3(0, 1, 0) },
    isometric: { position: new THREE.Vector3(c, c, c), up: new THREE.Vector3(0, 1, 0) },
    // Edges (horizontal)
    'front-top': { position: new THREE.Vector3(0, e, e), up: new THREE.Vector3(0, 1, 0) },
    'front-bottom': { position: new THREE.Vector3(0, -e, e), up: new THREE.Vector3(0, 1, 0) },
    'front-left': { position: new THREE.Vector3(-e, 0, e), up: new THREE.Vector3(0, 1, 0) },
    'front-right': { position: new THREE.Vector3(e, 0, e), up: new THREE.Vector3(0, 1, 0) },
    'back-top': { position: new THREE.Vector3(0, e, -e), up: new THREE.Vector3(0, 1, 0) },
    'back-bottom': { position: new THREE.Vector3(0, -e, -e), up: new THREE.Vector3(0, 1, 0) },
    'back-left': { position: new THREE.Vector3(-e, 0, -e), up: new THREE.Vector3(0, 1, 0) },
    'back-right': { position: new THREE.Vector3(e, 0, -e), up: new THREE.Vector3(0, 1, 0) },
    'top-left': { position: new THREE.Vector3(-e, e, 0), up: new THREE.Vector3(0, 1, 0) },
    'top-right': { position: new THREE.Vector3(e, e, 0), up: new THREE.Vector3(0, 1, 0) },
    'bottom-left': { position: new THREE.Vector3(-e, -e, 0), up: new THREE.Vector3(0, 1, 0) },
    'bottom-right': { position: new THREE.Vector3(e, -e, 0), up: new THREE.Vector3(0, 1, 0) },
    // Corners
    'front-top-left': { position: new THREE.Vector3(-c, c, c), up: new THREE.Vector3(0, 1, 0) },
    'front-top-right': { position: new THREE.Vector3(c, c, c), up: new THREE.Vector3(0, 1, 0) },
    'front-bottom-left': { position: new THREE.Vector3(-c, -c, c), up: new THREE.Vector3(0, 1, 0) },
    'front-bottom-right': { position: new THREE.Vector3(c, -c, c), up: new THREE.Vector3(0, 1, 0) },
    'back-top-left': { position: new THREE.Vector3(-c, c, -c), up: new THREE.Vector3(0, 1, 0) },
    'back-top-right': { position: new THREE.Vector3(c, c, -c), up: new THREE.Vector3(0, 1, 0) },
    'back-bottom-left': { position: new THREE.Vector3(-c, -c, -c), up: new THREE.Vector3(0, 1, 0) },
    'back-bottom-right': { position: new THREE.Vector3(c, -c, -c), up: new THREE.Vector3(0, 1, 0) },
  };

  return positions[preset];
}

interface ViewerProviderProps {
  children: React.ReactNode;
}

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children }) => {
  const [state, setState] = useState<ViewerState>({
    displayMode: 'shaded',
    projectionMode: 'perspective',
    currentView: null,
  });

  // Shared ref for camera state (avoids React state updates during drag)
  const cameraStateRef = useRef<CameraStateRef>({
    position: new THREE.Vector3(1, 1, 1).normalize(),
    up: new THREE.Vector3(0, 1, 0),
    version: 0,
  });

  const viewerRefsRef = useRef<ViewerRefs | null>(null);

  const registerRefs = useCallback((refs: ViewerRefs) => {
    viewerRefsRef.current = refs;
  }, []);

  const setView = useCallback((preset: ViewPreset) => {
    const refs = viewerRefsRef.current;
    if (!refs || !refs.camera.current) return;

    const { position, up } = getViewPosition(preset);
    const camera = refs.camera.current;
    const target = refs.target.current;

    // Set camera position relative to target
    camera.position.copy(position).add(target);
    camera.up.copy(up);
    camera.lookAt(target);

    // Update camera state ref
    cameraStateRef.current.position.copy(position).normalize();
    cameraStateRef.current.up.copy(up);
    cameraStateRef.current.version++;

    setState((prev) => ({ ...prev, currentView: preset }));
    refs.requestRender();
  }, []);

  const setDisplayMode = useCallback((mode: DisplayMode) => {
    const refs = viewerRefsRef.current;
    if (!refs || !refs.scene.current) return;

    // Update all mesh materials in the scene
    refs.scene.current.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const material = object.material as THREE.MeshStandardMaterial;
        material.wireframe = mode === 'wireframe';
      }
    });

    setState((prev) => ({ ...prev, displayMode: mode }));
    refs.requestRender();
  }, []);

  const toggleProjection = useCallback(() => {
    const refs = viewerRefsRef.current;
    if (!refs) return;

    setState((prev) => {
      const newMode = prev.projectionMode === 'perspective' ? 'orthographic' : 'perspective';
      refs.updateCamera(newMode);
      return { ...prev, projectionMode: newMode };
    });
  }, []);

  const zoomToFit = useCallback(() => {
    const refs = viewerRefsRef.current;
    if (!refs || !refs.camera.current || !refs.scene.current) return;

    const camera = refs.camera.current;
    const scene = refs.scene.current;

    // Calculate bounding box of scene
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    let distance: number;
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = camera.fov * (Math.PI / 180);
      distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;
    } else {
      distance = maxDim * 1.5;
    }

    // Update target to center
    refs.target.current.copy(center);

    // Move camera to new distance while maintaining direction
    const direction = camera.position.clone().sub(refs.target.current).normalize();
    camera.position.copy(refs.target.current).add(direction.multiplyScalar(distance));
    camera.lookAt(refs.target.current);

    refs.requestRender();
  }, []);

  return (
    <ViewerContext.Provider value={{ state, actions: { setView, setDisplayMode, toggleProjection, zoomToFit }, registerRefs, cameraStateRef }}>
      {children}
    </ViewerContext.Provider>
  );
};
