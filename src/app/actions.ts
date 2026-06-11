"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAuthActivity } from "@/lib/auth-activity";
import { logAuditEvent } from "@/lib/audit";
import {
  getActiveMembership,
  getMembership,
  getUser,
  requireCanDeleteRecords,
  requireCanEditFinancials,
  requireCanManageEvents,
  requireCanManageUsers,
  requireMembership,
  requireUser,
} from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { BudgetItemDocument, OrganizationRole } from "@/lib/types";

const eventSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Event name is required"),
  starts_on: z.string().min(1, "Start date is required"),
  ends_on: z.string().optional(),
  status: z.enum(["planning", "confirmed", "active", "settled", "cancelled"]),
  capacity: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

const onboardingSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required"),
  organization_name: z.string().trim().min(2, "Organization name is required"),
});

const optionalMoney = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().min(0).nullable(),
);

const optionalDate = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.string().nullable(),
);

const nullableUuid = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.string().uuid().nullable(),
);

const budgetItemSchema = z.object({
  id: z.string().uuid().optional(),
  event_id: z.string().uuid(),
  cost_type: z.enum(["hard", "soft"]),
  category: z.string().trim().min(1, "Category is required"),
  description: z.string().trim().min(1, "Description is required"),
  estimated_amount: z.coerce.number().min(0),
  actual_amount: optionalMoney,
  status: z.enum(["planned", "quoted", "approved", "due", "paid", "cancelled"]),
  vendor_contact_id: nullableUuid,
  due_date: optionalDate,
  paid_date: optionalDate,
  notes: z.string().trim().optional(),
});

const batchBudgetItemSchema = budgetItemSchema.required({ id: true }).omit({ event_id: true });

const batchBudgetItemsSchema = z.object({
  event_id: z.string().uuid(),
  rows: z
    .array(batchBudgetItemSchema)
    .min(1, "No changed budget rows were submitted"),
});

const revenueItemSchema = z.object({
  id: z.string().uuid().optional(),
  event_id: z.string().uuid(),
  source: z.enum(["ticket", "sponsorship", "bar_bounty", "merch_split", "other"]),
  description: z.string().trim().min(1, "Description is required"),
  projected_amount: z.coerce.number().min(0),
  actual_amount: optionalMoney,
  status: z.enum(["projected", "confirmed", "received"]),
  notes: z.string().trim().optional(),
});

const ticketTierSchema = z.object({
  id: z.string().uuid().optional(),
  event_id: z.string().uuid(),
  name: z.string().trim().min(1, "Tier name is required"),
  price: z.coerce.number().min(0),
  capacity: z.coerce.number().int().min(0),
  sold_quantity: z.coerce.number().int().min(0),
  comp_quantity: z.coerce.number().int().min(0),
  notes: z.string().trim().optional(),
});

const settlementSchema = z.object({
  event_id: z.string().uuid(),
  partner_split_type: z.enum(["true_50_50", "sweat_equity", "siloed_revenue_streams", "custom"]),
  partner_a_name: z.string().trim().optional(),
  partner_b_name: z.string().trim().optional(),
  partner_a_percent: z.coerce.number().min(0).max(100),
  partner_b_percent: z.coerce.number().min(0).max(100),
  notes: z.string().trim().optional(),
});

const inviteUserSchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  full_name: z.string().trim().min(2, "Full name is required"),
  role: z.enum(["admin", "producer", "viewer"]),
  temporary_password: z.string().min(10, "Temporary password must be at least 10 characters"),
  confirm_admin: z.string().optional(),
});

const inviteRequestSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required").max(120, "Full name is too long"),
  email: z.string().trim().email("A valid email is required").max(254, "Email is too long"),
  company: z.string().trim().max(160, "Company / affiliation is too long").optional(),
  message: z.string().trim().max(1000, "Message must be 1,000 characters or less").optional(),
  website: z.string().trim().optional(),
});

const inviteRequestStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["reviewed", "declined", "spam"]),
});

const memberIdSchema = z.object({
  member_id: z.string().uuid(),
});

const removeMemberSchema = memberIdSchema.extend({
  confirm_intent: z.literal("remove_member"),
});

const destructiveActionSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid().optional(),
  confirm_intent: z.literal("archive"),
  delete_reason: z.string().trim().max(500).optional(),
});

const restoreActionSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid().optional(),
});

const financialDocumentTypes = ["receipt", "invoice", "quote", "w9", "coi", "contract", "other"] as const;
const financialDocumentStatuses = ["uploaded", "needs_review", "accepted", "rejected"] as const;
const financialDocumentBucket = "financial-documents";
const maxFinancialDocumentFileSize = 10 * 1024 * 1024;
const allowedFinancialDocumentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const financialDocumentBaseSchema = z.object({
  id: z.string().uuid().optional(),
  event_id: z.string().uuid(),
  budget_item_id: z.string().uuid(),
});

const uploadFinancialDocumentSchema = financialDocumentBaseSchema.extend({
  document_type: z.enum(financialDocumentTypes),
  document_status: z.enum(financialDocumentStatuses).default("uploaded"),
  notes: z.string().trim().max(1000).optional(),
});

const updateFinancialDocumentStatusSchema = financialDocumentBaseSchema.required({ id: true }).extend({
  document_status: z.enum(financialDocumentStatuses),
  notes: z.string().trim().max(1000).optional(),
});

const archiveFinancialDocumentSchema = financialDocumentBaseSchema.required({ id: true }).extend({
  confirm_intent: z.literal("archive"),
  delete_reason: z.string().trim().max(500).optional(),
});

const restoreFinancialDocumentSchema = financialDocumentBaseSchema.required({ id: true });

const updateMemberRoleSchema = memberIdSchema.extend({
  role: z.enum(["admin", "producer", "viewer"]),
});

const changePasswordSchema = z.object({
  password: z.string().min(10, "Password must be at least 10 characters"),
  confirm_password: z.string().min(10),
}).refine((value) => value.password === value.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const [membership, user] = await Promise.all([
    getActiveMembership({ allowPasswordChange: true }),
    requireUser(),
  ]);

  if (membership) {
    await logAuthActivity({
      organizationId: membership.organization_id,
      profileId: membership.profile_id,
      authUserId: user.id,
      email: user.email ?? email,
      eventType: "user.login",
      summary: `Signed in ${user.email ?? email}.`,
      metadata: { source: "login_form" },
    });
  }

  if (membership?.must_change_password) {
    redirect("/change-password");
  }

  redirect("/dashboard");
}

export type InviteRequestFormState = {
  ok: boolean;
  message: string | null;
  error: string | null;
};

const inviteRequestSuccessMessage = "Thanks. Your request has been received. If approved, an administrator will send you an invitation.";

