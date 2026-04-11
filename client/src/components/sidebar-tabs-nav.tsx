import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Radix `TabsList` classes for a vertical navigator (left column). */
export const SIDEBAR_TABS_LIST_CLASS = cn(
  "inline-flex h-auto w-full flex-col items-stretch justify-start gap-1.5 rounded-lg border bg-muted/40 p-2 text-muted-foreground",
);

/** Radix `TabsTrigger` classes aligned for sidebar (full-width, left-aligned label). */
export const SIDEBAR_TABS_TRIGGER_CLASS = cn(
  "inline-flex min-h-10 w-full justify-start gap-2 rounded-md px-3 py-2 text-left text-sm font-medium whitespace-normal",
  "data-[state=active]:shadow-sm",
);

type SidebarTabsNavLayoutProps = {
  /** Omit or pass `null` to show only the main column (full width). */
  sidebar?: ReactNode | null;
  children: ReactNode;
  className?: string;
};

/**
 * Places tab triggers in a left column and tab panels on the right.
 * Use inside `<Tabs>` with `TabsContent` using `className="mt-0 ..."` so spacing comes from the right column.
 */
export function SidebarTabsNavLayout({ sidebar, children, className }: SidebarTabsNavLayoutProps) {
  if (sidebar == null) {
    return <div className={cn("min-w-0", className)}>{children}</div>;
  }
  return (
    <div className={cn("flex flex-col gap-6 lg:flex-row lg:items-start", className)}>
      <nav className="w-full shrink-0 lg:w-56 xl:w-60" aria-label="Section navigation">
        {sidebar}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
