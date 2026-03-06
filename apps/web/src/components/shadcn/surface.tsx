import { createElement } from "react";
import type { HTMLAttributes } from "react";

import { cn } from "./utils";

interface ShadCardProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "section" | "div";
}

export function ShadCard({ as = "article", className, ...props }: ShadCardProps) {
  return createElement(as, {
    className: cn("ms-card", className),
    ...props,
  });
}

export type ShadBadgeVariant = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

interface ShadBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ShadBadgeVariant;
}

export function ShadBadge({ variant = "neutral", className, ...props }: ShadBadgeProps) {
  return <span className={cn("ms-pill", `ms-pill--${variant}`, className)} {...props} />;
}
