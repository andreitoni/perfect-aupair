import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin/access";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return triggerSentryTestEvent(request);
}

export async function POST(request: NextRequest) {
  return triggerSentryTestEvent(request);
}

async function triggerSentryTestEvent(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const error = new Error("Perfect AuPair Sentry test event");
  error.name = "PerfectAuPairSentryTestError";

  const eventId = Sentry.captureException(error, {
    tags: {
      debug_route: "/api/debug/sentry",
      requested_method: request.method,
    },
    extra: {
      triggeredAt: new Date().toISOString(),
      userAgent: request.headers.get("user-agent"),
    },
  });

  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    eventId,
    dsnConfigured: Boolean(
      process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    ),
    message: "Sentry test event captured.",
  });
}

async function isAuthorized(request: NextRequest) {
  if (isAuthorizedBySecret(request)) {
    return true;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return isAdminEmail(user?.email);
}

function isAuthorizedBySecret(request: NextRequest) {
  const secret =
    process.env.SENTRY_TEST_SECRET ??
    process.env.CRON_SECRET ??
    process.env.MAINTENANCE_BYPASS_SECRET;

  if (!secret) {
    return false;
  }

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-debug-secret") === secret
  );
}
