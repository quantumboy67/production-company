"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { inviteUser } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { titleize } from "@/lib/format";

const inviteRoles = ["admin", "producer", "viewer"] as const;

const roleDescriptions = {
  owner: "Full organization control",
  admin: "Manages users and event operations except Owner protections",
  producer: "Edits events and financials",
  viewer: "Read-only access",
};

export function TeamInviteForm() {
  const [role, setRole] = useState<(typeof inviteRoles)[number]>("viewer");
  const isAdminInvite = role === "admin";

  return (
    <div className="space-y-4">
      <form action={inviteUser} className="grid gap-3 md:grid-cols-6">
        <Field label="Email" className="md:col-span-2">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Full name" className="md:col-span-2">
          <Input name="full_name" required />
        </Field>
        <Field label="Role">
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as (typeof inviteRoles)[number])}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {inviteRoles.map((inviteRole) => (
              <option key={inviteRole} value={inviteRole}>
                {titleize(inviteRole)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Temporary password">
          <Input name="temporary_password" type="password" required />
        </Field>

        {isAdminInvite ? (
          <div className="md:col-span-6 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium">Admin access warning</p>
            <p className="mt-1 text-muted-foreground">
              Admins can manage users and modify events/financials, but cannot remove Owners.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input name="confirm_admin" value="true" type="checkbox" required className="mt-1" />
              <span>I understand this user will have Admin access.</span>
            </label>
          </div>
        ) : null}

        <div className="md:col-span-6">
          <Button type="submit">Invite user</Button>
        </div>
      </form>

      <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
        {Object.entries(roleDescriptions).map(([roleName, description]) => (
          <div key={roleName} className="rounded-md border bg-muted/20 p-2">
            <span className="font-medium text-foreground">{titleize(roleName)}</span>
            <p className="mt-1">{description}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Email is not sent automatically yet. Send the temporary password privately. The user will be required to
        create a new password on first login.
      </p>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
