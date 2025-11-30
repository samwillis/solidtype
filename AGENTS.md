# SolidType – AGENTS GUIDE

Welcome, agent 👋  
This document tells you how to work inside the SolidType repo.

Before you write *any* code, read:

- [`docs/OVERVIEW.md`](docs/OVERVIEW.md) – **What** SolidType is and why it exists.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – **How** it is structured (packages, layers, data flow).
- [`docs/PLAN.md`](docs/PLAN.md) – The **phase-by-phase implementation plan** you must follow.

Treat those three documents as the source of truth. If they conflict with existing code, the docs win and the code should be brought back into line.

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

You are working in a pnpm monorepo with (at minimum):

- `@solidtype/core` (functional kernel),
- `@solidtype/oo` (OO façade),
- `@solidtype/viewer` (demo app).

### Core rules

- `@solidtype/core`:
  - **No DOM / browser APIs.**
  - **No three.js** or other rendering code.
  - Only minimal dependencies (testing, build tooling).
  - Functional, data-oriented style (plain objects, handles, pure functions where possible).

- `@solidtype/oo`:
  - Wraps `@solidtype/core` with classes.
  - No extra geometry/topology logic that isn’t also available in `core`.

- `@solidtype/viewer`:
  - May use `three.js`, Vite, etc.
  - Talks only to the OO façade (and through that, the core).

If you find yourself wanting to put core geometry or topology logic into `viewer`, stop and move it into `@solidtype/core`.

---

## 3. Coding Style Guide (TypeScript)

### 3.1 General

- Use **TypeScript**, strict mode (`strict: true`).
- Prefer **ESM** imports/exports.
- Keep functions **small**, **pure**, and **single-purpose** wherever possible.
- Don’t introduce new runtime dependencies unless:
  - They’re already approved (e.g. Vitest, three.js in viewer),
  - Or they clearly solve a broad, non-trivial problem (and you add a short comment in the code explaining why).

### 3.2 Types & Data

- Use **explicit types** for public functions and exported symbols.
- Use **branded IDs** for handles (e.g. `type FaceId = number & { __brand: "FaceId" };`).
- Avoid `any`. If you must use it temporarily, leave a `// TODO(agent): remove any` comment.
- Prefer **struct-of-arrays** for performance-critical tables in the core (as per `ARCHITECTURE.md`).

### 3.3 Functions & Errors

- For internal helpers, throw `Error` only for truly exceptional situations.
- For modeling operations, prefer result types like:
  ```ts
  type Result<T> = { ok: true; value: T } | { ok: false; error: ModelingError };
  ```

* Use clear, descriptive names:

  * `computeFaceNormal`, not `doFaceStuff`.

### 3.4 Style & Formatting

* Honour the repo’s existing formatting (Prettier/ESLint configs if present).
* Use **camelCase** for variables/functions, **PascalCase** for types/classes.
* Use `const` by default; use `let` only when mutation is necessary.
* Avoid deeply nested code; extract helper functions instead.

---

## 4. Testing Expectations

SolidType is TDD-oriented:

* For every new module or non-trivial function, add **Vitest unit tests** in the same package.
* Do not add public API without at least basic tests.
* When you fix a bug, add a test that would fail without the fix.

Guidelines:

* Keep tests **fast** and **deterministic**.
* Prefer **clear, example-based tests** over heavy randomised tests, unless instructed otherwise in `PLAN.md`.
* Use the namespacing laid out in `ARCHITECTURE.md` (`num`, `geom`, `topo`, `model`, `sketch`, `naming`, `mesh`).

---

## 5. How to Work With the Plan

`PLAN.md` is written in phases (Phase 0, Phase 1, …).

When implementing:

1. **Stick to the current phase.**

   * Don’t jump ahead unless a later phase is explicitly required to unblock the current one.
2. After completing a task from the plan:

   * Ensure tests pass (`pnpm test`).
   * Ensure the change matches the described APIs and responsibilities in `ARCHITECTURE.md`.
3. If you must deviate:

   * Keep the deviation **minimal**.
   * Add a clear comment in the code explaining why (and, if possible, point back to the relevant section in `PLAN.md`).

---

## 6. Things You Should Not Do

* Do **not**:

  * Introduce WASM or native modules.
  * Add heavy dependencies to `@solidtype/core`.
  * Tie `@solidtype/core` to browser APIs.
  * Bypass `naming` for external references (constraints, selections, etc.).
  * Implement new features without tests.

If you need functionality that doesn’t fit these guidelines, leave a TODO and implement the best compliant version you can.

---

## 7. Summary

* Read `OVERVIEW.md`, `ARCHITECTURE.md`, and `PLAN.md` first.
* Respect package boundaries and layer responsibilities.
* Write small, well-typed, test-backed TypeScript.
* Keep `@solidtype/core` clean, deterministic, and environment-neutral.
* Use the persistent naming and constraint systems as the **backbone**, not an afterthought.

If in doubt, favour **clarity and correctness** over cleverness.
