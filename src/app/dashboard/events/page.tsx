import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listEvents } from "@/lib/data/events";
import { prettyDate } from "@/lib/format";
import { canManageEvents, getProfile } from "@/lib/supabase/auth";

export default async function EventsPage() {
  const [events, profile] = await Promise.all([listEvents(), getProfile()]);
  const canCreateEvents = canManageEvents(profile.membership.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground">Browse and manage productions.</p>
        </div>
        {canCreateEvents ? <Button asChild><Link href="/dashboard/events/new">New event</Link></Button> : null}
      </div>
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
                </TR>
              </THead>
              <TBody>
                {events.map((event) => (
                  <TR key={event.id}>
                    <TD className="font-medium">
                      <Link href={`/dashboard/events/${event.id}`} className="hover:underline">{event.name}</Link>
                    </TD>
                    <TD>{prettyDate(event.starts_on)}{event.ends_on ? ` - ${prettyDate(event.ends_on)}` : ""}</TD>
                    <TD>{event.venues?.name ?? "TBD"}</TD>
                    <TD><Badge>{event.status}</Badge></TD>
                    <TD className="text-right">{event.capacity ?? "TBD"}</TD>
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
