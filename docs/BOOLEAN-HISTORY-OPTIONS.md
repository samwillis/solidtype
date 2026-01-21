# Boolean History Tracking Options

Investigation of options for tracking OCCT topology through boolean operations for stable PersistentRefs.

## Background

Phase 8 implemented OCCT history extraction for extrude/revolve operations. However, history is lost when bodies are merged via boolean operations because:

1. Boolean operations create new topology
2. We currently discard the boolean builder after getting the result shape
3. No mapping is maintained from input faces to output faces

## Key Finding

The OCCT boolean history APIs (`Modified()`, `IsDeleted()`, `Generated()`) are fully functional in OpenCascade.js 1.1.1. We can track exactly what happens to each face:

- **MODIFIED**: Face was split or trimmed → list of result faces
- **DELETED**: Face was completely removed (internal faces)
- **UNCHANGED**: Face survived as-is (Modified returns empty, not deleted)

## Options

### Option 1: Transitive History Chain

**Approach**: Maintain a chain of transformations that maps from original sketch entities through all operations to current faces.

```typescript
interface TopologyHistory {
  // Maps current face hash → origin info
  faceOrigins: Map<
    number,
    {
      originFeatureId: string; // Feature that created the face
      originEntityId?: string; // Sketch entity UUID (for side faces)
      originSelector: LocalSelector; // Original selector type
      transformationChain: string[]; // Feature IDs of operations that modified it
    }
  >;
}
```

**Implementation**:

1. After each extrude/revolve, record face origins from OCCT history
2. After each boolean, use `Modified()` to update mappings
3. Store the history with the body

**Pros**:

- Complete history tracking
- Can regenerate PersistentRefs for any face
- Handles complex operation sequences

**Cons**:

- Memory overhead grows with operation count
- Complexity in maintaining the chain
- Need to handle face splits (1 input → N outputs)

**Estimated complexity**: Medium-High

---

### Option 2: Just-In-Time History Extraction

**Approach**: Don't maintain persistent history. Instead, rebuild history on demand by replaying operations when generating PersistentRefs.

**Implementation**:

1. Keep the boolean builder objects alive (or re-create them during rebuild)
2. When generating a ref, trace the face back through the operation sequence
3. Use `Modified()` to find the input face that produced this output

**Pros**:

- No persistent storage overhead
- Always accurate (uses actual OCCT state)

**Cons**:

- Requires re-execution or keeping builders alive
- Slower ref generation
- May not work with current architecture (we dispose shapes)

**Estimated complexity**: High

---

### Option 3: Boolean History Wrapper (Recommended)

**Approach**: Create an extended boolean operation that returns history alongside the result.

```typescript
interface BooleanWithHistoryResult {
  success: boolean;
  shape?: Shape;
  faceMap?: Map<number, number[]>; // inputHash → outputHashes
  deletedFaces?: Set<number>;
}

function booleanOpWithHistory(base: Shape, tool: Shape, op: BooleanOp): BooleanWithHistoryResult;
```

**Implementation**:

1. Create `booleanOpWithHistory()` in kernel/operations.ts
2. Before deleting the builder, extract Modified/IsDeleted for all input faces
3. Return the face mapping alongside the result shape
4. In KernelEngine, use this mapping to update the stored history

```typescript
// In KernelEngine after boolean:
const boolResult = booleanOpWithHistory(baseShape, toolShape, "union");

// Merge histories
for (const [inputHash, outputHashes] of boolResult.faceMap) {
  const origin = baseHistory.get(inputHash) ?? toolHistory.get(inputHash);
  if (origin) {
    for (const outputHash of outputHashes) {
      mergedHistory.set(outputHash, { ...origin, modified: true });
    }
  }
}
```

**Pros**:

- Fits current architecture well
- Incremental change (add new function, modify callers)
- History stays with body, updated after each operation
- Can be enabled/disabled easily

**Cons**:

- Need to iterate all input faces (both shapes) to build mapping
- Some overhead per boolean operation

**Estimated complexity**: Medium

---

### Option 4: Fingerprint-Based Matching with History Hints

**Approach**: Use fingerprints as the primary matching mechanism, but use OCCT history as "hints" to improve accuracy.

**Implementation**:

1. Continue using geometric fingerprints as the main matching method
2. When OCCT history is available, use it to validate/refine matches
3. Fall back to pure fingerprint matching when history is unavailable

**Pros**:

- Graceful degradation
- Works even if history tracking has gaps
- Lower complexity than full history chain

**Cons**:

- Fingerprints still have edge cases (symmetric geometry)
- Doesn't fully solve the stability problem

**Estimated complexity**: Low-Medium

---

## Recommendation

**Start with Option 3 (Boolean History Wrapper)**, as it:

1. Fits the current architecture (operations return history, engine stores it)
2. Is an incremental change from what's already implemented
3. Provides complete tracking for the common case
4. Can fall back to fingerprints when history is unavailable

### Implementation Steps

1. **Core package**:
   - Add `booleanOpWithHistory()` function
   - Return face mapping for base and tool shapes
   - Handle edge exploration for Generated() (new edges from intersections)

2. **App package (KernelEngine)**:
   - Modify `handleMerge()` to use `booleanOpWithHistory()`
   - Merge histories from both input bodies
   - Update body entry with merged history

3. **Reference index**:
   - No changes needed (already uses face hashes from history)

4. **Tests**:
   - Test history tracking through union/cut/intersect
   - Test that PersistentRefs survive boolean operations

### Estimated Effort

- Core changes: ~100-150 lines
- KernelEngine changes: ~50-100 lines
- Tests: ~100 lines
- Total: ~300 lines, medium complexity

This would complete Phase 8 with full history tracking through all operations.
