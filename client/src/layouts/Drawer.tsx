import { useEffect, useRef, type ReactNode } from "react";

/** The mobile navigation panel: a native <dialog> pinned to the left edge (focus trap, Esc and backdrop come with it). */
export function Drawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label="Navigation"
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-line bg-surface p-0 text-fg backdrop:bg-black/50 lg:hidden"
    >
      {open && children}
    </dialog>
  );
}
