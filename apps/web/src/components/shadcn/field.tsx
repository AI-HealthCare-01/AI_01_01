import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "./utils";

export const ShadInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function ShadInput(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn("ms-input", className)} {...props} />;
});

export const ShadTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function ShadTextarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn("ms-textarea", className)} {...props} />;
  }
);

export const ShadSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function ShadSelect(
  { className, ...props },
  ref
) {
  return <select ref={ref} className={cn("ms-select", className)} {...props} />;
});
