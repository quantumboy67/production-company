import Link from "next/link";
import { createDemoEvent } from "@/app/actions";
import { PrintButton } from "@/components/app/print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDashboardEvents } from "@/lib/data/events";
import { money, prettyDate, titleize } from "@/lib/format";
import { canManageEvents, getProfile } from "@/lib/supabase/auth";
import type { DashboardEvent, EventProfitLoss } from "@/lib/types";

type SearchParams = {
  date?: string;
  error?: string;
  month?: string;
  upcoming?: string;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { date, error, month, upcoming } = await searchParams;
  const [events, profile] = await Promise.all([listDashboardEvents(), getProfile()]);
  const canCreateEvents = canManageEvents(profile.membership.role);
  const today = toIsoDate(new Date());
  const currentMonth = parseMonth(month) ?? today.slice(0, 7);
  const selectedDate = isIsoDate(date) ? date : getDefaultSelectedDate(currentMonth, today);
  const calendarDays = buildCalendarDays(currentMonth);
  const eventsByDate = groupEventsByDate(events);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const upcomingEvents = events
    .filter((event) => event.starts_on >= today && event.status !== "cancelled")
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const nextEvent = upcomingEvents[0] ?? events[0] ?? null;
  const aggregate = sumProfitLoss(upcomingEvents.length > 0 ? upcomingEvents : events);
  const showUpcoming = upcoming === "1";

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          aside, .print-hidden, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          .print-card { border: 0 !important; box-shadow: none !important; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Calendar-based event financial tracker.</p>
        </div>
        {canCreateEvents ? <Button asChild><Link href="/dashboard/events/new">New event</Link></Button> : null}
      </div>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <Card className="border-primary/30 bg-primary/5 print:hidden">
        <CardContent className="py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Beta focus:</span> calendar to selected date to event financials.
        </CardContent>
      </Card>

      {events.length === 0 && canCreateEvents ? (
        <Card className="print:hidden">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-muted-foreground">No events yet. Create a demo event to explore the financial workflow.</p>
            <form action={createDemoEvent}>
              <Button type="submit" variant="outline">Create demo event</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-4 print:hidden">
        <NextEventCard event={nextEvent} />
        <MetricCard label="Projected P/L" value={money(aggregate.projectedNet)} detail="Projected revenue - estimated expenses" />
        <MetricCard
          label="Actual / entered P/L"
          value={money(aggregate.actualNet)}
          detail={actualsDetail(aggregate)}
        />
        <MetricCard label="Overdue tasks" value="-" detail="No task tracking enabled yet." muted />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] print:hidden">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{formatMonthLabel(currentMonth)}</CardTitle>
              <p className="text-sm text-muted-foreground">Click a date to review events.</p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={dashboardHref({ month: addMonths(currentMonth, -1) })}>Previous</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={dashboardHref({ month: addMonths(currentMonth, 1) })}>Next</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {weekdayLabels.map((label) => <div key={label} className="py-2">{label}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dayEvents = eventsByDate.get(day.iso) ?? [];
                const isSelected = day.iso === selectedDate;
                const isToday = day.iso === today;

                return (
                  <Link
                    key={day.iso}
                    href={dashboardHref({ date: day.iso, month: currentMonth })}
                    className={[
                      "min-h-24 rounded-md border p-2 text-left transition hover:bg-muted/60",
                      day.inMonth ? "bg-card" : "bg-muted/20 text-muted-foreground",
                      isSelected ? "border-primary bg-primary/10" : "",
                      isToday ? "ring-1 ring-primary/60" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium">{day.dayOfMonth}</span>
                      {dayEvents.length > 0 ? <span className="size-2 rounded-full bg-primary" /> : null}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div key={event.id} className="truncate rounded bg-muted px-1.5 py-1 text-xs text-foreground">
                          {event.name}
                        </div>
                      ))}
                      {dayEvents.length > 2 ? (
                        <div className="text-xs text-muted-foreground">+{dayEvents.length - 2} more</div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <SelectedDatePanel date={selectedDate} events={selectedEvents} canCreateEvents={canCreateEvents} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h2 className="text-lg font-semibold">Upcoming event financials</h2>
            <p className="text-sm text-muted-foreground">Projected and actual / entered totals from existing budget, revenue, and ticket tiers.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={dashboardHref({ month: currentMonth, date: selectedDate, upcoming: showUpcoming ? undefined : "1" })}>
                {showUpcoming ? "Hide upcoming events" : "Show all upcoming events"}
              </Link>
            </Button>
            {showUpcoming ? <PrintButton label="Print list" /> : null}
          </div>
        </div>

        {showUpcoming ? <UpcomingEventsTable events={upcomingEvents} /> : null}
      </section>
    </div>
  );
}

function NextEventCard({ event }: { event: DashboardEvent | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Next upcoming event</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {event ? (
          <>
            <Link href={`/dashboard/events/${event.id}`} className="block font-semibold hover:underline">{event.name}</Link>
            <p className="text-sm text-muted-foreground">{prettyDate(event.starts_on)} at {event.venues?.name ?? "TBD venue"}</p>
            <Badge>{titleize(event.status)}</Badge>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, detail, muted }: { label: string; value: string; detail: string; muted?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={muted ? "text-2xl font-semibold text-muted-foreground" : "text-2xl font-semibold"}>{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function SelectedDatePanel({
  date,
  events,
  canCreateEvents,
}: {
  date: string;
  events: DashboardEvent[];
  canCreateEvents: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{prettyDate(date)}</CardTitle>
        <p className="text-sm text-muted-foreground">Events on selected date</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No events scheduled for this date.</p>
        ) : (
          events.map((event) => (
            <Link key={event.id} href={`/dashboard/events/${event.id}`} className="block rounded-md border p-3 hover:bg-muted/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{event.name}</p>
                <Badge>{titleize(event.status)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{event.venues?.name ?? "TBD venue"}</p>
              <p className="mt-2 text-xs text-muted-foreground">Projected net {money(event.financials.projectedNet)}</p>
            </Link>
          ))
        )}
        {canCreateEvents ? (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/dashboard/events/new?date=${date}`}>Add event on this date</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UpcomingEventsTable({ events }: { events: DashboardEvent[] }) {
  return (
    <Card className="print-card">
      <CardHeader>
        <CardTitle>Upcoming event financials</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No upcoming events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 font-medium">Venue</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 text-right font-medium">Projected revenue</th>
                  <th className="py-2 pr-3 text-right font-medium">Estimated expenses</th>
                  <th className="py-2 pr-3 text-right font-medium">Projected net</th>
                  <th className="py-2 pr-3 text-right font-medium">Actual / entered revenue</th>
                  <th className="py-2 pr-3 text-right font-medium">Actual / paid expenses</th>
                  <th className="py-2 text-right font-medium">Actual / entered net</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="py-2 pr-3">{prettyDate(event.starts_on)}</td>
                    <td className="py-2 pr-3"><Link href={`/dashboard/events/${event.id}`} className="font-medium hover:underline">{event.name}</Link></td>
                    <td className="py-2 pr-3 text-muted-foreground">{event.venues?.name ?? "TBD venue"}</td>
                    <td className="py-2 pr-3">{titleize(event.status)}</td>
                    <MoneyCell value={event.financials.projectedRevenue} />
                    <MoneyCell value={event.financials.estimatedExpenses} />
                    <MoneyCell value={event.financials.projectedNet} strong />
                    <MoneyCell value={event.financials.actualRevenue} />
                    <MoneyCell value={event.financials.actualExpenses} />
                    <MoneyCell value={event.financials.actualNet} strong />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Actual / entered totals include only actual or received values entered so far. Blank actual fields are not treated as confirmed zeroes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoneyCell({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <td className={strong ? "py-2 pr-3 text-right font-mono font-semibold" : "py-2 pr-3 text-right font-mono"}>
      {money(value)}
    </td>
  );
}

function sumProfitLoss(events: DashboardEvent[]): EventProfitLoss {
  return events.reduce(
    (total, event) => ({
      projectedRevenue: total.projectedRevenue + event.financials.projectedRevenue,
      estimatedExpenses: total.estimatedExpenses + event.financials.estimatedExpenses,
      projectedNet: total.projectedNet + event.financials.projectedNet,
      actualRevenue: total.actualRevenue + event.financials.actualRevenue,
      actualExpenses: total.actualExpenses + event.financials.actualExpenses,
      actualNet: total.actualNet + event.financials.actualNet,
      missingActualRevenueCount: total.missingActualRevenueCount + event.financials.missingActualRevenueCount,
      missingActualExpenseCount: total.missingActualExpenseCount + event.financials.missingActualExpenseCount,
    }),
    {
      projectedRevenue: 0,
      estimatedExpenses: 0,
      projectedNet: 0,
      actualRevenue: 0,
      actualExpenses: 0,
      actualNet: 0,
      missingActualRevenueCount: 0,
      missingActualExpenseCount: 0,
    },
  );
}

function actualsDetail(financials: EventProfitLoss) {
  const missing = financials.missingActualExpenseCount + financials.missingActualRevenueCount;
  return missing > 0
    ? `Actual / entered values. ${missing} blank actual fields are not confirmed zeroes.`
    : "Actual received revenue - actual / paid expenses";
}

function groupEventsByDate(events: DashboardEvent[]) {
  const grouped = new Map<string, DashboardEvent[]>();

  for (const event of events) {
    for (const date of eventDateRange(event)) {
      const existing = grouped.get(date) ?? [];
      existing.push(event);
      grouped.set(date, existing);
    }
  }

  return grouped;
}

function eventDateRange(event: DashboardEvent) {
  const start = parseIsoDate(event.starts_on);
  const end = event.ends_on ? parseIsoDate(event.ends_on) : start;
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function buildCalendarDays(month: string) {
  const first = parseIsoDate(`${month}-01`);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = toIsoDate(date);
    days.push({
      iso,
      dayOfMonth: date.getDate(),
      inMonth: iso.startsWith(month),
    });
  }

  return days;
}

function dashboardHref(params: { date?: string; month?: string; upcoming?: string }) {
  const searchParams = new URLSearchParams();
  if (params.month) searchParams.set("month", params.month);
  if (params.date) searchParams.set("date", params.date);
  if (params.upcoming) searchParams.set("upcoming", params.upcoming);
  const query = searchParams.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(parseIsoDate(`${month}-01`));
}

function addMonths(month: string, amount: number) {
  const date = parseIsoDate(`${month}-01`);
  date.setMonth(date.getMonth() + amount);
  return toIsoDate(date).slice(0, 7);
}

function getDefaultSelectedDate(month: string, today: string) {
  return today.startsWith(month) ? today : `${month}-01`;
}

function parseMonth(value: string | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
