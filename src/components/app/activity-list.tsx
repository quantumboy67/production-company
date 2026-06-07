"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { titleize } from "@/lib/format";
import type { AuditLogRecord } from "@/lib/types";

export function ActivityList({ activity }: { activity: AuditLogRecord[] }) {
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [query, setQuery] = useState("");

  const actorOptions = useMemo(() => uniqueOptions(activity.map(formatActor)), [activity]);
  const actionOptions = useMemo(() => uniqueOptions(activity.map((item) => item.action)), [activity]);
  const entityOptions = useMemo(() => uniqueOptions(activity.map((item) => item.entity_type)), [activity]);
  const filteredActivity = useMemo(
    () => activity.filter((item) => matchesFilters(item, { actorFilter, actionFilter, entityFilter, startDate, endDate, query })),
    [activity, actorFilter, actionFilter, entityFilter, startDate, endDate, query],
  );
  const counts = useMemo(() => summarizeActivity(activity), [activity]);
  const filteredCounts = useMemo(() => summarizeActivity(filteredActivity), [filteredActivity]);
  const hasFilters = actorFilter !== "all" || actionFilter !== "all" || entityFilter !== "all" || startDate || endDate || query.trim();

  function clearFilters() {
    setActorFilter("all");
    setActionFilter("all");
    setEntityFilter("all");
    setStartDate("");
    setEndDate("");
    setQuery("");
  }

  function exportCsv() {
    const csv = toCsv(filteredActivity);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `event-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card data-testid="activity-tab">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Activity</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Event-related changes from budgets, revenue, tickets, settlement, team access, and event details.
            </p>
          </div>
          {activity.length > 0 ? (
            <Button type="button" variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActivityCounts counts={counts} filteredCounts={filteredCounts} isFiltered={Boolean(hasFilters)} />

        {activity.length > 0 ? (
          <div className="rounded-md border bg-muted/10 p-3">
            <div className="grid gap-3 lg:grid-cols-6">
              <Field label="Search" className="lg:col-span-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Summary, action, or actor"
                  data-testid="activity-search"
                />
              </Field>
              <Field label="Actor">
                <Select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} data-testid="activity-actor-filter">
                  <option value="all">All actors</option>
                  {actorOptions.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
                </Select>
              </Field>
              <Field label="Action">
                <Select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} data-testid="activity-action-filter">
                  <option value="all">All actions</option>
                  {actionOptions.map((action) => <option key={action} value={action}>{formatAction(action)}</option>)}
                </Select>
              </Field>
              <Field label="Entity">
                <Select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} data-testid="activity-entity-filter">
                  <option value="all">All entities</option>
                  {entityOptions.map((entity) => <option key={entity} value={entity}>{formatEntity(entity)}</option>)}
                </Select>
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Start date">
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} data-testid="activity-start-date" />
              </Field>
              <Field label="End date">
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} data-testid="activity-end-date" />
              </Field>
              <div className="flex items-end text-xs text-muted-foreground lg:col-span-2">
                Showing {filteredActivity.length} of {activity.length} audit {activity.length === 1 ? "entry" : "entries"}.
              </div>
            </div>
          </div>
        ) : null}

        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity has been logged for this event yet.
          </p>
        ) : filteredActivity.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No activity matches the current filters.</p>
        ) : (
          <div className="space-y-3">
            {filteredActivity.map((item) => (
              <article key={item.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{formatAction(item.action)}</Badge>
                      <Badge className="bg-muted/20">{formatCategory(getActivityCategory(item))}</Badge>
                      <p className="text-xs text-muted-foreground">{formatTimestamp(item.created_at)}</p>
                    </div>
                    <p className="font-medium">{item.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatActor(item)}
                    </p>
                  </div>
                </div>
                {item.before_data || item.after_data || item.metadata ? (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Review before / after details</summary>
                    <div className="mt-2 grid gap-2 lg:grid-cols-3">
                      <JsonBlock label="Before" value={item.before_data} />
                      <JsonBlock label="After" value={item.after_data} />
                      <JsonBlock label="Metadata" value={item.metadata} />
                    </div>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type FilterState = {
  actorFilter: string;
  actionFilter: string;
  entityFilter: string;
  startDate: string;
  endDate: string;
  query: string;
};

type ActivityCategory = "financial" | "event" | "team" | "settlement" | "other";

function ActivityCounts({
  counts,
  filteredCounts,
  isFiltered,
}: {
  counts: Record<ActivityCategory | "total", number>;
  filteredCounts: Record<ActivityCategory | "total", number>;
  isFiltered: boolean;
}) {
  const activeCounts = isFiltered ? filteredCounts : counts;
  const helper = isFiltered ? `Filtered from ${counts.total} total` : "All visible event activity";

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CountCard label="Total activity" value={activeCounts.total} />
        <CountCard label="Financial changes" value={activeCounts.financial} />
        <CountCard label="Event changes" value={activeCounts.event} />
        <CountCard label="Team / access" value={activeCounts.team} />
        <CountCard label="Settlement changes" value={activeCounts.settlement} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
        {value ? JSON.stringify(redactAuditValue(value), null, 2) : "None"}
      </pre>
    </div>
  );
}

function formatAction(action: string) {
  const labels: Record<string, string> = {
    "budget_item.created": "Budget created",
    "budget_item.updated": "Budget updated",
    "budget_item.deleted": "Budget deleted",
    "budget_items.batch_updated": "Budget batch saved",
    "revenue_item.created": "Revenue created",
    "revenue_item.updated": "Revenue updated",
    "revenue_item.deleted": "Revenue deleted",
    "ticket_tier.created": "Ticket tier created",
    "ticket_tier.updated": "Ticket tier updated",
    "ticket_tier.deleted": "Ticket tier deleted",
    "settlement.updated": "Settlement updated",
    "team_member.invited": "Team member invited",
    "team_member.role_changed": "Team role changed",
    "team_member.removed": "Team member removed",
    "team_member.password_change_required": "Password change required",
    "team_member.password_changed": "Password changed",
    "event.created": "Event created",
    "event.updated": "Event updated",
    "event.deleted": "Event deleted",
  };

  return labels[action] ?? titleize(action.replace(/[._]/g, " "));
}

function formatEntity(entityType: string) {
  return titleize(entityType.replace(/_/g, " "));
}

function formatActor(item: AuditLogRecord) {
  return item.actor_name || item.actor_email || "Unknown actor";
}

function formatCategory(category: ActivityCategory) {
  const labels: Record<ActivityCategory, string> = {
    financial: "Financial",
    event: "Event",
    team: "Team",
    settlement: "Settlement",
    other: "Other",
  };

  return labels[category];
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function matchesFilters(item: AuditLogRecord, filters: FilterState) {
  const actor = formatActor(item);
  const createdAt = new Date(item.created_at);
  const query = filters.query.trim().toLowerCase();
  const searchable = [
    item.summary,
    item.action,
    formatAction(item.action),
    item.entity_type,
    formatEntity(item.entity_type),
    actor,
    item.actor_email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (filters.actorFilter !== "all" && actor !== filters.actorFilter) return false;
  if (filters.actionFilter !== "all" && item.action !== filters.actionFilter) return false;
  if (filters.entityFilter !== "all" && item.entity_type !== filters.entityFilter) return false;
  if (filters.startDate && createdAt < new Date(`${filters.startDate}T00:00:00`)) return false;
  if (filters.endDate && createdAt > new Date(`${filters.endDate}T23:59:59.999`)) return false;
  if (query && !searchable.includes(query)) return false;

  return true;
}

function summarizeActivity(items: AuditLogRecord[]): Record<ActivityCategory | "total", number> {
  const counts: Record<ActivityCategory | "total", number> = {
    total: items.length,
    financial: 0,
    event: 0,
    team: 0,
    settlement: 0,
    other: 0,
  };

  for (const item of items) {
    counts[getActivityCategory(item)] += 1;
  }

  return counts;
}

function getActivityCategory(item: AuditLogRecord): ActivityCategory {
  if (item.entity_type === "settlement" || item.action.startsWith("settlement.")) return "settlement";
  if (item.entity_type === "event" || item.action.startsWith("event.")) return "event";
  if (item.entity_type === "team_member" || item.action.startsWith("team_member.")) return "team";
  if (
    item.entity_type === "budget_item" ||
    item.entity_type === "revenue_item" ||
    item.entity_type === "ticket_tier" ||
    item.action.startsWith("budget_") ||
    item.action.startsWith("revenue_") ||
    item.action.startsWith("ticket_")
  ) {
    return "financial";
  }

  return "other";
}

function uniqueOptions(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function toCsv(items: AuditLogRecord[]) {
  const rows = [
    ["timestamp", "actor", "action", "entity_type", "summary"],
    ...items.map((item) => [
      item.created_at,
      formatActor(item),
      formatAction(item.action),
      formatEntity(item.entity_type),
      item.summary,
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (isSensitiveKey(key)) return [key, "[redacted]"];
      return [key, redactAuditValue(entry)];
    }),
  );
}

function isSensitiveKey(key: string) {
  return /password|token|secret|service[_-]?role|apikey|api[_-]?key|authorization/i.test(key);
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={`h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
      {...props}
    />
  );
}
