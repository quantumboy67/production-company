import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/auth";
import type { BudgetItem, EventRecord, RevenueItem, Settlement, TicketTier } from "@/lib/types";

export async function listEvents() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, organization_id, venue_id, name, starts_on, ends_on, status, capacity, notes, venues(name)")
    .eq("organization_id", profile.organization_id)
    .order("starts_on", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeEvent);
}

export async function getEvent(id: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, organization_id, venue_id, name, starts_on, ends_on, status, capacity, notes, venues(name)")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (error) throw new Error(error.message);
  return normalizeEvent(data);
}

export async function getEventFinancials(eventId: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const [budget, revenue, tickets, settlement] = await Promise.all([
    supabase
      .from("budget_items")
      .select("id, cost_type, category, description, estimated_amount, actual_amount, status, due_date, paid_date, notes, contacts!budget_items_vendor_contact_id_fkey(name)")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .order("cost_type", { ascending: true })
      .order("category", { ascending: true }),
    supabase
      .from("revenue_items")
      .select("id, source, description, projected_amount, actual_amount, status, notes")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .order("source", { ascending: true }),
    supabase
      .from("ticket_tiers")
      .select("id, name, price, capacity, sold_quantity, comp_quantity, generated_gross, projected_gross, notes")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .order("price", { ascending: true }),
    supabase
      .from("settlements")
      .select("id, partner_split_type, partner_a_name, partner_b_name, partner_a_percent, partner_b_percent, notes")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
  ]);

  for (const result of [budget, revenue, tickets, settlement]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    budgetItems: (budget.data ?? []).map(normalizeBudgetItem),
    revenueItems: (revenue.data ?? []) as RevenueItem[],
    ticketTiers: (tickets.data ?? []) as TicketTier[],
    settlement: settlement.data as Settlement | null,
  };
}

function normalizeEvent(row: Record<string, unknown>): EventRecord {
  const venues = Array.isArray(row.venues) ? row.venues[0] : row.venues;

  return {
    ...(row as Omit<EventRecord, "venues">),
    venues: venues ? (venues as { name: string }) : null,
  };
}

function normalizeBudgetItem(row: Record<string, unknown>): BudgetItem {
  const contacts = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;

  return {
    ...(row as Omit<BudgetItem, "contacts">),
    contacts: contacts ? (contacts as { name: string }) : null,
  };
}

export function calculateSettlement(input: {
  budgetItems: BudgetItem[];
  revenueItems: RevenueItem[];
  ticketTiers: TicketTier[];
  settlement: Settlement | null;
}) {
  const ticketGross = input.ticketTiers.reduce(
    (sum, tier) => sum + Number(tier.generated_gross || tier.projected_gross || 0),
    0,
  );
  const otherRevenue = input.revenueItems.reduce(
    (sum, item) => sum + Number(item.actual_amount ?? item.projected_amount ?? 0),
    0,
  );
  const totalExpenses = input.budgetItems.reduce(
    (sum, item) => sum + Number(item.actual_amount ?? item.estimated_amount ?? 0),
    0,
  );
  const grossRevenue = ticketGross + otherRevenue;
  const netProfit = grossRevenue - totalExpenses;
  const partnerAPercent = Number(input.settlement?.partner_a_percent ?? 50);
  const partnerBPercent = Number(input.settlement?.partner_b_percent ?? 50);

  return {
    grossRevenue,
    totalExpenses,
    netProfit,
    breakEven: totalExpenses,
    partnerAAmount: netProfit > 0 ? netProfit * (partnerAPercent / 100) : 0,
    partnerBAmount: netProfit > 0 ? netProfit * (partnerBPercent / 100) : 0,
  };
}
