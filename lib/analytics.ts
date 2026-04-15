"use client";

import type {
  AnalyticsEventName,
  AnalyticsEventPayloadMap,
} from "@/lib/analytics-events";

export type TrackPayload<E extends AnalyticsEventName> = Omit<
  AnalyticsEventPayloadMap[E],
  "timestamp"
> & {
  event: E;
  timestamp: number;
};

export async function track<E extends AnalyticsEventName>(
  event: E,
  data: AnalyticsEventPayloadMap[E]
): Promise<void> {
  const payload: TrackPayload<E> = {
    ...(data as Omit<AnalyticsEventPayloadMap[E], "timestamp">),
    event,
    timestamp: data.timestamp ?? Date.now(),
  };

  const res = await fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Track request failed: HTTP ${res.status}`);
  }
}
