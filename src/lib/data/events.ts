import { createClient } from "@/lib/supabase/server";
import { canDeleteRecords, getProfile } from "@/lib/supabase/auth";
import type {
  BudgetItem,
  ContactOption,
  DashboardEvent,
  EventProfitLoss,
  EventRecord,
  RevenueItem,
  Settlement,
  TicketTier,
} from "@/lib/types";

export async function listEvents(options: { includeArchived?: boolean } = {}) {
  const profile = await getProfile();
  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("id, organization_id, venue_id, name, starts_on, ends_on, status, capacity, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by, venues(name)")
    .eq("organization_id", profile.organization_id)
    .order("starts_on", { ascending: true });

  if (!options.includeArchived || !canDeleteRecords(profile.membership.role)) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeEvent);
}

export async function listDashboardEvents(): Promise<DashboardEvent[]> {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, organization_id, venue_id, name, starts_on, ends_on, status, capacity, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by, venues(name)")
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .order("starts_on", { ascending: true });

  if (error) throw new Error(error.message);

  const events = (data ?? []).map(normalizeEvent);
  const eventIds = events.map((event) => event.id);

  if (eventIds.length === 0) return [];

  const [budget, revenue, tickets] = await Promise.all([
    supabase
      .from("budget_items")
      .select("event_id, estimated_amount, actual_amount")
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .in("event_id", eventIds),
    supabase
      .from("revenue_items")
      .select("event_id, projected_amount, actual_amount")
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .in("event_id", eventIds),
    supabase
      .from("ticket_tiers")
      .select("event_id, projected_gross, generated_gross")
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .in("event_id", eventIds),
  ]);

  for (const result of [budget, revenue, tickets]) {
    if (result.error) throw new Error(result.error.message);
  }

  return events.map((event) => ({
    ...event,
    financials: calculateEventProfitLoss({
      budgetItems: (budget.data ?? []).filter((item) => item.event_id === event.id),
      revenueItems: (revenue.data ?? []).filter((item) => item.event_id === event.id),
      ticketTiers: (tickets.data ?? []).filter((item) => item.event_id === event.id),
    }),
  }));
}

export async function getEvent(id: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, organization_id, venue_id, name, starts_on, ends_on, status, capacity, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by, venues(name)")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .single();

  if (error) throw new Error(error.message);
  return normalizeEvent(data);
}

export async function getEventFinancials(eventId: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const canViewArchived = canDeleteRecords(profile.membership.role);
  const [budget, archivedBudget, revenue, archivedRevenue, tickets, archivedTickets, settlement, contacts] = await Promise.all([
    supabase
      .from("budget_items")
      .select("id, vendor_contact_id, cost_type, category, description, estimated_amount, actual_amount, status, due_date, paid_date, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by, contacts!budget_items_vendor_contact_id_fkey(name)")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .order("cost_type", { ascending: true })
      .order("category", { ascending: true }),
    supabase
      .from("budget_items")
      .select("id, vendor_contact_id, cost_type, category, description, estimated_amount, actual_amount, status, due_date, paid_date, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by, contacts!budget_items_vendor_contact_id_fkey(name)")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("revenue_items")
      .select("id, source, description, projected_amount, actual_amount, status, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .order("source", { ascending: true }),
    supabase
      .from("revenue_items")
      .select("id, source, description, projected_amount, actual_amount, status, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("ticket_tiers")
      .select("id, name, price, capacity, sold_quantity, comp_quantity, generated_gross, projected_gross, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .order("price", { ascending: true }),
    supabase
      .from("ticket_tiers")
      .select("id, name, price, capacity, sold_quantity, comp_quantity, generated_gross, projected_gross, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("settlements")
      .select("id, partner_split_type, partner_a_name, partner_b_name, partner_a_percent, partner_b_percent, notes")
      .eq("event_id", eventId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id, name, company")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
  ]);

  for (const result of [budget, archivedBudget, revenue, archivedRevenue, tickets, archivedTickets, settlement, contacts]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    budgetItems: (budget.data ?? []).map(normalizeBudgetItem),
    archivedBudgetItems: canViewArchived ? (archivedBudget.data ?? []).map(normalizeBudgetItem) : [],
    revenueItems: (revenue.data ?? []) as RevenueItem[],
    archivedRevenueItems: canViewArchived ? ((archivedRevenue.data ?? []) as RevenueItem[]) : [],
    ticketTiers: (tickets.data ?? []) as TicketTier[],
    archivedTicketTiers: canViewArchived ? ((archivedTickets.data ?? []) as TicketTier[]) : [],
    settlement: settlement.data as Settlement | null,
    contacts: (contacts.data ?? []) as ContactOption[],
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

export function calculateEventProfitLoss(input: {
  budgetItems: Array<Pick<BudgetItem, "estimated_amount" | "actual_amount">>;
  revenueItems: Array<Pick<RevenueItem, "projected_amount" | "actual_amount">>;
  ticketTiers: Array<Pick<TicketTier, "projected_gross" | "generated_gross">>;
}): EventProfitLoss {
  const projectedTicketGross = input.ticketTiers.reduce(
    (sum, tier) => sum + Number(tier.projected_gross ?? 0),
    0,
  );
  const actualTicketGross = input.ticketTiers.reduce(
    (sum, tier) => sum + Number(tier.generated_gross ?? 0),
    0,
  );
  const projectedRevenueItems = input.revenueItems.reduce(
    (sum, item) => sum + Number(item.projected_amount ?? 0),
    0,
  );
  const actualRevenueItems = input.revenueItems.reduce(
    (sum, item) => sum + Number(item.actual_amount ?? 0),
    0,
  );
  const estimatedExpenses = input.budgetItems.reduce(
    (sum, item) => sum + Number(item.estimated_amount ?? 0),
    0,
  );
  const actualExpenses = input.budgetItems.reduce(
    (sum, item) => sum + Number(item.actual_amount ?? 0),
    0,
  );
  const projectedRevenue = projectedTicketGross + projectedRevenueItems;
  const actualRevenue = actualTicketGross + actualRevenueItems;

  return {
    projectedRevenue,
    estimatedExpenses,
    projectedNet: projectedRevenue - estimatedExpenses,
    actualRevenue,
    actualExpenses,
    actualNet: actualRevenue - actualExpenses,
    missingActualRevenueCount: input.revenueItems.filter((item) => item.actual_amount === null).length,
    missingActualExpenseCount: input.budgetItems.filter((item) => item.actual_amount === null).length,
  };
}
