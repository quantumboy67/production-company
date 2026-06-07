import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/auth";
import type { EventRecord, EventStatus, ItemStatus, RevenueStatus } from "@/lib/types";

export type AuditorSeverity = "critical" | "warning" | "info" | "pass";
export type AuditorCategory = "financial" | "documents" | "settlement" | "operational" | "access";
export type AuditorFilter = "all" | "critical" | "warning" | "documents" | "ready";

export type AuditorIssue = {
  id: string;
  severity: Exclude<AuditorSeverity, "pass">;
  category: AuditorCategory;
  message: string;
  href: string;
};

export type AuditorEventResult = {
  event: EventRecord;
  score: number;
  issues: AuditorIssue[];
  counts: Record<AuditorSeverity, number>;
  documentIssues: number;
  financials: {
    projectedRevenue: number;
    estimatedExpenses: number;
    projectedNet: number;
    actualRevenue: number;
    actualExpenses: number;
    actualNet: number;
  };
};

export type AuditorSummary = {
  eventsReviewed: number;
  criticalIssues: number;
  warnings: number;
  documentsMissing: number;
};

type EventRow = Omit<EventRecord, "venues"> & {
  venues: { name: string } | { name: string }[] | null;
};

type BudgetAuditRow = {
  id: string;
  event_id: string;
  category: string;
  description: string;
  estimated_amount: number | null;
  actual_amount: number | null;
  status: ItemStatus;
  deleted_at: string | null;
};

type RevenueAuditRow = {
  id: string;
  event_id: string;
  source: string;
  description: string;
  projected_amount: number | null;
  actual_amount: number | null;
  status: RevenueStatus;
  deleted_at: string | null;
};

type TicketAuditRow = {
  id: string;
  event_id: string;
  name: string;
  capacity: number | null;
  sold_quantity: number | null;
  projected_gross: number | null;
  generated_gross: number | null;
  deleted_at: string | null;
};

type SettlementAuditRow = {
  id: string;
  event_id: string;
  notes: string | null;
};

type DocumentAuditRow = {
  id: string;
  event_id: string;
  budget_item_id: string;
  file_name: string;
  document_type: string;
  document_status: string;
  deleted_at: string | null;
};

export async function listAuditorEvents(): Promise<{ events: AuditorEventResult[]; summary: AuditorSummary }> {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select("id, organization_id, venue_id, name, starts_on, ends_on, status, capacity, notes, deleted_at, deleted_by, delete_reason, restored_at, restored_by, venues(name)")
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .order("starts_on", { ascending: true });

  if (eventsError) throw new Error(eventsError.message);

  const events = ((eventsData ?? []) as EventRow[]).map(normalizeEvent);
  const eventIds = events.map((event) => event.id);

  if (eventIds.length === 0) {
    return {
      events: [],
      summary: {
        eventsReviewed: 0,
        criticalIssues: 0,
        warnings: 0,
        documentsMissing: 0,
      },
    };
  }

  const [budget, revenue, tickets, settlements, documents] = await Promise.all([
    supabase
      .from("budget_items")
      .select("id, event_id, category, description, estimated_amount, actual_amount, status, deleted_at")
      .eq("organization_id", profile.organization_id)
      .in("event_id", eventIds),
    supabase
      .from("revenue_items")
      .select("id, event_id, source, description, projected_amount, actual_amount, status, deleted_at")
      .eq("organization_id", profile.organization_id)
      .in("event_id", eventIds),
    supabase
      .from("ticket_tiers")
      .select("id, event_id, name, capacity, sold_quantity, projected_gross, generated_gross, deleted_at")
      .eq("organization_id", profile.organization_id)
      .in("event_id", eventIds),
    supabase
      .from("settlements")
      .select("id, event_id, notes")
      .eq("organization_id", profile.organization_id)
      .in("event_id", eventIds),
    supabase
      .from("budget_item_documents")
      .select("id, event_id, budget_item_id, file_name, document_type, document_status, deleted_at")
      .eq("organization_id", profile.organization_id)
      .in("event_id", eventIds),
  ]);

  for (const result of [budget, revenue, tickets, settlements, documents]) {
    if (result.error) throw new Error(result.error.message);
  }

  const budgetByEvent = groupByEvent((budget.data ?? []) as BudgetAuditRow[]);
  const revenueByEvent = groupByEvent((revenue.data ?? []) as RevenueAuditRow[]);
  const ticketsByEvent = groupByEvent((tickets.data ?? []) as TicketAuditRow[]);
  const settlementsByEvent = groupByEvent((settlements.data ?? []) as SettlementAuditRow[]);
  const documentsByEvent = groupByEvent((documents.data ?? []) as DocumentAuditRow[]);

  const results = events.map((event) => auditEvent({
    event,
    budgetItems: budgetByEvent.get(event.id) ?? [],
    revenueItems: revenueByEvent.get(event.id) ?? [],
    ticketTiers: ticketsByEvent.get(event.id) ?? [],
    settlement: (settlementsByEvent.get(event.id) ?? [])[0] ?? null,
    documents: documentsByEvent.get(event.id) ?? [],
  }));

  return {
    events: results,
    summary: {
      eventsReviewed: results.length,
      criticalIssues: sum(results, (event) => event.counts.critical),
      warnings: sum(results, (event) => event.counts.warning),
      documentsMissing: sum(results, (event) => countMissingDocumentIssues(event.issues)),
    },
  };
}

