"use client";
import { useEffect, useRef } from "react";

/**
 * Polling-based replacement for Supabase Realtime.
 * Calls `onChange` at a regular interval to refresh data.
 */
export function useRealtime(
  table: string,
  onChange: () => void,
  filter?: string,
) {
  const savedCallback = useRef(onChange);
  savedCallback.current = onChange;

  useEffect(() => {
    // Poll every 5 seconds for changes
    const interval = setInterval(() => {
      savedCallback.current();
    }, 5000);
    return () => clearInterval(interval);
  }, [table, filter]);
}
