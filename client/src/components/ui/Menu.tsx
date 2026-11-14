import { Ellipsis, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useDismiss } from "../../hooks/useDismiss";
import { cn } from "../../utils/cn";
import { Button } from "./Button";

export type MenuItem = {
  label: string;
  icon: LucideIcon;
  /** Navigates (a real link, so middle-click works). Use onSelect for everything else. */
  to?: string;
  onSelect?: () => void;
  /** Red text, for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
};

const itemClass =
  "flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors hover:bg-subtle focus-visible:bg-subtle disabled:opacity-60";

/**
 * A "More actions" dropdown. Click outside and Escape close it (useDismiss); the arrow keys move between items;
 * Escape and a choice put focus back on the button, so keyboard users do not lose their place.
 */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** The button is the first child of the root; focus goes back to it after Escape or a choice. */
  const focusButton = () => rootRef.current?.querySelector<HTMLElement>(":scope > button")?.focus();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close);

  // Opening the menu moves focus to its first item, so the arrow keys work straight away
  useEffect(() => {
    if (open)
      listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      focusButton();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nodes = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (nodes.length === 0) return;
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown" ? (at + 1) % nodes.length : (at - 1 + nodes.length) % nodes.length;
    nodes[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <Button
        variant="secondary"
        size="sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="px-2"
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </Button>

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          className="animate-rise absolute right-0 z-10 mt-2 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {items.map(({ label: text, icon: Icon, to, onSelect, danger, disabled }) => {
            const content = (
              <>
                <Icon
                  className={cn("size-4", danger ? "text-down-ink" : "text-fg-muted")}
                  aria-hidden="true"
                />
                {text}
              </>
            );
            const cls = cn(itemClass, danger && "text-down-ink");
            return to ? (
              <Link key={text} role="menuitem" to={to} onClick={close} className={cls}>
                {content}
              </Link>
            ) : (
              <button
                key={text}
                role="menuitem"
                type="button"
                disabled={disabled}
                onClick={() => {
                  close();
                  focusButton();
                  onSelect?.();
                }}
                className={cls}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