export function filterAuditorEvents(events: AuditorEventResult[], filter: AuditorFilter) {
  if (filter === "critical") return events.filter((event) => event.counts.critical > 0);
  if (filter === "warning") return events.filter((event) => event.counts.warning > 0);
  if (filter === "documents") return events.filter((event) => event.documentIssues > 0);
  if (filter === "ready") return events.filter((event) => event.counts.critical === 0);
  return events;
}

function auditEvent(input: {
  event: EventRecord;
  budgetItems: BudgetAuditRow[];
  revenueItems: RevenueAuditRow[];
  ticketTiers: TicketAuditRow[];
  settlement: SettlementAuditRow | null;
  documents: DocumentAuditRow[];
}): AuditorEventResult {
  const activeBudgetItems = input.budgetItems.filter((item) => !item.deleted_at);
  const archivedBudgetItems = input.budgetItems.filter((item) => item.deleted_at);
  const activeRevenueItems = input.revenueItems.filter((item) => !item.deleted_at);
  const archivedRevenueItems = input.revenueItems.filter((item) => item.deleted_at);
  const activeTicketTiers = input.ticketTiers.filter((tier) => !tier.deleted_at);
  const archivedTicketTiers = input.ticketTiers.filter((tier) => tier.deleted_at);
  const activeDocuments = input.documents.filter((document) => !document.deleted_at);
  const archivedDocuments = input.documents.filter((document) => document.deleted_at);
  const documentsByBudgetItem = groupByBudgetItem(activeDocuments);
  const archivedDocumentsByBudgetItem = groupByBudgetItem(archivedDocuments);
  const issues: AuditorIssue[] = [];
  const budgetHref = (budgetItemId?: string) => `/dashboard/events/${input.event.id}?tab=budget${budgetItemId ? `&highlight_budget_item=${budgetItemId}` : ""}`;
  const revenueHref = `/dashboard/events/${input.event.id}?tab=revenue`;
  const overviewHref = `/dashboard/events/${input.event.id}`;

  if (activeBudgetItems.length === 0) {
    addIssue(issues, "warning", "financial", "Event has no active budget items.", budgetHref());
  }

  for (const item of activeBudgetItems) {
    const estimated = toNumber(item.estimated_amount);
    const actual = item.actual_amount === null ? null : toNumber(item.actual_amount);
    const itemDocuments = documentsByBudgetItem.get(item.id) ?? [];
    const hasReceiptOrInvoice = itemDocuments.some((document) => document.document_type === "receipt" || document.document_type === "invoice");

    if (estimated > 0 && actual === null && item.status !== "paid") {
      addIssue(issues, "warning", "financial", `${item.description} has an estimate but no actual or paid amount.`, budgetHref(item.id));
    }

    if ((actual !== null || item.status === "paid") && !hasReceiptOrInvoice) {
      addIssue(issues, "critical", "documents", `${item.description} has an actual or paid amount but no active receipt or invoice.`, budgetHref(item.id));
    }

    for (const document of itemDocuments) {
      if (document.document_status === "needs_review") {
        addIssue(issues, "warning", "documents", `${document.file_name} needs review.`, budgetHref(item.id));
      }

      if ((document.document_type === "receipt" || document.document_type === "invoice") && document.document_status !== "accepted") {
        addIssue(issues, "warning", "documents", `${document.file_name} is uploaded but not accepted yet.`, budgetHref(item.id));
      }

      if (document.document_status === "rejected") {
        addIssue(issues, "warning", "documents", `${document.file_name} is rejected but still attached to an active budget item.`, budgetHref(item.id));
      }
    }

    if ((archivedDocumentsByBudgetItem.get(item.id) ?? []).length > 0) {
      addIssue(issues, "info", "documents", `${item.description} has archived documents that may need review.`, budgetHref(item.id));
    }
  }

  const estimatedExpenses = sum(activeBudgetItems, (item) => toNumber(item.estimated_amount));
  const actualExpenses = sum(activeBudgetItems, (item) => toNumber(item.actual_amount));
  const projectedRevenue = sum(activeRevenueItems, (item) => toNumber(item.projected_amount)) + sum(activeTicketTiers, (tier) => toNumber(tier.projected_gross));
  const actualRevenue = sum(activeRevenueItems, (item) => toNumber(item.actual_amount)) + sum(activeTicketTiers, (tier) => toNumber(tier.generated_gross));
  const projectedNet = projectedRevenue - estimatedExpenses;
  const actualNet = actualRevenue - actualExpenses;

  if (actualExpenses > estimatedExpenses && estimatedExpenses > 0) {
    addIssue(issues, "warning", "financial", "Actual expenses exceed estimated expenses.", budgetHref());
  }

  if (projectedNet < 0) {
    addIssue(issues, "warning", "financial", "Projected net is negative.", revenueHref);
  }

  if (actualNet < 0) {
    addIssue(issues, "critical", "financial", "Actual or entered net is negative.", revenueHref);
  }

  for (const item of activeRevenueItems) {
    if (toNumber(item.projected_amount) > 0 && item.actual_amount === null && item.status !== "received") {
      addIssue(issues, "warning", "financial", `${item.description} has projected revenue but no actual or received amount.`, revenueHref);
    }
  }

  for (const tier of activeTicketTiers) {
    if (toNumber(tier.capacity) > 0 && toNumber(tier.sold_quantity) === 0 && input.event.status !== "cancelled") {
      addIssue(issues, "info", "financial", `${tier.name} has capacity but zero sold tickets.`, revenueHref);
    }
  }

  if (input.settlement && !input.settlement.notes?.trim()) {
    addIssue(issues, "info", "settlement", "Settlement is missing notes.", revenueHref);
  }

  const hasIncompleteActualExpenses = activeBudgetItems.some((item) => item.actual_amount === null && item.status !== "cancelled");
  const hasIncompleteActualRevenue = activeRevenueItems.some((item) => item.actual_amount === null && item.status !== "received");
  if (input.settlement && (hasIncompleteActualExpenses || hasIncompleteActualRevenue)) {
    addIssue(issues, "warning", "settlement", "Settlement has incomplete actual revenue or expense inputs.", revenueHref);
  }

  if (!input.event.venue_id) {
    addIssue(issues, "warning", "operational", "Event is missing a venue.", overviewHref);
  }

  if (!input.event.starts_on) {
    addIssue(issues, "warning", "operational", "Event is missing a date.", overviewHref);
  }

  if (isClosePlanningEvent(input.event.starts_on, input.event.status)) {
    addIssue(issues, "warning", "operational", "Event is still planning within 14 days of the event date.", overviewHref);
  }

  const archivedRecordCount = archivedBudgetItems.length + archivedRevenueItems.length + archivedTicketTiers.length + archivedDocuments.length;
  if (archivedRecordCount > 0) {
    addIssue(issues, "info", "operational", `${archivedRecordCount} archived record${archivedRecordCount === 1 ? "" : "s"} exist for this event.`, overviewHref);
  }

  if (issues.length === 0) {
    addIssue(issues, "info", "access", "No active readiness issues found.", overviewHref);
  }

  const realIssues = issues.filter((issue) => issue.message !== "No active readiness issues found.");
  const counts = countSeverities(realIssues);

  return {
    event: input.event,
    issues,
    counts: {
      ...counts,
      pass: realIssues.length === 0 ? 1 : 0,
    },
    score: calculateScore(counts),
    documentIssues: realIssues.filter((issue) => issue.category === "documents").length,
    financials: {
      projectedRevenue,
      estimatedExpenses,
      projectedNet,
      actualRevenue,
      actualExpenses,
      actualNet,
    },
  };
}

