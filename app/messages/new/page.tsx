import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { profile } = await searchParams;

  if (!profile) {
    redirect("/messages");
  }

  redirect(`/messages?profile=${encodeURIComponent(profile)}`);
}
