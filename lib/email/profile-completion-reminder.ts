import { sendEmail } from "@/lib/email/resend";
import {
  getOptionalEmailUnsubscribeHeaders,
  getOptionalEmailUnsubscribeUrl,
} from "@/lib/email/unsubscribe";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export type ProfileCompletionReminderAccountType = "au_pair" | "family";

type SendProfileCompletionReminderEmailInput = {
  accountType: ProfileCompletionReminderAccountType;
  deliveryId: string;
  email: string;
  firstName?: string | null;
  unsubscribeToken: string;
};

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

function getAudienceCopy(accountType: ProfileCompletionReminderAccountType) {
  if (accountType === "family") {
    return {
      heading: "You're one photo away from meeting au pairs",
      sentence:
        "Add at least one profile photo to complete your profile and start connecting with au pairs.",
    };
  }

  return {
    heading: "You're one photo away from being discovered",
    sentence:
      "Add at least one profile photo to complete your profile and start connecting with host families.",
  };
}

export async function sendProfileCompletionReminderEmail({
  accountType,
  deliveryId,
  email,
  firstName,
  unsubscribeToken,
}: SendProfileCompletionReminderEmailInput) {
  const subject = "Your Perfect AuPair profile is almost ready";
  const greeting = firstName?.trim() ? `Hi ${firstName.trim()},` : "Hi,";
  const audienceCopy = getAudienceCopy(accountType);
  const profilePhotosUrl = absoluteUrl("/profile/photos");
  const settingsUrl = absoluteUrl("/account/settings");
  const unsubscribeUrl = getOptionalEmailUnsubscribeUrl(
    unsubscribeToken,
    "profile_completion",
  );
  const preview = `${audienceCopy.sentence} It only takes a minute.`;
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="color-scheme" content="light only" />
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;padding:0;background:#fbfaf7;color:#25302d;font-family:Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fbfaf7;">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;border-collapse:collapse;overflow:hidden;border-radius:28px;background:#ffffff;border:1px solid #eee8df;box-shadow:0 18px 54px rgba(37,48,45,0.08);color:#25302d;">
                <tr>
                  <td style="padding:28px 32px;background:#ffffff;border-bottom:1px solid #eee8df;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td width="72" style="vertical-align:middle;">
                          <img src="${absoluteUrl("/brand/perfect-aupair-logo-email.png")}" width="72" height="72" alt="${SITE_NAME}" style="display:block;width:72px;height:72px;border:0;border-radius:999px;" />
                        </td>
                        <td style="padding-left:16px;vertical-align:middle;">
                          <div style="font-size:22px;line-height:1.15;font-weight:900;letter-spacing:-0.02em;color:#25302d;">${SITE_NAME}</div>
                          <div style="margin-top:4px;font-size:13px;line-height:1.4;font-weight:700;color:#6c7470;">Au pair and host family matching</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:34px 32px 8px;background:#ffffff;color:#25302d;">
                    <div style="font-size:12px;line-height:1.4;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;color:#6f8793;">Complete your profile</div>
                    <h1 style="margin:12px 0 0;font-size:30px;line-height:1.08;font-weight:900;letter-spacing:-0.04em;color:#25302d;">${escapeHtml(audienceCopy.heading)}</h1>
                    <p style="margin:18px 0 0;font-size:16px;line-height:1.65;font-weight:600;color:#6c7470;">${escapeHtml(greeting)}</p>
                    <p style="margin:14px 0 0;font-size:16px;line-height:1.65;font-weight:600;color:#6c7470;">You’ve already created your ${SITE_NAME} account. ${escapeHtml(audienceCopy.sentence)}</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:24px 32px 10px;background:#ffffff;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td align="center" style="border-radius:14px;background:#25302d;">
                          <a href="${profilePhotosUrl}" style="display:block;padding:16px 22px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.2;font-weight:800;">Finish my profile</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 32px 34px;background:#ffffff;">
                    <div style="margin-top:10px;border-radius:16px;background:#eef8fd;border:1px solid #cfeaf8;padding:15px 16px;color:#40504b;font-size:13px;line-height:1.55;font-weight:700;">It only takes a minute. You can add more photos or update your profile anytime.</div>
                    <p style="margin:24px 0 0;font-size:12px;line-height:1.6;font-weight:600;color:#808984;">You’re receiving this email because you created an account at ${SITE_NAME}. Manage notification emails in your <a href="${settingsUrl}" style="color:#59645f;">account settings</a> or <a href="${unsubscribeUrl}" style="color:#59645f;">turn off profile reminders</a>.<br />Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#59645f;">${SUPPORT_EMAIL}</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
  const text = [
    greeting,
    "",
    `You’ve already created your ${SITE_NAME} account. ${audienceCopy.sentence}`,
    "",
    `Finish your profile: ${profilePhotosUrl}`,
    "",
    "It only takes a minute. You can add more photos or update your profile anytime.",
    "",
    `Notification settings: ${settingsUrl}`,
    `Turn off profile reminders: ${unsubscribeUrl}`,
    `Need help? ${SUPPORT_EMAIL}`,
  ].join("\n");

  return sendEmail({
    to: email,
    subject,
    html,
    text,
    idempotencyKey: `profile-completion-reminder/${deliveryId}`,
    headers: getOptionalEmailUnsubscribeHeaders(
      unsubscribeToken,
      "profile_completion",
    ),
  });
}
