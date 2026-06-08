import Image from "next/image";
import { signIn } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Image
            src="/juniper-berry-logo.png?v=sprig-20260607"
            alt="Juniper Berry Productions logo"
            width={1016}
            height={290}
            priority
            unoptimized
            className="h-auto w-full max-w-sm rounded-md"
          />
          <CardTitle className="sr-only">Juniper Berry Productions</CardTitle>
          <CardDescription>Event production command center</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error === "profile" ? "Your user needs a profile assigned to an organization." : error}
            </p>
          ) : null}
          <form action={signIn} className="space-y-4" data-testid="login-form">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
