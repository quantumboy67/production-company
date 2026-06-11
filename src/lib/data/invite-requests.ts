import { createClient } from "@/lib/supabase/server";
import { requireCanManageUsers } from "@/lib/supabase/auth";
import type { InviteRequestRecord } from "@/lib/types";

export async function listInviteRequests(limit = 20): Promise<InviteRequestRecord[]> {
  await requireCanManageUsers();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invite_requests")
    .select("id, organization_id, full_name, email, company, message, status, reviewed_by, reviewed_at, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as InviteRequestRecord[];
}
