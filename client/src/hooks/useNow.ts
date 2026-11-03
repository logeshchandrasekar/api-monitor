import { useEffect, useState } from "react";

/**
 * Re-renders the caller every `intervalMs` and returns the current time, so "3 min ago" keeps
 * counting between polls without asking the server anything.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
