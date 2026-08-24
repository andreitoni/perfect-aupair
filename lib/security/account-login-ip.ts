import "server-only";

import { isIP } from "node:net";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTrustedClientIp } from "@/lib/security/request";

type AuthMethod = "password" | "google" | "facebook";

export async function recordAccountLoginIp({
  profileId,
  request,
  authMethod,
}: {
  profileId: string;
  request: Request;
  authMethod: AuthMethod;
}) {
  const ipAddress = getTrustedClientIp(request.headers);

  if (!isIP(ipAddress)) {
    return;
  }

  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient.rpc("record_account_login_ip", {
      p_profile_id: profileId,
      p_ip_address: ipAddress,
      p_auth_method: authMethod,
    });

    if (error) {
      console.error("Failed to record account login IP", error.message);
    }
  } catch (error) {
    console.error(
      "Failed to record account login IP",
      error instanceof Error ? error.message : error,
    );
  }
}
