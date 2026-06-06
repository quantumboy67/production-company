import {
  forceMemberPasswordChange,
  removeMember,
  updateMemberRole,
} from "@/app/actions";
import { redirect } from "next/navigation";
import { TeamInviteForm } from "@/components/app/team-invite-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listTeamMembers, type TeamMember } from "@/lib/data/team";
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
  const activeMembers = members.filter((member) => member.status === "active");
  const inactiveMembers = members.filter((member) => member.status !== "active");

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
          <TeamInviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Members</CardTitle>
        </CardHeader>
        <CardContent>
          {activeMembers.length > 0 ? (
            <MembersTable members={activeMembers} showActions />
          ) : (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No active members yet.
            </p>
          )}
        </CardContent>
      </Card>

      {inactiveMembers.length > 0 ? (
        <details className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-base font-semibold">
            Show inactive members ({inactiveMembers.length})
          </summary>
          <div className="space-y-3 px-5 pb-5">
            <p className="text-sm text-muted-foreground">
              Removed and disabled members are shown for reference only. Reactivate by inviting the user again.
            </p>
            <MembersTable members={inactiveMembers} showActions={false} showDeactivatedAt />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function MembersTable({
  members,
  showActions,
  showDeactivatedAt = false,
}: {
  members: TeamMember[];
  showActions: boolean;
  showDeactivatedAt?: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Name</TH>
          <TH>Email</TH>
          <TH>Role</TH>
          <TH>Status</TH>
          <TH>Password</TH>
          <TH>Invited</TH>
          {showDeactivatedAt ? <TH>Deactivated</TH> : null}
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
            {showDeactivatedAt ? (
              <TD>{member.deactivated_at ? prettyDate(member.deactivated_at.slice(0, 10)) : "Unknown"}</TD>
            ) : null}
            <TD>
              {showActions ? (
                <MemberActions member={member} />
              ) : (
                <p className="text-right text-xs text-muted-foreground">Read-only</p>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function MemberActions({ member }: { member: TeamMember }) {
  if (member.status !== "active") {
    return <p className="text-right text-xs text-muted-foreground">Read-only</p>;
  }

  return (
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
      {member.role === "owner" ? (
        <span className="self-center text-xs text-muted-foreground">Owner protected</span>
      ) : (
        <form action={removeMember}>
          <input type="hidden" name="member_id" value={member.id} />
          <Button type="submit" variant="destructive" size="sm">Remove</Button>
        </form>
      )}
    </div>
  );
}
