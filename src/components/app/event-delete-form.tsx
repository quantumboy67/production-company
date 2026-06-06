"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteEvent } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function EventDeleteForm({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setIsOpen(true)} data-testid="event-delete-open">
        Delete
      </Button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <form
            action={deleteEvent}
            aria-modal="true"
            className="w-full max-w-md rounded-md border bg-background p-5 shadow-lg"
            role="dialog"
            data-testid="event-delete-confirm-dialog"
          >
            <input type="hidden" name="id" value={eventId} />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Delete event?</h2>
              <p className="text-sm text-muted-foreground">
                This will delete <span className="font-medium text-foreground">{eventName}</span> and cascade-delete its event financial records, ticket tiers,
                settlement, tasks, run of show items, contracts, sponsorships, and file metadata. This cannot be
                undone.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <DeleteSubmitButton />
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function DeleteSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting..." : "Delete event"}
    </Button>
  );
}
