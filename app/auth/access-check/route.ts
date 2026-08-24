import { NextResponse } from "next/server";
import {
  getActiveSuspensionForEmail,
  getPermanentEmailBan,
  permanentBanLoginMessage,
  suspensionLoginMessage,
} from "@/lib/moderation/auth-block";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim();

  if (!email) {
    return NextResponse.json(
      { error: "Please enter your email address." },
      { status: 400 },
    );
  }

  const permanentBan = await getPermanentEmailBan(email);

  if (permanentBan) {
    return NextResponse.json(
      { error: permanentBanLoginMessage(permanentBan.reason) },
      { status: 403 },
    );
  }

  const activeSuspension = await getActiveSuspensionForEmail(email);

  if (activeSuspension) {
    return NextResponse.json(
      { error: suspensionLoginMessage(activeSuspension) },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
