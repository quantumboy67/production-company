import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { titleize } from "@/lib/format";
import type { AuditLogRecord } from "@/lib/types";

export function ActivityList({ activity }: { activity: AuditLogRecord[] }) {
  return (
    <Card data-testid="activity-tab">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <p className="text-sm text-muted-foreground">
          Event-related changes from budgets, revenue, tickets, settlement, and event details.
        </p>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No activity has been logged for this event yet.</p>
        ) : (
          <div className="space-y-3">
            {activity.map((item) => (
              <article key={item.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{formatAction(item.action)}</Badge>
                      <p className="text-xs text-muted-foreground">{formatTimestamp(item.created_at)}</p>
                    </div>
                    <p className="font-medium">{item.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.actor_name || item.actor_email || "Unknown actor"}
                    </p>
                  </div>
                </div>
                {item.before_data || item.after_data || item.metadata ? (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">View audit details</summary>
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

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
        {value ? JSON.stringify(value, null, 2) : "None"}
      </pre>
    </div>
  );
}

function formatAction(action: string) {
  return titleize(action.replace(".", " "));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
