"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit";
import {
  getActiveMembership,
  requireCanDeleteRecords,
  requireCanEditFinancials,
  requireCanManageEvents,
  requireCanManageUsers,
  requireMembership,
  requireUser,
} from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationRole } from "@/lib/types";

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
});

const memberIdSchema = z.object({
  member_id: z.string().uuid(),
});

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

  const membership = await getActiveMembership({ allowPasswordChange: true });

  if (membership?.must_change_password) {
    redirect("/change-password");
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
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
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=budget`);
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
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getBudgetItemForAudit(supabase, profile.organization_id, eventId, id);
  const { error } = await supabase
    .from("budget_items")
    .delete()
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(eventId, "budget", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "budget_item",
    entityId: id,
    action: "budget_item.deleted",
    summary: `Deleted budget item "${before?.description ?? id}".`,
    beforeData: before ? summarizeBudgetItem(before) : null,
    metadata: { event_id: eventId },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=budget`);
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
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getRevenueItemForAudit(supabase, profile.organization_id, eventId, id);
  const { error } = await supabase
    .from("revenue_items")
    .delete()
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "revenue_item",
    entityId: id,
    action: "revenue_item.deleted",
    summary: `Deleted revenue item "${before?.description ?? id}".`,
    beforeData: before ? summarizeRevenueItem(before) : null,
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
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const before = await getTicketTierForAudit(supabase, profile.organization_id, eventId, id);
  const { error } = await supabase
    .from("ticket_tiers")
    .delete()
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "ticket_tier",
    entityId: id,
    action: "ticket_tier.deleted",
    summary: `Deleted ticket tier "${before?.name ?? id}".`,
    beforeData: before ? summarizeTicketTier(before) : null,
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
  return pickAuditFields(row, ["id", "name", "starts_on", "ends_on", "status", "capacity", "venue_id", "notes"]);
}

function summarizeBudgetItem(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "cost_type", "category", "description", "estimated_amount", "actual_amount", "status", "vendor_contact_id", "due_date", "paid_date", "notes"]);
}

function summarizeRevenueItem(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "source", "description", "projected_amount", "actual_amount", "status", "notes"]);
}

function summarizeTicketTier(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "name", "price", "capacity", "sold_quantity", "comp_quantity", "projected_gross", "generated_gross", "notes"]);
}

function summarizeSettlement(row: AuditRow) {
  return pickAuditFields(row, ["id", "event_id", "partner_split_type", "partner_a_name", "partner_b_name", "partner_a_percent", "partner_b_percent", "notes"]);
}

function pickAuditFields(row: AuditRow, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
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
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const before = await getEventForAudit(supabase, profile.organization_id, id);
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("organization_id", profile.organization_id);

  if (error) {
    redirect(`/dashboard/events/${id}?error=${encodeURIComponent(error.message)}`);
  }

  await logAuditEvent({
    organizationId: profile.organization_id,
    actorProfile: profile,
    entityType: "event",
    entityId: id,
    action: "event.deleted",
    summary: `Deleted event "${before?.name ?? id}".`,
    beforeData: before ? summarizeEvent(before) : null,
    metadata: { event_id: id },
  });

  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
}

export async function inviteUser(formData: FormData) {
  const membership = await requireCanManageUsers();
  const parsed = inviteUserSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/dashboard/settings/team?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid invite")}`);
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

  revalidatePath("/dashboard/settings/team");
  redirect(`/dashboard/settings/team?success=${encodeURIComponent(`Invited ${parsed.data.email}. Share the temporary password directly.`)}`);
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

  revalidatePath("/dashboard/settings/team");
  redirect("/dashboard/settings/team?success=Password change required on next login");
}

export async function removeMember(formData: FormData) {
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

  await logAuditEvent({
    organizationId: membership.organization_id,
    actorProfile: membership,
    entityType: "team_member",
    entityId: membership.profile_id,
    action: "team_member.password_changed",
    summary: "Changed password after temporary-password requirement.",
    metadata: { member_id: membership.id, target_profile_id: membership.profile_id },
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
    partner_a_name: "Juniper Berry Production Company",
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
