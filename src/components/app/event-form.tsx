import { createEvent, updateEvent } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventRecord } from "@/lib/types";

type Props = {
  event?: EventRecord;
  error?: string;
  defaultStartDate?: string;
};

export function EventForm({ event, error, defaultStartDate }: Props) {
  const action = event ? updateEvent : createEvent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{event ? "Edit Event" : "Create Event"}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <form action={action} className="grid gap-4 md:grid-cols-2">
          {event ? <input type="hidden" name="id" value={event.id} /> : null}
          <div className="md:col-span-2">
            <Label htmlFor="name">Event name</Label>
            <Input id="name" name="name" defaultValue={event?.name} required />
          </div>
          <div>
            <Label htmlFor="starts_on">Start date</Label>
            <Input id="starts_on" name="starts_on" type="date" defaultValue={event?.starts_on ?? defaultStartDate} required />
          </div>
          <div>
            <Label htmlFor="ends_on">End date</Label>
            <Input id="ends_on" name="ends_on" type="date" defaultValue={event?.ends_on ?? ""} />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={event?.status ?? "planning"}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="planning">Planning</option>
              <option value="confirmed">Confirmed</option>
              <option value="active">Active</option>
              <option value="settled">Settled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <Label htmlFor="capacity">Capacity</Label>
            <Input id="capacity" name="capacity" type="number" min="0" defaultValue={event?.capacity ?? ""} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={event?.notes ?? ""} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">{event ? "Save event" : "Create event"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
