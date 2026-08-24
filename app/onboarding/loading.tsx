import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  DesktopAppHeaderSkeleton,
  LoadingSkeleton,
  MobileAppNavSkeleton,
} from "@/components/layout/LoadingAppChrome";

export default function OnboardingLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen overflow-x-hidden bg-[var(--background)] pb-16 text-[#25302d] sm:pb-0"
    >
      <DesktopAppHeaderSkeleton subtitleWidth="w-44" />
      <MobileAppNavSkeleton />

      <section className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-[1.25rem] border border-[#d6e2e8] bg-white shadow-sm"
        >
          <div className="border-b border-[#d6e2e8] p-4 sm:p-6">
            <LoadingSkeleton className="h-3 w-24 rounded-full bg-[#c7d4da]" />
            <LoadingSkeleton className="mt-3 h-8 w-64 max-w-full rounded-full bg-[#cbd7dc]" />
            <LoadingSkeleton className="mt-3 h-4 w-full max-w-xl rounded-full bg-[#dce5e9]" />
            <LoadingSkeleton className="mt-5 h-2.5 w-full rounded-full bg-[#e7f1f4]" />
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={index === 4 ? "sm:col-span-2" : ""}>
                <LoadingSkeleton className="h-3.5 w-24 rounded-full bg-[#c7d4da]" />
                <LoadingSkeleton
                  className={`mt-2 w-full rounded-[0.8rem] bg-[#edf2f4] ring-1 ring-[#d6e2e8] ${
                    index === 4 ? "h-24" : "h-12"
                  }`}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end border-t border-[#d6e2e8] p-4 sm:p-6">
            <LoadingSkeleton className="h-12 w-36 rounded-full bg-[var(--pa-primary)]" />
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
