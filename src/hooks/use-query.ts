"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
export function useQuery<T>(path: string | null) {
  const [state, setState] = useState<{
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: !!path });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((x) => x + 1), []);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (!path) {
        if (!cancelled) setState({ data: null, error: null, loading: false });
        return;
      }
      if (!cancelled)
        setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await api<T>(path);
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (e) {
        if (!cancelled)
          setState({
            data: null,
            error: e instanceof Error ? e.message : "Network error",
            loading: false,
          });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path, revision]);
  return { ...state, refresh };
}
export function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
