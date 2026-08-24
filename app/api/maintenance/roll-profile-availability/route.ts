import { NextResponse, type NextRequest } from "next/server";
import { runMonitoredCronJob } from "@/lib/monitoring/cron";
import { rollProfileAvailabilityWindows } from "@/lib/profiles/roll-profile-availability";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return rollAvailability(request);
}

export async function POST(request: NextRequest) {
  return rollAvailability(request);
}

async function rollAvailability(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitoredCronJob(
      "roll-profile-availability",
      async () => {
        const supabase = createAdminClient();

        return rollProfileAvailabilityWindows({ supabase });
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not roll profile availability windows", error);

    return NextResponse.json(
      { error: "Could not roll profile availability windows." },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const secret =
    process.env.PROFILE_AVAILABILITY_ROLL_SECRET ?? process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-maintenance-secret") === secret
  );
}
