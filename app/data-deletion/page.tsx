import { LegalPage } from "@/components/layout/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/site";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

export const metadata = createPublicPageMetadata({
  title: "Data Deletion Instructions",
  description:
    "Instructions for requesting deletion of your Perfect AuPair account and associated personal data.",
  path: "/data-deletion",
});

export default function DataDeletionPage() {
  return (
    <LegalPage
      translationScope="/data-deletion"
      eyebrow="Data deletion"
      title="Data Deletion Instructions"
      description="You can request deletion of your Perfect AuPair account and associated personal data from your account page or by email."
    >
      <section>
        <h2 className="text-xl font-black text-[#25302d]">Delete from your account</h2>
        <p>
          If you can access your account, go to Account and use the Delete
          account section. Your public profile will be hidden immediately and
          permanent deletion will be scheduled after 7 days.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Request deletion by email</h2>
        <p>
          If you cannot access your account, contact us at{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          from the email address connected to your account.
        </p>
        <p className="mt-3">
          Please include the subject:{" "}
          <span className="font-black text-[#25302d]">
            Data deletion request
          </span>
          .
        </p>
      </section>

      <section>
        <p>
          We will verify your request and delete your account data in
          accordance with applicable privacy laws. Limited records may be kept
          longer only where necessary for safety, abuse prevention, legal
          claims, or legal obligations.
        </p>
      </section>
    </LegalPage>
  );
}
