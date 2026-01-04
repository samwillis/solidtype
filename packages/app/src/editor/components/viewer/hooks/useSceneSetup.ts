/**
 * useSceneSetup - Three.js scene initialization hook
 *
 * Handles scene, camera, renderer, post-processing, lighting, and group creation.
 * Returns refs and state needed by other viewer hooks.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer, EffectPass, RenderPass, SSAOEffect, NormalPass } from "postprocessing";
import { useTheme } from "../../../contexts/ThemeContext";
import { parseHexColor } from "../viewer-utils";

/** Scene groups for organizing Three.js objects */
export interface SceneGroups {
  meshes: THREE.Group;
  edges: THREE.Group;
  sketch: THREE.Group;
  selection: THREE.Group;
  constraintLabels: THREE.Group;
  planes: THREE.Group;
  origin: THREE.Group;
  faceHighlights: THREE.Group;
}

/** Result of useSceneSetup hook */
export interface SceneSetupResult {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  composerRef: React.MutableRefObject<EffectComposer | null>;
  aoEffectRef: React.MutableRefObject<SSAOEffect | null>;
  labelRendererRef: React.MutableRefObject<CSS2DRenderer | null>;
  targetRef: React.MutableRefObject<THREE.Vector3>;
  needsRenderRef: React.MutableRefObject<boolean>;
  groupRefs: {
    meshGroup: React.MutableRefObject<THREE.Group | null>;
    edgeGroup: React.MutableRefObject<THREE.Group | null>;
    sketchGroup: React.MutableRefObject<THREE.Group | null>;
    selectionGroup: React.MutableRefObject<THREE.Group | null>;
    constraintLabelsGroup: React.MutableRefObject<THREE.Group | null>;
    planesGroup: React.MutableRefObject<THREE.Group | null>;
    originGroup: React.MutableRefObject<THREE.Group | null>;
    faceHighlightGroup: React.MutableRefObject<THREE.Group | null>;
  };
  sceneReady: boolean;
  requestRender: () => void;
}

/**
 * Hook to set up the Three.js scene, camera, renderer, and post-processing.
 *
 * @param containerRef - Ref to the container DOM element
 */
