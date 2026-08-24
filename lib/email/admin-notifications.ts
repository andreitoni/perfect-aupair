import { SITE_NAME, SITE_URL } from "@/lib/site";
import { sendEmail } from "@/lib/email/resend";

type VerificationRequestEmailInput = {
  profileId: string;
  profileName: string | null;
  profileEmail: string | null;
  accountType: string | null;
  profileSlug: string | null;
  city: string | null;
  country: string | null;
};

type NewPublicProfileEmailInput = {
  profileId: string;
  profileName: string | null;
  profileEmail: string | null;
  accountType: string | null;
  city?: string | null;
  country?: string | null;
  createdAt?: string | null;
};

type NewModerationReportEmailInput = {
  reportId: string;
  reporterEmail: string | null;
  subjectType: string;
  subjectId: string;
  category: string;
  reason: string;
  details: string;
};

function adminNotificationEmail() {
  return (
    process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
    "admin@example.invalid"
  );
}

function accountTypeLabel(accountType?: string | null) {
  if (accountType === "au_pair") return "Au pair";
  if (accountType === "family") return "Host family";
  return "Unknown";
}

function locationLabel(city?: string | null, country?: string | null) {
  return [city, country].filter(Boolean).join(", ") || "Not provided";
}

async function sendRequiredAdminEmail({
  errorLabel,
  html,
  idempotencyKey,
  subject,
  text,
  to,
}: {
  errorLabel: string;
  html: string;
  idempotencyKey: string;
  subject: string;
  text: string;
  to: string;
}) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await sendEmail({
        to,
        subject,
        html,
        text,
        idempotencyKey,
      });
    } catch (error) {
      lastError = error;

      if (attempt === 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 750);
        });
      }
    }
  }

  console.error(errorLabel, lastError);
  return { sent: false, skipped: false };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function adminDetailsTableHtml(rows: Array<{ label: string; value: string }>) {
  return rows
    .map(
      (row) => `
        <tr>
          <td width="34%" style="padding:9px 18px 9px 0;border-top:1px solid #edf2f4;font-family:Arial,sans-serif;font-size:12px;line-height:17px;color:#6f8793;font-weight:800;text-transform:uppercase;letter-spacing:.05em;vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:9px 0;border-top:1px solid #edf2f4;font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#25302d;font-weight:700;vertical-align:top;word-break:break-word;">${escapeHtml(row.value)}</td>
        </tr>
      `,
    )
    .join("");
}

