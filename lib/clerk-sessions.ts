import { clerkClient } from "@clerk/nextjs/server";

export type SessionListItem = {
  sessionId: string;
  userId: string;
  status: string;
  lastActiveAt: number;
  createdAt: number;
  expireAt: number;
  isCurrent: boolean;
  deviceLabel: string;
  browserName?: string;
  deviceType?: string;
  city?: string;
  country?: string;
  ipAddress?: string;
};

type ClerkSession = Awaited<
  ReturnType<Awaited<ReturnType<typeof clerkClient>>["sessions"]["getSessionList"]>
>["data"][number];

function formatDeviceLabel(session: ClerkSession): string {
  const activity = session.latestActivity;
  if (!activity) {
    return "Thiết bị không xác định";
  }
  const parts: string[] = [];
  if (activity.browserName) {
    parts.push(
      activity.browserVersion
        ? `${activity.browserName} ${activity.browserVersion}`
        : activity.browserName
    );
  }
  if (activity.deviceType) {
    parts.push(activity.deviceType);
  } else if (activity.isMobile) {
    parts.push("Mobile");
  }
  const location = [activity.city, activity.country].filter(Boolean).join(", ");
  if (location) {
    parts.push(location);
  }
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  if (activity.ipAddress) {
    return `IP ${activity.ipAddress}`;
  }
  return "Thiết bị không xác định";
}

function mapSession(
  session: ClerkSession,
  currentSessionId?: string | null
): SessionListItem {
  const activity = session.latestActivity;
  return {
    sessionId: session.id,
    userId: session.userId,
    status: session.status,
    lastActiveAt: session.lastActiveAt,
    createdAt: session.createdAt,
    expireAt: session.expireAt,
    isCurrent: Boolean(currentSessionId && session.id === currentSessionId),
    deviceLabel: formatDeviceLabel(session),
    browserName: activity?.browserName,
    deviceType: activity?.deviceType,
    city: activity?.city,
    country: activity?.country,
    ipAddress: activity?.ipAddress,
  };
}

export async function listActiveSessionsForUser(params: {
  userId: string;
  currentSessionId?: string | null;
}): Promise<SessionListItem[]> {
  const client = await clerkClient();
  const result = await client.sessions.getSessionList({
    userId: params.userId,
    status: "active",
    limit: 100,
  });
  return result.data.map((session) =>
    mapSession(session, params.currentSessionId)
  );
}

export async function sessionBelongsToUser(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const sessions = await listActiveSessionsForUser({ userId });
  return sessions.some((s) => s.sessionId === sessionId);
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  const client = await clerkClient();
  await client.sessions.revokeSession(sessionId);
}
