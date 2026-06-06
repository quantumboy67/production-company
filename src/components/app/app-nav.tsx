import Link from "next/link";
import Image from "next/image";
import { ClipboardCheck, Contact, LayoutDashboard, Music2, ReceiptText, Settings, Users } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { canManageUsers } from "@/lib/supabase/auth";
import type { OrganizationRole } from "@/lib/types";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/events", label: "Events", icon: Music2 },
  { href: "/dashboard/team", label: "My Team", icon: Users },
];

const comingSoonItems = [
  { label: "My Contacts", icon: Contact },
  { label: "Receipts & Invoices", icon: ReceiptText },
  { label: "My Auditor", icon: ClipboardCheck },
];

export function AppNav({ role }: { role: OrganizationRole }) {
  const visibleItems = canManageUsers(role)
    ? [...items, { href: "/dashboard/settings/team", label: "Settings", icon: Settings }]
    : items;

  return (
    <aside className="flex min-h-screen w-full flex-col border-r bg-card/40 px-3 py-4 lg:w-64">
      <Link href="/dashboard" className="mb-6 block px-2" aria-label="Juniper Berry Production Company dashboard">
        <Image
          src="/juniper-berry-logo.png"
          alt="Juniper Berry Production Company"
          width={1016}
          height={290}
          priority
          className="h-auto w-full max-w-[13rem] rounded-md"
        />
      </Link>
      <nav className="grid gap-1">
        {visibleItems.map((item) => (
          <Button key={item.href} asChild variant="ghost" className="justify-start">
            <Link href={item.href}>
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </Button>
        ))}
      </nav>
      <div className="mt-5 border-t pt-4">
        <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Coming soon</p>
        <div className="mt-2 grid gap-1">
          {comingSoonItems.map((item) => (
            <div
              key={item.label}
              className="flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground opacity-80"
              aria-disabled="true"
            >
              <item.icon className="size-4" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        Beta focus: event budgets, revenue, ticket tiers, and settlement tracking.
      </div>
      <div className="mt-auto space-y-3">
        <p className="px-2 text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Giant Juniper LLC</p>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full justify-start">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
