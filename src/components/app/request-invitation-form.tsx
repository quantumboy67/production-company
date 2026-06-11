"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitInviteRequest, type InviteRequestFormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: InviteRequestFormState = {
  ok: false,
  message: null,
  error: null,
};

export function RequestInvitationForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(submitInviteRequest, initialState);

  return (
    <div className="mt-5 border-t pt-4">
      {!isOpen ? (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setIsOpen(true)}>
          Request an invitation
        </Button>
      ) : (
        <form action={formAction} className="space-y-3" data-testid="invite-request-form">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <Field label="Full name">
            <Input name="full_name" autoComplete="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Company / affiliation">
            <Input name="company" autoComplete="organization" />
          </Field>
          <Field label="Reason / message">
            <Textarea name="message" rows={3} maxLength={1000} />
          </Field>
          {state.error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.message ? (
            <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground" data-testid="invite-request-success">
              {state.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <InviteRequestSubmitButton />
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function InviteRequestSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending..." : "Send request"}
    </Button>
  );
}
