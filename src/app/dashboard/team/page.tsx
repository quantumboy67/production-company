import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listMyTeamMembers, type TeamMember } from "@/lib/data/team";
import { prettyDate, titleize } from "@/lib/format";
import { canManageUsers } from "@/lib/supabase/auth";
import type { OrganizationRole } from "@/lib/types";

const roleDescriptions: Record<OrganizationRole, string> = {
  owner: "Full organization control",
  admin: "Manages users and event operations except Owner protections",
  producer: "Edits events and financials",
  viewer: "Read-only access",
};

export default async function MyTeamPage() {
  const { activeMembers, inactiveMembers, currentRole } = await listMyTeamMembers();
  const canManage = canManageUsers(currentRole);
  const counts = getRoleCounts(activeMembers);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Team</h1>
          <p className="text-sm text-muted-foreground">
            People directly associated with Juniper Berry Production Company.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/dashboard/settings/team">Manage team</Link>
          </Button>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Active members" value={activeMembers.length} />
        <SummaryCard label="Owners" value={counts.owner} />
        <SummaryCard label="Admins" value={counts.admin} />
        <SummaryCard label="Producers" value={counts.producer} />
        <SummaryCard label="Viewers" value={counts.viewer} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Role Guide</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {(Object.keys(roleDescriptions) as OrganizationRole[]).map((role) => (
            <div key={role} className="rounded-md border bg-muted/20 p-3">
              <Badge>{titleize(role)}</Badge>
              <p className="mt-2 text-sm text-muted-foreground">{roleDescriptions[role]}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <MemberDirectory title="Active Members" members={activeMembers} showInactiveDates={false} />

      {canManage && inactiveMembers.length > 0 ? (
        <details className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-base font-semibold">
            Inactive Members ({inactiveMembers.length})
          </summary>
          <div className="px-5 pb-5">
            <MemberTable members={inactiveMembers} showInactiveDates />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function MemberDirectory({
  title,
  members,
  showInactiveDates,
}: {
  title: string;
  members: TeamMember[];
  showInactiveDates: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {members.length > 0 ? (
          <MemberTable members={members} showInactiveDates={showInactiveDates} />
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No team members to show yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MemberTable({
  members,
  showInactiveDates,
}: {
  members: TeamMember[];
  showInactiveDates: boolean;
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
          <TH>Joined</TH>
          {showInactiveDates ? <TH>Deactivated</TH> : null}
        </TR>
      </THead>
      <TBody>
        {members.map((member) => (
          <TR key={member.id}>
            <TD className="font-medium">{member.profiles?.full_name ?? "Unnamed user"}</TD>
            <TD>{member.profiles?.email ?? member.profile_id}</TD>
            <TD>
              <Badge>{titleize(member.role)}</Badge>
            </TD>
            <TD>
              <Badge>{titleize(member.status)}</Badge>
            </TD>
            <TD>{member.must_change_password ? "Change required" : "Current"}</TD>
            <TD>{formatNullableDate(member.invited_at)}</TD>
            <TD>{formatNullableDate(member.profiles_created_at ?? member.created_at)}</TD>
            {showInactiveDates ? <TD>{formatNullableDate(member.deactivated_at)}</TD> : null}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function getRoleCounts(members: TeamMember[]) {
  return members.reduce(
    (counts, member) => {
      counts[member.role] += 1;
      return counts;
    },
    { owner: 0, admin: 0, producer: 0, viewer: 0 } satisfies Record<OrganizationRole, number>,
  );
}

function formatNullableDate(value: string | null) {
  if (!value) return "Unknown";
  return prettyDate(value.slice(0, 10));
}
