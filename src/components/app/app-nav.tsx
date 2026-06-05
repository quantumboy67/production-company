import Link from "next/link";
import Image from "next/image";
import { ContactRound, LayoutDashboard, MapPin, Music2, Settings } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/events", label: "Events", icon: Music2 },
  { href: "/dashboard/contacts", label: "Contacts", icon: ContactRound },
  { href: "/dashboard/venues", label: "Venues", icon: MapPin },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
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
        {items.map((item) => (
          <Button key={item.href} asChild variant="ghost" className="justify-start">
            <Link href={item.href}>
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </Button>
        ))}
      </nav>
      <form action={signOut} className="mt-auto">
        <Button type="submit" variant="outline" className="w-full justify-start">
          Sign out
        </Button>
      </form>
    </aside>
  );
}
