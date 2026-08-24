import { expect, test } from "@playwright/test";
import {
  sendNewPublicProfileAdminEmail,
  sendVerificationRequestAdminEmail,
} from "../../lib/email/admin-notifications";
import { sendEmail } from "../../lib/email/resend";

const originalFetch = globalThis.fetch;
const originalResendApiKey = process.env.RESEND_API_KEY;
const originalAdminNotificationEmail =
  process.env.ADMIN_NOTIFICATION_EMAIL;

test.afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalResendApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalResendApiKey;
  }

  if (originalAdminNotificationEmail === undefined) {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
  } else {
    process.env.ADMIN_NOTIFICATION_EMAIL = originalAdminNotificationEmail;
  }
});

test("a newly public profile emails the admin inbox", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  delete process.env.ADMIN_NOTIFICATION_EMAIL;

  const requests: Array<{ body: Record<string, unknown>; headers: Headers }> = [];

  globalThis.fetch = async (_input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });

    return new Response(JSON.stringify({ id: "test-email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await sendNewPublicProfileAdminEmail({
    profileId: "11111111-1111-4111-8111-111111111111",
    profileName: "Test Au Pair",
    profileEmail: "new-member@example.com",
    accountType: "au_pair",
    city: "Ingolstadt",
    country: "Germany",
    createdAt: "2026-07-18T12:00:00.000Z",
  });
  expect(requests).toHaveLength(1);
  expect(requests[0].body).toMatchObject({
    to: "admin@example.invalid",
    subject: "New public profile: Test Au Pair (Au pair)",
  });
  expect(requests[0].headers.get("Idempotency-Key")).toBe(
    "admin-profile-published:11111111-1111-4111-8111-111111111111",
  );
  expect(JSON.stringify(requests[0].body)).toContain(
    "/admin?view=members#profiles",
  );
});

test("a badge verification request emails the admin inbox", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(JSON.stringify({ id: "test-email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await sendVerificationRequestAdminEmail({
    profileId: "22222222-2222-4222-8222-222222222222",
    profileName: "Test Family",
    profileEmail: "family@example.com",
    accountType: "family",
    profileSlug: "test-family-example",
    city: "Munich",
    country: "Germany",
  });

  expect(requestBody).toMatchObject({
    to: "admin@example.invalid",
    subject: "New verification request: Test Family",
  });
  expect(JSON.stringify(requestBody)).toContain(
    "/admin?view=review#verifications",
  );
});

test("inline email images are sent as CID attachments", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(JSON.stringify({ id: "test-email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await sendEmail({
    to: "member@example.com",
    subject: "Profile photo test",
    html: '<img src="cid:profile-photo" alt="Profile" />',
    text: "Profile photo test",
    attachments: [
      {
        content: "cHJvZmlsZS1waG90bw==",
        filename: "profile-photo.webp",
        contentId: "profile-photo",
      },
    ],
  });

  expect(requestBody).toMatchObject({
    attachments: [
      {
        content: "cHJvZmlsZS1waG90bw==",
        filename: "profile-photo.webp",
        content_id: "profile-photo",
      },
    ],
  });
});

test("optional email unsubscribe headers are passed to Resend", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(JSON.stringify({ id: "test-email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await sendEmail({
    to: "member@example.com",
    subject: "Email preference test",
    html: "<p>Email preference test</p>",
    text: "Email preference test",
    headers: {
      "List-Unsubscribe":
        "<https://perfectaupair.example/api/email/unsubscribe?token=test>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  expect(requestBody).toMatchObject({
    headers: {
      "List-Unsubscribe":
        "<https://perfectaupair.example/api/email/unsubscribe?token=test>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
});
