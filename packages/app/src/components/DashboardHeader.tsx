/**
 * Dashboard Header - Responsive sticky header for dashboard pages
 *
 * Handles:
 * - Sticky positioning with scroll border
 * - Responsive layout: title left, controls center, props panel right
 * - On narrow screens: controls wrap below, aligned to the right
 */

import { useEffect, useState, useRef, type ReactNode } from "react";
import "./DashboardHeader.css";

interface DashboardHeaderProps {
  /** Title displayed on the left */
  title: ReactNode;
  /** Optional action button next to title (e.g., settings) */
  titleAction?: ReactNode;
  /** View controls (branch selector, filters, sort, view toggle) */
  viewControls?: ReactNode;
  /** Properties panel component (positioned top-right) */
  propertiesPanel: ReactNode;
}

export function DashboardHeader({
  title,
  titleAction,
  viewControls,
  propertiesPanel,
}: DashboardHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      // Check the parent's scroll position to detect scrolling
      const parent = headerRef.current?.parentElement;
      if (parent) {
        setIsScrolled(parent.scrollTop > 0);
      }
    };

    // Listen to scroll on the parent element (dashboard-main)
    const parent = headerRef.current?.parentElement;
    if (parent) {
      parent.addEventListener("scroll", handleScroll, { passive: true });
      return () => parent.removeEventListener("scroll", handleScroll);
    }
    return undefined;
  }, []);

  return (
    <header
      ref={headerRef}
      className={`dashboard-header ${isScrolled ? "dashboard-header--scrolled" : ""}`}
    >
      {/* 1. Title - float left, first in DOM */}
      <div className="dashboard-header__left">
        <h1 className="dashboard-header__title">{title}</h1>
        {titleAction && <div className="dashboard-header__title-action">{titleAction}</div>}
      </div>

      {/* 2. Props panel wrapper - reserves space, panel is absolute inside */}
      <div className="dashboard-header__right">
        <div className="dashboard-header__props-wrapper">
          <div className="dashboard-header__props-container">{propertiesPanel}</div>
        </div>
      </div>

      {/* 3. Controls - float right (drops down when no space) */}
      {viewControls && <div className="dashboard-header__controls">{viewControls}</div>}
    </header>
  );
}

export default DashboardHeader;
