import { Card, CardContent } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
  "data-testid": testId,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <Card className={cn("border-dashed", className)} data-testid={testId}>
      <CardContent className="py-12 text-center text-muted-foreground">
        {Icon ? <Icon className="w-10 h-10 mx-auto mb-3 opacity-50" aria-hidden /> : null}
        <p className="text-sm font-medium text-foreground">
          {description ? <SectionTitleWithHint hint={description}>{title}</SectionTitleWithHint> : title}
        </p>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