export async function submitInviteRequest(
  _previousState: InviteRequestFormState,
  formData: FormData,
): Promise<InviteRequestFormState> {
  const parsed = inviteRequestSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      ok: false,
      message: null,
      error: parsed.error.issues[0]?.message ?? "Please check your request and try again.",
    };
  }

  if (parsed.data.website) {
    return { ok: true, message: inviteRequestSuccessMessage, error: null };
  }

  const email = parsed.data.email.toLowerCase();
  const admin = createAdminClient();

  try {
    const { data: existing } = await admin
      .from("invite_requests")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .limit(1);

    if (!existing || existing.length === 0) {
      const requestHeaders = await headers();
      const ipAddress = getClientIp(requestHeaders);
      const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? null;
      const { data: request, error } = await admin
        .from("invite_requests")
        .insert({
          full_name: parsed.data.full_name,
          email,
          company: emptyToNull(parsed.data.company),
          message: emptyToNull(parsed.data.message),
          status: "pending",
          ip_hash: ipAddress ? hashValue(ipAddress) : null,
          user_agent: userAgent,
        })
        .select("id, full_name, email, company, message, created_at")
        .single();

      if (error) {
        console.warn("Invite request insert failed", { error: error.message });
        return { ok: true, message: inviteRequestSuccessMessage, error: null };
      }

      console.info("invite_request.submitted", { requestId: request.id });
      await maybeSendInviteRequestEmail(request);
    }
  } catch (error) {
    console.warn("Invite request submit failed", {
      error: error instanceof Error ? error.message : "Unknown invite request error",
    });
  }

  return { ok: true, message: inviteRequestSuccessMessage, error: null };
}

