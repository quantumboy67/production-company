import { redirect } from "next/navigation";
import { completeOnboarding, signOut } from "@/app/actions";
import { PendingSubmitButton } from "@/components/app/pending-submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMembership, getOptionalProfile, requireUser } from "@/lib/supabase/auth";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const profile = await getOptionalProfile();
  const membership = await getMembership();
  const { error } = await searchParams;

  if (membership?.status && membership.status !== "active") {
    redirect("/login?error=Your account is not active for this organization.");
  }

  if (profile?.organization_id && membership?.status === "active") {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set Up Your Workspace</CardTitle>
          <CardDescription>
            Create the first organization and attach it to your signed-in account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="text-muted-foreground">Signed in as</p>
            <p className="font-medium text-foreground">{user.email ?? user.id}</p>
          </div>
          <form action={completeOnboarding} className="space-y-4">
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} required />
            </div>
            <div>
              <Label htmlFor="organization_name">Organization name</Label>
              <Input id="organization_name" name="organization_name" placeholder="Juniper Berry Production Company" required />
            </div>
            <PendingSubmitButton idleLabel="Create workspace" pendingLabel="Creating..." />
          </form>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
