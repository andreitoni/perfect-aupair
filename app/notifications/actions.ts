"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type MarkSystemNotificationReadResult = {
  ok: boolean;
  error?: string;
};

export type SocialMediaConsentResponse = "accepted" | "declined";

export async function markSystemNotificationRead(
  notificationId: string,
): Promise<MarkSystemNotificationReadResult> {
  const normalizedNotificationId = notificationId.trim();

  if (!normalizedNotificationId) {
    return { ok: false, error: "Missing notification id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("system_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", normalizedNotificationId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function respondToSocialMediaConsentNotification(
  notificationId: string,
  response: SocialMediaConsentResponse,
): Promise<MarkSystemNotificationReadResult> {
  const normalizedNotificationId = notificationId.trim();

  if (
    !normalizedNotificationId ||
    (response !== "accepted" && response !== "declined")
  ) {
    return { ok: false, error: "Invalid social media consent response." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { data: notification, error: notificationError } = await supabase
    .from("system_notifications")
    .select("id")
    .eq("id", normalizedNotificationId)
    .eq("recipient_id", user.id)
    .eq("type", "social_media_consent_request")
    .maybeSingle<{ id: string }>();

  if (notificationError || !notification) {
    return {
      ok: false,
      error: notificationError?.message ?? "Notification not found.",
    };
  }

  const { data: updatedProfile, error: consentError } = await supabase
    .from("profiles")
    .update({ social_media_consent_status: response })
    .eq("id", user.id)
    .in("account_type", ["au_pair", "family"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (consentError || !updatedProfile) {
    return {
      ok: false,
      error:
        consentError?.message ??
        "Consent is only available to au pair and family profiles.",
    };
  }

  const admin = createAdminClient();
  const { error: readError } = await admin
    .from("system_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", normalizedNotificationId)
    .eq("recipient_id", user.id);

  if (readError) {
    return { ok: false, error: readError.message };
  }

  return { ok: true };
}
