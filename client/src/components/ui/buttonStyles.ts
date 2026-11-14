import { cn } from "../../utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "border border-line bg-surface text-fg hover:border-fg-muted/40 hover:bg-subtle",
  ghost: "text-fg hover:bg-subtle",
  danger: "bg-danger text-white hover:bg-danger-hover",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
};

/** The look of a button as a class string, so a <Link> can wear it too (see ButtonLink). Lives apart from Button.tsx because a component file may only export components. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium",
    "transition-[background-color,border-color,color,transform] duration-150 ease-out-quint active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );
}
