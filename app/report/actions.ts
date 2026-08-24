"use server";

import { redirect } from "next/navigation";
import {
  recordSecurityRequest,
  securityRateLimitMessage,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { sendNewModerationReportAdminEmail } from "@/lib/email/admin-notifications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function normalizeReportType(value: string | null) {
  if (value !== "profile") {
    return null;
  }

  return "profile";
}

function normalizeUuid(value: string | null) {
  if (!value || !UUID_PATTERN.test(value)) {
    return null;
  }

  return value;
}

function normalizeReportCategory(value: string | null) {
  if (
    value === "fake_profile" ||
    value === "inappropriate_content" ||
    value === "spam_scam" ||
    value === "harassment_safety" ||
    value === "privacy" ||
    value === "other"
  ) {
    return value;
  }

  return null;
}

async function getReportedProfileId({
  supabase,
  subjectId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  subjectId: string;
}) {
  const { data } = await supabase.rpc("get_public_profile", {
    p_profile_id: subjectId,
  });

  const profile = Array.isArray(data) ? data[0] : data;

  if (!profile) {
    throw new Error("Profile not found.");
  }

  return subjectId;
}

type ReportActionResult = {
  ok: boolean;
  error?: string;
};

async function createModerationReport(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const securityDecision = await recordSecurityRequest({
    action: "report",
    subject: user.id,
  });

  if (!securityDecision.allowed) {
    throw new Error(securityRateLimitMessage(securityDecision.retryAfterSeconds));
  }

  const subjectType = normalizeReportType(String(formData.get("type") ?? ""));
  const subjectId = normalizeUuid(String(formData.get("id") ?? ""));
  const category = normalizeReportCategory(String(formData.get("category") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const returnTo = safeNextPath(String(formData.get("returnTo") ?? ""));

  if (!subjectType || !subjectId) {
    throw new Error("Invalid report link.");
  }

  if (!category) {
    throw new Error("Please choose a report category.");
  }

  if (subjectId === user.id) {
    throw new Error("You cannot report your own profile.");
  }

  if (reason.length < 3 || reason.length > 80) {
    throw new Error("Please choose a report reason.");
  }

  if (details.length > 1200) {
    throw new Error("Report details must be 1200 characters or fewer.");
  }

  const reportedProfileId = await getReportedProfileId({
    supabase,
    subjectId,
  });

  const { data: report, error } = await supabase
    .from("moderation_reports")
    .insert({
    reporter_id: user.id,
    subject_type: subjectType,
    subject_id: subjectId,
    reported_profile_id: reportedProfileId,
    category,
    reason,
    details,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (report?.id) {
    await sendNewModerationReportAdminEmail({
      reportId: report.id,
      reporterEmail: user.email ?? null,
      subjectType,
      subjectId,
      category,
      reason,
      details,
    });
  }

  return { returnTo };
}

export async function submitModerationReportInline(
  formData: FormData,
): Promise<ReportActionResult> {
  try {
    await createModerationReport(formData);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
    };
  }
}

export async function submitModerationReport(formData: FormData) {
  const { returnTo } = await createModerationReport(formData);
  const params = new URLSearchParams({ sent: "1" });

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  redirect(`/report?${params.toString()}`);
}
