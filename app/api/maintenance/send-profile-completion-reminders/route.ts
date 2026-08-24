import { NextResponse, type NextRequest } from "next/server";
import { sendPendingProfileCompletionReminders } from "@/lib/email/send-profile-completion-reminders";
import { runMonitoredCronJob } from "@/lib/monitoring/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return sendProfileCompletionReminders(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const profileId =
    payload &&
    typeof payload === "object" &&
    "profileId" in payload &&
    typeof payload.profileId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.profileId,
    )
      ? payload.profileId
      : undefined;

  if (!profileId) {
    return NextResponse.json({ error: "Invalid profile ID." }, { status: 400 });
  }

  return sendProfileCompletionReminders(request, profileId);
}

async function sendProfileCompletionReminders(
  request: NextRequest,
  forceProfileId?: string,
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitoredCronJob(
      "send-profile-completion-reminders",
      async () => {
        const supabase = createAdminClient();
        const result = await sendPendingProfileCompletionReminders({
          supabase,
          batchSize: 25,
          forceProfileId,
        });

        if (result.retryableFailures > 0) {
          throw new Error(
            `Profile completion reminders finished with ${result.retryableFailures} retryable failure(s).`,
          );
        }

        return result;
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not send profile completion reminders", error);

    return NextResponse.json(
      { error: "Could not send profile completion reminders." },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const secrets = [
    process.env.PROFILE_COMPLETION_REMINDER_SECRET,
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
