# SolidType CAD App – Implementation Plan

Target stack recap:

* **CAD kernel:** SolidType (`@solidtype/core`, `@solidtype/oo`).
* **App:** React + Radix UI, CodeMirror, three.js viewer.
* **Collab/storage:** Yjs (client-only for now).
* **Model format:** **Full TypeScript** + JSX, *model-as-code*, pure function `Part(props)` returning a strict `<Model>` DSL tree.
* **Runtime:** Pure, whitelisted modeling runtime in a Web Worker; model code is treated as a pure function `props → model tree`.

We’ll structure this similar to the kernel plan: phases building up vertical slices.

---

## Phase 0 – App Skeleton & Wiring

### Goals

* Create the React app package (e.g. `packages/app`) and basic layout.
* Integrate Radix UI, CodeMirror, three.js.
* No Yjs, no SolidType integration yet; just the shell.

### Tasks

1. **New app package**

* Add `packages/app` to the monorepo, built with Vite + React + TS.
* Basic layout:

  * Left: Radix `Tabs` for **Feature Tree** / **Files & Code** (empty for now).
  * Center: placeholder div for viewer.
  * Right: placeholder panel for **Properties**.

2. **Three.js viewer shell**

* Set up a simple viewer component:

  * Basic scene, camera, lighting, orbit controls.
  * Render a test cube to confirm the pipeline.

3. **CodeMirror integration**

* Add CodeMirror editor component in the **Files & Code** tab:

  * TS/JSX mode, simple text state (no Yjs yet).
  * A sample `Part.tsx` file hardcoded as a string.

4. **Routing / app state**

* Keep it simple: a single “project” in memory, no routing needed yet.

### Testing

* Smoke tests: app loads, viewer shows cube, editor shows sample TypeScript, tabs switch.

---

## Phase 1 – Yjs Project Model (Code + Params in Code)

### Goals

* Represent a **project as a Yjs document**.
* Store model code as TS/JSX text inside Yjs.
* Wire CodeMirror to Yjs.

### Data model

* 1 project = 1 Yjs document.
* Yjs structures:

  * `Y.Map` for files:

    * Key: filename (`"Part.tsx"`).
    * Value: `Y.Text` holding the TypeScript source.
  * (No parameters or UI state in Yjs – they live in code.)

Later, we’ll extend with annotation structures, but v1 keeps it simple.

### Tasks

1. **Yjs setup**

* Create a `Project` abstraction:

  ```ts
  interface Project {
    doc: Y.Doc;
    files: Y.Map<Y.Text>;
  }
  ```

* For now, use `doc` in-memory only (no provider). Later we can swap to a websocket provider.

2. **CodeMirror-Yjs binding**

* Wrap CodeMirror with a `useYTextCodeMirror` hook:

  * Binds a `Y.Text` to the editor.
  * Supports multiple editors per doc in future, but v1 has one.

3. **Initial project loader**

* On app load:

  * Create a new `Y.Doc`.
  * Initialise a `"Part.tsx"` entry in `files`.
  * Seed it with a simple `Part(props)` example.

4. **React hooks**

* Introduce hooks like:

  ```ts
  function useProject(): Project;
  function useYFile(filename: string): Y.Text | null;
  ```

* Components subscribe to these to get the current file text.

### Testing

* Basic tests with `jsdom`:

  * Creating a project yields a `Part.tsx` file in Yjs.
  * Editing code in the editor updates the Y.Text (and vice versa).

---

## Phase 2 – TypeScript Worker: Parse, Type-check, Transpile

### Goals

* Move TS parsing/type-checking into a **Web Worker**.
* From Yjs text, produce:

  * TS AST (or ESTree equivalent),
  * Type errors / diagnostics,
  * Transpiled JS ready for execution.

### Tasks

1. **TS worker setup**

