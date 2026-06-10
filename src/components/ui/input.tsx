import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "placeholder:text-muted-fg",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
