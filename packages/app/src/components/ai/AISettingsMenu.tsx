/**
 * AI Settings Menu
 *
 * Dropdown menu for AI tool approval settings including YOLO mode toggle.
 * Rendered in a portal to avoid clipping by parent containers.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { LuSettings, LuZap, LuShield, LuRotateCcw } from "react-icons/lu";
import { useToolApprovalPrefs } from "../../hooks/useToolApprovalPrefs";
import "./AISettingsMenu.css";

export function AISettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { yoloMode, alwaysAllow, setYoloMode, resetPreferences } = useToolApprovalPrefs();

  // Calculate position when opening
  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  // Update position on scroll/resize
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
    return undefined;
  }, [isOpen, updatePosition]);

  const handleToggle = useCallback(() => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  }, [isOpen, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        className="ai-settings-trigger"
        onClick={handleToggle}
        aria-label="AI Settings"
        aria-expanded={isOpen}
      >
        <LuSettings size={12} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="ai-settings-menu"
            style={{
              position: "fixed",
              top: menuPosition.top,
              right: menuPosition.right,
              zIndex: 10000,
            }}
          >
            <div className="ai-settings-label">Tool Approval</div>

            {/* YOLO Mode Toggle */}
            <button
              className={`ai-settings-item ${yoloMode ? "active" : ""}`}
              onClick={() => setYoloMode(!yoloMode)}
            >
              <LuZap size={12} className={yoloMode ? "yolo-active" : ""} />
              <span>YOLO Mode</span>
              {yoloMode && <span className="ai-settings-badge">ON</span>}
            </button>

            <div className="ai-settings-hint">
              {yoloMode ? "All tools auto-approved" : "Destructive operations require confirmation"}
            </div>

            {/* Show count of always-allowed tools */}
            {alwaysAllow.length > 0 && (
              <div className="ai-settings-info">
                <LuShield size={10} />
                <span>{alwaysAllow.length} tools always allowed</span>
              </div>
            )}

            {/* Reset preferences */}
            <button className="ai-settings-item ai-settings-reset" onClick={resetPreferences}>
              <LuRotateCcw size={12} />
              <span>Reset to Defaults</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

export default AISettingsMenu;
