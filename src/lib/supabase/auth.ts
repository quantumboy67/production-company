import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireUser() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getProfile() {
  const profile = await getOptionalProfile();

  if (!profile?.organization_id) {
    redirect("/onboarding");
  }

  return profile;
}

export async function getOptionalProfile() {
  const supabase = await createClient();
  const user = await requireUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
