import { cn } from "@/lib/utils";
import { IMANI_MARK_SRC } from "@/lib/brand-assets";

type Props = {
  className?: string;
  /** Use empty string when adjacent text names the brand (decorative). */
  alt?: string;
};

export function ImaniMark({ className, alt = "Imani EHR" }: Props) {
  return <img src={IMANI_MARK_SRC} alt={alt} className={cn("object-contain shrink-0", className)} />;
}
