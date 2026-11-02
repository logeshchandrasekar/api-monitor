import { useEffect } from "react";
import { APP_NAME } from "../config";

/** Sets the browser tab title: "Monitors · API Monitor". An empty title resets it to the app name. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
