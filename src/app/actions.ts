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
