import { sendEmail } from "@/lib/email/resend";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function brandHeaderHtml() {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td width="58" style="vertical-align:middle;">
          <img src="${absoluteUrl("/brand/perfect-aupair-logo-email.png")}" width="58" height="58" alt="${SITE_NAME}" style="display:block;width:58px;height:58px;border-radius:999px;border:0;" />
        </td>
        <td style="padding-left:12px;vertical-align:middle;">
          <div style="font-family:Arial,sans-serif;font-size:20px;line-height:24px;color:#172426;font-weight:900;">${SITE_NAME}</div>
          <div style="margin-top:2px;font-family:Arial,sans-serif;font-size:12px;line-height:17px;color:#6f8793;font-weight:700;">Au pair and host family matching</div>
        </td>
      </tr>
    </table>
  `;
}

function accountDeletionEmailHtml({
  body,
  ctaHref,
  ctaLabel,
  heading,
  preview,
  subject,
}: {
  body: string;
  ctaHref: string;
  ctaLabel: string;
  heading: string;
  preview: string;
  subject: string;
}) {
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
                    ${brandHeaderHtml()}
                  </td>
                </tr>
                <tr>
                  <td style="border-radius:28px;background:#ffffff;padding:28px;box-shadow:0 12px 32px rgba(38,63,69,0.08);border:1px solid #dce5ea;">
                    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#6f8793;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Account deletion</p>
                    <h1 style="margin:0;font-family:Arial,sans-serif;font-size:30px;line-height:36px;color:#172426;font-weight:900;">${escapeHtml(heading)}</h1>
                    <p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#52666f;font-weight:700;">${escapeHtml(body)}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
                      <tr>
                        <td style="border-radius:999px;background:#16879e;">
                          <a href="${ctaHref}" style="display:inline-block;padding:14px 24px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;line-height:18px;color:#ffffff;text-decoration:none;font-weight:800;">${escapeHtml(ctaLabel)}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#6f8793;text-align:center;">
                    Please do not reply to this email. Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#16879e;font-weight:800;">${SUPPORT_EMAIL}</a>.
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

export async function sendAccountDeletionRequestedEmail(
  to: string,
  idempotencyKey?: string,
) {
  const reactivateHref = absoluteUrl("/login?mode=login");
  const subject = `Your ${SITE_NAME} account has been deleted`;
  const body =
    "Your account is no longer active and your profile is no longer public. Your data is scheduled to be permanently deleted in 7 days. Messages you sent remain visible in the recipients’ conversation copies. If you changed your mind, log in and choose Reactivate account.";
  const text = [
    `Your ${SITE_NAME} account has been deleted.`,
    "Your account is no longer active and your profile is no longer public.",
    "Your data is scheduled to be permanently deleted in 7 days.",
    "Messages you sent remain visible in the recipients’ conversation copies.",
    "If you changed your mind, log in and choose Reactivate account.",
    "",
    `Reactivate account: ${reactivateHref}`,
    `Need help? Contact ${SUPPORT_EMAIL}`,
  ].join("\n");

  const html = accountDeletionEmailHtml({
    body,
    ctaHref: reactivateHref,
    ctaLabel: "Reactivate account",
    heading: "Your account has been deleted",
    preview:
      "Your account is no longer active. Your data will be deleted in 7 days.",
    subject,
  });

  return sendEmail({ to, subject, html, text, idempotencyKey });
}

export async function sendAccountDeletionReminderEmail(
  to: string,
  idempotencyKey?: string,
) {
  const reactivateHref = absoluteUrl("/login?mode=login");
  const subject = `Your ${SITE_NAME} account will be deleted tomorrow`;
  const body = `Your ${SITE_NAME} account is scheduled to be permanently deleted in 1 day. Messages you sent remain visible in the recipients’ conversation copies. If you want to keep using ${SITE_NAME}, log in and choose Reactivate account.`;
  const text = [
    `Your ${SITE_NAME} account is scheduled to be permanently deleted in 1 day.`,
    "Messages you sent remain visible in the recipients’ conversation copies.",
    "If you want to keep your account, log in and choose Reactivate account.",
    "",
    `Reactivate account: ${reactivateHref}`,
    `Need help? Contact ${SUPPORT_EMAIL}`,
  ].join("\n");

  const html = accountDeletionEmailHtml({
    body,
    ctaHref: reactivateHref,
    ctaLabel: "Reactivate account",
    heading: "Your account will be deleted in 1 day",
    preview: "Your account will be deleted in 1 day.",
    subject,
  });

  return sendEmail({ to, subject, html, text, idempotencyKey });
}