export function useSceneSetup(
  containerRef: React.RefObject<HTMLDivElement | null>
): SceneSetupResult {
  const { theme } = useTheme();

  // Core Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const aoEffectRef = useRef<SSAOEffect | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const needsRenderRef = useRef(true);

  // Scene group refs
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const edgeGroupRef = useRef<THREE.Group | null>(null);
  const sketchGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);
  const constraintLabelsGroupRef = useRef<THREE.Group | null>(null);
  const planesGroupRef = useRef<THREE.Group | null>(null);
  const originGroupRef = useRef<THREE.Group | null>(null);
  const faceHighlightGroupRef = useRef<THREE.Group | null>(null);

  const [sceneReady, setSceneReady] = useState(false);

  // Request a render
  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  // Scene initialization effect
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    const initialBgColor = theme === "dark" ? 0x1a1a1a : 0xfdfaf8;
    scene.background = new THREE.Color(initialBgColor);
    sceneRef.current = scene;

    // Camera setup - zoom out to show ~300mm working space
    const camera = new THREE.PerspectiveCamera(
      45, // Narrower FOV like CAD apps
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    // Isometric-ish starting view - distance for ~300mm workspace
    const distance = 350;
    camera.position.set(distance * 0.577, distance * 0.577, distance * 0.577);
    camera.lookAt(targetRef.current);
    cameraRef.current = camera;

    // Renderer setup with improved tone mapping for better contrast
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap for performance
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing setup for ambient occlusion
    const composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Normal pass required for SSAO
    const normalPass = new NormalPass(scene, camera);
    composer.addPass(normalPass);

    // SSAO Effect - screen-space ambient occlusion for depth perception
    const ssaoEffect = new SSAOEffect(camera, normalPass.texture, {
      worldDistanceThreshold: 100,
      worldDistanceFalloff: 50,
      worldProximityThreshold: 5,
      worldProximityFalloff: 2,
      luminanceInfluence: 0.5,
      radius: 0.1,
      intensity: 2.5,
      bias: 0.025,
      samples: 16,
      rings: 4,
      color: new THREE.Color(0x000000),
    });
    aoEffectRef.current = ssaoEffect;

    // Effect pass to apply SSAO
    const effectPass = new EffectPass(camera, ssaoEffect);
    composer.addPass(effectPass);
    composerRef.current = composer;

    // Enhanced CAD-style lighting with better contrast
    // Stronger ambient for base visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Key light - main illumination from upper-front-right
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(200, 350, 300);
    scene.add(keyLight);

    // Fill light - softer from opposite side
    const fillLight = new THREE.DirectionalLight(0xf0f0ff, 0.4);
    fillLight.position.set(-200, 50, -100);
    scene.add(fillLight);

    // Rim/back light - highlights edges from behind
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(-50, 100, -300);
    scene.add(rimLight);

    // Top light - soft overhead illumination
    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 400, 0);
    scene.add(topLight);

    // Hemisphere light for natural sky/ground gradient
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    scene.add(hemiLight);

    // Group for kernel meshes
    const meshGroup = new THREE.Group();
    meshGroup.name = "kernel-meshes";
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Group for edge lines
    const edgeGroup = new THREE.Group();
    edgeGroup.name = "edge-lines";
    edgeGroup.renderOrder = 0.1;
    scene.add(edgeGroup);
    edgeGroupRef.current = edgeGroup;

    // Group for sketch visualization
    const sketchGroup = new THREE.Group();
    sketchGroup.name = "sketch-3d";
    sketchGroup.renderOrder = 1;
    scene.add(sketchGroup);
    sketchGroupRef.current = sketchGroup;

    // Group for selection highlights
    const selectionGroup = new THREE.Group();
    selectionGroup.name = "selection-highlights";
    selectionGroup.renderOrder = 0.5;
    scene.add(selectionGroup);
    selectionGroupRef.current = selectionGroup;

    // Group for constraint labels (CSS2D)
    const constraintLabelsGroup = new THREE.Group();
    constraintLabelsGroup.name = "constraint-labels";
    scene.add(constraintLabelsGroup);
    constraintLabelsGroupRef.current = constraintLabelsGroup;

    // CSS2D Renderer for constraint labels
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    container.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    // Group for datum planes visualization
    const planesGroup = new THREE.Group();
    planesGroup.name = "datum-planes";
    planesGroup.renderOrder = 0;
    scene.add(planesGroup);
    planesGroupRef.current = planesGroup;

    // Group for origin visualization
    const originGroup = new THREE.Group();
    originGroup.name = "origin";
    originGroup.renderOrder = 0;
    scene.add(originGroup);
    originGroupRef.current = originGroup;

    // Group for 3D face/edge selection highlights
    const faceHighlightGroup = new THREE.Group();
    faceHighlightGroup.name = "face-highlights";
    faceHighlightGroup.renderOrder = 2;
    scene.add(faceHighlightGroup);
    faceHighlightGroupRef.current = faceHighlightGroup;

    // Mark scene as ready
    setSceneReady(true);
    console.log("[useSceneSetup] Scene setup complete");

    // Initial render
    needsRenderRef.current = true;

    // Cleanup
    return () => {
      setSceneReady(false);

      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = null;
      }
      aoEffectRef.current = null;

      if (labelRenderer.domElement.parentNode) {
        labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
      }

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }

      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Update scene background when theme changes
  useEffect(() => {
    if (sceneRef.current) {
      requestAnimationFrame(() => {
        if (!sceneRef.current) return;
        const viewerBgColor = getComputedStyle(document.documentElement)
          .getPropertyValue("--color-viewer-bg")
          .trim();
        const bgColor = viewerBgColor
          ? parseHexColor(viewerBgColor, theme === "dark" ? 0x1a1a1a : 0xfdfaf8)
          : theme === "dark"
            ? 0x1a1a1a
            : 0xfdfaf8;
        sceneRef.current.background = new THREE.Color(bgColor);
        needsRenderRef.current = true;
        // Force a render immediately to update the background
        if (rendererRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      });
    }
  }, [theme]);

  return {
    sceneRef,
    cameraRef,
    rendererRef,
    composerRef,
    aoEffectRef,
    labelRendererRef,
    targetRef,
    needsRenderRef,
    groupRefs: {
      meshGroup: meshGroupRef,
      edgeGroup: edgeGroupRef,
      sketchGroup: sketchGroupRef,
      selectionGroup: selectionGroupRef,
      constraintLabelsGroup: constraintLabelsGroupRef,
      planesGroup: planesGroupRef,
      originGroup: originGroupRef,
      faceHighlightGroup: faceHighlightGroupRef,
    },
    sceneReady,
    requestRender,
  };
}
