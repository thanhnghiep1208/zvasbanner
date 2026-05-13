import { clerkClient } from "@clerk/nextjs/server";

export type UserRole = "admin" | "mod" | "editor";
export type Permission =
  | "view_dashboard"
  | "manage_roles"
  | "delete_user"
  | "block_user"
  | "generate_image";

const DEFAULT_ADMIN_EMAIL = "thanhnghiep1208@gmail.com";

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

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export async function getUserRoleByUserId(userId: string): Promise<UserRole> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primaryEmail =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (primaryEmail?.toLowerCase() === DEFAULT_ADMIN_EMAIL) {
    return "admin";
  }
  const roleFromMetadata =
    user.privateMetadata?.role ?? user.publicMetadata?.role;
  return normalizeRole(roleFromMetadata);
}

export async function getUserAccessByUserId(userId: string): Promise<{
  role: UserRole;
  blocked: boolean;
}> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primaryEmail =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  const role =
    primaryEmail?.toLowerCase() === DEFAULT_ADMIN_EMAIL
      ? "admin"
      : normalizeRole(user.privateMetadata?.role ?? user.publicMetadata?.role);
  const blocked =
    typeof user.privateMetadata?.blocked === "boolean"
      ? user.privateMetadata.blocked
      : typeof user.publicMetadata?.blocked === "boolean"
        ? user.publicMetadata.blocked
        : false;
  return { role, blocked };
}

