import { sendEmail } from "@/lib/email/resend";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export const REPORT_ACTION_TAKEN_TITLE = "We took action on your report";
export const REPORT_ACTION_TAKEN_BODY =
  "Thank you for reporting this. We reviewed the interaction and took action under our safety rules. For privacy and safety reasons, we cannot share the exact account action.";
export const REPORTING_GUIDANCE =
  "On Perfect AuPair, you can report a member directly from their profile using “Report this profile”, or from the conversation menu using “Report profile”. Reports submitted this way go directly to our moderation dashboard.";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendReportActionTakenEmail({
  deliveryId,
  firstName,
  to,
}: {
  deliveryId: string;
  firstName: string | null;
  to: string;
}) {
  const greeting = firstName?.trim() ? `Hi ${firstName.trim()},` : "Hello,";
  const safetyUrl = `${SITE_URL}/safety`;
  const text = [
    greeting,
    "",
    REPORT_ACTION_TAKEN_BODY,
    "",
    REPORTING_GUIDANCE,
    "",
    `Safety guidance: ${safetyUrl}`,
    `Need help? Contact ${SUPPORT_EMAIL}`,
  ].join("\n");
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <title>${REPORT_ACTION_TAKEN_TITLE}</title>
      </head>
      <body style="margin:0;padding:0;background:#f2f4f7;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${REPORT_ACTION_TAKEN_BODY}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f2f4f7;">
          <tr>
            <td align="center" style="padding:28px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 14px;font-family:Arial,sans-serif;font-size:20px;line-height:24px;color:#172426;font-weight:900;">${SITE_NAME}</td>
                </tr>
                <tr>
                  <td style="border-radius:28px;background:#ffffff;padding:28px;border:1px solid #dce5ea;">
                    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#52666f;font-weight:700;">${escapeHtml(greeting)}</p>
                    <h1 style="margin:0;font-family:Arial,sans-serif;font-size:30px;line-height:36px;color:#172426;font-weight:900;">${REPORT_ACTION_TAKEN_TITLE}</h1>
                    <p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#52666f;font-weight:700;">${REPORT_ACTION_TAKEN_BODY}</p>
                    <p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#52666f;font-weight:700;">${REPORTING_GUIDANCE}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
                      <tr>
                        <td style="border-radius:999px;background:#16879e;">
                          <a href="${safetyUrl}" style="display:inline-block;padding:14px 24px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;line-height:18px;color:#ffffff;text-decoration:none;font-weight:800;">Read safety guidance</a>
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

  return sendEmail({
    to,
    subject: REPORT_ACTION_TAKEN_TITLE,
    html,
    text,
    idempotencyKey: `report-action-taken-${deliveryId}`,
  });
}
