import { NextResponse, type NextRequest } from "next/server";
import { sendPendingMessageDigests } from "@/lib/email/send-message-digests";
import { runMonitoredCronJob } from "@/lib/monitoring/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitoredCronJob(
      "send-message-digests",
      async () => {
        const result = await sendPendingMessageDigests({
          supabase: createAdminClient(),
        });

        if (result.retryableFailures > 0) {
          throw new Error(
            `Message digests finished with ${result.retryableFailures} retryable failure(s).`,
          );
        }

        return result;
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not send message digests", error);
    return NextResponse.json(
      { error: "Could not send message digests." },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const secrets = [
    process.env.MESSAGE_DIGEST_SECRET,
    process.env.CRON_SECRET,
  ].filter((secret): secret is string => Boolean(secret));

  if (secrets.length === 0) return false;

  const authorization = request.headers.get("authorization");
  const maintenanceSecret = request.headers.get("x-maintenance-secret");

  return secrets.some(
    (secret) =>
      authorization === `Bearer ${secret}` || maintenanceSecret === secret,
  );
}
