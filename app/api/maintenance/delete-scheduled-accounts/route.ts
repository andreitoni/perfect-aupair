import { NextResponse, type NextRequest } from "next/server";
import { runMonitoredCronJob } from "@/lib/monitoring/cron";
import { cleanupScheduledAccountDeletions } from "@/lib/privacy/cleanup-scheduled-account-deletions";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return deleteScheduledAccounts(request);
}

export async function POST(request: NextRequest) {
  return deleteScheduledAccounts(request);
}

async function deleteScheduledAccounts(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitoredCronJob(
      "delete-scheduled-accounts",
      async () => {
        const supabase = createAdminClient();
        const result = await cleanupScheduledAccountDeletions({ supabase });

        if (result.failed > 0) {
          throw new Error(
            `Account deletion cleanup completed with ${result.failed} failed request(s).`,
          );
        }

        return result;
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not delete scheduled accounts", error);

    return NextResponse.json(
      { error: "Could not delete scheduled accounts." },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const secret =
    process.env.ACCOUNT_DELETION_CLEANUP_SECRET ?? process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-maintenance-secret") === secret
  );
}
