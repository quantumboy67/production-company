import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VenuesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Venues</h1>
        <p className="text-sm text-muted-foreground">Track addresses, capacities, contacts, and venue notes.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Venue CRUD is scaffolded for the next MVP phase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
