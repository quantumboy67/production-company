import {
  forceMemberPasswordChange,
  inviteUser,
  removeMember,
  updateMemberRole,
} from "@/app/actions";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listTeamMembers } from "@/lib/data/team";
import { prettyDate, titleize } from "@/lib/format";
import { canManageUsers, getProfile } from "@/lib/supabase/auth";

const inviteRoles = ["admin", "producer", "viewer"] as const;

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const profile = await getProfile();

  if (!canManageUsers(profile.membership.role)) {
    redirect("/dashboard");
  }

  const [members, params] = await Promise.all([listTeamMembers(), searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Invite users and manage access for this organization.</p>
      </div>

      {params.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {params.error}
        </p>
      ) : null}
      {params.success ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
          {params.success}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Invite User</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={inviteUser} className="grid gap-3 md:grid-cols-6">
            <Field label="Email" className="md:col-span-2">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Full name" className="md:col-span-2">
              <Input name="full_name" required />
            </Field>
            <Field label="Role">
              <select name="role" defaultValue="viewer" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {inviteRoles.map((role) => <option key={role} value={role}>{titleize(role)}</option>)}
              </select>
            </Field>
            <Field label="Temporary password">
              <Input name="temporary_password" type="password" required />
            </Field>
            <div className="md:col-span-6">
              <Button type="submit">Invite user</Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Email is not sent automatically yet. Share the username and temporary password directly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Password</TH>
                <TH>Invited</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((member) => (
                <TR key={member.id}>
                  <TD className="font-medium">{member.profiles?.full_name ?? "Unnamed user"}</TD>
                  <TD>{member.profiles?.email ?? member.profile_id}</TD>
                  <TD><Badge>{titleize(member.role)}</Badge></TD>
                  <TD><Badge>{titleize(member.status)}</Badge></TD>
                  <TD>{member.must_change_password ? "Required" : "Current"}</TD>
                  <TD>{member.invited_at ? prettyDate(member.invited_at.slice(0, 10)) : "Unknown"}</TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-2">
                      {member.role === "owner" ? null : (
                        <form action={updateMemberRole} className="flex gap-2">
                          <input type="hidden" name="member_id" value={member.id} />
                          <select name="role" defaultValue={member.role} className="h-8 rounded-md border bg-background px-2 text-xs">
                            {inviteRoles.map((role) => <option key={role} value={role}>{titleize(role)}</option>)}
                          </select>
                          <Button type="submit" variant="secondary" size="sm">Save role</Button>
                        </form>
                      )}
                      <form action={forceMemberPasswordChange}>
                        <input type="hidden" name="member_id" value={member.id} />
                        <Button type="submit" variant="outline" size="sm">Force reset</Button>
                      </form>
                      <form action={removeMember}>
                        <input type="hidden" name="member_id" value={member.id} />
                        <Button type="submit" variant="destructive" size="sm">Remove</Button>
                      </form>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
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
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
