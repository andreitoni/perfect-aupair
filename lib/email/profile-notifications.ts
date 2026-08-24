import {
  formatAge,
  formatAllowance,
  formatCountryName,
  formatDuration,
  formatFamilyDisplayName,
  formatLanguageList,
  formatStartWindow,
} from "@/lib/i18n/translations";
import {
  getProfilePhotoPublicUrl,
  PROFILE_PHOTOS_BUCKET,
} from "@/lib/images/storage";
import { sendEmail, type EmailAttachment } from "@/lib/email/resend";
import { getOptionalEmailUnsubscribeHeaders } from "@/lib/email/unsubscribe";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

type NotificationProfile = {
  id: string;
  email: string | null;
  account_type: string | null;
  full_name: string | null;
  first_name: string | null;
  city: string | null;
  country: string | null;
  nationality: string | null;
  birth_date: string | null;
  date_of_birth: string | null;
  preferred_host_countries: string[] | null;
  mother_tongue: string | null;
  fluent_languages: string[] | null;
  basic_languages: string[] | null;
  availability_start: string | null;
  availability_start_from: string | null;
  availability_start_to: string | null;
  duration: string | null;
  duration_min_months: number | null;
  duration_max_months: number | null;
  children_info: string | null;
  au_pair_allowance_amount: number | null;
  au_pair_allowance_currency: string | null;
  has_drivers_license: boolean | null;
  has_childcare_experience: boolean | null;
  has_infant_experience: boolean | null;
  has_first_aid: boolean | null;
  will_care_for_elderly: boolean | null;
  will_care_for_pets: boolean | null;
  public_slug: string | null;
  onboarding_completed: boolean | null;
  suspended_at: string | null;
  deletion_requested_at: string | null;
  is_admin: boolean | null;
  new_message_emails_enabled: boolean | null;
  email_unsubscribe_token: string | null;
  last_active_at: string | null;
};

type ProfilePhotoRow = {
  storage_path: string;
};

type ProfileEmailPhoto = {
  emailUrl: string;
  webUrl: string;
  attachments: EmailAttachment[];
};

type MessageNotificationInput = {
  conversationId: string;
  messageId: string;
  senderId: string;
  recipientId: string;
  hasMedia: boolean;
  idempotencyKey: string;
};

export type NotificationEmailDeliveryResult = {
  status: "sent" | "suppressed" | "retryable_failure";
};

