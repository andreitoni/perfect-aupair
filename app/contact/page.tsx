import { LegalPage } from "@/components/layout/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/site";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";
import Link from "next/link";

export const metadata = createPublicPageMetadata({
  title: "Contact and Support",
  description:
    "Contact Perfect AuPair for support, privacy requests, and abuse reports.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <LegalPage
      translationScope="/contact"
      eyebrow="Contact"
      title="Contact and Support"
      description={`For support, privacy requests, or safety reports, contact ${SUPPORT_EMAIL}.`}
    >
      <section>
        <h2 className="text-xl font-black text-[#25302d]">Support</h2>
        <p className="mt-2">
          For account help, product questions, or feedback, email{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Report abuse or unsafe behavior</h2>
        <p className="mt-2">
          If a profile, message, story, or user behavior looks unsafe,
          misleading, abusive, exploitative, discriminatory, or illegal, report
          it from the platform where possible. You can also email{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with enough information for us to locate and review the issue. Do not
          send unnecessary identity documents or sensitive information.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Privacy and data deletion requests</h2>
        <p className="mt-2">
          For access, correction, deletion, restriction, objection, portability,
          or other privacy requests, contact support from the email address
          connected to your account so the request can be verified. For account
          deletion, you can also use the in-account deletion button or follow
          the{" "}
          <Link className="font-black text-[#25302d]" href="/data-deletion">
            Data Deletion Instructions
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Emergency note</h2>
        <p className="mt-2">
          Perfect AuPair support is not an emergency service. If someone is in
          immediate danger, contact local emergency services or law enforcement.
        </p>
      </section>
    </LegalPage>
  );
}
