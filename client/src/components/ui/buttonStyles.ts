import { cn } from "../../utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "border border-line bg-surface text-fg hover:bg-subtle",
  ghost: "text-fg hover:bg-subtle",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
};

/** The look of a button as a class string, so a <Link> can wear it too (see ButtonLink). Lives apart from Button.tsx because a component file may only export components. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );
}