type ProfileViewInterestNotificationInput = {
  actorId: string;
  recipientId: string;
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

const SUPPRESSED_DELIVERY: NotificationEmailDeliveryResult = {
  status: "suppressed",
};

async function sendNotificationEmailWithRetry(
  recipientId: string,
  send: () => ReturnType<typeof sendEmail>,
): Promise<NotificationEmailDeliveryResult> {
  const category = "new_message";
  let reservationId: string | null = null;

  try {
    const admin = createAdminClient();
    const { data: reserved, error } = await admin.rpc(
      "reserve_engagement_email_delivery",
      { p_category: category, p_recipient_id: recipientId },
    );

    if (error) {
      console.warn("Engagement email budget unavailable.", {
        category,
        message: error.message,
      });
      return { status: "retryable_failure" };
    }

    if (typeof reserved !== "string" || !reserved) {
      return SUPPRESSED_DELIVERY;
    }

    reservationId = reserved;
  } catch (error) {
    console.warn("Engagement email budget unavailable.", {
      category,
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "retryable_failure" };
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await send();

      if (result.sent) {
        const admin = createAdminClient();
        const { data: completed, error } = await admin.rpc(
          "complete_engagement_email_delivery",
          {
            p_completed_at: new Date().toISOString(),
            p_delivery_id: reservationId,
          },
        );

        if (error || completed !== true) {
          console.error("Could not complete engagement email reservation.", {
            category,
            message: error?.message ?? "Reservation no longer active.",
            recipientId,
          });
        }

        return { status: "sent" };
      }
      if (result.skipped) break;
    } catch (error) {
      console.warn("Engagement email delivery attempt failed.", {
        attempt,
        category,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (reservationId) {
    const admin = createAdminClient();
    const { error } = await admin.rpc("release_engagement_email_delivery", {
      p_delivery_id: reservationId,
    });

    if (error) {
      console.error("Could not release engagement email reservation.", {
        category,
        message: error.message,
        recipientId,
      });
    }
  }

  return { status: "retryable_failure" };
}

function getDisplayName(profile: NotificationProfile) {
  const name = profile.full_name?.trim() || profile.first_name?.trim();

  if (profile.account_type === "family") {
    return formatFamilyDisplayName(name, "en") ?? "A host family";
  }

  return name || "Someone";
}

function getFirstName(profile: NotificationProfile) {
  return (
    profile.first_name?.trim() ||
    profile.full_name?.trim().split(/\s+/)[0] ||
    getDisplayName(profile)
  );
}

function getLocation(profile: NotificationProfile) {
  return [
    profile.city,
    profile.country ? formatCountryName(profile.country, "en") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function getCountry(profile: NotificationProfile) {
  return profile.country ? formatCountryName(profile.country, "en") : null;
}

function getMessageSubject(profile: NotificationProfile) {
  const name =
    profile.account_type === "family"
      ? getDisplayName(profile)
      : getFirstName(profile);
  const country = getCountry(profile);

  if (country) {
    return `${name} from ${country} has sent you a message`;
  }

  return `${name} has sent you a message`;
}

function calculateAge(value?: string | null) {
  if (!value) return null;

  const birthDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = today.getUTCDate() - birthDate.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age > 0 ? age : null;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}

function formatCountryList(values: string[] | null | undefined) {
  const countries = uniqueValues(values ?? []);

  if (countries.length === 0) return null;

  return countries.map((country) => formatCountryName(country, "en")).join(", ");
}

function formatLanguages(profile: NotificationProfile) {
  const languages = uniqueValues([
    profile.mother_tongue,
    ...(profile.fluent_languages ?? []),
    ...(profile.basic_languages ?? []),
  ]);

  if (languages.length === 0) return null;

  return formatLanguageList(languages, "en");
}

function formatAvailability(profile: NotificationProfile) {
  if (profile.availability_start_from || profile.availability_start_to) {
    return formatStartWindow(
      "en",
      profile.availability_start_from,
      profile.availability_start_to,
    );
  }

  return profile.availability_start?.trim() || null;
}

function formatStayDuration(profile: NotificationProfile) {
  if (profile.duration_min_months || profile.duration_max_months) {
    return formatDuration(
      "en",
      profile.duration_min_months,
      profile.duration_max_months,
    );
  }

  return profile.duration?.trim() || null;
}

function formatExperience(profile: NotificationProfile) {
  const values = [
    profile.has_childcare_experience ? "Childcare experience" : null,
    profile.has_infant_experience ? "Infant experience" : null,
    profile.has_first_aid ? "First aid" : null,
    profile.has_drivers_license ? "Driver's license" : null,
    profile.will_care_for_elderly ? "Elderly care" : null,
    profile.will_care_for_pets ? "Pet care" : null,
  ].filter(Boolean);

  return values.length > 0 ? values.join(", ") : null;
}

function getProfileFacts(profile: NotificationProfile) {
  const age = calculateAge(profile.birth_date ?? profile.date_of_birth);
  const languages = formatLanguages(profile);
  const availability = formatAvailability(profile);
  const duration = formatStayDuration(profile);
  const nationality = profile.nationality
    ? formatCountryName(profile.nationality, "en")
    : null;
  const preferredCountries = formatCountryList(profile.preferred_host_countries);
  const allowance = formatAllowance(
    profile.au_pair_allowance_amount,
    profile.au_pair_allowance_currency,
    "en",
  );
  const experience = formatExperience(profile);

  const baseFacts = [
    {
      label: "Profile",
      value: profile.account_type === "family" ? "Host family" : "Au pair",
    },
    age ? { label: "Age", value: formatAge(age, "en") } : null,
    nationality ? { label: "Nationality", value: nationality } : null,
    languages ? { label: "Languages", value: languages } : null,
  ].filter(
    (fact): fact is { label: string; value: string } =>
      Boolean(fact?.value),
  );

  if (profile.account_type === "family") {
    return [
      ...baseFacts,
      profile.children_info
        ? { label: "Children", value: profile.children_info }
        : null,
      allowance ? { label: "Allowance", value: allowance } : null,
      availability ? { label: "Start", value: availability } : null,
      duration ? { label: "Stay", value: duration } : null,
    ]
      .filter(
        (fact): fact is { label: string; value: string } =>
          Boolean(fact?.value),
      )
      .slice(0, 6);
  }

  return [
    ...baseFacts,
    preferredCountries
      ? { label: "Desired countries", value: preferredCountries }
      : null,
    availability ? { label: "Available", value: availability } : null,
    duration ? { label: "Stay", value: duration } : null,
    experience ? { label: "Experience", value: experience } : null,
  ]
    .filter(
      (fact): fact is { label: string; value: string } =>
        Boolean(fact?.value),
    )
    .slice(0, 7);
}

function isEmailableRecipient(profile: NotificationProfile | undefined) {
  return Boolean(
    profile?.new_message_emails_enabled &&
      profile.email_unsubscribe_token &&
      profile.onboarding_completed &&
      !profile.suspended_at &&
      !profile.deletion_requested_at &&
      !profile.is_admin,
  );
}

function isActiveNotificationRecipient(profile: NotificationProfile | undefined) {
  return Boolean(
    profile?.onboarding_completed &&
      !profile.suspended_at &&
      !profile.deletion_requested_at &&
      !profile.is_admin,
  );
}

function profileHref(profile: NotificationProfile) {
  return `/profile/${profile.public_slug ?? profile.id}`;
}

function messageOpenHref(profile: NotificationProfile, conversationId: string) {
  const sender = encodeURIComponent(profile.public_slug ?? profile.id);
  return `/notifications/message/${sender}?conversation=${encodeURIComponent(
    conversationId,
  )}`;
}

async function getRecipientEmail(
  admin: ReturnType<typeof createAdminClient>,
  recipient: NotificationProfile,
) {
  const { data, error } = await admin.auth.admin.getUserById(recipient.id);

  if (error) {
    console.warn("Could not load auth email for notification recipient.", error);
  }

  return data?.user?.email ?? recipient.email ?? null;
}

const PROFILE_PHOTO_CONTENT_ID = "profile-photo";
const MAX_INLINE_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

function profilePhotoFileName(storagePath: string) {
  const fileName = storagePath.split("/").at(-1);

  return fileName && /^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(fileName)
    ? fileName
    : "profile-photo.jpg";
}

async function getPrimaryEmailPhoto(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<ProfileEmailPhoto> {
  const fallbackUrl = absoluteUrl("/brand/perfect-aupair-logo-mark.png");
  const { data, error } = await admin
    .from("profile_photos")
    .select("storage_path")
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ProfilePhotoRow>();

  if (error) {
    console.warn("Could not load notification profile photo.", error);
  }

  if (!data?.storage_path) {
    return {
      emailUrl: fallbackUrl,
      webUrl: fallbackUrl,
      attachments: [],
    };
  }

  if (data.storage_path.startsWith("demo-pics/")) {
    const demoUrl = absoluteUrl(`/${data.storage_path}`);

    return {
      emailUrl: demoUrl,
      webUrl: demoUrl,
      attachments: [],
    };
  }

  const webUrl = absoluteUrl(
    getProfilePhotoPublicUrl(admin, data.storage_path),
  );
  const { data: photo, error: downloadError } = await admin.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .download(data.storage_path);

  if (
    downloadError ||
    !photo ||
    photo.size <= 0 ||
    photo.size > MAX_INLINE_PROFILE_PHOTO_BYTES
  ) {
    console.warn("Could not attach notification profile photo.", {
      message:
        downloadError?.message ??
        (photo?.size
          ? `Unexpected profile photo size: ${photo.size} bytes.`
          : "Profile photo download returned no content."),
      profileId,
    });

    return {
      emailUrl: fallbackUrl,
      webUrl,
      attachments: [],
    };
  }

  const content = Buffer.from(await photo.arrayBuffer()).toString("base64");

  return {
    emailUrl: `cid:${PROFILE_PHOTO_CONTENT_ID}`,
    webUrl,
    attachments: [
      {
        content,
        filename: profilePhotoFileName(data.storage_path),
        contentId: PROFILE_PHOTO_CONTENT_ID,
      },
    ],
  };
}

async function getPrimaryNotificationPhotoUrl(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
) {
  const fallbackUrl = absoluteUrl("/brand/perfect-aupair-logo-mark.png");
  const { data, error } = await admin
    .from("profile_photos")
    .select("storage_path")
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ProfilePhotoRow>();

  if (error) {
    console.warn("Could not load notification profile photo.", error);
  }

  if (!data?.storage_path) {
    return fallbackUrl;
  }

  if (data.storage_path.startsWith("demo-pics/")) {
    return absoluteUrl(`/${data.storage_path}`);
  }

  return absoluteUrl(getProfilePhotoPublicUrl(admin, data.storage_path));
}

function profileCardHtml({
  ctaHref,
  ctaLabel,
  facts,
  intro,
  location,
  photoUrl,
  profileName,
}: {
  ctaHref: string;
  ctaLabel: string;
  facts: Array<{ label: string; value: string }>;
  intro: string;
  location: string;
  photoUrl: string;
  profileName: string;
}) {
  const factRows = facts
    .map(
      (fact) => `
        <tr>
          <td width="42%" style="padding:10px 18px 10px 0;border-top:1px solid #edf2f4;font-family:Arial,sans-serif;font-size:12px;line-height:17px;color:#6f8793;font-weight:800;text-transform:uppercase;letter-spacing:.05em;vertical-align:top;">${escapeHtml(fact.label)}</td>
          <td style="padding:10px 0;border-top:1px solid #edf2f4;font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#25302d;font-weight:800;vertical-align:top;">${escapeHtml(fact.value)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding:0;">
          <h1 style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:30px;line-height:36px;color:#172426;font-weight:900;">${escapeHtml(intro)}</h1>
          <img src="${photoUrl}" width="584" height="320" alt="${escapeHtml(profileName)}" style="display:block;width:100%;max-width:584px;height:320px;object-fit:cover;border-radius:24px;border:1px solid #d6e2e8;background:#eef4f6;" />
          <h2 style="margin:22px 0 0;font-family:Arial,sans-serif;font-size:28px;line-height:34px;color:#172426;font-weight:800;">${escapeHtml(profileName)}</h2>
          ${
            location
              ? `<p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:23px;color:#52666f;font-weight:700;">${escapeHtml(location)}</p>`
              : ""
          }
          ${
            factRows
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;">${factRows}</table>`
              : ""
          }
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
            <tr>
              <td style="border-radius:999px;background:#16879e;">
                <a href="${ctaHref}" style="display:inline-block;padding:14px 24px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;line-height:18px;color:#ffffff;text-decoration:none;font-weight:800;">${escapeHtml(ctaLabel)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function shellHtml({
  children,
  footerNote,
  preview,
  title,
}: {
  children: string;
  footerNote: string;
  preview: string;
  title: string;
}) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#f2f4f7;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f2f4f7;">
          <tr>
            <td align="center" style="padding:28px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 14px;">
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
                  </td>
                </tr>
                <tr>
                  <td style="border-radius:28px;background:#ffffff;padding:28px;box-shadow:0 12px 32px rgba(38,63,69,0.08);border:1px solid #dce5ea;">
                    ${children}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 0 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:22px;background:#16879e;">
                      <tr>
                        <td align="center" style="padding:18px 18px 10px;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#dcecf2;font-weight:700;">
                          Please do not reply to this email. It was sent automatically by ${SITE_NAME}.
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:0 18px 12px;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#dcecf2;">
                          ${escapeHtml(footerNote)} Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#ffffff;font-weight:800;">${SUPPORT_EMAIL}</a>.
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:0 18px 20px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                              <td style="border-radius:999px;background:#ffffff;">
                                <a href="${absoluteUrl("/account/settings")}" style="display:inline-block;padding:11px 18px;border-radius:999px;font-family:Arial,sans-serif;font-size:13px;line-height:16px;color:#16879e;text-decoration:none;font-weight:800;">Notification settings</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
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

async function loadProfiles(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
) {
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, account_type, full_name, first_name, city, country, nationality, birth_date, date_of_birth, preferred_host_countries, mother_tongue, fluent_languages, basic_languages, availability_start, availability_start_from, availability_start_to, duration, duration_min_months, duration_max_months, children_info, au_pair_allowance_amount, au_pair_allowance_currency, has_drivers_license, has_childcare_experience, has_infant_experience, has_first_aid, will_care_for_elderly, will_care_for_pets, public_slug, onboarding_completed, suspended_at, deletion_requested_at, is_admin, new_message_emails_enabled, email_unsubscribe_token, last_active_at",
    )
    .in("id", ids)
    .returns<NotificationProfile[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function canDeliverProfileViewNotification(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  recipientId: string,
) {
  const [actorEligibility, recipientEligibility, blockedPair] =
    await Promise.all([
      admin.rpc("public_profile_is_eligible", {
        p_profile_id: actorId,
        p_require_photo: true,
      }),
      admin.rpc("public_profile_is_eligible", {
        p_profile_id: recipientId,
        p_require_photo: true,
      }),
      admin
        .from("profile_blocks")
        .select("blocker_id")
        .or(
          `and(blocker_id.eq.${actorId},blocked_profile_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_profile_id.eq.${actorId})`,
        )
        .limit(1)
        .maybeSingle<{ blocker_id: string }>(),
    ]);

  const error =
    actorEligibility.error ??
    recipientEligibility.error ??
    blockedPair.error;

  if (error) {
    throw error;
  }

  return (
    actorEligibility.data === true &&
    recipientEligibility.data === true &&
    !blockedPair.data
  );
}

export async function sendNewMessageNotificationEmail({
  conversationId,
  messageId,
  senderId,
  recipientId,
  hasMedia,
  idempotencyKey,
}: MessageNotificationInput): Promise<NotificationEmailDeliveryResult> {
  if (senderId === recipientId) {
    return SUPPRESSED_DELIVERY;
  }

  try {
    const admin = createAdminClient();
    const profiles = await loadProfiles(admin, [senderId, recipientId]);
    const sender = profiles.find((profile) => profile.id === senderId);
    const recipient = profiles.find((profile) => profile.id === recipientId);

    if (!sender || !recipient || !isEmailableRecipient(recipient)) {
      return SUPPRESSED_DELIVERY;
    }

    const { data: deliveryStrategy, error: strategyError } = await admin.rpc(
      "schedule_message_notification_delivery",
      {
        p_message_id: messageId,
        p_recipient_id: recipientId,
      },
    );

    if (strategyError) {
      console.warn("Could not schedule the message notification email.", {
        message: strategyError.message,
        recipientId,
      });
      return { status: "retryable_failure" };
    }

    if (deliveryStrategy !== "immediate") {
      return SUPPRESSED_DELIVERY;
    }

    const to = await getRecipientEmail(admin, recipient);

    if (!to) {
      return SUPPRESSED_DELIVERY;
    }

    const senderName = getDisplayName(sender);
    const location = getLocation(sender);
    const profileFacts = getProfileFacts(sender);
    const profilePhoto = await getPrimaryEmailPhoto(admin, sender.id);
    const ctaHref = absoluteUrl(messageOpenHref(sender, conversationId));
    const mediaNote = hasMedia
      ? "They may have included a photo, video, or voice message."
      : "Open the conversation to read it and reply.";
    const intro = "New message in your inbox";
    const subject = getMessageSubject(sender);
    const profileFactText = profileFacts.map(
      (fact) => `${fact.label}: ${fact.value}`,
    );
    const text = [
      `${subject}.`,
      location ? `Location: ${location}` : "",
      ...profileFactText,
      mediaNote,
      "",
      `View and reply: ${ctaHref}`,
      `Notification settings: ${absoluteUrl("/account/settings")}`,
    ].filter(Boolean);

    const html = shellHtml({
      title: subject,
      preview: `${subject}.`,
      footerNote:
        "You are receiving this because new-message emails are enabled.",
      children: `
        ${profileCardHtml({
          ctaHref,
          ctaLabel: "View and reply",
          facts: profileFacts,
          intro,
          location,
          photoUrl: profilePhoto.emailUrl,
          profileName: senderName,
        })}
        <div style="height:1px;background:#dce5ea;margin:28px 0;"></div>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:23px;color:#52666f;font-weight:700;">This is the first message from ${escapeHtml(senderName)}. ${escapeHtml(mediaNote)}</p>
      `,
    });

    return await sendNotificationEmailWithRetry(recipientId, () =>
      sendEmail({
        to,
        subject,
        html,
        text: text.join("\n"),
        idempotencyKey,
        attachments: profilePhoto.attachments,
        headers: getOptionalEmailUnsubscribeHeaders(
          recipient.email_unsubscribe_token as string,
          "new_message",
        ),
      }),
    );
  } catch (error) {
    console.error("Failed to send new message notification email.", error);
    return { status: "retryable_failure" };
  }
}

export async function sendUnreadMessageDigestEmail({
  deliveryId,
  latestMessageAt,
  recipientId,
  unreadConversationCount,
  unreadMessageCount,
}: {
  deliveryId: string;
  latestMessageAt: string;
  recipientId: string;
  unreadConversationCount: number;
  unreadMessageCount: number;
}): Promise<NotificationEmailDeliveryResult> {
  if (unreadConversationCount < 1 || unreadMessageCount < 1) {
    return SUPPRESSED_DELIVERY;
  }

  try {
    const admin = createAdminClient();
    const recipient = (await loadProfiles(admin, [recipientId]))[0];

    if (!recipient || !isEmailableRecipient(recipient)) {
      return SUPPRESSED_DELIVERY;
    }

    if (
      recipient.last_active_at &&
      new Date(recipient.last_active_at).getTime() >=
        new Date(latestMessageAt).getTime()
    ) {
      return SUPPRESSED_DELIVERY;
    }

    const to = await getRecipientEmail(admin, recipient);
    if (!to) return SUPPRESSED_DELIVERY;

    const firstName = getFirstName(recipient);
    const inboxUrl = absoluteUrl("/messages");
    const subject = "You have unread messages on Perfect AuPair";
    const messageLabel = unreadMessageCount === 1 ? "Unread message" : "Unread messages";
    const conversationLabel =
      unreadConversationCount === 1 ? "Conversation" : "Conversations";
    const text = [
      `Hi ${firstName},`,
      "",
      "Unread messages are waiting for you.",
      `${unreadMessageCount} ${messageLabel.toLowerCase()} across ${unreadConversationCount} ${conversationLabel.toLowerCase()}.`,
      "",
      `Open your inbox: ${inboxUrl}`,
      `Notification settings: ${absoluteUrl("/account/settings")}`,
    ].join("\n");
    const html = shellHtml({
      title: subject,
      preview: `${unreadMessageCount} unread message${unreadMessageCount === 1 ? "" : "s"} waiting in your inbox.`,
      footerNote:
        "You are receiving this because new-message emails are enabled.",
      children: `
        <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:12px;line-height:17px;color:#16879e;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">Your inbox</p>
        <h1 style="margin:0;font-family:Arial,sans-serif;font-size:30px;line-height:36px;color:#172426;font-weight:900;">Unread messages are waiting for you</h1>
        <p style="margin:20px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#52666f;font-weight:700;">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:12px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#52666f;font-weight:700;">You have new conversations waiting in your ${SITE_NAME} inbox. Open your messages when you’re ready to read and reply.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin-top:22px;border-radius:18px;background:#eef8fd;border:1px solid #cfeaf8;">
          <tr>
            <td width="50%" align="center" style="padding:18px 10px;border-right:1px solid #cfeaf8;">
              <div style="font-family:Arial,sans-serif;font-size:26px;line-height:31px;color:#25302d;font-weight:900;">${unreadMessageCount}</div>
              <div style="margin-top:4px;font-family:Arial,sans-serif;font-size:12px;line-height:17px;color:#52666f;font-weight:700;">${messageLabel}</div>
            </td>
            <td width="50%" align="center" style="padding:18px 10px;">
              <div style="font-family:Arial,sans-serif;font-size:26px;line-height:31px;color:#25302d;font-weight:900;">${unreadConversationCount}</div>
              <div style="margin-top:4px;font-family:Arial,sans-serif;font-size:12px;line-height:17px;color:#52666f;font-weight:700;">${conversationLabel}</div>
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
          <tr>
            <td style="border-radius:999px;background:#16879e;">
              <a href="${inboxUrl}" style="display:inline-block;padding:14px 24px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;line-height:18px;color:#ffffff;text-decoration:none;font-weight:800;">Open your inbox</a>
            </td>
          </tr>
        </table>
      `,
    });

    return await sendNotificationEmailWithRetry(recipientId, () =>
      sendEmail({
        to,
        subject,
        html,
        text,
        idempotencyKey: `message-digest/${deliveryId}`,
        headers: getOptionalEmailUnsubscribeHeaders(
          recipient.email_unsubscribe_token as string,
          "new_message",
        ),
      }),
    );
  } catch (error) {
    console.error("Failed to send unread-message digest email.", error);
    return { status: "retryable_failure" };
  }
}

export async function createProfileViewInterestNotification({
  actorId,
  recipientId,
}: ProfileViewInterestNotificationInput) {
  if (actorId === recipientId) {
    return;
  }

  try {
    const admin = createAdminClient();
    const profiles = await loadProfiles(admin, [actorId, recipientId]);
    const actor = profiles.find((profile) => profile.id === actorId);
    const recipient = profiles.find((profile) => profile.id === recipientId);

    if (
      !actor ||
      !recipient ||
      actor.account_type !== "family" ||
      recipient.account_type !== "au_pair" ||
      !isActiveNotificationRecipient(actor) ||
      !isActiveNotificationRecipient(recipient) ||
      !(await canDeliverProfileViewNotification(admin, actorId, recipientId))
    ) {
      return;
    }

    const actorName = getDisplayName(actor);
    const actorCountry = getCountry(actor);
    const profilePhotoUrl = await getPrimaryNotificationPhotoUrl(admin, actor.id);
    const title = `${actorName} viewed your profile`;
    const body = actorCountry
      ? `${actorName}, from ${actorCountry}, viewed your profile.`
      : `${actorName} viewed your profile.`;

    const { error: notificationError } = await admin
      .from("system_notifications")
      .upsert(
        {
          recipient_id: recipientId,
          type: "profile_view_interest",
          title,
          body,
          image_url: profilePhotoUrl,
          action_href: profileHref(actor),
          actor_profile_id: actorId,
          dedupe_key: `profile_view_interest:${actorId}:${recipientId}`,
          read_at: null,
        },
        { onConflict: "dedupe_key" },
      );

    if (notificationError) {
      throw notificationError;
    }
  } catch (error) {
    console.error("Failed to create profile view interest notification.", error);
  }
}