* Create a `ts-worker` using Vite’s `worker` support:

  * Worker receives the current file map (string snapshot).
  * Uses `typescript` (compiler API) to:

    * Parse `Part.tsx`,
    * Find `export function Part(props: PartProps)` (or a small set of conventions),
    * Type-check the file,
    * Transpile to JS (common target, say ES2020).

2. **Diagnostics pipeline**

* Worker returns:

  ```ts
  interface TsAnalysisResult {
    diagnostics: TsDiagnostic[];
    transpiledFiles: Record<string, string>; // filename -> JS
  }
  ```

* UI:

  * Show diagnostics in an **Errors/Problems** panel.
  * Highlight error ranges in CodeMirror.

3. **Message protocol**

* Main thread ↔ TS worker messages:

  * `analyzeProject` (send file contents snapshot).
  * `analysisResult` (diagnostics + transpiled JS).

* Use a debounced trigger for analysis on code changes.

4. **React integration**

* `useTsAnalysis(project)` hook:

  * Subscribes to Yjs file changes.
  * Debounces and sends to worker.
  * Exposes `diagnostics`, `jsBundle` to components.

### Testing

* Unit-ish tests (worker in Node):

  * Given a TS file with simple syntax errors, diagnostics match expectation.
  * Successful compile returns transpiled JS.

* UI tests:

  * Diagnostics appear as expected in the side panel and code editor.

---

## Phase 3 – Modeling Runtime: JSX DSL → SolidType Model

### Goals

* Introduce a **modeling DSL** in JSX that the TS code uses.
* Execute the transpiled JS in a **sandboxed modeling worker** with a **whitelisted API**, producing a “model tree”.
* From model tree, call SolidType kernel to build actual geometry.

### High-level design

* Modeling runtime lives in another Web Worker (`model-worker`).

* It is given:

  * JS bundle (from TS worker),
  * Name of entry `Part` component,
  * Any additional metadata (later).

* The modeling JS uses our custom JSX factory:

  ```ts
  /** @jsx sjsx */
  import { Model, Sketch, Extrude, Revolve, Sweep, ... } from "@solidtype/dsl";
  ```

  where `sjsx` builds a **ModelNode tree**, not React elements.

* Entry function signature:

  ```ts
  export type PartProps = { ... };

  export function Part(props: PartProps): ModelNode {
    return (
      <Model>
        {/* DSL nodes */}
      </Model>
    );
  }
  ```

* The worker executes `Part(defaultProps)` to get a **DSL tree**, then interprets it into SolidType kernel calls.

### Tasks

1. **Define the DSL types**

* In `@solidtype/oo` or a new `@solidtype/dsl` package, define:

  ```ts
  // Pseudocode
  export type ModelNode =
    | { kind: "Model"; children: ModelNode[] }
    | { kind: "Sketch"; id: string; plane: PlaneRef; children: SketchNode[] }
    | { kind: "Extrude"; sketchId: string; distance: number; op: "add" | "cut" }
    | { kind: "Revolve"; ... }
    | { kind: "Sweep"; ... }
    | { kind: "Group"; children: ModelNode[] }
    | /* etc. */ ;

  export function sjsx(type: any, props: any, ...children: any[]): ModelNode;
  ```

* Enforce **strict DSL**:

  * `<Model>` root required.
  * Only recognised DSL elements allowed.

2. **Modeling worker**

* `model-worker` runs in a sandbox:

  * Receives JS bundle as a string.

  * Evaluates it in a restricted context:

    * Provide `sjsx` and DSL components.
    * Disallow direct access to browser globals.
    * Disallow arbitrary imports (only our DSL).

  * Finds `Part` function and calls:

    ```ts
    const defaultProps = inferDefaultPropsFromCodeOrHardcoded();
    const tree = Part(defaultProps);
    ```

3. **Interpreting the DSL tree**

* From `ModelNode`, use `@solidtype/oo` API to:

  * Create sketches (mapping `<Sketch>` children to sketch definitions).
  * Apply extrudes/revolves/sweeps and build bodies.
  * Collect intermediate **feature checkpoints** for later breakpoints.