export async function signOut() {
  const supabase = await createClient();
  const [membership, user] = await Promise.all([getMembership(), getUser()]);

  if (membership) {
    await logAuthActivity({
      organizationId: membership.organization_id,
      profileId: membership.profile_id,
      authUserId: user?.id ?? membership.profile_id,
      email: user?.email ?? null,
      eventType: "user.logout",
      summary: `Signed out ${user?.email ?? membership.profile_id}.`,
      metadata: { source: "sign_out_button" },
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid setup")}`);
  }

  const supabase = await createClient();
  const slug = slugify(parsed.data.organization_name);
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .insert({
      created_by: user.id,
      name: parsed.data.organization_name,
      slug,
    })
    .select("id")
    .single();

  if (organizationError) {
    redirect(`/onboarding?error=${encodeURIComponent(organizationError.message)}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        organization_id: organization.id,
        full_name: parsed.data.full_name,
        email: user.email ?? null,
        role: "owner",
      },
      { onConflict: "id" },
    );

  if (profileError) {
    redirect(`/onboarding?error=${encodeURIComponent(profileError.message)}`);
  }

  const { error: membershipError } = await supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: organization.id,
        profile_id: user.id,
        role: "owner",
        status: "active",
        must_change_password: false,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,profile_id" },
    );

  if (membershipError) {
    redirect(`/onboarding?error=${encodeURIComponent(membershipError.message)}`);
  }

  const demoError = await createDemoEventForOrganization(organization.id);

  if (demoError) {
    redirect(`/onboarding?error=${encodeURIComponent(`Workspace created, but demo data failed: ${demoError}`)}`);
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function createEvent(formData: FormData) {
  const profile = await requireCanManageEvents();
  const parsed = eventSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/dashboard/events/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid event")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      organization_id: profile.organization_id,
      ...parsed.data,
      ends_on: parsed.data.ends_on || null,
      capacity: parsed.data.capacity || null,
      notes: parsed.data.notes || null,
    })
    .select("*")
    .single();

  if (error) {
    redirect(`/dashboard/events/new?error=${encodeURIComponent(error.message)}`);
  }

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "event",
    entityId: data.id,
    action: "event.created",
    summary: `Created event "${data.name}".`,
    afterData: summarizeEvent(data),
    metadata: { event_id: data.id },
  });

  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${data.id}`);
}

export async function createBudgetItem(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = budgetItemSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "budget", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireContactAccess(supabase, profile.organization_id, parsed.data.vendor_contact_id);

  const { data, error } = await supabase
    .from("budget_items")
    .insert({
      organization_id: profile.organization_id,
      ...parsed.data,
      notes: parsed.data.notes || null,
    })
    .select("*")
    .single();

  if (error) redirectToFinancialError(parsed.data.event_id, "budget", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "budget_item",
    entityId: data.id,
    action: "budget_item.created",
    summary: `Created budget item "${data.description}".`,
    afterData: summarizeBudgetItem(data),
    metadata: { event_id: parsed.data.event_id },
  });
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=budget&highlight_budget_item=${data.id}`);
}

export async function updateBudgetItem(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = budgetItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) redirectToFinancialError(String(formData.get("event_id") ?? ""), "budget", parsed.error?.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireContactAccess(supabase, profile.organization_id, parsed.data.vendor_contact_id);
  const { id, ...values } = parsed.data;
  const before = await getBudgetItemForAudit(supabase, profile.organization_id, values.event_id, id);
  const { data, error } = await supabase
    .from("budget_items")
    .update({
      ...values,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("event_id", values.event_id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(values.event_id, "budget", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "budget_item",
    entityId: id,
    action: "budget_item.updated",
    summary: `Updated budget item "${data.description}".`,
    beforeData: before ? summarizeBudgetItem(before) : null,
    afterData: summarizeBudgetItem(data),
    metadata: { event_id: values.event_id },
  });
  revalidatePath(`/dashboard/events/${values.event_id}`);
  redirect(`/dashboard/events/${values.event_id}?tab=budget`);
}

export async function updateBudgetItemsBatch(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const eventId = String(formData.get("event_id") ?? "");
  const rawRows = String(formData.get("rows") ?? "[]");
  let rows: unknown;

  try {
    rows = JSON.parse(rawRows);
  } catch {
    return { ok: false, message: "Budget changes could not be read. Please refresh and try again." };
  }

  const parsed = batchBudgetItemsSchema.safeParse({ event_id: eventId, rows });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "One or more budget rows are invalid.",
    };
  }

  const supabase = await createClient();

  try {
    await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
    await requireBudgetItemsAccess(
      supabase,
      profile.organization_id,
      parsed.data.event_id,
      parsed.data.rows.map((row) => row.id),
    );

    for (const contactId of uniqueContactIds(parsed.data.rows)) {
      await requireContactAccess(supabase, profile.organization_id, contactId);
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Budget access check failed.",
    };
  }

  const beforeRows = await getBudgetItemsForAudit(
    supabase,
    profile.organization_id,
    parsed.data.event_id,
    parsed.data.rows.map((row) => row.id),
  );
  const updates = parsed.data.rows.map(({ id, ...values }) => ({
    id,
    event_id: parsed.data.event_id,
    organization_id: profile.organization_id,
    ...values,
    notes: values.notes || null,
  }));

  const { error } = await supabase
    .from("budget_items")
    .upsert(updates, { onConflict: "id" })
    .select("id");

  if (error) {
    return { ok: false, message: error.message };
  }

  const afterRows = await getBudgetItemsForAudit(
    supabase,
    profile.organization_id,
    parsed.data.event_id,
    parsed.data.rows.map((row) => row.id),
  );
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "budget_item",
    entityId: parsed.data.event_id,
    action: "budget_items.batch_updated",
    summary: `Batch updated ${updates.length} budget ${updates.length === 1 ? "item" : "items"}.`,
    beforeData: beforeRows.map(summarizeBudgetItem),
    afterData: afterRows.map(summarizeBudgetItem),
    metadata: {
      event_id: parsed.data.event_id,
      changed_count: updates.length,
      changed_item_ids: updates.map((row) => row.id),
    },
  });

  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  return { ok: true, message: `Saved ${updates.length} budget ${updates.length === 1 ? "row" : "rows"}.` };
}

export async function deleteBudgetItem(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = destructiveActionSchema.required({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "budget", "Archive confirmation is required.");

  const id = parsed.data.id;
  const eventId = parsed.data.event_id;
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getBudgetItemForAudit(supabase, profile.organization_id, eventId, id);
  if (!before || before.deleted_at) redirectToFinancialError(eventId, "budget", "Budget item was not found or is already archived.");

  const archivedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("budget_items")
    .update({
      deleted_at: archivedAt,
      deleted_by: profile.profile_id,
      delete_reason: parsed.data.delete_reason || null,
      restored_at: null,
      restored_by: null,
    })
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(eventId, "budget", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "budget_item",
    entityId: id,
    action: "budget_item.deleted",
    summary: `Archived budget item "${before.description ?? id}".`,
    beforeData: before ? summarizeBudgetItem(before) : null,
    afterData: summarizeBudgetItem(data),
    metadata: { event_id: eventId, delete_reason: parsed.data.delete_reason || null },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=budget`);
}

export async function restoreBudgetItem(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = restoreActionSchema.required({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "budget", "Invalid restore request.");

  const { id, event_id: eventId } = parsed.data;
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getBudgetItemForAudit(supabase, profile.organization_id, eventId, id);
  if (!before?.deleted_at) redirectToFinancialError(eventId, "budget", "Budget item is not archived.");

  const { data, error } = await supabase
    .from("budget_items")
    .update({
      deleted_at: null,
      deleted_by: null,
      restored_at: new Date().toISOString(),
      restored_by: profile.profile_id,
    })
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id)
    .not("deleted_at", "is", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(eventId, "budget", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "budget_item",
    entityId: id,
    action: "budget_item.restored",
    summary: `Restored budget item "${data.description ?? id}".`,
    beforeData: before ? summarizeBudgetItem(before) : null,
    afterData: summarizeBudgetItem(data),
    metadata: { event_id: eventId },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=budget`);
}

export async function uploadBudgetItemDocument(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = uploadFinancialDocumentSchema.safeParse(Object.fromEntries(formData));
  const eventId = String(formData.get("event_id") ?? "");

  if (!parsed.success) {
    redirectToFinancialError(eventId, "budget", parsed.error.issues[0]?.message ?? "Document upload is invalid.");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirectToFinancialError(parsed.data.event_id, "budget", "Choose a document to upload.");
  }

  if (file.size > maxFinancialDocumentFileSize) {
    redirectToFinancialError(parsed.data.event_id, "budget", "Documents must be 10 MB or smaller.");
  }

  if (!allowedFinancialDocumentMimeTypes.has(file.type)) {
    redirectToFinancialError(parsed.data.event_id, "budget", "Only PDF, PNG, JPG, WEBP, CSV, and XLSX documents are supported.");
  }

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireBudgetItemsAccess(supabase, profile.organization_id, parsed.data.event_id, [parsed.data.budget_item_id]);

  const admin = createAdminClient();
  const documentId = crypto.randomUUID();
  const safeFileName = sanitizeFileName(file.name);
  const storagePath = `${profile.organization_id}/${parsed.data.event_id}/${parsed.data.budget_item_id}/${documentId}/${safeFileName}`;
  const { error: uploadError } = await admin.storage
    .from(financialDocumentBucket)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    redirectToFinancialError(parsed.data.event_id, "budget", uploadError.message);
  }

  const { data, error } = await admin
    .from("budget_item_documents")
    .insert({
      id: documentId,
      organization_id: profile.organization_id,
      event_id: parsed.data.event_id,
      budget_item_id: parsed.data.budget_item_id,
      uploaded_by: profile.profile_id,
      file_name: safeFileName,
      storage_bucket: financialDocumentBucket,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: file.size,
      document_type: parsed.data.document_type,
      document_status: parsed.data.document_status,
      notes: parsed.data.notes || null,
    })
    .select("*")
    .single();

  if (error) {
    await admin.storage.from(financialDocumentBucket).remove([storagePath]);
    redirectToFinancialError(parsed.data.event_id, "budget", error.message);
  }

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "financial_document",
    entityId: data.id,
    action: "financial_document.uploaded",
    summary: `${formatDocumentType(data.document_type)} uploaded: "${data.file_name}".`,
    afterData: summarizeFinancialDocument(data),
    metadata: {
      event_id: parsed.data.event_id,
      budget_item_id: parsed.data.budget_item_id,
      document_type: data.document_type,
      document_status: data.document_status,
      file_name: data.file_name,
    },
  });

  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=budget&highlight_budget_item=${parsed.data.budget_item_id}`);
}

export async function updateBudgetItemDocumentStatus(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = updateFinancialDocumentStatusSchema.safeParse(Object.fromEntries(formData));
  const eventId = String(formData.get("event_id") ?? "");

  if (!parsed.success) {
    redirectToFinancialError(eventId, "budget", parsed.error.issues[0]?.message ?? "Document status update is invalid.");
  }

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireBudgetItemsAccess(supabase, profile.organization_id, parsed.data.event_id, [parsed.data.budget_item_id]);

  const before = await getFinancialDocumentForAudit(
    supabase,
    profile.organization_id,
    parsed.data.event_id,
    parsed.data.budget_item_id,
    parsed.data.id,
  );
  if (!before || before.deleted_at) {
    redirectToFinancialError(parsed.data.event_id, "budget", "Document was not found or is archived.");
  }

  const { data, error } = await supabase
    .from("budget_item_documents")
    .update({
      document_status: parsed.data.document_status,
      notes: parsed.data.notes || null,
      restored_at: null,
      restored_by: null,
    })
    .eq("id", parsed.data.id)
    .eq("budget_item_id", parsed.data.budget_item_id)
    .eq("event_id", parsed.data.event_id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(parsed.data.event_id, "budget", error.message);

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "financial_document",
    entityId: parsed.data.id,
    action: "financial_document.status_changed",
    summary: `${formatDocumentType(data.document_type)} status changed to ${titleCaseStatus(data.document_status)}: "${data.file_name}".`,
    beforeData: before ? summarizeFinancialDocument(before) : null,
    afterData: summarizeFinancialDocument(data),
    metadata: {
      event_id: parsed.data.event_id,
      budget_item_id: parsed.data.budget_item_id,
      document_type: data.document_type,
      document_status: data.document_status,
      file_name: data.file_name,
    },
  });

  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=budget&highlight_budget_item=${parsed.data.budget_item_id}`);
}

export async function archiveBudgetItemDocument(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = archiveFinancialDocumentSchema.safeParse(Object.fromEntries(formData));
  const eventId = String(formData.get("event_id") ?? "");

  if (!parsed.success) {
    redirectToFinancialError(eventId, "budget", "Archive confirmation is required.");
  }

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireBudgetItemsAccess(supabase, profile.organization_id, parsed.data.event_id, [parsed.data.budget_item_id]);

  const before = await getFinancialDocumentForAudit(
    supabase,
    profile.organization_id,
    parsed.data.event_id,
    parsed.data.budget_item_id,
    parsed.data.id,
  );
  if (!before || before.deleted_at) {
    redirectToFinancialError(parsed.data.event_id, "budget", "Document was not found or is already archived.");
  }

  const { data, error } = await supabase
    .from("budget_item_documents")
    .update({
      document_status: "archived",
      deleted_at: new Date().toISOString(),
      deleted_by: profile.profile_id,
      delete_reason: parsed.data.delete_reason || null,
      restored_at: null,
      restored_by: null,
    })
    .eq("id", parsed.data.id)
    .eq("budget_item_id", parsed.data.budget_item_id)
    .eq("event_id", parsed.data.event_id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(parsed.data.event_id, "budget", error.message);

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "financial_document",
    entityId: parsed.data.id,
    action: "financial_document.archived",
    summary: `${formatDocumentType(before.document_type)} archived: "${before.file_name}".`,
    beforeData: before ? summarizeFinancialDocument(before) : null,
    afterData: summarizeFinancialDocument(data),
    metadata: {
      event_id: parsed.data.event_id,
      budget_item_id: parsed.data.budget_item_id,
      document_type: before.document_type,
      file_name: before.file_name,
      delete_reason: parsed.data.delete_reason || null,
    },
  });

  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=budget&highlight_budget_item=${parsed.data.budget_item_id}`);
}

