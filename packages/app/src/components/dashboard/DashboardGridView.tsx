/**
 * Dashboard Grid View Component
 *
 * Reusable grid/card view for dashboard pages.
 */

import { type ReactNode } from "react";
import { LuFileText } from "react-icons/lu";
import { formatTimeAgo } from "../../lib/utils/format";
import "../../styles/dashboard.css";

interface GridItem {
  id: string;
  name: string;
  description?: string | null;
  workspace?: string;
  meta?: string;
  updatedAt?: string | Date;
  icon?: ReactNode;
  onClick: () => void;
}

interface DashboardGridViewProps {
  items: GridItem[];
}

export function DashboardGridView({ items }: DashboardGridViewProps) {
  return (
    <div className="dashboard-grid">
      {items.map((item) => (
        <div
          key={item.id}
          className="dashboard-card"
          onClick={item.onClick}
          style={{ cursor: "pointer" }}
        >
          <div className="dashboard-card-thumbnail">
            <div className="dashboard-card-thumbnail-placeholder">
              {item.icon || <LuFileText size={48} />}
            </div>
          </div>
          <div className="dashboard-card-content">
            <div className="dashboard-card-header">
              <h3 className="dashboard-card-title">{item.name}</h3>
            </div>
            {item.workspace && (
              <div className="dashboard-card-workspace-row">
                <span className="dashboard-card-workspace">{item.workspace}</span>
              </div>
            )}
            {item.description && (
              <p className="dashboard-card-description">{item.description}</p>
            )}
            {item.meta && (
              <div className="dashboard-card-meta">
                <span className="dashboard-card-time">{item.meta}</span>
              </div>
            )}
            {item.updatedAt && (
              <div className="dashboard-card-meta">
                <span className="dashboard-card-time">
                  Updated {formatTimeAgo(item.updatedAt)}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
