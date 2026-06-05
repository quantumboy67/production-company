import { AppNav } from "@/components/app/app-nav";
import { getProfile } from "@/lib/supabase/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await getProfile();

  return (
    <div className="grid min-h-screen lg:grid-cols-[256px_1fr]">
      <AppNav />
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
