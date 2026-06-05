import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/auth";

type ActorProfile = {
  id?: string | null;
  profile_id?: string | null;
  email?: string | null;
  full_name?: string | null;
};

type AuditValue = Record<string, unknown> | Record<string, unknown>[] | null;

type LogAuditEventInput = {
  organizationId: string;
  actorProfile?: ActorProfile | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  beforeData?: AuditValue;
  afterData?: AuditValue;
  metadata?: Record<string, unknown> | null;
};

const redactedKeys = ["password", "temporary_password", "token", "secret", "service_role", "service_key"];

export async function logAuditEvent(input: LogAuditEventInput) {
  try {
    const admin = createAdminClient();
    const user = await getUser();
    const actorProfileId = input.actorProfile?.profile_id ?? input.actorProfile?.id ?? user?.id ?? null;
    const actor = await resolveActor(admin, actorProfileId);

    const { error } = await admin.from("audit_log").insert({
      organization_id: input.organizationId,
      actor_profile_id: actorProfileId,
      actor_auth_user_id: user?.id ?? actorProfileId,
      actor_email: actor?.email ?? input.actorProfile?.email ?? user?.email ?? null,
      actor_name: actor?.full_name ?? input.actorProfile?.full_name ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      before_data: sanitizeAuditValue(input.beforeData ?? null),
      after_data: sanitizeAuditValue(input.afterData ?? null),
      metadata: sanitizeRecord(input.metadata ?? null),
    });

    if (error) {
      console.warn("Audit log insert failed", {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        error: error.message,
      });
    }
  } catch (error) {
    console.warn("Audit log insert failed", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      error: error instanceof Error ? error.message : "Unknown audit error",
    });
  }
}

async function resolveActor(admin: ReturnType<typeof createAdminClient>, profileId: string | null) {
  if (!profileId) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", profileId)
    .maybeSingle();

  if (error) return null;
  return data as { id: string; full_name: string | null; email: string | null } | null;
}

function sanitizeAuditValue(value: AuditValue): AuditValue {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRecord(item) ?? {});
  }

  return sanitizeRecord(value);
}

function sanitizeRecord(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (redactedKeys.some((redactedKey) => key.toLowerCase().includes(redactedKey))) {
        return [key, "[redacted]"];
      }

      if (Array.isArray(item)) {
        return [key, item.map((child) => (isRecord(child) ? sanitizeRecord(child) : child))];
      }

      if (isRecord(item)) {
        return [key, sanitizeRecord(item)];
      }

      return [key, item];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
