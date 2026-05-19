import { clerkClient } from "@clerk/nextjs/server";

import { USER_ACCESS_CACHE_MS } from "@/lib/dashboard";

export type UserRole = "admin" | "mod" | "editor";
export type Permission =
  | "view_dashboard"
  | "manage_roles"
  | "delete_user"
  | "block_user"
  | "generate_image";

/** Override admin by primary email (Clerk user record). */
export const DEFAULT_ADMIN_EMAIL = "thanhnghiep1208@gmail.com";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    "view_dashboard",
    "manage_roles",
    "delete_user",
    "block_user",
    "generate_image",
  ],
  mod: ["view_dashboard", "manage_roles", "generate_image"],
  editor: ["generate_image"],
};

function normalizeRole(raw: unknown): UserRole {
  if (raw === "admin" || raw === "mod" || raw === "editor") return raw;
  return "editor";
}

export type ClerkUserRoleInput = {
  emailAddresses: { id: string; emailAddress: string }[];
  primaryEmailAddressId: string | null;
  privateMetadata: Record<string, unknown>;
  publicMetadata: Record<string, unknown>;
};

export function getPrimaryEmailFromClerkUser(
  user: ClerkUserRoleInput
): string | undefined {
  return (
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress
  );
}

/** Role from Clerk user (email override + private/public metadata). */
export function getRoleFromClerkUser(user: ClerkUserRoleInput): UserRole {
  const primaryEmail = getPrimaryEmailFromClerkUser(user);
  if (primaryEmail?.toLowerCase() === DEFAULT_ADMIN_EMAIL) {
    return "admin";
  }
  return normalizeRole(user.privateMetadata?.role ?? user.publicMetadata?.role);
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export async function getUserRoleByUserId(userId: string): Promise<UserRole> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return getRoleFromClerkUser(user);
}

type UserAccess = { role: UserRole; blocked: boolean };

const userAccessCache = new Map<string, { expiresAt: number; access: UserAccess }>();

export function invalidateUserAccessCache(userId?: string): void {
  if (userId) {
    userAccessCache.delete(userId);
    return;
  }
  userAccessCache.clear();
}

async function loadUserAccessFromClerk(userId: string): Promise<UserAccess> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = getRoleFromClerkUser(user);
  const blocked =
    typeof user.privateMetadata?.blocked === "boolean"
      ? user.privateMetadata.blocked
      : typeof user.publicMetadata?.blocked === "boolean"
        ? user.publicMetadata.blocked
        : false;
  return { role, blocked };
}

export async function getUserAccessByUserId(userId: string): Promise<UserAccess> {
  const now = Date.now();
  const cached = userAccessCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.access;
  }
  const access = await loadUserAccessFromClerk(userId);
  userAccessCache.set(userId, {
    access,
    expiresAt: now + USER_ACCESS_CACHE_MS,
  });
  return access;
}
