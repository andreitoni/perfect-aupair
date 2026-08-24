import { LegalPage } from "@/components/layout/LegalPage";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";
import Link from "next/link";

export const metadata = createPublicPageMetadata({
  title: "Privacy Policy",
  description:
    "How Perfect AuPair handles account, profile, photo, story, message, and privacy data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      translationScope="/privacy"
      eyebrow="Privacy"
      title="Privacy Policy"
      description={`This policy explains how ${SITE_NAME} collects, uses, stores, and protects personal data for au pair and host family matching.`}
    >
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#52636a]">
        Effective August 8, 2026
      </p>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Controller and contact</h2>
        <p className="mt-2">
          Perfect AuPair is the controller for personal data processed through
          this website. For privacy questions, account deletion requests, or
          abuse reports, contact{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Personal data we collect
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Account data, including email address, authentication identifiers, account type, login status, and security metadata.</li>
          <li>Profile data, including display name, country, city, nationality, languages, age derived from date of birth, availability, family or au pair details, profile text, and preferences.</li>
          <li>Uploaded content, including profile photos, optional profile videos, stories, message photos, videos and voice messages, and report attachments if applicable.</li>
          <li>Messages and interaction metadata, including conversation participants, timestamps, message text, media references, profile views, and saved-profile activity.</li>
          <li>Moderation and safety data, including public profile content checks, reports, suspension or ban records, and limited records needed to prevent abuse.</li>
          <li>Technical data, including cookies, device and browser information, network identifiers, security logs, and optional measurement data where consent is required and given.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Public and private profile information
        </h2>
        <p className="mt-2">
          Public profile and search pages may show display name, profile type,
          city/country, nationality, languages, calculated age, availability,
          bio/introduction, story previews, public profile photos, and whether
          a profile has an intro video. An intro video is private media and is
          only viewable by its owner, administrators, and eligible logged-in
          members with the opposite account type after moderation approval.
          Perfect AuPair does not intentionally show email address, phone
          number, phone country code, street address, or exact date
          of birth on public profile/search pages.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          How we use personal data
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>To create and secure accounts, authenticate users, and route users through onboarding.</li>
          <li>To display profiles, search results, stories, saved profiles, and matching-related information according to the visibility of each feature.</li>
          <li>With a member&apos;s explicit consent, to feature their public profile photos, name, and profile description on Perfect AuPair social media accounts. The applicable scope depends on the consent wording accepted by the member, and consent can be withdrawn at any time in account settings.</li>
          <li>To show eligible members who viewed or saved their profile. This matching activity is part of the service and is separate from optional analytics; a profile view by an eligible host family may be disclosed to the au pair whose profile was viewed.</li>
          <li>To deliver private messages and photo, video, or voice attachments between conversation participants.</li>
          <li>To review content, investigate reports, prevent misuse, enforce platform rules, and protect users and the service.</li>
          <li>To respond to support, privacy, account deletion, and legal requests.</li>
          <li>To operate, secure, troubleshoot, and improve the service, including through optional measurement tools where consent is required and given.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Legal bases</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Contract and pre-contract steps: to provide accounts, profiles, messaging, profile-view and saved-profile activity, and matching features requested by users.</li>
          <li>Legitimate interests: to keep the platform safe, prevent abuse, debug issues, moderate reports, and protect users and the service.</li>
          <li>Consent: where a specific feature asks for consent, such as optional analytics or other non-essential cookies.</li>
          <li>Legal obligations and legal claims: where data must be processed or retained to comply with law, respond to lawful requests, or establish, exercise, or defend legal claims.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Error and security monitoring
        </h2>
        <p className="mt-2">
          Sentry helps us detect and diagnose technical failures as part of the
          service&apos;s necessary security and reliability monitoring. We filter
          URLs, headers, query data, and other diagnostic context to reduce the
          personal data included in reports, exclude administration pages, and
          do not use this monitoring for advertising.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Optional analytics
        </h2>
        <p className="mt-2">
          With consent, Perfect AuPair may collect limited usage information,
          such as pages viewed, interactions, and device or browser details, to
          understand how the service is used and improve its performance and
          usability.
        </p>
        <p className="mt-3">
          Optional analytics is not required to use the service and is not used
          for advertising. You can withdraw consent at any time through the
          cookie preferences control to stop future optional collection.
        </p>
        <p className="mt-3">
          Google Analytics and Vercel Web Analytics are used only after consent.
          Query strings are removed, dynamic public profile URLs are grouped
          without their profile identifier, all administration pages are
          excluded, and private conversation pages are excluded from Vercel Web
          Analytics. Google advertising personalization and Google Signals are
          disabled.
        </p>
        <p className="mt-3">
          Vercel Speed Insights provides privacy-aware performance measurements
          through a separate route filter. Query strings and dynamic identifiers
          are removed, and administration pages are excluded.
        </p>
        <p className="mt-3">
          Microsoft Clarity may be used after consent for aggregated heatmaps
          and masked session replays. Strict masking is enabled, and private
          conversation and administration pages are excluded from recording.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Who receives personal data</h2>
        <p className="mt-2">
          Personal data may be shared with other members as part of the features
          you use, with authorized personnel, and with trusted processors that
          support hosting, account access, communications, content delivery,
          safety review, customer support, security, and consent-based
          measurement. It may also be disclosed where required by law, to
          protect rights or safety, or in connection with a lawful business
          transfer. Processors are permitted to handle personal data only for
          the services they provide to us and subject to appropriate contractual
          safeguards.
        </p>
        <p className="mt-3">
          Some recipients may process data outside the UK or EEA. Where required,
          transfers rely on an adequacy decision, approved contractual clauses,
          or another lawful safeguard. Details about safeguards relevant to a
          request are available through the privacy contact above.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Retention</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Account and profile data are kept while the account is active and as needed to provide the service.</li>
          <li>Profile content is kept while the account is active or until it is replaced or deleted, subject to limited safety and legal retention.</li>
          <li>Stories are intended to expire after 24 hours and are then removed through the deletion process.</li>
          <li>When a user requests account deletion, the public profile is hidden immediately and normal account access is disabled. Permanent deletion is scheduled after 7 days. Messages already sent remain visible in the recipients&apos; conversation copies with the sender shown only as a deleted account.</li>
          <li>Deleted message photos, videos, and voice messages are removed from the visible conversation immediately. Deleted photos may be kept in restricted retention for up to 90 days for safety, moderation, abuse prevention, legal claims, and legal obligations. Deleted message videos and voice messages are kept for up to 3 days for admin moderation, then deleted by scheduled cleanup.</li>
          <li>Reports, bans, suspension records, support emails, privacy requests, and security logs may be kept longer where necessary to prevent abuse, comply with legal obligations, or establish, exercise, or defend legal claims.</li>
          <li>Limited residual copies may remain temporarily in protected backups or logs until they are overwritten or no longer required.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">User rights</h2>
        <p className="mt-2">
          Depending on where you live, you may have rights to access, correct,
          delete, restrict, object to processing, receive a copy of, or withdraw
          consent for certain personal data. GDPR and UK GDPR requests are
          answered without undue delay and normally within one month. Some
          rights are not absolute where safety, legal obligations, or legal
          claims require limited retention.
        </p>
        <p className="mt-3">
          To make a privacy request, email{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          from the email address connected to your account.
        </p>
        <p className="mt-3">
          You may also lodge a complaint with the data protection authority in
          the country where you live or work, or where you believe a violation
          occurred. We encourage you to contact us first so we can try to resolve
          the concern.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Automated review</h2>
        <p className="mt-2">
          Automated tools may help identify content that could violate platform
          rules. They support safety review and do not establish a person&apos;s
          identity, suitability, or trustworthiness. Content or account
          restrictions may be reviewed by an authorized person where applicable.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Security</h2>
        <p className="mt-2">
          We use proportionate technical and organizational safeguards designed
          to protect personal data, including access controls, restricted media
          delivery, encryption in transit, abuse controls, monitoring, and
          retention procedures. No online service can guarantee absolute
          security. Users must protect their credentials and promptly report
          suspected unauthorized access.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Children and family information</h2>
        <p className="mt-2">
          Perfect AuPair accounts are only for adults aged 18 or older. Host
          families should avoid posting identifying
          personal information about children, such as full names, exact
          birthdates, school names, addresses, or private images without proper
          permission.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Cookies</h2>
        <p className="mt-2">
          The website uses cookies and similar storage for account sessions,
          security, preferences, consent choices, and optional measurement. See
          the{" "}
          <Link className="font-black text-[#25302d]" href="/cookie-policy">
            Cookie Policy
          </Link>{" "}
          for details and to manage optional cookies.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Changes</h2>
        <p className="mt-2">
          This policy may be updated as the service or legal requirements
          change. Material changes will be communicated where required. The
          latest version is available at{" "}
          <Link className="font-black text-[#25302d]" href="/privacy">
            {SITE_URL}/privacy
          </Link>
          .
        </p>
      </section>
    </LegalPage>
  );
}
