import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "./utils";

export type ShadButtonVariant = "primary" | "secondary" | "soft" | "tertiary" | "danger" | "ghost";
export type ShadButtonSize = "sm" | "md" | "lg";

export interface ShadButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ShadButtonVariant;
  size?: ShadButtonSize;
  fullWidth?: boolean;
}

export const ShadButton = forwardRef<HTMLButtonElement, ShadButtonProps>(function ShadButton(
  { variant = "primary", size = "md", fullWidth = false, className, type, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn("ms-btn", `ms-btn--${variant}`, `ms-btn--${size}`, fullWidth && "ms-btn--full", className)}
      {...props}
    />
  );
});

export type ShadIconButtonVariant = "neutral" | "primary" | "danger";

export interface ShadIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ShadIconButtonVariant;
  size?: ShadButtonSize;
}

export const ShadIconButton = forwardRef<HTMLButtonElement, ShadIconButtonProps>(function ShadIconButton(
  { variant = "neutral", size = "md", className, type, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "ms-icon-btn",
        `ms-icon-btn--${size}`,
        variant !== "neutral" && `ms-icon-btn--${variant}`,
        className
      )}
      {...props}
    />
  );
});
