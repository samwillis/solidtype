/**
 * Dashboard List View Component
 *
 * Reusable list view for dashboard pages.
 */

import { type ReactNode } from "react";
import { LuFileText } from "react-icons/lu";
import { formatTimeAgo } from "../../lib/utils/format";
import "../../styles/dashboard.css";

interface ListItem {
  id: string;
  name: string;
  path?: string;
  updatedAt?: string | Date;
  icon?: ReactNode;
  onClick: () => void;
}

interface DashboardListViewProps {
  items: ListItem[];
}

export function DashboardListView({ items }: DashboardListViewProps) {
  return (
    <div className="dashboard-list">
      {items.map((item) => (
        <div key={item.id} className="dashboard-list-item" onClick={item.onClick}>
          <div className="dashboard-list-item-icon">{item.icon || <LuFileText size={20} />}</div>
          <div className="dashboard-list-item-content">
            <div className="dashboard-list-item-name">{item.name}</div>
            {item.path && <div className="dashboard-list-item-path">{item.path}</div>}
          </div>
          {item.updatedAt && (
            <div className="dashboard-list-item-meta">
              <span className="dashboard-list-item-time">{formatTimeAgo(item.updatedAt)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
