import Link from "next/link";
import { restoreEvent } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listEvents } from "@/lib/data/events";
import { prettyDate } from "@/lib/format";
import { canDeleteRecords, canManageEvents, getProfile } from "@/lib/supabase/auth";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; error?: string }>;
}) {
  const { archived, error } = await searchParams;
  const profile = await getProfile();
  const canRestoreEvents = canDeleteRecords(profile.membership.role);
  const includeArchived = canRestoreEvents && archived === "1";
  const events = await listEvents({ includeArchived });
  const canCreateEvents = canManageEvents(profile.membership.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground">Browse and manage productions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRestoreEvents ? (
            <Button asChild variant="outline">
              <Link href={includeArchived ? "/dashboard/events" : "/dashboard/events?archived=1"}>
                {includeArchived ? "Hide archived" : "Include archived"}
              </Link>
            </Button>
          ) : null}
          {canCreateEvents ? <Button asChild><Link href="/dashboard/events/new">New event</Link></Button> : null}
        </div>
      </div>
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Event List</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">No events yet. Create the first show.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Date</TH>
                  <TH>Venue</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Capacity</TH>
                  {includeArchived ? <TH className="text-right">Restore</TH> : null}
                </TR>
              </THead>
              <TBody>
                {events.map((event) => (
                  <TR key={event.id} className={event.deleted_at ? "bg-muted/30 text-muted-foreground" : undefined}>
                    <TD className="font-medium">
                      {event.deleted_at ? event.name : <Link href={`/dashboard/events/${event.id}`} className="hover:underline">{event.name}</Link>}
                      {event.deleted_at ? <span className="ml-2 text-xs">(archived)</span> : null}
                    </TD>
                    <TD>{prettyDate(event.starts_on)}{event.ends_on ? ` - ${prettyDate(event.ends_on)}` : ""}</TD>
                    <TD>{event.venues?.name ?? "TBD"}</TD>
                    <TD><Badge>{event.status}</Badge></TD>
                    <TD className="text-right">{event.capacity ?? "TBD"}</TD>
                    {includeArchived ? (
                      <TD className="text-right">
                        {event.deleted_at ? (
                          <form action={restoreEvent}>
                            <input type="hidden" name="id" value={event.id} />
                            <Button type="submit" variant="outline" size="sm" data-testid={`event-restore-${event.id}`} aria-label={`Restore ${event.name}`}>Restore</Button>
                          </form>
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
