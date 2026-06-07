import Link from "next/link";
import { AlertTriangle, CircleAlert, FileWarning, Info, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { filterAuditorEvents, listAuditorEvents, type AuditorEventResult, type AuditorFilter, type AuditorIssue } from "@/lib/data/auditor";
import { money, prettyDate, titleize } from "@/lib/format";

const filters: Array<{ value: AuditorFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "documents", label: "Needs documents" },
  { value: "ready", label: "Ready / no critical" },
];

export default async function AuditorPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const activeFilter = parseFilter(rawFilter);
  const { events, summary } = await listAuditorEvents();
  const filteredEvents = filterAuditorEvents(events, activeFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Auditor</h1>
          <p className="text-sm text-muted-foreground">Financial readiness and completeness checks for Juniper Berry Productions events.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/events">Open events</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Events reviewed" value={summary.eventsReviewed} detail="Active events in this organization" />
        <SummaryCard label="Critical issues" value={summary.criticalIssues} detail="Highest-priority blockers" tone={summary.criticalIssues > 0 ? "critical" : "pass"} />
        <SummaryCard label="Warnings" value={summary.warnings} detail="Completeness concerns" tone={summary.warnings > 0 ? "warning" : "pass"} />
        <SummaryCard label="Documents missing" value={summary.documentsMissing} detail="Actual or paid costs without receipt/invoice" tone={summary.documentsMissing > 0 ? "critical" : "pass"} />
      </section>

      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>Event Readiness</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Deterministic checks only. My Auditor does not auto-fix records or use AI in this alpha.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <Button key={filter.value} asChild size="sm" variant={activeFilter === filter.value ? "secondary" : "outline"}>
                <Link href={filter.value === "all" ? "/dashboard/auditor" : `/dashboard/auditor?filter=${filter.value}`}>
                  {filter.label}
                </Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">No events match this auditor filter.</p>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event) => <AuditorEventRow key={event.event.id} result={event} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditorEventRow({ result }: { result: AuditorEventResult }) {
  const critical = result.counts.critical;
  const warnings = result.counts.warning;
  const info = result.counts.info;
  const ready = critical === 0;

  return (
    <details className="rounded-md border bg-background p-4" data-testid={`auditor-event-${result.event.id}`}>
      <summary className="cursor-pointer list-none">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_130px_minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{result.event.name}</h2>
              <Badge>{titleize(result.event.status)}</Badge>
              {ready ? <Badge className="border-green-700/30 bg-green-700/10 text-foreground">No critical</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {prettyDate(result.event.starts_on)} at {result.event.venues?.name ?? "TBD venue"}
            </p>
          </div>
          <ScoreBadge score={result.score} />
          <div className="flex flex-wrap gap-2 text-xs">
            <IssuePill severity="critical" count={critical} />
            <IssuePill severity="warning" count={warnings} />
            <IssuePill severity="info" count={info} />
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/events/${result.event.id}`}>Event detail</Link>
          </Button>
        </div>
      </summary>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-2">
          {result.issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
        </div>
        <div className="rounded-md border bg-muted/10 p-3 text-sm">
          <p className="font-medium">Financial snapshot</p>
          <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
            <SnapshotRow label="Projected revenue" value={money(result.financials.projectedRevenue)} />
            <SnapshotRow label="Estimated expenses" value={money(result.financials.estimatedExpenses)} />
            <SnapshotRow label="Projected net" value={money(result.financials.projectedNet)} />
            <SnapshotRow label="Actual revenue" value={money(result.financials.actualRevenue)} />
            <SnapshotRow label="Actual expenses" value={money(result.financials.actualExpenses)} />
            <SnapshotRow label="Actual / entered net" value={money(result.financials.actualNet)} />
          </dl>
        </div>
      </div>
    </details>
  );
}

function IssueRow({ issue }: { issue: AuditorIssue }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-card/40 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={issue.severity} />
          <Badge className="bg-muted/20">{titleize(issue.category)}</Badge>
        </div>
        <p className="mt-2 text-sm">{issue.message}</p>
      </div>
      <Button asChild size="sm" variant="ghost">
        <Link href={issue.href}>Review</Link>
      </Button>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "critical" | "warning" | "pass";
}) {
  const icon = tone === "critical" ? CircleAlert : tone === "warning" ? AlertTriangle : tone === "pass" ? ShieldCheck : FileWarning;
  const Icon = icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className={tone === "critical" ? "text-2xl font-semibold text-destructive" : "text-2xl font-semibold"}>{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">Readiness</p>
      <p className="font-semibold">{score}/100</p>
    </div>
  );
}

function IssuePill({ severity, count }: { severity: Exclude<AuditorIssue["severity"], "pass">; count: number }) {
  return (
    <span className="rounded-md border bg-muted/20 px-2 py-1">
      {titleize(severity)}: <span className="font-medium text-foreground">{count}</span>
    </span>
  );
}

function SeverityBadge({ severity }: { severity: AuditorIssue["severity"] }) {
  const classes: Record<AuditorIssue["severity"], string> = {
    critical: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-primary/30 bg-primary/10 text-foreground",
    info: "border bg-muted/20 text-muted-foreground",
  };
  const Icon = severity === "critical" ? CircleAlert : severity === "warning" ? AlertTriangle : Info;

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${classes[severity]}`}>
      <Icon className="size-3" />
      {titleize(severity)}
    </span>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function parseFilter(value: string | undefined): AuditorFilter {
  return filters.some((filter) => filter.value === value) ? (value as AuditorFilter) : "all";
}
