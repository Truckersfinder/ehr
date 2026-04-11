import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SectionTitleWithHintProps = {
  children: ReactNode;
  /** Shown on hover (and focus) — replaces static CardDescription / subtitle copy. */
  hint: ReactNode;
  className?: string;
  /** Subtle dotted underline; set false for inline use where decoration is noisy. */
  showUnderline?: boolean;
};

/**
 * Wraps a section or card title so explanatory copy lives in a tooltip (“hover to discover”).
 */
export function SectionTitleWithHint({ children, hint, className, showUnderline = true }: SectionTitleWithHintProps) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            showUnderline && "cursor-help border-b border-dotted border-muted-foreground/55 pb-px",
            className,
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-md text-left font-normal leading-relaxed">
        {typeof hint === "string" ? <p>{hint}</p> : hint}
      </TooltipContent>
    </Tooltip>
  );
}