function adminEmailShellHtml({
  ctaHref,
  ctaLabel,
  details,
  eyebrow,
  heading,
  intro,
  links,
  preview,
  subject,
}: {
  ctaHref: string;
  ctaLabel: string;
  details: Array<{ label: string; value: string }>;
  eyebrow: string;
  heading: string;
  intro: string;
  links: Array<{ href: string; label: string }>;
  preview: string;
  subject: string;
}) {
  const detailRows = adminDetailsTableHtml(details);
  const secondaryLinks = links
    .map(
      (link) => `
        <p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#52666f;">
          <a href="${link.href}" style="color:#16879e;font-weight:800;text-decoration:underline;">${escapeHtml(link.label)}</a>
        </p>
      `,
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;padding:0;background:#f2f4f7;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f2f4f7;">
          <tr>
            <td align="center" style="padding:28px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td width="58" style="vertical-align:middle;">
                          <img src="${SITE_URL}/brand/perfect-aupair-logo-email.png" width="58" height="58" alt="${SITE_NAME}" style="display:block;width:58px;height:58px;border-radius:999px;border:0;" />
                        </td>
                        <td style="padding-left:12px;vertical-align:middle;">
                          <div style="font-family:Arial,sans-serif;font-size:20px;line-height:24px;color:#172426;font-weight:900;">${SITE_NAME}</div>
                          <div style="margin-top:2px;font-family:Arial,sans-serif;font-size:12px;line-height:17px;color:#6f8793;font-weight:700;">Admin notification</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="border-radius:28px;background:#ffffff;padding:28px;box-shadow:0 12px 32px rgba(38,63,69,0.08);border:1px solid #dce5ea;">
                    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#6f8793;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
                    <h1 style="margin:0;font-family:Arial,sans-serif;font-size:30px;line-height:36px;color:#172426;font-weight:900;">${escapeHtml(heading)}</h1>
                    <p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#52666f;font-weight:700;">${escapeHtml(intro)}</p>
                    ${
                      detailRows
                        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;">${detailRows}</table>`
                        : ""
                    }
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
                      <tr>
                        <td style="border-radius:999px;background:#16879e;">
                          <a href="${ctaHref}" style="display:inline-block;padding:14px 24px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;line-height:18px;color:#ffffff;text-decoration:none;font-weight:800;">${escapeHtml(ctaLabel)}</a>
                        </td>
                      </tr>
                    </table>
                    ${secondaryLinks ? `<div style="margin-top:18px;">${secondaryLinks}</div>` : ""}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#6f8793;text-align:center;">
                    Sent automatically by ${SITE_NAME}.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function sendVerificationRequestAdminEmail({
  profileId,
  profileName,
  profileEmail,
  accountType,
  profileSlug,
  city,
  country,
}: VerificationRequestEmailInput) {
  const adminEmail = adminNotificationEmail();
  const displayName = profileName?.trim() || "Unknown profile";
  const adminUrl = `${SITE_URL}/admin?view=review#verifications`;
  const publicProfileUrl = profileSlug
    ? `${SITE_URL}/profile/${profileSlug}`
    : `${SITE_URL}/admin/profiles/${profileId}`;
  const location = [city, country].filter(Boolean).join(", ") || "Unknown";

  const lines = [
    `A user requested manual profile verification on ${SITE_NAME}.`,
    "",
    `Name: ${displayName}`,
    `Email: ${profileEmail ?? "Unknown"}`,
    `Account type: ${accountType ?? "Unknown"}`,
    `Location: ${location}`,
    `Profile ID: ${profileId}`,
    "",
    `Review requests: ${adminUrl}`,
    `Public profile: ${publicProfileUrl}`,
  ];

  const subject = `New verification request: ${displayName}`;
  const html = adminEmailShellHtml({
    ctaHref: adminUrl,
    ctaLabel: "Open verification queue",
    details: [
      { label: "Name", value: displayName },
      { label: "Email", value: profileEmail ?? "Unknown" },
      { label: "Account type", value: accountType ?? "Unknown" },
      { label: "Location", value: location },
      { label: "Profile ID", value: profileId },
    ],
    eyebrow: "Verification",
    heading: "New manual verification request",
    intro: `A user requested manual profile verification on ${SITE_NAME}.`,
    links: [{ href: publicProfileUrl, label: "View public profile" }],
    preview: subject,
    subject,
  });

  try {
    await sendEmail({
      to: adminEmail,
      subject,
      html,
      text: lines.join("\n"),
    });
  } catch (error) {
    console.error("Failed to send verification request admin email.", error);
  }
}

export async function sendNewPublicProfileAdminEmail({
  profileId,
  profileName,
  profileEmail,
  accountType,
  city,
  country,
  createdAt,
}: NewPublicProfileEmailInput) {
  const adminEmail = adminNotificationEmail();
  const displayName = profileName?.trim() || "New member";
  const typeLabel = accountTypeLabel(accountType);
  const location = locationLabel(city, country);
  const adminProfileUrl = `${SITE_URL}/admin/profiles/${profileId}`;
  const adminUrl = `${SITE_URL}/admin?view=members#profiles`;
  const createdLabel = createdAt
    ? new Date(createdAt).toLocaleString("en-GB", { timeZone: "Europe/Berlin" })
    : "Just now";
  const subject = `New public profile: ${displayName} (${typeLabel})`;
  const lines = [
    `A new profile is now public on ${SITE_NAME}.`,
    "",
    `Name: ${displayName}`,
    `Email: ${profileEmail ?? "Unknown"}`,
    `Account type: ${typeLabel}`,
    `Location: ${location}`,
    `Created: ${createdLabel}`,
    `Profile ID: ${profileId}`,
    "",
    `Admin profile: ${adminProfileUrl}`,
    `Admin dashboard: ${adminUrl}`,
  ];
  const html = adminEmailShellHtml({
    ctaHref: adminProfileUrl,
    ctaLabel: "Open admin profile",
    details: [
      { label: "Name", value: displayName },
      { label: "Email", value: profileEmail ?? "Unknown" },
      { label: "Account type", value: typeLabel },
      { label: "Location", value: location },
      { label: "Created", value: createdLabel },
      { label: "Profile ID", value: profileId },
    ],
    eyebrow: "New public profile",
    heading: "A new profile is live",
    intro: `A new ${typeLabel.toLowerCase()} profile is now public on ${SITE_NAME}.`,
    links: [{ href: adminUrl, label: "Open admin dashboard" }],
    preview: subject,
    subject,
  });

  return sendRequiredAdminEmail({
    to: adminEmail,
    subject,
    html,
    text: lines.join("\n"),
    idempotencyKey: `admin-profile-published:${profileId}`,
    errorLabel: "Failed to send new public profile admin email.",
  });
}

export async function sendNewModerationReportAdminEmail({
  reportId,
  reporterEmail,
  subjectType,
  subjectId,
  category,
  reason,
  details,
}: NewModerationReportEmailInput) {
  const adminEmail = adminNotificationEmail();
  const adminUrl = `${SITE_URL}/admin?view=reports#reports`;
  const subject = `New moderation report: ${reason}`;
  const lines = [
    `A new moderation report was submitted on ${SITE_NAME}.`,
    "",
    `Category: ${category}`,
    `Reason: ${reason}`,
    `Reporter: ${reporterEmail ?? "Unknown"}`,
    `Subject type: ${subjectType}`,
    `Subject ID: ${subjectId}`,
    `Report ID: ${reportId}`,
    ...(details ? ["", `Details: ${details}`] : []),
    "",
    `Admin dashboard: ${adminUrl}`,
  ];
  const html = adminEmailShellHtml({
    ctaHref: adminUrl,
    ctaLabel: "Open reports",
    details: [
      { label: "Category", value: category },
      { label: "Reason", value: reason },
      { label: "Reporter", value: reporterEmail ?? "Unknown" },
      { label: "Subject type", value: subjectType },
      { label: "Subject ID", value: subjectId },
      { label: "Report ID", value: reportId },
      ...(details ? [{ label: "Details", value: details }] : []),
    ],
    eyebrow: "Moderation report",
    heading: "New report requires review",
    intro: `A new moderation report was submitted on ${SITE_NAME}.`,
    links: [],
    preview: subject,
    subject,
  });

  return sendRequiredAdminEmail({
    to: adminEmail,
    subject,
    html,
    text: lines.join("\n"),
    idempotencyKey: `admin-moderation-report:${reportId}`,
    errorLabel: "Failed to send new moderation report admin email.",
  });
}
