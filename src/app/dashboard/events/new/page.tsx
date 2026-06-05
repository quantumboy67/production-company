import { EventForm } from "@/components/app/event-form";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const { date, error } = await searchParams;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Event</h1>
        <p className="text-sm text-muted-foreground">Create the shell for a show, then add budget and revenue detail.</p>
      </div>
      <EventForm error={error} defaultStartDate={isIsoDate(date) ? date : undefined} />
    </div>
  );
}

function isIsoDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
