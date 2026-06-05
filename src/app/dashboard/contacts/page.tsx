import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-sm text-muted-foreground">Booking agents, tour managers, sponsors, vendors, security, production, and hospitality contacts.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Directory CRUD is scaffolded for the next MVP phase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
