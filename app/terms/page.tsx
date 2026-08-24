import { LegalPage } from "@/components/layout/LegalPage";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";
import Link from "next/link";

export const metadata = createPublicPageMetadata({
  title: "Terms and Conditions",
  description: "The basic rules for using Perfect AuPair.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage
      translationScope="/terms"
      eyebrow="Terms"
      title="Terms and Conditions"
      description={`These terms describe the rules for using ${SITE_NAME} as an au pair and host family matching platform.`}
    >
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#52636a]">
        Effective July 18, 2026
      </p>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Agreement</h2>
        <p className="mt-2">
          By accessing or using Perfect AuPair, you agree to these terms and the
          Privacy Policy. If you do not agree, do not use the service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Our role: a connection platform only
        </h2>
        <p className="mt-2">
          Perfect AuPair provides online tools that let au pairs and host
          families find and communicate with each other. We are not an employer,
          recruiter, placement agency, representative, visa sponsor,
          background-check provider, insurer, payment provider, or party to any
          relationship, agreement, travel plan, employment, or dispute between
          users. We do not arrange placements, supervise users, hold user funds,
          or make decisions for them.
        </p>
        <p className="mt-3">
          Each user independently decides whom to contact, what information to
          share, which checks to perform, and whether to enter or continue an
          arrangement. No user may bind Perfect AuPair or represent that they act
          for us.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Eligibility and account duties
        </h2>
        <p className="mt-2">
          You must be at least 18, legally able to agree to these terms, and
          permitted to use the service under applicable law. You must provide
          accurate information, protect your credentials, promptly report
          suspected unauthorized access, and remain responsible for activity on
          your account. Host families must not create accounts for children or
          publish identifying child information that should remain private.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Your conduct and content</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Use accurate information and do not impersonate or mislead anyone.</li>
          <li>Treat other members respectfully; harassment, threats, hate, discrimination, and intimidation are not allowed.</li>
          <li>Do not scam, spam, pressure, mislead, extort, or ask for unsafe payments or deposits.</li>
          <li>Do not upload illegal, explicit, abusive, violent, exploitative, or unsafe content.</li>
          <li>Do not share another person&apos;s private information without consent.</li>
          <li>Do not scrape data, access accounts or systems without authorization, or bypass restrictions or safety controls.</li>
          <li>Do not use the service for illegal work, trafficking, exploitation, or arrangements that violate immigration, labor, tax, or child-safety laws.</li>
        </ul>
        <p className="mt-3">
          You are solely responsible for content you submit and must have all
          necessary rights and permissions. You are also responsible for losses,
          claims, or consequences caused by your content, conduct, promises, or
          arrangements with other users.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Independent checks and legal compliance
        </h2>
        <p className="mt-2">
          Users must independently verify identity, references, background,
          qualifications, household circumstances, duties, compensation,
          insurance, travel, and any other material information before relying
          on it. Users are solely responsible for obtaining professional advice
          and complying with immigration, employment, tax, childcare, housing,
          insurance, and other laws that apply to them.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">User interactions and safety</h2>
        <p className="mt-2">
          Online and offline interactions are between users and are undertaken at
          their own risk. Verification indicators, moderation, reports, or other
          safety features are limited signals, not endorsements or guarantees of
          identity, character, legality, compatibility, or safety. Users should
          follow the Safety Center guidance and contact local emergency services
          or law enforcement where appropriate.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">License to user content</h2>
        <p className="mt-2">
          You retain ownership of your content. By submitting it, you grant
          Perfect AuPair a non-exclusive, worldwide, royalty-free license to
          host, store, reproduce, process, display, transmit, and adapt it only
          as needed to operate, secure, moderate, and improve the service. This
          license ends when the content is deleted, except for limited copies
          lawfully retained for safety, legal, or technical reasons.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Moderation and enforcement</h2>
        <p className="mt-2">
          We may review reports, use automated or manual review, restrict
          features, remove content, suspend or terminate accounts, preserve
          evidence, and notify authorities where permitted or required. Safety
          tools reduce risk but cannot detect or prevent every violation. To the
          extent permitted by law, offering moderation or verification does not
          create a general duty to monitor users or guarantee outcomes.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Third-party information and services</h2>
        <p className="mt-2">
          User content, external links, official guidance, and third-party
          services are outside our control. Their availability does not mean we
          endorse or guarantee them. Users must review third-party terms and
          verify current information directly with the relevant authority or
          provider.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">No guarantees</h2>
        <p className="mt-2">
          The service is provided on an “as available” basis. To the fullest
          extent permitted by law, we make no promise that it will be
          uninterrupted, error-free, secure in every circumstance, or that any
          profile, content, message, match, response, arrangement, job, travel
          outcome, visa decision, or user-provided information will be accurate,
          lawful, suitable, safe, or successful.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Limitation of liability</h2>
        <p className="mt-2">
          To the fullest extent permitted by applicable law, Perfect AuPair is
          not liable for conduct or content of users; arrangements or disputes
          between users; reliance on user or third-party information; failed
          checks, travel, visas, employment, hosting, childcare, payments, loss
          of property, personal disputes, or events outside our reasonable
          control. We are not liable for indirect, incidental, consequential,
          special, exemplary, or punitive loss, or for lost opportunity, income,
          data, or reputation, where such exclusions are lawful.
        </p>
        <p className="mt-3">
          Nothing in these terms excludes or limits liability that cannot
          lawfully be excluded or limited, including liability for fraud or
          fraudulent misrepresentation, intentional misconduct, or death or
          personal injury caused by our negligence where applicable. Mandatory
          consumer and data-protection rights remain unaffected.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Your responsibility for claims</h2>
        <p className="mt-2">
          To the extent permitted by law, you agree to reimburse Perfect AuPair
          for reasonable losses, liabilities, and costs arising from a third-party
          claim caused by your unlawful content or conduct, your infringement of
          another person&apos;s rights, or your material breach of these terms. This
          does not apply to the extent a claim was caused by our own unlawful act
          or breach.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Account closure</h2>
        <p className="mt-2">
          You may stop using the service and request account deletion. We may
          restrict or end access for rule violations, risk to users or the
          service, legal requirements, or discontinuation of the service.
          Deletion and limited lawful retention are described in the Privacy
          Policy.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">General terms</h2>
        <p className="mt-2">
          If part of these terms is unenforceable, the remaining terms continue
          to apply. A delay in enforcement is not a waiver. These terms may be
          updated for legal, safety, or service changes; material changes will be
          communicated where required. Applicable mandatory law and the
          jurisdiction of competent courts are not displaced by these terms.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Contact</h2>
        <p className="mt-2">
          For support or legal questions, contact{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . The latest terms are available at{" "}
          <Link className="font-black text-[#25302d]" href="/terms">
            {SITE_URL}/terms
          </Link>
          .
        </p>
      </section>
    </LegalPage>
  );
}