export async function restoreBudgetItemDocument(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = restoreFinancialDocumentSchema.safeParse(Object.fromEntries(formData));
  const eventId = String(formData.get("event_id") ?? "");

  if (!parsed.success) {
    redirectToFinancialError(eventId, "budget", "Invalid document restore request.");
  }

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireBudgetItemsAccess(supabase, profile.organization_id, parsed.data.event_id, [parsed.data.budget_item_id]);

  const before = await getFinancialDocumentForAudit(
    supabase,
    profile.organization_id,
    parsed.data.event_id,
    parsed.data.budget_item_id,
    parsed.data.id,
  );
  if (!before?.deleted_at) {
    redirectToFinancialError(parsed.data.event_id, "budget", "Document is not archived.");
  }

  const { data, error } = await supabase
    .from("budget_item_documents")
    .update({
      document_status: "needs_review",
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      restored_at: new Date().toISOString(),
      restored_by: profile.profile_id,
    })
    .eq("id", parsed.data.id)
    .eq("budget_item_id", parsed.data.budget_item_id)
    .eq("event_id", parsed.data.event_id)
    .eq("organization_id", profile.organization_id)
    .not("deleted_at", "is", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(parsed.data.event_id, "budget", error.message);

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "financial_document",
    entityId: parsed.data.id,
    action: "financial_document.restored",
    summary: `${formatDocumentType(data.document_type)} restored: "${data.file_name}".`,
    beforeData: before ? summarizeFinancialDocument(before) : null,
    afterData: summarizeFinancialDocument(data),
    metadata: {
      event_id: parsed.data.event_id,
      budget_item_id: parsed.data.budget_item_id,
      document_type: data.document_type,
      document_status: data.document_status,
      file_name: data.file_name,
    },
  });

  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=budget&highlight_budget_item=${parsed.data.budget_item_id}`);
}

export async function createRevenueItem(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = revenueItemSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { data, error } = await supabase
    .from("revenue_items")
    .insert({
      organization_id: profile.organization_id,
      ...parsed.data,
      notes: parsed.data.notes || null,
    })
    .select("*")
    .single();

  if (error) redirectToFinancialError(parsed.data.event_id, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "revenue_item",
    entityId: data.id,
    action: "revenue_item.created",
    summary: `Created revenue item "${data.description}".`,
    afterData: summarizeRevenueItem(data),
    metadata: { event_id: parsed.data.event_id },
  });
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=revenue`);
}

export async function updateRevenueItem(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = revenueItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error?.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { id, ...values } = parsed.data;
  const before = await getRevenueItemForAudit(supabase, profile.organization_id, values.event_id, id);
  const { data, error } = await supabase
    .from("revenue_items")
    .update({
      ...values,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("event_id", values.event_id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(values.event_id, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "revenue_item",
    entityId: id,
    action: "revenue_item.updated",
    summary: `Updated revenue item "${data.description}".`,
    beforeData: before ? summarizeRevenueItem(before) : null,
    afterData: summarizeRevenueItem(data),
    metadata: { event_id: values.event_id },
  });
  revalidatePath(`/dashboard/events/${values.event_id}`);
  redirect(`/dashboard/events/${values.event_id}?tab=revenue`);
}

export async function deleteRevenueItem(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = destructiveActionSchema.required({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", "Archive confirmation is required.");

  const id = parsed.data.id;
  const eventId = parsed.data.event_id;
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getRevenueItemForAudit(supabase, profile.organization_id, eventId, id);
  if (!before || before.deleted_at) redirectToFinancialError(eventId, "revenue", "Revenue item was not found or is already archived.");

  const { data, error } = await supabase
    .from("revenue_items")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.profile_id,
      delete_reason: parsed.data.delete_reason || null,
      restored_at: null,
      restored_by: null,
    })
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "revenue_item",
    entityId: id,
    action: "revenue_item.deleted",
    summary: `Archived revenue item "${before.description ?? id}".`,
    beforeData: before ? summarizeRevenueItem(before) : null,
    afterData: summarizeRevenueItem(data),
    metadata: { event_id: eventId, delete_reason: parsed.data.delete_reason || null },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=revenue`);
}

export async function restoreRevenueItem(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = restoreActionSchema.required({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", "Invalid restore request.");

  const { id, event_id: eventId } = parsed.data;
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getRevenueItemForAudit(supabase, profile.organization_id, eventId, id);
  if (!before?.deleted_at) redirectToFinancialError(eventId, "revenue", "Revenue item is not archived.");

  const { data, error } = await supabase
    .from("revenue_items")
    .update({
      deleted_at: null,
      deleted_by: null,
      restored_at: new Date().toISOString(),
      restored_by: profile.profile_id,
    })
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id)
    .not("deleted_at", "is", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "revenue_item",
    entityId: id,
    action: "revenue_item.restored",
    summary: `Restored revenue item "${data.description ?? id}".`,
    beforeData: before ? summarizeRevenueItem(before) : null,
    afterData: summarizeRevenueItem(data),
    metadata: { event_id: eventId },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=revenue`);
}

export async function createTicketTier(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = ticketTierSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { data, error } = await supabase
    .from("ticket_tiers")
    .insert({
      organization_id: profile.organization_id,
      ...parsed.data,
      notes: parsed.data.notes || null,
    })
    .select("*")
    .single();

  if (error) redirectToFinancialError(parsed.data.event_id, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "ticket_tier",
    entityId: data.id,
    action: "ticket_tier.created",
    summary: `Created ticket tier "${data.name}".`,
    afterData: summarizeTicketTier(data),
    metadata: { event_id: parsed.data.event_id },
  });
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=revenue`);
}

export async function updateTicketTier(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = ticketTierSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error?.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { id, ...values } = parsed.data;
  const before = await getTicketTierForAudit(supabase, profile.organization_id, values.event_id, id);
  const { data, error } = await supabase
    .from("ticket_tiers")
    .update({
      ...values,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("event_id", values.event_id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(values.event_id, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "ticket_tier",
    entityId: id,
    action: "ticket_tier.updated",
    summary: `Updated ticket tier "${data.name}".`,
    beforeData: before ? summarizeTicketTier(before) : null,
    afterData: summarizeTicketTier(data),
    metadata: { event_id: values.event_id },
  });
  revalidatePath(`/dashboard/events/${values.event_id}`);
  redirect(`/dashboard/events/${values.event_id}?tab=revenue`);
}

export async function deleteTicketTier(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = destructiveActionSchema.required({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", "Archive confirmation is required.");

  const id = parsed.data.id;
  const eventId = parsed.data.event_id;
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getTicketTierForAudit(supabase, profile.organization_id, eventId, id);
  if (!before || before.deleted_at) redirectToFinancialError(eventId, "revenue", "Ticket tier was not found or is already archived.");

  const { data, error } = await supabase
    .from("ticket_tiers")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.profile_id,
      delete_reason: parsed.data.delete_reason || null,
      restored_at: null,
      restored_by: null,
    })
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "ticket_tier",
    entityId: id,
    action: "ticket_tier.deleted",
    summary: `Archived ticket tier "${before.name ?? id}".`,
    beforeData: before ? summarizeTicketTier(before) : null,
    afterData: summarizeTicketTier(data),
    metadata: { event_id: eventId, delete_reason: parsed.data.delete_reason || null },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=revenue`);
}

