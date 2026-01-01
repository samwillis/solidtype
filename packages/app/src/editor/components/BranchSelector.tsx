/**
 * Branch selector dropdown
 */

import { useState } from "react";
import type { Branch } from "../../db/schema";
import "./BranchSelector.css";

interface BranchSelectorProps {
  branches: Branch[];
  currentBranchId: string;
  onBranchChange: (branchId: string) => void;
  onCreateBranch: () => void;
}

export function BranchSelector({
  branches,
  currentBranchId,
  onBranchChange,
  onCreateBranch,
}: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentBranch = branches.find((b) => b.id === currentBranchId);

  return (
    <div className="branch-selector">
      <button className="branch-selector-trigger" onClick={() => setIsOpen(!isOpen)}>
        <BranchIcon />
        <span className="branch-name">{currentBranch?.name ?? "main"}</span>
        {currentBranch?.isMain && <span className="branch-badge main">main</span>}
        {currentBranch?.mergedAt && <span className="branch-badge merged">merged</span>}
        <ChevronIcon className={isOpen ? "open" : ""} />
      </button>

      {isOpen && (
        <>
          <div className="branch-selector-backdrop" onClick={() => setIsOpen(false)} />
          <div className="branch-selector-dropdown">
            <div className="branch-selector-header">
              <span>Switch branch</span>
            </div>

            <div className="branch-selector-list">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  className={`branch-option ${branch.id === currentBranchId ? "active" : ""}`}
                  onClick={() => {
                    onBranchChange(branch.id);
                    setIsOpen(false);
                  }}
                >
                  <BranchIcon />
                  <span className="branch-option-name">{branch.name}</span>
                  {branch.isMain && <span className="branch-badge main">main</span>}
                  {branch.mergedAt && <span className="branch-badge merged">merged</span>}
                  {branch.id === currentBranchId && <CheckIcon />}
                </button>
              ))}
            </div>

            <div className="branch-selector-footer">
              <button
                className="branch-create-btn"
                onClick={() => {
                  onCreateBranch();
                  setIsOpen(false);
                }}
              >
                <PlusIcon />
                Create branch
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.5 2.5 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="currentColor"
      className={`chevron-icon ${className || ""}`}
    >
      <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 11-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
    </svg>
  );
}
