"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { removeMember } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function MemberRemoveForm({ memberId, label }: { memberId: string; label: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={() => setIsOpen(true)} data-testid={`member-remove-open-${memberId}`} aria-label={`Remove ${label}`}>
        Remove
      </Button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <form
            action={removeMember}
            aria-modal="true"
            className="w-full max-w-md rounded-md border bg-background p-5 shadow-lg"
            role="dialog"
            data-testid="member-remove-confirm-dialog"
          >
            <input type="hidden" name="member_id" value={memberId} />
            <input type="hidden" name="confirm_intent" value="remove_member" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Remove team member?</h2>
              <p className="text-sm text-muted-foreground">
                This will remove {label} from active access. Owners remain protected, and the last active Owner cannot be removed.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} data-testid="member-remove-cancel">
                Cancel
              </Button>
              <RemoveSubmitButton />
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function RemoveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending} data-testid="member-remove-confirm">
      {pending ? "Removing..." : "Remove member"}
    </Button>
  );
}