* Return to main thread:

  ```ts
  interface ModelBuildResult {
    success: boolean;
    bodies: BuiltBodyHandle[];    // or serialized mesh handles
    checkpoints: FeatureCheckpoint[];
    kernelErrors?: ModelingError[];
  }
  ```

4. **Main-thread integration**

* `useModelBuild(project)` hook:

  * Subscribes to TS analysis results (only run if diagnostics are empty or non-fatal).
  * Sends JS bundle to `model-worker`.
  * Receives `ModelBuildResult`.
  * Provides:

    * current bodies / meshes to the viewer,
    * feature tree structure from checkpoints,
    * kernel errors.

### Testing

* Worker-level tests:

  * Simple Part that returns minimal `<Model><Sketch/><Extrude/></Model>` tree.
  * Ensure interpreters build a single extruded body in SolidType.

* End-to-end:

  * Edit `Part.tsx` and hit “Rebuild” → viewer updates.

---

## Phase 4 – Feature Tree & Breakpoints

### Goals

* Build a **hierarchical feature tree** that mirrors JSX/component nesting.
* Add **per-feature breakpoints**: run model up to a feature.

### Tasks

1. **Feature checkpoint representation**

* In the modeling interpreter, assign each DSL node a unique **feature ID**:

  ```ts
  interface FeatureCheckpoint {
    id: string;              // stable across rebuilds where possible
    kind: "Sketch" | "Extrude" | "Revolve" | "Sweep" | "Boolean" | ...;
    label: string;           // for UI
    parentId?: string;       // for hierarchy
    astPath: AstPath;        // path into TS AST (for code navigation)
    modelStateHandle: any;   // handle for intermediate kernel state
  }
  ```

* As you interpret the DSL tree, capture model state after each feature and store a handle or snapshot.

2. **Feature tree UI**

* React component for the left panel “Feature Tree” tab:

  * Builds a tree from `FeatureCheckpoint[]`.
  * Displays hierarchy based on `parentId`.

* Clicking a feature:

  * **Breakpoint:** instruct `model-worker` to rebuild only up to that feature’s checkpoint.
  * Viewer shows model as-of that feature.
  * Code editor scrolls to the corresponding AST node via `astPath`.

3. **AST path mapping**

* During TS analysis, store a mapping from AST nodes → stable IDs or paths.
* DSL interpretation uses that mapping to attach `astPath` to each node.

4. **Error handling integration**

* When a feature fails:

  * Errors panel shows the error tied to that feature ID.
  * Feature tree marks it (e.g. red icon).
  * Viewer shows state up to previous successful feature.

### Testing

* Build a multi-feature example (Sketch → Extrude → Revolve).
* Confirm:

  * Feature tree shows hierarchy.
  * Clicking each node updates viewer + code selection.
  * Error in the last feature still shows earlier geometry.

---

## Phase 5 – Sketch UI (Code-Backed Sketches)

### Goals

* 2D sketch editor for `<Sketch>` nodes.
* Direct link between sketch edits and the **code** defining those sketches.

### Sketch representation in code

* For v1, keep sketches **simple** in JSX:

  ```tsx
  <Sketch id="base" plane="XY">
    <Rectangle id="rect" width={props.width} height={props.height} />
    {/* later: raw <Line>, <Arc>, constraints, etc. */}
  </Sketch>
  ```

* Under the hood, those DSL nodes translate to SolidType sketch entities + constraints.

### Tasks

1. **In-kernel mapping**

* Treat `<Sketch>` children as **sketch sub-DSL**:

  * `Rectangle` expands to a set of points + lines + constraints (`horizontal`, `vertical`, equal lengths, coincident, etc.).
  * Eventually support explicit `<Line p1={...} p2={...} />`, `<Arc ... />` children.