export async function restoreTicketTier(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = restoreActionSchema.required({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", "Invalid restore request.");

  const { id, event_id: eventId } = parsed.data;
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getTicketTierForAudit(supabase, profile.organization_id, eventId, id);
  if (!before?.deleted_at) redirectToFinancialError(eventId, "revenue", "Ticket tier is not archived.");

  const { data, error } = await supabase
    .from("ticket_tiers")
    .update({
      deleted_at: null,
      deleted_by: null,
      restored_at: new Date().toISOString(),
      restored_by: profile.profile_id,
    })
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id)
    .not("deleted_at", "is", null)
    .select("*")
    .single();

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "ticket_tier",
    entityId: id,
    action: "ticket_tier.restored",
    summary: `Restored ticket tier "${data.name ?? id}".`,
    beforeData: before ? summarizeTicketTier(before) : null,
    afterData: summarizeTicketTier(data),
    metadata: { event_id: eventId },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=revenue`);
}

export async function updateSettlement(formData: FormData) {
  const profile = await requireCanEditFinancials();
  const parsed = settlementSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const before = await getSettlementForAudit(supabase, profile.organization_id, parsed.data.event_id);
  const { data, error } = await supabase
    .from("settlements")
    .upsert(
      {
        organization_id: profile.organization_id,
        ...parsed.data,
        partner_a_name: parsed.data.partner_a_name || null,
        partner_b_name: parsed.data.partner_b_name || null,
        notes: parsed.data.notes || null,
      },
      { onConflict: "event_id" },
    )
    .select("*")
    .single();

  if (error) redirectToFinancialError(parsed.data.event_id, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "settlement",
    entityId: data.id,
    action: "settlement.updated",
    summary: "Updated settlement.",
    beforeData: before ? summarizeSettlement(before) : null,
    afterData: summarizeSettlement(data),
    metadata: { event_id: parsed.data.event_id },
  });
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=revenue`);
}

function redirectToFinancialError(eventId: string, tab: "budget" | "revenue", message = "Invalid financial item"): never {
  redirect(`/dashboard/events/${eventId}?tab=${tab}&error=${encodeURIComponent(message)}`);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AuditRow = Record<string, unknown>;

async function getEventForAudit(supabase: SupabaseServerClient, organizationId: string, eventId: string) {
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data as AuditRow | null;
}

async function getBudgetItemForAudit(supabase: SupabaseServerClient, organizationId: string, eventId: string, id: string) {
  const { data } = await supabase
    .from("budget_items")
    .select("*")
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data as AuditRow | null;
}

async function getBudgetItemsForAudit(supabase: SupabaseServerClient, organizationId: string, eventId: string, ids: string[]) {
  const { data } = await supabase
    .from("budget_items")
    .select("*")
    .eq("event_id", eventId)
    .eq("organization_id", organizationId)
    .in("id", ids);

  return (data ?? []) as AuditRow[];
}

async function getFinancialDocumentForAudit(
  supabase: SupabaseServerClient,
  organizationId: string,
  eventId: string,
  budgetItemId: string,
  id: string,
) {
  const { data } = await supabase
    .from("budget_item_documents")
    .select("*")
    .eq("id", id)
    .eq("budget_item_id", budgetItemId)
    .eq("event_id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data as BudgetItemDocument | null;
}

async function getRevenueItemForAudit(supabase: SupabaseServerClient, organizationId: string, eventId: string, id: string) {
  const { data } = await supabase
    .from("revenue_items")
    .select("*")
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data as AuditRow | null;
}

async function getTicketTierForAudit(supabase: SupabaseServerClient, organizationId: string, eventId: string, id: string) {
  const { data } = await supabase
    .from("ticket_tiers")
    .select("*")
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data as AuditRow | null;
}

async function getSettlementForAudit(supabase: SupabaseServerClient, organizationId: string, eventId: string) {
  const { data } = await supabase
    .from("settlements")
    .select("*")
    .eq("event_id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data as AuditRow | null;
}

async function getMemberForAudit(supabase: SupabaseServerClient, organizationId: string, memberId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("id, profile_id, role, status, must_change_password, invited_at, deactivated_at, profiles!organization_members_profile_id_fkey(full_name, email)")
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;
  const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

  return {
    id: data.id,
    profile_id: data.profile_id,
    role: data.role,
    status: data.status,
    must_change_password: data.must_change_password,
    invited_at: data.invited_at,
    deactivated_at: data.deactivated_at,
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
  };
}

function summarizeEvent(row: AuditRow) {
  return pickAuditFields(row, ["id", "name", "starts_on", "ends_on", "status", "capacity", "venue_id", "notes", "deleted_at", "deleted_by", "delete_reason", "restored_at", "restored_by"]);
}

function summarizeBudgetItem(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "cost_type", "category", "description", "estimated_amount", "actual_amount", "status", "vendor_contact_id", "due_date", "paid_date", "notes", "deleted_at", "deleted_by", "delete_reason", "restored_at", "restored_by"]);
}

function summarizeFinancialDocument(row: AuditRow) {
  return pickAuditFields(row, [
    "id",
    "event_id",
    "budget_item_id",
    "uploaded_by",
    "file_name",
    "mime_type",
    "file_size",
    "document_type",
    "document_status",
    "notes",
    "uploaded_at",
    "deleted_at",
    "deleted_by",
    "delete_reason",
    "restored_at",
    "restored_by",
  ]);
}

function summarizeRevenueItem(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "source", "description", "projected_amount", "actual_amount", "status", "notes", "deleted_at", "deleted_by", "delete_reason", "restored_at", "restored_by"]);
}

function summarizeTicketTier(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "name", "price", "capacity", "sold_quantity", "comp_quantity", "projected_gross", "generated_gross", "notes", "deleted_at", "deleted_by", "delete_reason", "restored_at", "restored_by"]);
}

function summarizeSettlement(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "partner_split_type", "partner_a_name", "partner_b_name", "partner_a_percent", "partner_b_percent", "notes"]);
}

