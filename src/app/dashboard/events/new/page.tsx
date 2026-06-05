import { EventForm } from "@/components/app/event-form";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Event</h1>
        <p className="text-sm text-muted-foreground">Create the shell for a show, then add budget and revenue detail.</p>
      </div>
      <EventForm error={error} />
    </div>
  );
}
