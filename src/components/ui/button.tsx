import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "ghost";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-[var(--radius)] px-4 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      "disabled:pointer-events-none disabled:opacity-50",
      variant === "default" && "bg-accent text-accent-fg hover:bg-accent-hover",
      variant === "ghost" && "hover:bg-muted",
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";
