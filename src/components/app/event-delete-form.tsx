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
            <input type="hidden" name="confirm_intent" value="archive" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Archive event?</h2>
              <p className="text-sm text-muted-foreground">
                This will archive <span className="font-medium text-foreground">{eventName}</span> and remove it from active views. It can be restored by an Admin or Owner.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Reason optional</span>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  name="delete_reason"
                  placeholder="Why is this event being archived?"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} data-testid="event-archive-cancel">
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
    <Button type="submit" variant="destructive" disabled={pending} data-testid="event-archive-confirm">
      {pending ? "Archiving..." : "Archive event"}
    </Button>
  );
}
