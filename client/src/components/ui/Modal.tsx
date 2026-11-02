import { useEffect, useId, useRef, type ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Usually buttons; right-aligned. */
  footer?: ReactNode;
};

/**
 * Built on the native <dialog>: showModal() gives focus trapping, Esc to close, an inert page behind it
 * and a backdrop for free. The content is only rendered while open, so forms inside start fresh each time.
 */
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose} // fires for Esc and for dialog.close()
      onClick={(event) => {
        // The dialog has no padding of its own, so a click that lands on the <dialog> element itself is a click on the backdrop
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/50"
    >
      {open && (
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1.5 text-sm text-fg-muted">
              {description}
            </p>
          )}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
