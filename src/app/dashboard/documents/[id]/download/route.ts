import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: document, error } = await supabase
    .from("budget_item_documents")
    .select("id, organization_id, storage_bucket, storage_path, file_name, deleted_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !document) {
    notFound();
  }

  const admin = createAdminClient();
  const { data, error: signedUrlError } = await admin.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60, {
      download: document.file_name,
    });

  if (signedUrlError || !data?.signedUrl) {
    notFound();
  }

  redirect(data.signedUrl);
}
