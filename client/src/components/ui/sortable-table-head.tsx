import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import * as React from "react";

import { TABLE_HEADER_CELL_CLASS } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortDir = "asc" | "desc";

export function SortableTableHead({
  className,
  children,
  active,
  sortDir,
  onSort,
  align = "left",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  active: boolean;
  sortDir: SortDir;
  onSort: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "h-12 pl-4 pr-6 align-middle [&:has([role=checkbox])]:pr-0",
        align === "right" ? "text-right" : "text-left",
        TABLE_HEADER_CELL_CLASS,
        className,
      )}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "-mx-2 inline-flex min-h-10 w-full max-w-full items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
          align === "right" ? "justify-end text-right" : "justify-start text-left",
          "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <span className="truncate">{children}</span>
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

/** Sortable header for CSS grid “tables” (e.g. reception same-day list). */
export function SortableGridHeaderButton({
  active,
  sortDir,
  onSort,
  className,
  children,
}: {
  active: boolean;
  sortDir: SortDir;
  onSort: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="columnheader"
      onClick={onSort}
      className={cn(
        "flex w-full min-h-10 items-center gap-1.5 border-r border-border py-2 pl-2 pr-3 text-left transition-colors last:border-r-0 last:pr-6",
        TABLE_HEADER_CELL_CLASS,
        "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="truncate">{children}</span>
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
      )}
    </button>
  );
}
