import { requireCanManageUsers } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationMemberStatus, OrganizationRole } from "@/lib/types";

export type TeamMember = {
  id: string;
  profile_id: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  must_change_password: boolean;
  invited_at: string | null;
  profiles: {
    full_name: string | null;
    email: string | null;
    id: string;
  } | null;
};

export async function listTeamMembers() {
  const membership = await requireCanManageUsers();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, profile_id, role, status, must_change_password, invited_at, profiles!organization_members_profile_id_fkey(id, full_name, email)")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((member) => {
    const profiles = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;

    return {
      ...member,
      profiles: profiles ?? null,
    } as TeamMember;
  });
}
