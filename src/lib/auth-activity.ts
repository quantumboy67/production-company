import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const authActivityEvents = [
  "user.invited",
  "user.login",
  "user.logout",
  "user.first_login_completed",
  "user.password_changed",
  "user.password_change_required",
  "user.role_changed",
  "user.removed",
  "user.reactivated",
] as const;

export type AuthActivityEvent = (typeof authActivityEvents)[number];

type LogAuthActivityInput = {
  organizationId: string;
  profileId?: string | null;
  authUserId?: string | null;
  email?: string | null;
  eventType: AuthActivityEvent;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

const redactedKeys = ["password", "temporary_password", "token", "secret", "service_role", "service_key", "authorization"];

export async function logAuthActivity(input: LogAuthActivityInput) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("auth_activity").insert({
      organization_id: input.organizationId,
      profile_id: input.profileId ?? input.authUserId ?? null,
      auth_user_id: input.authUserId ?? input.profileId ?? null,
      email: input.email ?? null,
      event_type: input.eventType,
      summary: input.summary,
      metadata: sanitizeRecord(input.metadata ?? null),
    });

    if (error) {
      console.warn("Auth activity insert failed", {
        eventType: input.eventType,
        profileId: input.profileId ?? null,
        error: error.message,
      });
    }
  } catch (error) {
    console.warn("Auth activity insert failed", {
      eventType: input.eventType,
      profileId: input.profileId ?? null,
      error: error instanceof Error ? error.message : "Unknown auth activity error",
    });
  }
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
