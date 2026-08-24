import { LegalPage } from "@/components/layout/LegalPage";
import { CookiePreferencesButton } from "@/components/analytics/CookiePreferencesButton";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

export const metadata = createPublicPageMetadata({
  title: "Cookie Policy",
  description:
    "How Perfect AuPair uses cookies and similar browser storage.",
  path: "/cookie-policy",
});

export default function CookiePolicyPage() {
  return (
    <LegalPage
      translationScope="/cookie-policy"
      eyebrow="Cookies"
      title="Cookie Policy"
      description={`${SITE_NAME} uses cookies and similar browser storage to keep the website secure, remember preferences, and operate account features.`}
    >
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#52636a]">
        Effective August 8, 2026
      </p>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">What cookies are</h2>
        <p className="mt-2">
          Cookies and similar technologies, such as local storage, let a website
          remember information in a browser. They can be necessary for login and
          security, or optional for analytics, advertising, and personalization.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Necessary technologies</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>
            <span className="font-black text-[#25302d]">Account and session:</span>{" "}
            keep users signed in and protect account-only features.
          </li>
          <li>
            <span className="font-black text-[#25302d]">Security and service operation:</span>{" "}
            help prevent misuse, diagnose technical errors through Sentry, and
            maintain reliable access. This monitoring is not used for advertising.
          </li>
          <li>
            <span className="font-black text-[#25302d]">Language preference:</span>{" "}
            the site stores the selected language so the interface can continue
            in the chosen language on later visits.
          </li>
          <li>
            <span className="font-black text-[#25302d]">Consent choice:</span>{" "}
            remembers whether optional measurement is accepted or declined.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Optional measurement</h2>
        <p className="mt-2">
          With your consent, we may use optional analytics to understand how the
          service is used and to improve its performance and usability. This may
          include information about pages viewed, interactions, and device or
          browser characteristics.
        </p>
        <p className="mt-2">
          Google Analytics and Vercel Web Analytics are activated only after
          your optional analytics consent. We remove query strings, group dynamic
          profile URLs without retaining their profile identifier, exclude all
          administration pages, and exclude private conversation pages from
          Vercel Web Analytics. Google advertising personalization and Google
          Signals are disabled.
        </p>
        <p className="mt-2">
          Vercel Speed Insights provides privacy-aware performance measurements
          through a separate route filter. Query strings and dynamic identifiers
          are removed, and administration pages are excluded.
        </p>
        <p className="mt-2">
          Microsoft Clarity may be used after consent to understand usability
          through aggregated heatmaps and masked session replays. Strict masking
          is enabled, and private conversation and administration pages are
          excluded from recording.
        </p>
        <p className="mt-2">
          Optional analytics only starts after consent, is not required to use
          Perfect AuPair, and is not used for advertising. You can withdraw your
          consent at any time through the cookie preferences control.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Managing cookies</h2>
        <p className="mt-2">
          When optional measurement is offered, you can accept or decline it
          through the preference control below. You can also delete or block
          browser storage through your browser settings. Blocking necessary
          technologies may prevent account and security features from working
          correctly. Withdrawing optional consent stops future optional
          collection and may reload the page to apply the choice.
        </p>
        <CookiePreferencesButton />
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Contact</h2>
        <p className="mt-2">
          For questions about cookies or privacy, email{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
