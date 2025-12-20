import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';

export type ViewPreset = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'isometric';
export type DisplayMode = 'wireframe' | 'shaded';

interface ViewerState {
  displayMode: DisplayMode;
  currentView: ViewPreset;
}

interface ViewerActions {
  setView: (preset: ViewPreset) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  zoomToFit: () => void;
}

interface ViewerRefs {
  camera: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  scene: React.MutableRefObject<THREE.Scene | null>;
  target: React.MutableRefObject<THREE.Vector3>;
  requestRender: () => void;
}

interface ViewerContextValue {
  state: ViewerState;
  actions: ViewerActions;
  registerRefs: (refs: ViewerRefs) => void;
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

// Preset camera positions (looking at origin)
const VIEW_PRESETS: Record<ViewPreset, { position: THREE.Vector3; up: THREE.Vector3 }> = {
  front: { position: new THREE.Vector3(0, 0, VIEW_DISTANCE), up: new THREE.Vector3(0, 1, 0) },
  back: { position: new THREE.Vector3(0, 0, -VIEW_DISTANCE), up: new THREE.Vector3(0, 1, 0) },
  top: { position: new THREE.Vector3(0, VIEW_DISTANCE, 0), up: new THREE.Vector3(0, 0, -1) },
  bottom: { position: new THREE.Vector3(0, -VIEW_DISTANCE, 0), up: new THREE.Vector3(0, 0, 1) },
  left: { position: new THREE.Vector3(-VIEW_DISTANCE, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  right: { position: new THREE.Vector3(VIEW_DISTANCE, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  isometric: { 
    position: new THREE.Vector3(VIEW_DISTANCE * 0.577, VIEW_DISTANCE * 0.577, VIEW_DISTANCE * 0.577), 
    up: new THREE.Vector3(0, 1, 0) 
  },
};

interface ViewerProviderProps {
  children: React.ReactNode;
}

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children }) => {
  const [state, setState] = useState<ViewerState>({
    displayMode: 'shaded',
    currentView: 'isometric',
  });

  const viewerRefsRef = useRef<ViewerRefs | null>(null);

  const registerRefs = useCallback((refs: ViewerRefs) => {
    viewerRefsRef.current = refs;
  }, []);

  const setView = useCallback((preset: ViewPreset) => {
    const refs = viewerRefsRef.current;
    if (!refs || !refs.camera.current) return;

    const { position, up } = VIEW_PRESETS[preset];
    const camera = refs.camera.current;
    const target = refs.target.current;

    // Set camera position relative to target
    camera.position.copy(position).add(target);
    camera.up.copy(up);
    camera.lookAt(target);

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
    const fov = camera.fov * (Math.PI / 180);
    const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

    // Update target to center
    refs.target.current.copy(center);

    // Move camera to new distance while maintaining direction
    const direction = camera.position.clone().sub(refs.target.current).normalize();
    camera.position.copy(refs.target.current).add(direction.multiplyScalar(distance));
    camera.lookAt(refs.target.current);

    refs.requestRender();
  }, []);

  return (
    <ViewerContext.Provider value={{ state, actions: { setView, setDisplayMode, zoomToFit }, registerRefs }}>
      {children}
    </ViewerContext.Provider>
  );
};
