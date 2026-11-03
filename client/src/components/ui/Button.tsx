import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonStyles";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button, so a double click cannot submit twice. */
  loading?: boolean;
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
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
