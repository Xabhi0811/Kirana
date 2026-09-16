"use client";
import { useEffect } from "react";
import { browserSupabase } from "@/lib/supabase/client";
export function useRealtime(
  table: string,
  onChange: () => void,
  filter?: string,
) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
    const db = browserSupabase();
    const channel = db
      .channel(`${table}:${filter || "all"}`, {
        config: { postgres_changes_options: { wait: true } },
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        onChange,
      );
    let disposed = false;
    void db.realtime
      .setAuth()
      .then(() => {
        if (!disposed) channel.subscribe();
      })
      .catch(() => {
        /* The query remains usable if realtime is unavailable. */
      });
    return () => {
      disposed = true;
      void db.removeChannel(channel);
    };
  }, [table, filter, onChange]);
}
