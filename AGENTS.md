# SolidType – AGENTS GUIDE

Welcome, agent 👋  
This document tells you how to work inside the SolidType repo.

Before you write *any* code, read:

- [`OVERVIEW.md`](OVERVIEW.md) – **What** SolidType is and why it exists.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) – **How** it is structured (packages, layers, data flow).
- [`/plan/*`](plan/*) – The **phase-by-phase implementation plan** you must follow.

> **Note on historical documents:**
> - `OCC-REFACTOR.md` – ✅ **COMPLETED** – Documents the OpenCascade.js integration (now done).
> - `KERNEL-REFACTOR.md` – Superseded by the OpenCascade.js integration.

Treat those documents as the source of truth. If they conflict with existing code, the docs win and the code should be brought back into line.

---

## Reference Implementations

The [`/refs/`](refs/) directory contains downloadable source code from production CAD kernels for reference:

- **OCCT** (Open CASCADE) – Production B-Rep kernel with boolean operations
- **CGAL** – Robust geometry algorithms, especially planar arrangements (DCEL)
- **FreeCAD toponaming** – Persistent naming implementation (realthunder's branch)
- **Fornjot** – Modern Rust B-Rep kernel with similar goals to SolidType

To download references:

```bash
cd refs && ./download-refs.sh
```

See [`refs/README.md`](refs/README.md) for detailed guidance on what to study in each reference.

---

## 1. Your Responsibilities

As an agent, your job is to:

1. Implement the plan in `PLAN.md` **incrementally**, phase by phase.
2. Keep the architecture described in `ARCHITECTURE.md` intact.
3. Preserve the overall goals and constraints described in `OVERVIEW.md`.

If you are unsure how to implement something:

- Prefer a **small, clean, testable** implementation that matches the intent,
- Add a `// TODO(agent): ...` comment referencing the relevant doc section,
- Do **not** invent new architecture without clear justification in comments.

---

## 2. Package & Layer Rules

You are working in a pnpm monorepo with:

- `@solidtype/core` (CAD kernel wrapper with OO API, powered by OpenCascade.js),
- `@solidtype/app` (full CAD application).

### OCCT Integration Guidelines

The `@solidtype/core` package now uses OpenCascade.js for all B-Rep operations:

**DO:**
- All modeling operations go through `SolidSession` (the public API)
- Use the kernel/ module for OCCT wrappers (internal only)
- Keep the sketch/ module in pure TypeScript (no OCCT dependency)
- Dispose OCCT objects properly to prevent memory leaks

**DON'T:**
- Never import from `kernel/` in the app - use `SolidSession` instead
- Never expose OCCT types (TopoDS_Shape, etc.) in the public API
- Don't add OCCT dependencies to the sketch constraint solver

### Core rules

- `@solidtype/core`:
  - **No DOM / browser APIs.**
  - **No three.js** or other rendering code.
  - Only minimal dependencies (testing, build tooling).
  - Exposes an **object-oriented API** (`SolidSession`, `Body`, `Face`, `Edge`, `Sketch`) as the primary interface.
  - Internal modules use data-oriented style (struct-of-arrays, handles) for performance.

- `@solidtype/app`:
  - May use `three.js`, Vite, React, etc.
  - Uses the OO API from `@solidtype/core` for modeling operations.

If you find yourself wanting to put core geometry or topology logic into `app`, stop and move it into `@solidtype/core`.

---

## 3. Preferred Libraries & Tooling

When building UI and application logic in the viewer/app package, use these approved libraries:

### 3.1 UI Components – Base UI

Use **[Base UI](https://base-ui.com/react/components)** for all UI components wherever possible.

- Base UI is a headless component library (similar to Radix UI) that provides unstyled, accessible primitives.
- Available components include: Dialog, Menu, Context Menu, Popover, Tooltip, Select, Tabs, Accordion, Checkbox, Radio, Switch, Slider, Progress, Toast, and many more.
- Prefer Base UI over building custom components from scratch.
- Style components using CSS (the project already uses `.css` files alongside components).

### 3.2 Schemas & Validation – Zod

Use **[Zod](https://zod.dev)** for runtime schema validation and type inference.

- Define schemas for data structures that need validation (e.g., user input, API responses, file formats).
- Use `z.infer<typeof schema>` to derive TypeScript types from Zod schemas.
- Prefer Zod over manual validation logic.

### 3.3 Tanstack Libraries

Prefer **[Tanstack](https://tanstack.com)** libraries for common UI patterns:

- **Tanstack Form** – for form state management and validation.
- **Tanstack Table** – for data tables with sorting, filtering, and pagination.
- **Tanstack Virtual** – for virtualized/windowed scrolling of large lists.
- **[Tanstack AI](https://tanstack.com/ai/latest)** – for AI integrations with a unified interface across providers (OpenAI, Anthropic, Ollama, Gemini). Type-safe with full tool/function calling support.

These libraries are headless and integrate well with Base UI components.

### 3.4 When to Add New Dependencies

Before adding a dependency not listed here:

1. Check if an approved library already covers the use case.
2. Prefer small, focused libraries over large frameworks.
3. Add a comment in the code explaining why the dependency is needed.

---

## 4. Coding Style Guide (TypeScript)

### 4.1 General

- Use **TypeScript**, strict mode (`strict: true`).
- Prefer **ESM** imports/exports.
- Keep functions **small**, **pure**, and **single-purpose** wherever possible.
- Don't introduce new runtime dependencies unless:
  - They're already approved (see section 3 for preferred libraries),
  - Or they clearly solve a broad, non-trivial problem (and you add a short comment in the code explaining why).

### 4.2 Types & Data

- Use **explicit types** for public functions and exported symbols.
- Use **branded IDs** for handles (e.g. `type FaceId = number & { __brand: "FaceId" };`).
- Avoid `any`. If you must use it temporarily, leave a `// TODO(agent): remove any` comment.
- Prefer **struct-of-arrays** for performance-critical tables in the core (as per `ARCHITECTURE.md`).

### 4.3 Functions & Errors

- For internal helpers, throw `Error` only for truly exceptional situations.
- For modeling operations, prefer result types like:
  ```ts
  type Result<T> = { ok: true; value: T } | { ok: false; error: ModelingError };
  ```

* Use clear, descriptive names:

  * `computeFaceNormal`, not `doFaceStuff`.

### 4.4 Style & Formatting

* Honour the repo's existing formatting (Prettier/ESLint configs if present).
* Use **camelCase** for variables/functions, **PascalCase** for types/classes.
* Use `const` by default; use `let` only when mutation is necessary.
* Avoid deeply nested code; extract helper functions instead.

---

## 5. Testing Expectations

SolidType is TDD-oriented:

* For every new module or non-trivial function, add **Vitest unit tests** in the same package.
* Do not add public API without at least basic tests.
* When you fix a bug, add a test that would fail without the fix.

Guidelines:

* Keep tests **fast** and **deterministic**.
* Prefer **clear, example-based tests** over heavy randomised tests, unless instructed otherwise in `PLAN.md`.
* Use the namespacing laid out in `ARCHITECTURE.md` (`num`, `geom`, `topo`, `model`, `sketch`, `naming`, `mesh`, `api`).

---

## 6. How to Work With the Plan

`PLAN.md` is written in phases (Phase 0, Phase 1, …).

When implementing:

1. **Stick to the current phase.**

   * Don't jump ahead unless a later phase is explicitly required to unblock the current one.
2. After completing a task from the plan:

   * Ensure tests pass (`pnpm test`).
   * Ensure the change matches the described APIs and responsibilities in `ARCHITECTURE.md`.
3. If you must deviate:

   * Keep the deviation **minimal**.
   * Add a clear comment in the code explaining why (and, if possible, point back to the relevant section in `PLAN.md`).

4. **If you make architectural or plan changes**, you MUST update the documentation:

   * `ARCHITECTURE.md` – for structural changes (new modules, changed APIs, new packages)
   * `OVERVIEW.md` – for changes to vision, goals, or technical approach
   * `/plan/*` – for changes to the implementation plan or phase structure
   
   The docs are the source of truth. If you change the code in ways that conflict with the docs, update the docs to match.

---

## 7. Things You Should Not Do

* Do **not**:

  * Introduce WASM or native modules.
  * Add heavy dependencies to `@solidtype/core`.
  * Tie `@solidtype/core` to browser APIs.
  * Bypass `naming` for external references (constraints, selections, etc.).
  * Implement new features without tests.

If you need functionality that doesn't fit these guidelines, leave a TODO and implement the best compliant version you can.

---

## 8. Summary

* Read `OVERVIEW.md`, `ARCHITECTURE.md`, and `/plan/*` first.
* Respect package boundaries and layer responsibilities.
* Write small, well-typed, test-backed TypeScript.
* Keep `@solidtype/core` clean, deterministic, and environment-neutral.
* Use the persistent naming and constraint systems as the **backbone**, not an afterthought.

If in doubt, favour **clarity and correctness** over cleverness.
