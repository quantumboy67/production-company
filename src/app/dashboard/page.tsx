import Link from "next/link";
import { createDemoEvent } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listEvents } from "@/lib/data/events";
import { money, prettyDate } from "@/lib/format";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const events = await listEvents();
  const nextEvent = events[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Event financials for upcoming shows.</p>
        </div>
        <Button asChild><Link href="/dashboard/events/new">New event</Link></Button>
      </div>
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Beta focus:</span> event budgets, revenue, ticket tiers, and settlement tracking.
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Upcoming events" value={String(events.length)} />
        <Metric label="Next event" value={nextEvent ? prettyDate(nextEvent.starts_on) : "None"} />
        <Metric label="Projected net" value={money(0)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Next Up</CardTitle>
        </CardHeader>
        <CardContent>
          {nextEvent ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link href={`/dashboard/events/${nextEvent.id}`} className="font-medium hover:underline">
                  {nextEvent.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {prettyDate(nextEvent.starts_on)} at {nextEvent.venues?.name ?? "TBD venue"}
                </p>
              </div>
              <Badge>{nextEvent.status}</Badge>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">No events yet.</p>
              <form action={createDemoEvent}>
                <Button type="submit" variant="outline">Create demo event</Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
