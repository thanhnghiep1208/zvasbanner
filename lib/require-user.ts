import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * For Route Handlers that must only run for signed-in Clerk users.
 * Returns the active session user id, or a 401 JSON response.
 */
export async function requireUserJson(params: {
  error: string;
}): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: params.error }, { status: 401 });
  }
  return { userId };
}
