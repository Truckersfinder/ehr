import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const boxSize = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
} as const;

const iconSize = {
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
} as const;

export type MutedIconBoxSize = keyof typeof boxSize;

/** Neutral bordered tile for Lucide icons (no chart/primary accent colors). */
export function MutedIconBox({
  icon: Icon,
  size = "md",
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  size?: MutedIconBoxSize;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground",
        boxSize[size],
        className
      )}
    >
      <Icon className={cn(iconSize[size], iconClassName)} strokeWidth={1.5} />
    </div>
  );
}
