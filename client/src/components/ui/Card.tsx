import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type CardProps = {
  title?: string;
  description?: string;
  /** Buttons or links shown at the right of the header. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function Card({ title, description, action, children, className }: CardProps) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface shadow-sm", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children && <div className="p-5">{children}</div>}
    </section>
  );
}