function pickAuditFields(row: AuditRow, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function sanitizeFileName(value: string) {
  const trimmed = value.trim() || "document";
  return trimmed
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function formatDocumentType(value: string) {
  const labels: Record<string, string> = {
    receipt: "Receipt",
    invoice: "Invoice",
    quote: "Quote",
    w9: "W-9",
    coi: "COI",
    contract: "Contract",
    other: "Document",
  };

  return labels[value] ?? "Document";
}

function titleCaseStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function createDemoEvent() {
  const profile = await requireCanManageEvents();
  const demoError = await createDemoEventForOrganization(profile.organization_id);

  if (demoError) {
    redirect(`/dashboard?error=${encodeURIComponent(demoError)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  redirect("/dashboard");
}

export async function updateEvent(formData: FormData) {
  const profile = await requireCanManageEvents();
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) {
    redirect("/dashboard/events?error=Invalid event");
  }

  const supabase = await createClient();
  const { id, ...values } = parsed.data;
  const before = await getEventForAudit(supabase, profile.organization_id, id);
  const { data, error } = await supabase
    .from("events")
    .update({
      ...values,
      ends_on: values.ends_on || null,
      capacity: values.capacity || null,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    redirect(`/dashboard/events/${id}?error=${encodeURIComponent(error.message)}`);
  }

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "event",
    entityId: id,
    action: "event.updated",
    summary: `Updated event "${data.name}".`,
    beforeData: before ? summarizeEvent(before) : null,
    afterData: summarizeEvent(data),
    metadata: { event_id: id },
  });

  revalidatePath(`/dashboard/events/${id}`);
  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${id}`);
}

export async function deleteEvent(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = destructiveActionSchema.omit({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/dashboard/events?error=Archive confirmation is required.");
  }

  const id = parsed.data.id;
  const supabase = await createClient();
  const before = await getEventForAudit(supabase, profile.organization_id, id);
  if (!before || before.deleted_at) {
    redirect(`/dashboard/events/${id}?error=Event was not found or is already archived.`);
  }

  const { data, error } = await supabase
    .from("events")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.profile_id,
      delete_reason: parsed.data.delete_reason || null,
      restored_at: null,
      restored_by: null,
    })
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    redirect(`/dashboard/events/${id}?error=${encodeURIComponent(error.message)}`);
  }

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "event",
    entityId: id,
    action: "event.deleted",
    summary: `Archived event "${before.name ?? id}".`,
    beforeData: before ? summarizeEvent(before) : null,
    afterData: summarizeEvent(data),
    metadata: { event_id: id, delete_reason: parsed.data.delete_reason || null },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
}

export async function restoreEvent(formData: FormData) {
  const profile = await requireCanDeleteRecords();
  const parsed = restoreActionSchema.omit({ event_id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/dashboard/events?error=Invalid restore request.");
  }

  const id = parsed.data.id;
  const supabase = await createClient();
  const before = await getEventForAudit(supabase, profile.organization_id, id);
  if (!before?.deleted_at) {
    redirect("/dashboard/events?error=Event is not archived.");
  }

  const { data, error } = await supabase
    .from("events")
    .update({
      deleted_at: null,
      deleted_by: null,
      restored_at: new Date().toISOString(),
      restored_by: profile.profile_id,
    })
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .not("deleted_at", "is", null)
    .select("*")
    .single();

  if (error) {
    redirect(`/dashboard/events?error=${encodeURIComponent(error.message)}`);
  }

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "event",
    entityId: id,
    action: "event.restored",
    summary: `Restored event "${data.name ?? id}".`,
    beforeData: before ? summarizeEvent(before) : null,
    afterData: summarizeEvent(data),
    metadata: { event_id: id },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${id}`);
}

export async function inviteUser(formData: FormData) {
  const membership = await requireCanManageUsers();
  const parsed = inviteUserSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid invite")}`);
  }

  if (parsed.data.role === "admin" && parsed.data.confirm_admin !== "true") {
    redirect(
      `/dashboard/settings/team?error=${encodeURIComponent("Confirm Admin access before inviting an Admin user.")}`,
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.temporary_password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
    },
  });

  if (authError || !authUser.user) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(authError?.message ?? "Unable to create user")}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: authUser.user.id,
        organization_id: membership.organization_id,
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        role: parsed.data.role,
      },
      { onConflict: "id" },
    );

  if (profileError) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(profileError.message)}`);
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: membership.organization_id,
        profile_id: authUser.user.id,
        role: parsed.data.role,
        status: "active",
        must_change_password: true,
        invited_by: membership.profile_id,
        invited_at: new Date().toISOString(),
        deactivated_at: null,
      },
      { onConflict: "organization_id,profile_id" },
    );

  if (memberError) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(memberError.message)}`);
  }

  await logAuditEvent({
    organizationId: membership.organization_id,
    actorProfile: membership,
    entityType: "team_member",
    entityId: authUser.user.id,
    action: "team_member.invited",
    summary: `Invited ${parsed.data.email} as ${parsed.data.role}.`,
    afterData: {
      profile_id: authUser.user.id,
      email: parsed.data.email,
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      status: "active",
      must_change_password: true,
    },
    metadata: { invited_profile_id: authUser.user.id },
  });
  await logAuthActivity({
    organizationId: membership.organization_id,
    profileId: authUser.user.id,
    authUserId: authUser.user.id,
    email: parsed.data.email,
    eventType: "user.invited",
    summary: `Invited ${parsed.data.email} as ${parsed.data.role}.`,
    metadata: {
      invited_by_profile_id: membership.profile_id,
      role: parsed.data.role,
      status: "active",
      first_login_change_required: true,
    },
  });

  revalidatePath("/dashboard/settings/team");
  redirect(
    `/dashboard/settings/team?success=${encodeURIComponent(
      `Invited ${parsed.data.email} as ${parsed.data.role}. Send the temporary password privately. The user will be required to create a new password on first login.`,
    )}`,
  );
}

export async function updateMemberRole(formData: FormData) {
  const membership = await requireCanManageUsers();
  const parsed = updateMemberRoleSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid role update")}`);
  }

  const supabase = await createClient();
  const target = await getOrganizationMember(supabase, membership.organization_id, parsed.data.member_id);

  if (!target) {
    redirect("/dashboard/settings/team?error=Member not found");
  }

  if (target.role === "owner") {
    redirect("/dashboard/settings/team?error=Owner roles cannot be changed in alpha.");
  }

  if (membership.role === "admin" && parsed.data.role === "admin") {
    // Admins may promote non-owner users to Admin in this alpha.
  }

  const before = await getMemberForAudit(supabase, membership.organization_id, parsed.data.member_id);
  const { error } = await supabase
    .from("organization_members")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.member_id)
    .eq("organization_id", membership.organization_id);

  if (error) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(error.message)}`);
  }

  await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", target.profile_id)
    .eq("organization_id", membership.organization_id);

  const after = await getMemberForAudit(supabase, membership.organization_id, parsed.data.member_id);
  await logAuditEvent({
    organizationId: membership.organization_id,
    actorProfile: membership,
    entityType: "team_member",
    entityId: target.profile_id,
    action: "team_member.role_changed",
    summary: `Changed ${after?.email ?? target.profile_id} role from ${target.role} to ${parsed.data.role}.`,
    beforeData: before,
    afterData: after,
    metadata: { member_id: parsed.data.member_id, target_profile_id: target.profile_id },
  });
  await logAuthActivity({
    organizationId: membership.organization_id,
    profileId: target.profile_id,
    authUserId: target.profile_id,
    email: after?.email ?? before?.email ?? null,
    eventType: "user.role_changed",
    summary: `Changed ${after?.email ?? target.profile_id} role from ${target.role} to ${parsed.data.role}.`,
    metadata: {
      actor_profile_id: membership.profile_id,
      member_id: parsed.data.member_id,
      previous_role: target.role,
      new_role: parsed.data.role,
    },
  });

  revalidatePath("/dashboard/settings/team");
  redirect("/dashboard/settings/team?success=Role updated");
}

export async function forceMemberPasswordChange(formData: FormData) {
  const membership = await requireCanManageUsers();
  const parsed = memberIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/dashboard/settings/team?error=Invalid member");
  }

  const supabase = await createClient();
  const target = await getOrganizationMember(supabase, membership.organization_id, parsed.data.member_id);

  if (!target) {
    redirect("/dashboard/settings/team?error=Member not found");
  }

  if (target.role === "owner" && membership.role !== "owner") {
    redirect("/dashboard/settings/team?error=Admins cannot force password changes for Owners.");
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ must_change_password: true })
    .eq("id", parsed.data.member_id)
    .eq("organization_id", membership.organization_id);

  if (error) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(error.message)}`);
  }

  const after = await getMemberForAudit(supabase, membership.organization_id, parsed.data.member_id);
  await logAuditEvent({
    organizationId: membership.organization_id,
    actorProfile: membership,
    entityType: "team_member",
    entityId: target.profile_id,
    action: "team_member.password_change_required",
    summary: `Required password change for ${after?.email ?? target.profile_id}.`,
    afterData: after,
    metadata: { member_id: parsed.data.member_id, target_profile_id: target.profile_id },
  });
  await logAuthActivity({
    organizationId: membership.organization_id,
    profileId: target.profile_id,
    authUserId: target.profile_id,
    email: after?.email ?? null,
    eventType: "user.password_change_required",
    summary: `Required password change for ${after?.email ?? target.profile_id}.`,
    metadata: {
      actor_profile_id: membership.profile_id,
      member_id: parsed.data.member_id,
    },
  });

  revalidatePath("/dashboard/settings/team");
  redirect("/dashboard/settings/team?success=Password change required on next login");
}

