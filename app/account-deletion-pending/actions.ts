"use server";

import type { AccountDeletionCancellationRpcResult } from "@/lib/privacy/account-deletion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function revalidatePublicProfileSurfaces(profileId: string, publicSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/profile/${profileId}`);

  if (publicSlug) {
    revalidatePath(`/profile/${publicSlug}`);
  }
}

export async function reactivateAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?mode=login");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cancel_account_deletion", {
    p_profile_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  const cancellation = data as AccountDeletionCancellationRpcResult | null;

  if (!cancellation) {
    throw new Error("Could not reactivate the account.");
  }

  revalidatePath("/account-deletion-pending");
  revalidatePath("/account");
  revalidatePublicProfileSurfaces(user.id, cancellation.public_slug);
  redirect("/auth/home");
}