2. **Sketch editor UI**

* For the currently selected `<Sketch>` feature:

  * Show a 2D sketch canvas (center or overlay).
  * Use the sketch data from SolidType (via `@solidtype/oo`).

* Allow:

  * Create new lines/rectangles by clicking.
  * Move points by dragging.
  * Add constraints via toolbar / context menu.
  * Dimension edits.

3. **Mapping sketch actions back to code**

* When the user edits the sketch:

  * Modify the **AST for the `<Sketch>` node**:

    * Update props (e.g. rectangle width/height).
    * Or replace simple `<Rectangle>` with explicit `<Line>`s/constraints if needed.

* Use a code transform (AST → new TS text) and apply it back to Yjs.

* For v1, be pragmatic:

  * Start with editable `<Rectangle>` components:

    * Editing in sketch updates `width`/`height` props.
  * Later: support more complex graphs and constraints as structured DSL inside `<Sketch>`.

4. **Mode handling**

* When a sketch is selected and the user enters “Sketch mode”:

  * Center the sketch plane in the 2D view.
  * Temporarily freeze 3D rotation (or show both).

### Testing

* Example: `Part` with `<Sketch><Rectangle width={10} height={20} /></Sketch>`:

  * Drag rectangle corner → height changes in sketch → AST updates numeric literal → CodeMirror updates → rebuild shows new extrude.

---

## Phase 6 – Extrude, Revolve, Sweep UI

### Goals

* Provide point-and-click UI for creating and editing:

  * Extrude,
  * Revolve,
  * Sweep (MVP flavour).

* All changes reflect in **JSX code**.

### Tasks

1. **Extrude UI**

* In the feature tree or context menu:

  * “Add Extrude” when a sketch is selected.

* Create corresponding JSX:

  ```tsx
  <Extrude sketch="base" distance={props.depth} op="add" />
  ```

* UI for editing:

  * Distance: slider + numeric input → modifies TS literal or prop usage.
  * Operation: add/cut toggle.

2. **Revolve UI**

* Similar flow:

  * Pick a sketch and an axis (e.g. from sketch or model edge).
  * Insert:

    ```tsx
    <Revolve sketch="base" axis="sketchLine:axis1" angle={360} op="add" />
    ```

* Axis selection:

  * Use persistent naming to identify edges/lines.
  * Convert selection to a stable reference encoded in JSX props.

3. **Sweep UI (MVP)**

* UI:

  * Pick profile sketch,
  * Pick path (sketch curve or model edge chain).

* JSX:

  ```tsx
  <Sweep profile="profileSketch" path="pathSketchOrEdgeRef" />
  ```

* Initially:

  * Single profile, single path.
  * Simple orientation (default behaviour) – no twist controls yet.

4. **Editing and reflection back to code**

* Each feature has a properties panel:

  * Changing controls updates corresponding AST props and triggers rebuild.

### Testing

* Create simple models (sketched profile with extrude, revolve, sweep).
* Verify UI actions alter code and geometry as expected.

---

## Phase 7 – Selection & Persistent Naming Integration

### Goals

* Click in 3D → find feature + AST node.
* Use SolidType’s **persistent naming** to resolve geometry → feature.

### Tasks

1. **Selection flow**

* On click in three.js viewer:

  * Perform raycast, find intersected face/edge.
  * Ask SolidType OO layer for a `PersistentRef` for that entity.
  * Use naming subsystem to resolve `PersistentRef` back to:

    * `SubshapeRef` → which feature produced it → `FeatureId` → `FeatureCheckpoint`.

2. **Feature & code navigation**

* Given `FeatureCheckpoint` with `astPath`:

  * Highlight that feature in the tree.
  * Scroll/highlight code range in CodeMirror.

3. **Context menu / actions**

* Right-click on selected geometry:

  * “Edit Feature” → focus properties panel.
  * “Add Fillet” etc. (later).

### Testing

