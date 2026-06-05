import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/auth";
import type { AuditLogRecord } from "@/lib/types";

export async function listEventActivity(eventId: string): Promise<AuditLogRecord[]> {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, organization_id, actor_profile_id, actor_auth_user_id, actor_email, actor_name, entity_type, entity_id, action, summary, before_data, after_data, metadata, created_at")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as AuditLogRecord[]).filter((row) => isEventActivity(row, eventId));
}

function isEventActivity(row: AuditLogRecord, eventId: string) {
  return (
    (row.entity_type === "event" && row.entity_id === eventId) ||
    row.metadata?.event_id === eventId
  );
}