export async function updateInviteRequestStatus(formData: FormData) {
  const membership = await requireCanManageUsers();
  const parsed = inviteRequestStatusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/dashboard/settings/team?error=Invalid invitation request update.");
  }

  const supabase = await createClient();
  const { data: before, error: beforeError } = await supabase
    .from("invite_requests")
    .select("id, full_name, email, company, message, status, created_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (beforeError || !before) {
    redirect("/dashboard/settings/team?error=Invitation request not found.");
  }

  const { data: after, error } = await supabase
    .from("invite_requests")
    .update({
      status: parsed.data.status,
      reviewed_by: membership.profile_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .select("id, full_name, email, company, message, status, created_at, reviewed_at")
    .single();

  if (error) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(error.message)}`);
  }

  const action = parsed.data.status === "spam"
    ? "invite_request.marked_spam"
    : parsed.data.status === "declined"
      ? "invite_request.declined"
      : "invite_request.reviewed";

  await logAuditEvent({
    organizationId: membership.organization_id,
    actorProfile: membership,
    entityType: "invite_request",
    entityId: parsed.data.id,
    action,
    summary: `${formatInviteRequestStatus(parsed.data.status)} invitation request from ${before.email}.`,
    beforeData: before,
    afterData: after,
    metadata: {
      invite_request_id: parsed.data.id,
      email: before.email,
      previous_status: before.status,
      new_status: parsed.data.status,
    },
  });

  revalidatePath("/dashboard/settings/team");
  redirect(`/dashboard/settings/team?success=${encodeURIComponent(`Invitation request marked ${parsed.data.status}.`)}`);
}

export async function removeMember(formData: FormData) {
  const membership = await requireCanManageUsers();
  const parsed = removeMemberSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/dashboard/settings/team?error=Remove confirmation is required.");
  }

  const supabase = await createClient();
  const target = await getOrganizationMember(supabase, membership.organization_id, parsed.data.member_id);

  if (!target) {
    redirect("/dashboard/settings/team?error=Member not found");
  }

  if (target.role === "owner" && membership.role !== "owner") {
    redirect("/dashboard/settings/team?error=Admins cannot remove Owners.");
  }

  if (target.role === "owner") {
    const ownerCount = await countActiveOwners(supabase, membership.organization_id);

    if (ownerCount <= 1) {
      redirect("/dashboard/settings/team?error=Cannot remove the last Owner.");
    }
  }

  const before = await getMemberForAudit(supabase, membership.organization_id, parsed.data.member_id);
  const { error } = await supabase
    .from("organization_members")
    .update({
      status: "removed",
      deactivated_at: new Date().toISOString(),
      must_change_password: false,
    })
    .eq("id", parsed.data.member_id)
    .eq("organization_id", membership.organization_id);

  if (error) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(error.message)}`);
  }

  const after = await getMemberForAudit(supabase, membership.organization_id, parsed.data.member_id);
  await logAuditEvent({
    organizationId: membership.organization_id,
    actorProfile: membership,
    entityType: "team_member",
    entityId: target.profile_id,
    action: "team_member.removed",
    summary: `Removed ${before?.email ?? target.profile_id} from the organization.`,
    beforeData: before,
    afterData: after,
    metadata: { member_id: parsed.data.member_id, target_profile_id: target.profile_id },
  });
  await logAuthActivity({
    organizationId: membership.organization_id,
    profileId: target.profile_id,
    authUserId: target.profile_id,
    email: before?.email ?? null,
    eventType: "user.removed",
    summary: `Removed ${before?.email ?? target.profile_id} from the organization.`,
    metadata: {
      actor_profile_id: membership.profile_id,
      member_id: parsed.data.member_id,
      previous_status: before?.status ?? null,
      new_status: after?.status ?? "removed",
    },
  });

  revalidatePath("/dashboard/settings/team");
  redirect("/dashboard/settings/team?success=Member removed");
}

export async function changePassword(formData: FormData) {
  const membership = await requireMembership({ allowPasswordChange: true });
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/change-password?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid password")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    redirect(`/change-password?error=${encodeURIComponent(error.message)}`);
  }

  const admin = createAdminClient();
  const { error: memberError } = await admin
    .from("organization_members")
    .update({ must_change_password: false })
    .eq("id", membership.id)
    .eq("profile_id", membership.profile_id);

  if (memberError) {
    redirect(`/change-password?error=${encodeURIComponent(memberError.message)}`);
  }

  const user = await getUser();

  await logAuditEvent({
    organizationId: membership.organization_id,
    actorProfile: membership,
    entityType: "team_member",
    entityId: membership.profile_id,
    action: "team_member.password_changed",
    summary: "Changed password after temporary-password requirement.",
    metadata: { member_id: membership.id, target_profile_id: membership.profile_id },
  });
  await logAuthActivity({
    organizationId: membership.organization_id,
    profileId: membership.profile_id,
    authUserId: membership.profile_id,
    email: user?.email ?? null,
    eventType: "user.first_login_completed",
    summary: "Completed first-login password change.",
    metadata: { member_id: membership.id },
  });
  await logAuthActivity({
    organizationId: membership.organization_id,
    profileId: membership.profile_id,
    authUserId: membership.profile_id,
    email: user?.email ?? null,
    eventType: "user.password_changed",
    summary: "Changed password after temporary-password requirement.",
    metadata: { member_id: membership.id, source: "forced_password_change" },
  });

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

async function requireEventAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  eventId: string,
) {
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error("Event not found for this organization");
  }
}

async function requireContactAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contactId: string | null,
) {
  if (!contactId) return;

  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw new Error("Contact not found for this organization");
  }
}

async function requireBudgetItemsAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  eventId: string,
  itemIds: string[],
) {
  const uniqueIds = [...new Set(itemIds)];
  const { data, error } = await supabase
    .from("budget_items")
    .select("id")
    .eq("event_id", eventId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("One or more budget items were not found for this event.");
  }
}

