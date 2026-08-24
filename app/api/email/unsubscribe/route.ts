import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set([
  "new_message",
  "profile_completion",
]);

function readRequest(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  const category =
    request.nextUrl.searchParams.get("category")?.trim() ?? "";

  return {
    token: UUID_PATTERN.test(token) ? token : null,
    category: CATEGORIES.has(category) ? category : null,
  };
}

function htmlResponse(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Email preferences</title></head><body style="margin:0;background:#f2f4f7;color:#172426;font-family:Arial,sans-serif"><main style="max-width:560px;margin:64px auto;padding:0 18px"><section style="border:1px solid #dce5ea;border-radius:24px;background:#fff;padding:28px"><div style="font-size:20px;font-weight:900;margin-bottom:18px">Perfect AuPair</div>${body}</section></main></body></html>`,
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const { token, category } = readRequest(request);

  if (!token || !category) {
    return htmlResponse(
      '<h1 style="font-size:26px;margin:0 0 12px">This link is not valid</h1><p style="line-height:1.6;color:#52666f">Open your account settings to manage email preferences.</p>',
      400,
    );
  }

  const action = `/api/email/unsubscribe?token=${encodeURIComponent(token)}&category=${encodeURIComponent(category)}`;

  return htmlResponse(
    `<h1 style="font-size:26px;margin:0 0 12px">Turn off this email category?</h1><p style="line-height:1.6;color:#52666f">Essential account, security, and safety emails will not be affected.</p><form method="post" action="${action}" style="margin-top:22px"><button type="submit" style="border:0;border-radius:999px;background:#16879e;color:#fff;padding:13px 20px;font-size:15px;font-weight:800;cursor:pointer">Turn off these emails</button></form>`,
  );
}

export async function POST(request: NextRequest) {
  const { token, category } = readRequest(request);

  if (!token || !category) {
    return htmlResponse(
      '<h1 style="font-size:26px;margin:0 0 12px">This link is not valid</h1>',
      400,
    );
  }

  const { data, error } = await createAdminClient().rpc(
    "unsubscribe_optional_profile_email",
    { p_category: category, p_token: token },
  );

  if (error) {
    console.error("Could not update email unsubscribe preference.", {
      category,
      message: error.message,
    });
    return htmlResponse(
      '<h1 style="font-size:26px;margin:0 0 12px">We could not update this setting</h1><p style="line-height:1.6;color:#52666f">Please try again or use your account settings.</p>',
      503,
    );
  }

  if (data !== true) {
    return htmlResponse(
      '<h1 style="font-size:26px;margin:0 0 12px">This link is no longer valid</h1>',
      404,
    );
  }

  return htmlResponse(
    '<h1 style="font-size:26px;margin:0 0 12px">Email preference updated</h1><p style="line-height:1.6;color:#52666f">You will no longer receive this category of optional email. Essential account, security, and safety emails remain enabled.</p>',
  );
}
