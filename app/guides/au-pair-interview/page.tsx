import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/guides/au-pair-interview";
const TITLE = "Au Pair Interview Questions";
const DESCRIPTION =
  "Video-call questions and safety tips for au pairs and host families before matching.";

export const metadata = createPublicPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "article",
  publishedTime: "2026-06-29T00:00:00Z",
  modifiedTime: "2026-08-01T00:00:00Z",
});

export default function AuPairInterviewGuidePage() {
  return (
    <LegalPage
      translationScope="/guides/au-pair-interview"
      eyebrow="Guide"
      title="Au pair interview guide"
      description="A good match usually takes more than one chat. Use video calls to understand daily life, expectations, safety, and whether the communication feels clear and respectful."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Au pair interview", path: "/guides/au-pair-interview" },
      ]}
    >
      <GuideArticleMeta
        dateModified="2026-08-01"
        datePublished="2026-06-29"
        description={DESCRIPTION}
        headline={TITLE}
        inLanguage="en"
        path={PATH}
      />
      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Start with video calls
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Use Zoom, Google Meet, FaceTime, or another video tool where both sides can see each other clearly.</li>
          <li>Plan more than one call, ideally with different family members present at least once.</li>
          <li>Keep notes after each call so you can compare expectations before deciding.</li>
          <li>Do not send money, documents, or travel bookings because someone pressures you during a first call.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Questions host families can ask
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>What childcare experience do you have, and what ages have you cared for?</li>
          <li>What does a healthy daily routine with children look like to you?</li>
          <li>Are you comfortable with driving, pets, swimming, homework help, or infant care if relevant?</li>
          <li>How do you handle stress, homesickness, conflict, and feedback?</li>
          <li>What are your goals for language learning, culture, travel, and free time?</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Questions au pairs can ask
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>What would a normal weekday and weekend schedule look like?</li>
          <li>Which tasks are childcare, and which household tasks are expected?</li>
          <li>What private room, meals, transport, allowance, holidays, and language course support are included?</li>
          <li>How does the family handle discipline, screen time, routines, emergencies, and privacy?</li>
          <li>Who can I contact locally if I need help after I arrive?</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Red flags to pause on
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Refusing video calls or avoiding basic questions about identity, duties, or living arrangements.</li>
          <li>Pressure to travel quickly, send money, share sensitive documents, or move conversations away from safe channels too early.</li>
          <li>Unclear hours, vague pay or allowance, no private room, or expectations that sound like full-time domestic work.</li>
          <li>Disrespectful communication, changing stories, or promises that conflict with official country rules.</li>
        </ul>
        <p className="mt-3">
          After the interview, compare expectations in writing with the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/au-pair-contract"
          >
            au pair contract checklist
          </Link>{" "}
          and check the country guide for{" "}
          <Link className="font-black text-[#25302d]" href="/guides/germany">
            Germany
          </Link>
          , the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/united-kingdom"
          >
            United Kingdom
          </Link>
          , or the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/united-states"
          >
            United States
          </Link>
          .
        </p>
        <p className="mt-3">
          <Link className="font-black text-[#25302d]" href="/guides">
            Back to guides
          </Link>
        </p>
      </section>
    </LegalPage>
  );
}
