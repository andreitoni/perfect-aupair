import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  DesktopAppHeaderSkeleton,
  LoadingSkeleton,
  MobileAppNavSkeleton,
} from "@/components/layout/LoadingAppChrome";

export default function ProfileMediaLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen bg-[var(--background)] pb-16 text-[#25302d] sm:pb-0"
    >
      <DesktopAppHeaderSkeleton subtitleWidth="w-36" />
      <MobileAppNavSkeleton />

      <section className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-6"
        >
          <LoadingSkeleton className="h-8 w-64 max-w-full rounded-full bg-[#cbd7dc]" />
          <LoadingSkeleton className="mt-3 h-4 w-full max-w-xl rounded-full bg-[#dce5e9]" />

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <LoadingSkeleton
                key={index}
                className="aspect-square rounded-[0.9rem] bg-[#dde5e8] ring-1 ring-[#d6e2e8]"
              />
            ))}
          </div>

          <LoadingSkeleton className="mt-7 h-7 w-44 rounded-full bg-[#cbd7dc]" />
          <LoadingSkeleton className="mt-3 aspect-video w-full max-w-md rounded-[0.9rem] bg-[#dce5e9]" />

          <div className="mt-7 flex justify-end">
            <LoadingSkeleton className="h-12 w-36 rounded-full bg-[var(--pa-primary)]" />
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
