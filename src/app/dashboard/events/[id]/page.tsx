import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEvent } from "@/app/actions";
import { EventFinancialTabs } from "@/components/app/event-financial-tabs";
import { EventForm } from "@/components/app/event-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEvent, getEventFinancials } from "@/lib/data/events";
import { prettyDate, titleize } from "@/lib/format";

const tabs = [
  ["overview", "Overview"],
  ["budget", "Budget"],
  ["revenue", "Revenue & Settlement"],
] as const;

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview", error } = await searchParams;

  const [eventResult, financialsResult] = await Promise.allSettled([getEvent(id), getEventFinancials(id)]);

  if (eventResult.status === "rejected" || financialsResult.status === "rejected") {
    notFound();
  }

  const event = eventResult.value;
  const financials = financialsResult.value;
  const activeTab = tabs.some(([value]) => value === tab) ? tab : "overview";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
            <Badge>{titleize(event.status)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {prettyDate(event.starts_on)}{event.ends_on ? ` - ${prettyDate(event.ends_on)}` : ""} at {event.venues?.name ?? "TBD venue"}
          </p>
        </div>
        <form action={deleteEvent}>
          <input type="hidden" name="id" value={event.id} />
          <Button type="submit" variant="destructive">Delete</Button>
        </form>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b pb-2">
        {tabs.map(([value, label]) => (
          <Button key={value} asChild variant={activeTab === value ? "secondary" : "ghost"} size="sm">
            <Link href={`/dashboard/events/${event.id}?tab=${value}`}>{label}</Link>
          </Button>
        ))}
      </div>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {activeTab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <EventForm event={event} />
          <Card>
            <CardHeader>
              <CardTitle>Production Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {event.notes || "No notes yet."}
            </CardContent>
          </Card>
        </div>
      ) : (
        <EventFinancialTabs activeTab={activeTab} eventId={event.id} {...financials} />
      )}
    </div>
  );
}
