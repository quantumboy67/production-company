import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationMembership, OrganizationRole, Profile } from "@/lib/types";

const editRoles: OrganizationRole[] = ["owner", "admin", "producer"];
const adminRoles: OrganizationRole[] = ["owner", "admin"];

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireUser() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getProfile() {
  const [profile, membership] = await Promise.all([getOptionalProfile(), getActiveMembership()]);

  if (!profile?.organization_id || !membership) {
    redirect("/onboarding");
  }

  if (membership.must_change_password) {
    redirect("/change-password");
  }

  return {
    ...profile,
    organization_id: membership.organization_id,
    membership,
  };
}

export async function getOptionalProfile() {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile | null;
}

export async function getMembership(): Promise<OrganizationMembership | null> {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, profile_id, role, status, must_change_password")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as OrganizationMembership | null;
}

export async function getActiveMembership(options: { allowPasswordChange?: boolean } = {}) {
  const membership = await getMembership();

  if (!membership) {
    return null;
  }

  if (membership.status !== "active") {
    redirect("/login?error=Your account is not active for this organization.");
  }

  if (membership.must_change_password && !options.allowPasswordChange) {
    redirect("/change-password");
  }

  return membership;
}

export async function requireMembership(options: { allowPasswordChange?: boolean } = {}) {
  await requireUser();
  const membership = await getActiveMembership(options);

  if (!membership) {
    redirect("/onboarding");
  }

  return membership;
}

export async function requireRole(roles: OrganizationRole[], options: { allowPasswordChange?: boolean } = {}) {
  const membership = await requireMembership(options);

  if (!roles.includes(membership.role)) {
    throw new Error("You do not have permission to perform this action.");
  }

  return membership;
}

export async function requireCanManageUsers() {
  return requireRole([...adminRoles]);
}

export async function requireCanManageEvents() {
  return requireRole([...editRoles]);
}

export async function requireCanEditFinancials() {
  return requireRole([...editRoles]);
}

export async function requireCanDeleteRecords() {
  return requireRole([...adminRoles]);
}

export function canManageUsers(role: OrganizationRole) {
  return adminRoles.includes(role);
}

export function canManageEvents(role: OrganizationRole) {
  return editRoles.includes(role);
}

export function canEditFinancials(role: OrganizationRole) {
  return editRoles.includes(role);
}

export function canViewOnly(role: OrganizationRole) {
  return role === "viewer";
}

export function canDeleteRecords(role: OrganizationRole) {
  return adminRoles.includes(role);
}
