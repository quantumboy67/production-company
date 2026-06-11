import { updateInviteRequestStatus } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prettyDate, titleize } from "@/lib/format";
import type { InviteRequestRecord, InviteRequestStatus } from "@/lib/types";

const reviewStatuses: Array<Exclude<InviteRequestStatus, "pending" | "invited">> = ["reviewed", "declined", "spam"];

export function InvitationRequests({ requests }: { requests: InviteRequestRecord[] }) {
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const recentReviewed = requests.filter((request) => request.status !== "pending").slice(0, 5);

  return (
    <Card data-testid="invitation-requests">
      <CardHeader>
        <CardTitle>Invitation Requests</CardTitle>
        <p className="text-sm text-muted-foreground">
          Requests from people who reached the login page. These do not create accounts or send invitations automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingRequests.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No pending invitation requests.
          </p>
        ) : (
          <InviteRequestTable requests={pendingRequests} showActions />
        )}

        {recentReviewed.length > 0 ? (
          <details className="rounded-md border bg-muted/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">Recent reviewed requests ({recentReviewed.length})</summary>
            <div className="mt-3">
              <InviteRequestTable requests={recentReviewed} showActions={false} />
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InviteRequestTable({ requests, showActions }: { requests: InviteRequestRecord[]; showActions: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Company</TH>
            <TH>Message</TH>
            <TH>Created</TH>
            <TH>Status</TH>
            {showActions ? <TH className="text-right">Actions</TH> : null}
          </TR>
        </THead>
        <TBody>
          {requests.map((request) => (
            <TR key={request.id}>
              <TD className="font-medium">{request.full_name}</TD>
              <TD>{request.email}</TD>
              <TD>{request.company ?? "Not provided"}</TD>
              <TD className="max-w-xs whitespace-normal text-sm text-muted-foreground">{request.message ?? "Not provided"}</TD>
              <TD>{prettyDate(request.created_at.slice(0, 10))}</TD>
              <TD><Badge>{titleize(request.status)}</Badge></TD>
              {showActions ? (
                <TD>
                  <div className="flex flex-wrap justify-end gap-2">
                    {reviewStatuses.map((status) => (
                      <form key={status} action={updateInviteRequestStatus}>
                        <input type="hidden" name="id" value={request.id} />
                        <input type="hidden" name="status" value={status} />
                        <Button type="submit" variant={status === "spam" ? "destructive" : "outline"} size="sm">
                          {status === "spam" ? "Spam" : titleize(status)}
                        </Button>
                      </form>
                    ))}
                  </div>
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
