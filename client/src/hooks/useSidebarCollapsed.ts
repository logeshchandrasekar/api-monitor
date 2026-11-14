import { useCallback, useEffect, useState } from "react";
import { SIDEBAR_STORAGE_KEY } from "../config";

function readSaved(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false; // storage blocked (private window, strict settings): the sidebar simply starts open
  }
}

/** Whether the desktop sidebar is collapsed to icons. Remembered per browser; works without storage. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readSaved);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // not saved, still works for this visit
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);
  return [collapsed, toggle] as const;
}