function uniqueContactIds(rows: z.infer<typeof batchBudgetItemsSchema>["rows"]) {
  return [...new Set(rows.map((row) => row.vendor_contact_id).filter((id): id is string => Boolean(id)))];
}

async function getOrganizationMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  memberId: string,
) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, profile_id, role, status")
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .single();

  if (error) return null;
  return data as { id: string; organization_id: string; profile_id: string; role: OrganizationRole; status: string };
}

async function countActiveOwners(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
) {
  const { count, error } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("status", "active");

  if (error) return 0;
  return count ?? 0;
}

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${base || "organization"}-${crypto.randomUUID().slice(0, 8)}`;
}

function emptyToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getClientIp(headerStore: Headers) {
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? null;
  return headerStore.get("x-real-ip");
}

function formatInviteRequestStatus(status: "reviewed" | "declined" | "spam") {
  if (status === "spam") return "Marked spam";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function maybeSendInviteRequestEmail(request: {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  message: string | null;
  created_at: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.INVITE_REQUEST_NOTIFY_EMAIL;
  const from = process.env.INVITE_REQUEST_FROM_EMAIL;

  if (!apiKey || !to || !from) return;

  const lines = [
    "A new Juniper Berry Productions invitation request was submitted.",
    "",
    `Name: ${request.full_name}`,
    `Email: ${request.email}`,
    `Company / affiliation: ${request.company ?? "Not provided"}`,
    `Message: ${request.message ?? "Not provided"}`,
    `Submitted: ${request.created_at}`,
    "",
    "Review it in Settings -> Team.",
  ];

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Juniper Berry Productions invitation request",
        text: lines.join("\n"),
      }),
    });

    if (!response.ok) {
      console.warn("Invite request email failed", {
        requestId: request.id,
        status: response.status,
      });
    }
  } catch (error) {
    console.warn("Invite request email failed", {
      requestId: request.id,
      error: error instanceof Error ? error.message : "Unknown email error",
    });
  }
}

async function createDemoEventForOrganization(organizationId: string) {
  const supabase = await createClient();
  const { data: existingEvent, error: existingEventError } = await supabase
    .from("events")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", "Cedric Burnside @ Fairweather")
    .maybeSingle();

  if (existingEventError) return existingEventError.message;
  if (existingEvent) return null;

  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .insert({
      organization_id: organizationId,
      name: "Fairweather",
      address: "Phoenix, AZ",
      indoor_capacity: 450,
      outdoor_capacity: 900,
      notes: "Sample venue for the alpha demo event.",
    })
    .select("id")
    .single();

  if (venueError) return venueError.message;

  const { data: supportAct, error: supportActError } = await supabase
    .from("contacts")
    .insert({
      organization_id: organizationId,
      name: "The Sugar Thieves",
      company: "The Sugar Thieves",
      role: "production",
      notes: "Phoenix support act / opening band.",
    })
    .select("id")
    .single();

  if (supportActError) return supportActError.message;

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      organization_id: organizationId,
      venue_id: venue.id,
      name: "Cedric Burnside @ Fairweather",
      starts_on: "2026-09-18",
      ends_on: "2026-09-19",
      status: "planning",
      capacity: 900,
      notes: "Two-night alpha demo event.",
    })
    .select("id")
    .single();

  if (eventError) return eventError.message;

  const { error: eventContactError } = await supabase.from("event_contacts").insert({
    organization_id: organizationId,
    event_id: event.id,
    contact_id: supportAct.id,
    role: "support act",
    notes: "Opening band: The Sugar Thieves from Phoenix.",
  });

  if (eventContactError) return eventContactError.message;

  const { error: budgetError } = await supabase.from("budget_items").insert([
    demoBudgetItem(organizationId, event.id, "hard", "Headliner Guarantee", "Cedric Burnside headliner guarantee", 10000, "approved", "Seeded guarantee."),
    demoBudgetItem(organizationId, event.id, "hard", "Support Act", "The Sugar Thieves opening band", 1500, "planned", "Phoenix support act."),
    demoBudgetItem(organizationId, event.id, "hard", "Production", "PA, lights, stage package", 4200, "quoted"),
    demoBudgetItem(organizationId, event.id, "hard", "Production Labor", "Stagehands and audio engineer", 2200, "quoted"),
    demoBudgetItem(organizationId, event.id, "hard", "Backline", "Drum kit and amps", 900, "planned"),
    demoBudgetItem(organizationId, event.id, "hard", "Security", "Door and floor security", 1800, "planned"),
    demoBudgetItem(organizationId, event.id, "hard", "Insurance", "Event liability policy", 650, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Marketing", "Campaign management", 1200, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Social Media Ads", "Paid social ads", 1600, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Graphic Design", "Poster and digital assets", 450, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Print Posters", "Street team print run", 350, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Hotel", "Artist lodging", 1100, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Meals", "Artist and crew meals", 650, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Green Room Rider", "Hospitality rider", 500, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Ground Transportation", "Airport and hotel transportation", 500, "planned"),
    demoBudgetItem(organizationId, event.id, "soft", "Contingency", "Unplanned costs", 1000, "planned"),
  ]);

  if (budgetError) return budgetError.message;

  const { error: ticketError } = await supabase.from("ticket_tiers").insert([
    {
      organization_id: organizationId,
      event_id: event.id,
      name: "GA",
      price: 35,
      capacity: 700,
      sold_quantity: 0,
      comp_quantity: 20,
      notes: "General admission",
    },
    {
      organization_id: organizationId,
      event_id: event.id,
      name: "VIP 4-top tables",
      price: 280,
      capacity: 50,
      sold_quantity: 0,
      comp_quantity: 0,
      notes: "VIP table package, 4 guests per table",
    },
  ]);

  if (ticketError) return ticketError.message;

  const { error: revenueError } = await supabase.from("revenue_items").insert([
    demoRevenueItem(organizationId, event.id, "bar_bounty", "Bar bounty estimate", 2500),
    demoRevenueItem(organizationId, event.id, "merch_split", "Merchandise split estimate", 1200),
    demoRevenueItem(organizationId, event.id, "sponsorship", "Local sponsor target", 5000),
  ]);

  if (revenueError) return revenueError.message;

  const { error: settlementError } = await supabase.from("settlements").insert({
    organization_id: organizationId,
    event_id: event.id,
    partner_split_type: "true_50_50",
    partner_a_name: "Juniper Berry Productions",
    partner_b_name: "Venue Partner",
    partner_a_percent: 50,
    partner_b_percent: 50,
    notes: "Default true 50/50 split.",
  });

  return settlementError?.message ?? null;
}

function demoBudgetItem(
  organizationId: string,
  eventId: string,
  costType: "hard" | "soft",
  category: string,
  description: string,
  estimatedAmount: number,
  status: "planned" | "quoted" | "approved",
  notes: string | null = null,
) {
  return {
    organization_id: organizationId,
    event_id: eventId,
    cost_type: costType,
    category,
    description,
    estimated_amount: estimatedAmount,
    status,
    notes,
  };
}

function demoRevenueItem(
  organizationId: string,
  eventId: string,
  source: string,
  description: string,
  projectedAmount: number,
) {
  return {
    organization_id: organizationId,
    event_id: eventId,
    source,
    description,
    projected_amount: projectedAmount,
    status: "projected",
  };
}
