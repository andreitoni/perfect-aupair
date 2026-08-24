import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  DesktopAppHeaderSkeleton,
  LoadingSkeleton,
  MobileAppNavSkeleton,
} from "@/components/layout/LoadingAppChrome";

export default function NewStoryLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen bg-[var(--background)] pb-16 text-[#25302d] sm:pb-0"
    >
      <DesktopAppHeaderSkeleton subtitleWidth="w-28" />
      <MobileAppNavSkeleton />

      <section className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="rounded-[1.5rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-7"
        >
          <LoadingSkeleton className="h-3 w-20 rounded-full bg-[#c7d4da]" />
          <LoadingSkeleton className="mt-4 h-8 w-64 max-w-full rounded-full bg-[#cbd7dc]" />
          <LoadingSkeleton className="mt-3 h-4 w-full max-w-xl rounded-full bg-[#dce5e9]" />

          <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <LoadingSkeleton className="h-44 rounded-[1.25rem] bg-[#edf2f4] ring-1 ring-[#d6e2e8]" />
            <LoadingSkeleton className="aspect-square rounded-[1.25rem] bg-[#e3eaed]" />
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
