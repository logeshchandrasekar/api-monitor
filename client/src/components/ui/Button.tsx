import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button, so a double click cannot submit twice. */
  loading?: boolean;
};

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "border border-line bg-surface text-fg hover:bg-subtle",
  ghost: "text-fg hover:bg-subtle",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type} // "button" by default so a Button inside a <form> never submits by accident; pass type="submit" explicitly
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