function addIssue(issues: AuditorIssue[], severity: AuditorIssue["severity"], category: AuditorCategory, message: string, href: string) {
  issues.push({
    id: `${severity}:${category}:${message}`,
    severity,
    category,
    message,
    href,
  });
}

function countSeverities(issues: AuditorIssue[]): Record<Exclude<AuditorSeverity, "pass">, number> {
  return issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { critical: 0, warning: 0, info: 0 },
  );
}

function calculateScore(counts: Record<Exclude<AuditorSeverity, "pass">, number>) {
  return Math.max(0, 100 - counts.critical * 25 - counts.warning * 10 - counts.info * 3);
}

function countMissingDocumentIssues(issues: AuditorIssue[]) {
  return issues.filter((issue) => issue.category === "documents" && issue.message.includes("no active receipt or invoice")).length;
}

function groupByEvent<T extends { event_id: string }>(rows: T[]) {
  return rows.reduce((groups, row) => {
    const existing = groups.get(row.event_id) ?? [];
    existing.push(row);
    groups.set(row.event_id, existing);
    return groups;
  }, new Map<string, T[]>());
}

function groupByBudgetItem(rows: DocumentAuditRow[]) {
  return rows.reduce((groups, row) => {
    const existing = groups.get(row.budget_item_id) ?? [];
    existing.push(row);
    groups.set(row.budget_item_id, existing);
    return groups;
  }, new Map<string, DocumentAuditRow[]>());
}

function normalizeEvent(row: EventRow): EventRecord {
  const venues = Array.isArray(row.venues) ? row.venues[0] : row.venues;

  return {
    ...row,
    venues: venues ? { name: venues.name } : null,
  };
}

function isClosePlanningEvent(startsOn: string, status: EventStatus) {
  if (status !== "planning") return false;

  const today = startOfDay(new Date());
  const eventDate = startOfDay(new Date(`${startsOn}T00:00:00`));
  const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / 86_400_000);
  return daysUntil >= 0 && daysUntil <= 14;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function sum<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}
