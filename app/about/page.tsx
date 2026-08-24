import { LegalPage } from "@/components/layout/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/site";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";
import Link from "next/link";

export const metadata = createPublicPageMetadata({
  title: "About us",
  description:
    "Learn what Perfect AuPair stands for and how the platform helps au pairs and host families connect directly.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <LegalPage
      translationScope="/about"
      eyebrow="About us"
      title="About Perfect AuPair"
      description="Perfect AuPair is a modern matching platform for au pairs and host families who want a clear and direct way to discover each other."
    >
      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          What we do
        </h2>
        <p className="mt-2">
          Perfect AuPair gives au pairs and host families a clear place to
          create profiles, discover possible matches, and communicate directly.
          We focus on a simple experience that supports informed first contact.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Our principles
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Accurate profiles and realistic expectations.</li>
          <li>Respectful, direct communication.</li>
          <li>Careful handling of personal information.</li>
          <li>Practical reporting and safety tools.</li>
          <li>Independent checks before any commitment.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Perfect AuPair is a platform, not an agency
        </h2>
        <p className="mt-2">
          We provide the place for users to connect. We do not employ or place
          au pairs, represent either side, provide legal or immigration advice,
          or become a party to arrangements between users. Each person remains
          responsible for their decisions, checks, and legal obligations.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Learn more
        </h2>
        <p className="mt-2">
          Before making plans, read the{" "}
          <Link className="font-black text-[#25302d]" href="/safety">
            Safety Center
          </Link>
          , check the{" "}
          <Link className="font-black text-[#25302d]" href="/guides">
            country guides
          </Link>
          , learn{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/best-au-pair-website"
          >
            how to compare au pair websites
          </Link>
          , and contact{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          if you need support.
        </p>
      </section>
    </LegalPage>
  );
}
