import { NextResponse } from "next/server";
import {
  loadBoundedPublicProfileCards,
  reservePublicCatalogRequest,
  type PublicCatalogAccountType,
} from "@/lib/profile/public-catalog";
import { createClient } from "@/lib/supabase/server";

type ViewerProfile = {
  account_type: PublicCatalogAccountType | null;
  onboarding_completed: boolean | null;
  suspended_at: string | null;
  deletion_requested_at: string | null;
  is_admin: boolean | null;
};

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { ...RESPONSE_HEADERS, ...headers },
  });
}

export async function GET(request: Request) {
  if (request.url.length > 2_048) {
    return json({ error: "Invalid filters" }, 400);
  }

  const url = new URL(request.url);
  const requestedTarget = url.searchParams.get("target");

  if (requestedTarget !== "au_pair" && requestedTarget !== "family") {
    return json({ error: "Invalid target" }, 400);
  }

  const budget = await reservePublicCatalogRequest("count");
  if (!budget.allowed) {
    const status = budget.unavailable ? 503 : 429;
    return json(
      { error: budget.unavailable ? "Search unavailable" : "Too many requests" },
      status,
      { "Retry-After": String(Math.max(1, budget.retryAfterSeconds)) },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: viewer } = await supabase
      .from("profiles")
      .select(
        "account_type, onboarding_completed, suspended_at, deletion_requested_at, is_admin",
      )
      .eq("id", user.id)
      .maybeSingle<ViewerProfile>();
    const allowedTarget =
      viewer?.account_type === "family"
        ? "au_pair"
        : viewer?.account_type === "au_pair"
          ? "family"
          : null;

    if (
      !viewer?.onboarding_completed ||
      viewer.suspended_at ||
      viewer.deletion_requested_at ||
      viewer.is_admin ||
      requestedTarget !== allowedTarget
    ) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  const filters = Object.fromEntries(url.searchParams.entries());
  delete filters.target;
  const result = await loadBoundedPublicProfileCards({
    accountType: requestedTarget,
    filters,
    viewerId: user?.id ?? null,
    page: 1,
    pageSize: 12,
    includeCountries: false,
  });

  if (result.error) {
    return json({ error: "Search unavailable" }, 503);
  }

  return json({
    count: result.totalItems,
    capped: result.totalIsCapped,
  });
}
