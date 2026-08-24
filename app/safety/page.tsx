import { LegalPage } from "@/components/layout/LegalPage";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";
import Link from "next/link";

export const metadata = createPublicPageMetadata({
  title: "Safety Center",
  description:
    "Safety guidance for au pairs and host families using Perfect AuPair.",
  path: "/safety",
});

export default function SafetyPage() {
  return (
    <LegalPage
      translationScope="/safety"
      eyebrow="Safety"
      title="Safety Center"
      description={`${SITE_NAME} helps au pairs and host families connect, but every match should be checked carefully before anyone travels, shares documents, or makes commitments.`}
    >
      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Start with consistent, checkable information
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Use real profile photos and accurate profile information.</li>
          <li>A verification indicator reflects only the limited check described by the service. It is not a background check or a guarantee of identity, character, safety, or suitability.</li>
          <li>Be cautious if a profile avoids video calls, gives inconsistent details, or refuses basic questions.</li>
          <li>Compare names, locations, photos, references, and story details before making plans.</li>
          <li>Keep a record of early conversations and report suspicious behavior promptly.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Money, travel, and documents
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Do not send money to someone you have not carefully verified.</li>
          <li>Be suspicious of urgent requests for travel fees, visa fees, deposits, gift cards, crypto, or third-party payment links.</li>
          <li>Do not share passport scans, full ID documents, bank details, or sensitive personal data until you are confident the arrangement is legitimate and necessary.</li>
          <li>Use official visa, immigration, employment, and tax sources for the country involved. Perfect AuPair does not replace legal, immigration, or tax advice.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Country rules and written expectations
        </h2>
        <p className="mt-2">
          Au pair rules vary by country. Before agreeing, review the relevant
          country guide and then confirm the latest rules with official
          government, visa, sponsor, or employment-law sources.
        </p>
        <p className="mt-3">
          <Link className="font-black text-[#25302d]" href="/guides">
            Open country guides
          </Link>
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          For au pairs
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Ask for a video call with the family and, where appropriate, a tour of the home or living space.</li>
          <li>Discuss duties, hours, time off, pocket money, accommodation, meals, transport, insurance, language classes, and house rules before agreeing.</li>
          <li>Ask for written expectations and keep copies of important agreements.</li>
          <li>Tell a trusted person where you are going, who you will stay with, and how to contact you.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          For host families
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Interview candidates by video and ask about childcare experience, expectations, availability, and language level.</li>
          <li>Check references where possible and make sure local au pair, childcare, visa, and employment rules are understood.</li>
          <li>Be transparent about children, duties, schedule, accommodation, family routines, and any special requirements.</li>
          <li>Do not pressure anyone to travel, share documents, or accept terms before they have had time to review details.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Report unsafe behavior
        </h2>
        <p className="mt-2">
          Report profiles, messages, stories, or behavior that looks fake,
          misleading, abusive, exploitative, discriminatory, unsafe, or illegal.
          You can use the report option on the site or email{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-3">
          For immediate danger, contact local emergency services or law
          enforcement first. Perfect AuPair support is not an emergency service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Limits of platform safety</h2>
        <p className="mt-2">
          Perfect AuPair cannot supervise users, verify every statement, or
          prevent every harmful act. Safety tools and moderation are limited
          safeguards, not a substitute for independent checks, professional
          advice, official procedures, or personal judgment. User interactions
          and arrangements remain the responsibility of the people involved.
        </p>
      </section>
    </LegalPage>
  );
}
