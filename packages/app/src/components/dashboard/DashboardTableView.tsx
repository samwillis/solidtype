/**
 * Dashboard Table View Component
 *
 * Reusable table view using TanStack Table for dashboard pages.
 */

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type OnChangeFn,
} from "@tanstack/react-table";
import { LuChevronUp, LuChevronDown } from "react-icons/lu";
import "../../styles/dashboard.css";

interface DashboardTableViewProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}

export function DashboardTableView<T>({
  data,
  columns,
  sorting,
  onSortingChange,
}: DashboardTableViewProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange,
  });

  return (
    <div className="dashboard-table-container">
      <table className="dashboard-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`dashboard-table-header ${header.column.getCanSort() ? "dashboard-table-header-sortable" : ""}`}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="dashboard-table-header-content">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span className="dashboard-table-sort-icon">
                        {header.column.getIsSorted() === "asc" ? (
                          <LuChevronUp size={14} />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <LuChevronDown size={14} />
                        ) : (
                          <LuChevronDown size={14} style={{ opacity: 0.3 }} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="dashboard-table-row">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="dashboard-table-cell">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
