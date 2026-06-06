import { requireCanManageUsers, requireMembership } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationMemberStatus, OrganizationRole } from "@/lib/types";

export type TeamMember = {
  id: string;
  profile_id: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  must_change_password: boolean;
  invited_at: string | null;
  deactivated_at: string | null;
  created_at: string | null;
  profiles_created_at: string | null;
  profiles: {
    full_name: string | null;
    email: string | null;
    id: string;
    created_at: string | null;
  } | null;
};

export async function listTeamMembers() {
  const membership = await requireCanManageUsers();
  return listMembersForOrganization(membership.organization_id);
}

export async function listMyTeamMembers() {
  const membership = await requireMembership();
  const members = await listMembersForOrganization(membership.organization_id);

  return {
    currentRole: membership.role,
    activeMembers: members.filter((member) => member.status === "active"),
    inactiveMembers: members.filter((member) => member.status !== "active"),
  };
}

async function listMembersForOrganization(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, profile_id, role, status, must_change_password, invited_at, deactivated_at, created_at, profiles!organization_members_profile_id_fkey(id, full_name, email, created_at)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((member) => {
    const profiles = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;

    return {
      ...member,
      profiles_created_at: profiles?.created_at ?? null,
      profiles: profiles ?? null,
    } as TeamMember;
  });
}
