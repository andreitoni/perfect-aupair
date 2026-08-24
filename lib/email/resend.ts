export type EmailAttachment = {
  content: string;
  filename: string;
  contentId?: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  idempotencyKey?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
};

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8_000;
const DEFAULT_TRANSACTIONAL_EMAIL_FROM =
  "Perfect AuPair <no-reply@example.invalid>";

function sanitizeDisplayName(value: string) {
  return value
    .replace(/[\r\n<>]/g, " ")
    .replaceAll('"', "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function getSenderAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return match?.[1]?.trim() || from.trim();
}

function buildFromAddress(fromName?: string) {
  const baseFrom =
    process.env.TRANSACTIONAL_EMAIL_FROM ?? DEFAULT_TRANSACTIONAL_EMAIL_FROM;
  const displayName = fromName ? sanitizeDisplayName(fromName) : "";

  if (!displayName) {
    return baseFrom;
  }

  return `${displayName} <${getSenderAddress(baseFrom)}>`;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  fromName,
  idempotencyKey,
  attachments,
  headers,
}: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("RESEND_API_KEY is not configured; skipping email send.");
    return { sent: false, skipped: true };
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: buildFromAddress(fromName),
      to,
      subject,
      html,
      text,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      ...(attachments?.length
        ? {
            attachments: attachments.map((attachment) => ({
              content: attachment.content,
              filename: attachment.filename,
              ...(attachment.contentId
                ? { content_id: attachment.contentId }
                : {}),
            })),
          }
        : {}),
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Resend email failed with ${response.status}: ${errorText}`,
    );
  }

  return { sent: true, skipped: false };
}
