/**
 * Shared icon components for toolbars and UI
 */

import { LuUndo, LuRedo, LuDownload, LuChevronDown, LuCheck, LuX, LuSparkles, LuLassoSelect, LuRectangleHorizontal, LuCircle } from 'react-icons/lu';

// ============================================================================
// Feature icons
// ============================================================================

export const SketchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
  </svg>
);

export const ExtrudeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2v10" />
    <path d="M5 12l7-4 7 4" />
    <path d="M5 12v6l7 4 7-4v-6" />
  </svg>
);

export const RevolveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 11-9-9" />
    <path d="M12 3v9l5 5" />
  </svg>
);

export const PlaneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 6l8 4 8-4" />
    <path d="M4 6v8l8 4 8-4V6" />
  </svg>
);

// ============================================================================
// Sketch tool icons
// ============================================================================

export const SelectIcon = () => <LuLassoSelect size={18} />;

export const LineIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="19" x2="19" y2="5" />
  </svg>
);

export const RectangleIcon = () => <LuRectangleHorizontal size={18} />;

export const ArcIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 19a14 14 0 0 1 14-14" />
  </svg>
);

export const CircleIcon = () => <LuCircle size={18} />;

export const ConstraintsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 12h16" />
    <path d="M12 4v16" />
    <circle cx="4" cy="12" r="2" fill="currentColor" />
    <circle cx="20" cy="12" r="2" fill="currentColor" />
  </svg>
);

// ============================================================================
// Boolean icons
// ============================================================================

export const BooleanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="12" r="6" />
    <circle cx="15" cy="12" r="6" />
  </svg>
);

export const UnionIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 6a6 6 0 1 0 0 12 6 6 0 0 0 6-6 6 6 0 1 1 0-6" />
    <path d="M15 18a6 6 0 0 0 0-12" />
  </svg>
);

export const SubtractIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="12" r="6" />
    <path d="M15 6a6 6 0 1 1 0 12" strokeDasharray="4 2" />
  </svg>
);

export const IntersectIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="12" r="6" strokeDasharray="4 2" />
    <circle cx="15" cy="12" r="6" strokeDasharray="4 2" />
    <path d="M12 6v12" />
  </svg>
);

// ============================================================================
// Action icons
// ============================================================================

export const UndoIcon = () => <LuUndo size={18} />;

export const RedoIcon = () => <LuRedo size={18} />;

export const ExportIcon = () => <LuDownload size={18} />;

export const AIIcon = () => <LuSparkles size={18} />;

export const ChevronDownIcon = () => <LuChevronDown size={10} />;

// ============================================================================
// Sketch toolbar icons
// ============================================================================

export const NormalViewIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 6l8 4 8-4" />
    <path d="M4 6v8l8 4 8-4V6" />
    <circle cx="12" cy="10" r="2" />
  </svg>
);

export const CheckIcon = () => <LuCheck size={18} />;

export const CloseIcon = () => <LuX size={18} />;
