import { createClient } from "@/lib/supabase/server";
import { requireCanManageUsers } from "@/lib/supabase/auth";
import type { AuthActivityRecord } from "@/lib/types";

export async function listRecentAuthActivity(limit = 20): Promise<AuthActivityRecord[]> {
  const membership = await requireCanManageUsers();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auth_activity")
    .select("id, organization_id, profile_id, auth_user_id, email, event_type, summary, metadata, created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AuthActivityRecord[];
}
