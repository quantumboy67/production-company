"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile, requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

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

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
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
        role: "admin",
      },
      { onConflict: "id" },
    );

  if (profileError) {
    redirect(`/onboarding?error=${encodeURIComponent(profileError.message)}`);
  }

  const demoError = await createDemoEventForOrganization(organization.id);

  if (demoError) {
    redirect(`/onboarding?error=${encodeURIComponent(`Workspace created, but demo data failed: ${demoError}`)}`);
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function createEvent(formData: FormData) {
  const profile = await getProfile();
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
    .select("id")
    .single();

  if (error) {
    redirect(`/dashboard/events/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${data.id}`);
}

export async function createBudgetItem(formData: FormData) {
  const profile = await getProfile();
  const parsed = budgetItemSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "budget", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireContactAccess(supabase, profile.organization_id, parsed.data.vendor_contact_id);

  const { error } = await supabase.from("budget_items").insert({
    organization_id: profile.organization_id,
    ...parsed.data,
    notes: parsed.data.notes || null,
  });

  if (error) redirectToFinancialError(parsed.data.event_id, "budget", error.message);
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=budget`);
}

export async function updateBudgetItem(formData: FormData) {
  const profile = await getProfile();
  const parsed = budgetItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) redirectToFinancialError(String(formData.get("event_id") ?? ""), "budget", parsed.error?.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  await requireContactAccess(supabase, profile.organization_id, parsed.data.vendor_contact_id);
  const { id, ...values } = parsed.data;
  const { error } = await supabase
    .from("budget_items")
    .update({
      ...values,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("event_id", values.event_id)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(values.event_id, "budget", error.message);
  revalidatePath(`/dashboard/events/${values.event_id}`);
  redirect(`/dashboard/events/${values.event_id}?tab=budget`);
}

export async function updateBudgetItemsBatch(formData: FormData) {
  const profile = await getProfile();
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

  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  return { ok: true, message: `Saved ${updates.length} budget ${updates.length === 1 ? "row" : "rows"}.` };
}

export async function deleteBudgetItem(formData: FormData) {
  const profile = await getProfile();
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const { error } = await supabase
    .from("budget_items")
    .delete()
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(eventId, "budget", error.message);
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=budget`);
}

export async function createRevenueItem(formData: FormData) {
  const profile = await getProfile();
  const parsed = revenueItemSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { error } = await supabase.from("revenue_items").insert({
    organization_id: profile.organization_id,
    ...parsed.data,
    notes: parsed.data.notes || null,
  });

  if (error) redirectToFinancialError(parsed.data.event_id, "revenue", error.message);
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=revenue`);
}

export async function updateRevenueItem(formData: FormData) {
  const profile = await getProfile();
  const parsed = revenueItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error?.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { id, ...values } = parsed.data;
  const { error } = await supabase
    .from("revenue_items")
    .update({
      ...values,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("event_id", values.event_id)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(values.event_id, "revenue", error.message);
  revalidatePath(`/dashboard/events/${values.event_id}`);
  redirect(`/dashboard/events/${values.event_id}?tab=revenue`);
}

export async function deleteRevenueItem(formData: FormData) {
  const profile = await getProfile();
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const { error } = await supabase
    .from("revenue_items")
    .delete()
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=revenue`);
}

export async function createTicketTier(formData: FormData) {
  const profile = await getProfile();
  const parsed = ticketTierSchema.omit({ id: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { error } = await supabase.from("ticket_tiers").insert({
    organization_id: profile.organization_id,
    ...parsed.data,
    notes: parsed.data.notes || null,
  });

  if (error) redirectToFinancialError(parsed.data.event_id, "revenue", error.message);
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=revenue`);
}

export async function updateTicketTier(formData: FormData) {
  const profile = await getProfile();
  const parsed = ticketTierSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error?.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { id, ...values } = parsed.data;
  const { error } = await supabase
    .from("ticket_tiers")
    .update({
      ...values,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("event_id", values.event_id)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(values.event_id, "revenue", error.message);
  revalidatePath(`/dashboard/events/${values.event_id}`);
  redirect(`/dashboard/events/${values.event_id}?tab=revenue`);
}

export async function deleteTicketTier(formData: FormData) {
  const profile = await getProfile();
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = await createClient();

  await requireEventAccess(supabase, profile.organization_id, eventId);
  const { error } = await supabase
    .from("ticket_tiers")
    .delete()
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("organization_id", profile.organization_id);

  if (error) redirectToFinancialError(eventId, "revenue", error.message);
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?tab=revenue`);
}

export async function updateSettlement(formData: FormData) {
  const profile = await getProfile();
  const parsed = settlementSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirectToFinancialError(String(formData.get("event_id") ?? ""), "revenue", parsed.error.issues[0]?.message);

  const supabase = await createClient();
  await requireEventAccess(supabase, profile.organization_id, parsed.data.event_id);
  const { error } = await supabase
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
    );

  if (error) redirectToFinancialError(parsed.data.event_id, "revenue", error.message);
  revalidatePath(`/dashboard/events/${parsed.data.event_id}`);
  redirect(`/dashboard/events/${parsed.data.event_id}?tab=revenue`);
}

function redirectToFinancialError(eventId: string, tab: "budget" | "revenue", message = "Invalid financial item"): never {
  redirect(`/dashboard/events/${eventId}?tab=${tab}&error=${encodeURIComponent(message)}`);
}

export async function createDemoEvent() {
  const profile = await getProfile();
  const demoError = await createDemoEventForOrganization(profile.organization_id);

  if (demoError) {
    redirect(`/dashboard?error=${encodeURIComponent(demoError)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  redirect("/dashboard");
}

export async function updateEvent(formData: FormData) {
  const profile = await getProfile();
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success || !parsed.data.id) {
    redirect("/dashboard/events?error=Invalid event");
  }

  const supabase = await createClient();
  const { id, ...values } = parsed.data;
  const { error } = await supabase
    .from("events")
    .update({
      ...values,
      ends_on: values.ends_on || null,
      capacity: values.capacity || null,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("organization_id", profile.organization_id);

  if (error) {
    redirect(`/dashboard/events/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/events/${id}`);
  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${id}`);
}

export async function deleteEvent(formData: FormData) {
  const profile = await getProfile();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("organization_id", profile.organization_id);

  if (error) {
    redirect(`/dashboard/events/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
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
    partner_a_name: "Production Company",
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