* Simple extruded block:

  * Click side face → extrude feature node is selected.
  * Code view scrolls to `<Extrude>` JSX.

---

## Phase 8 – Error Handling & Problems Panel

### Goals

* Unified error UX:

  * TS/JSX errors,
  * Modeling runtime errors,
  * Kernel geometry errors.

* Keep last good model prefix visible.

### Tasks

1. **Unified problem model**

* Normalise errors into a common shape:

  ```ts
  type ProblemKind = "ts" | "runtime" | "kernel";

  interface Problem {
    kind: ProblemKind;
    message: string;
    file?: string;
    startPos?: { line: number; column: number };
    endPos?: { line: number; column: number };
    featureId?: string;
  }
  ```

2. **UI**

* Problems panel (e.g. bottom or side):

  * List of current problems with icons.
  * Clicking a problem jumps to:

    * Code span (for TS/runtime),
    * Feature tree node (for kernel).

3. **Viewer behaviour**

* Always show **last successful build**:

  * `model-worker` returns both:

    * `lastSuccessCheckpointId`,
    * any error info.

* Viewer uses `lastSuccessCheckpointId` to set geometry; if none, show “no valid model yet” state.

### Testing

* Inject synthetic TS errors and ensure they:

  * Appear in Problems panel,
  * Highlight in code.

* Force a kernel boolean failure (e.g. unsupported case) and ensure:

  * Problem appears tied to specific feature,
  * Earlier geometry shows.

---

## Phase 9 – LLM Side Panel (Design, not implementation-heavy)

### Goals

* Design the structure so that an LLM can:

  1. Generate new `Part.tsx` files from prompts.
  2. Edit existing code based on geometric + code context.
  3. Refactor/explain code.

### Architectural hooks

1. **State snapshot for LLM**

* Backend/LLM layer should receive:

  * Current project TS/JSX (per file),
  * Possibly a simplified feature tree or summary,
  * Optional selection context (which feature/face is selected).

2. **Patch application**

* LLM response: code edits as patches:

  * At minimum: “here is the full new `Part.tsx` text”.
  * Ideally: more structured instructions in the future (diffs, AST ops).

* For v1, assume “full file replacement” is acceptable:

  * Replace Y.Text for `Part.tsx` with the returned code.

3. **UI**

* Side panel with chat:

  * User prompt,
  * Model responses,
  * Buttons like “Apply changes”, “Show diff”.

Implementation details can be fleshed out later; the key is: **code is model**, so LLM integration is “just” code editing.

---

## Phase 10 – Collab (Level 1)

### Goals

* Multi-user editing of the same project:

  * Shared code via Yjs.
  * Each client rebuilds model locally.

### Tasks

1. **Yjs provider**

* Plug in a websocket provider (e.g. y-websocket) or similar, with a room ID per project.

2. **CodeMirror presence (optional later)**

* For v1 collab, presence is optional; just syncing text is enough.
* If desired, show remote cursors via CodeMirror + Yjs awareness.

3. **Rebuild on remote edits**

* TS worker and model worker already respond to Yjs changes; remote edits behave the same as local ones.

### Testing

* Run two clients pointing at the same project room.
* Verify code changes propagate and both rebuild models independently.

---

## Risk & Complexity Notes

* **Biggest risks:**

  * AST ↔ TS text transforms that keep code readable and stable.
  * Mapping between AST nodes, DSL features, and BREP geometry (for selection & breakpoints).
  * Sweep UX and kernel support.

* **Mitigation:**

  * Start with **simple DSL shapes** (`Rectangle`, `Extrude`, `Revolve`, MVP `Sweep`) and only allow the sketch UI to edit patterns we can confidently round-trip.
  * Keep a strong invariant: **all semantic edits go via AST**, never via ad-hoc string manipulation.
  * Be explicit about unsupported cases in sweep/booleans and surface them as kernel errors, not silent failures.
