"use client";

/**
 * Live updates via SSE (`GET /api/v1/stream`, event_bus.ts). On a relevant
 * event the matching React Query cache is invalidated so the UI refreshes
 * without polling. Event types observed: 'connected', 'phase_update',
 * 'risk_alert', 'recommendation'.
 *
 * No-op in MOCK mode. NOTE: EventSource is GET-only and cannot send the
 * `Authorization` header — the live stream needs cookie/session or a token
 * query param (same constraint as the OAuth redirect, tracked as A2.5).
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, USE_MOCK } from "./api";

const EVENT_TO_QUERY: Record<string, string[]> = {
  risk_alert: ["risks", "sweep"],
  recommendation: ["recommendations", "healing"],
  phase_update: ["recommendations", "sweep", "profit-readiness"],
};

export function useStream() {
  const qc = useQueryClient();

  useEffect(() => {
    if (USE_MOCK || typeof window === "undefined") return;

    const es = new EventSource(`${API_BASE}/api/v1/stream`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type?: string };
        const keys = data.type ? EVENT_TO_QUERY[data.type] : undefined;
        if (keys) {
          for (const key of keys) {
            qc.invalidateQueries({ queryKey: [key] });
          }
        }
      } catch {
        // Ignore non-JSON keepalive frames.
      }
    };

    es.onerror = () => {
      // Browser auto-reconnects; nothing to do.
    };

    return () => es.close();
  }, [qc]);
}
