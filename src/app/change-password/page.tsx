import { redirect } from "next/navigation";
import { changePassword, signOut } from "@/app/actions";
import { PendingSubmitButton } from "@/components/app/pending-submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getActiveMembership, requireUser } from "@/lib/supabase/auth";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const membership = await getActiveMembership({ allowPasswordChange: true });
  const { error } = await searchParams;

  if (!membership) {
    redirect("/onboarding");
  }

  if (!membership.must_change_password) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create a New Password</CardTitle>
          <CardDescription>
            Your temporary password worked. Create a new password before entering the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <form action={changePassword} className="space-y-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </div>
            <div>
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required />
            </div>
            <PendingSubmitButton idleLabel="Save password" pendingLabel="Saving..." />
          </form>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
