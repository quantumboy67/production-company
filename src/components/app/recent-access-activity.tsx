import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { titleize } from "@/lib/format";
import type { AuthActivityRecord } from "@/lib/types";

export function RecentAccessActivity({ activity }: { activity: AuthActivityRecord[] }) {
  return (
    <Card data-testid="recent-access-activity">
      <CardHeader>
        <CardTitle>Recent Access Activity</CardTitle>
        <p className="text-sm text-muted-foreground">
          Latest account access and team lifecycle events for this organization.
        </p>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No account activity has been logged yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>User</TH>
                  <TH>Event</TH>
                  <TH>Description</TH>
                </TR>
              </THead>
              <TBody>
                {activity.map((item) => (
                  <TR key={item.id}>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatTimestamp(item.created_at)}</TD>
                    <TD>{item.email ?? item.profile_id ?? "Unknown user"}</TD>
                    <TD><Badge>{formatAuthEvent(item.event_type)}</Badge></TD>
                    <TD className="min-w-[18rem] text-sm">{item.summary}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatAuthEvent(eventType: string) {
  const labels: Record<string, string> = {
    "user.invited": "Invited",
    "user.login": "Login",
    "user.logout": "Logout",
    "user.first_login_completed": "First login completed",
    "user.password_changed": "Password changed",
    "user.password_change_required": "Password change required",
    "user.role_changed": "Role changed",
    "user.removed": "Removed",
    "user.reactivated": "Reactivated",
  };

  return labels[eventType] ?? titleize(eventType.replace(/[._]/g, " "));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
