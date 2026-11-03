import type { ComponentProps } from "react";
import { Link } from "react-router";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonStyles";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** A router <Link> that looks like a Button: navigation stays a real link (middle-click, "open in new tab"). */
export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
