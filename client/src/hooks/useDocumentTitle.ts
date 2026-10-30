import { useEffect } from "react";

/** Sets the browser tab title: "Settings · API Monitor" */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · API Monitor` : "API Monitor";
  }, [title]);
}
