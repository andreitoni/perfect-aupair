import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  DesktopAppHeaderSkeleton,
  LoadingSkeleton,
  MobileAppNavSkeleton,
  MobileDiscoverySearchSkeleton,
  MobilePublicHeaderSkeleton,
} from "@/components/layout/LoadingAppChrome";
import { ProfileSearchCardSkeleton } from "@/components/search/ProfileSearchCardSkeleton";

function CompactStoriesSkeleton() {
  return (
    <aside
      aria-hidden="true"
      className="order-1 h-fit w-full min-w-0 max-w-full overflow-hidden px-0 py-1 lg:hidden"
    >
      <div className="pa-scrollbar-none flex max-w-full gap-2 overflow-hidden px-1 pb-1 pt-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="w-14 shrink-0 text-center">
            <LoadingSkeleton
              className={`mx-auto h-12 w-12 rounded-full ring-2 ring-offset-2 ring-offset-[var(--background)] ${
                index === 0
                  ? "bg-[#c8dfe6] ring-[var(--pa-accent)]"
                  : "bg-[#d8e0e3] ring-[#c8cdd3]"
              }`}
            />
            <LoadingSkeleton className="mx-auto mt-1.5 h-2.5 w-10 rounded-full bg-[#d6e2e8]" />
          </div>
        ))}
      </div>
    </aside>
  );
}

function SearchFiltersSkeleton() {
  return (
    <aside
      aria-hidden="true"
      className="order-2 h-fit min-w-0 max-w-full lg:sticky lg:top-24 lg:order-1"
    >
      <div className="rounded-[1rem] bg-[#f8fbfc] px-3 py-2 shadow-sm ring-1 ring-[#cddbe2] lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <LoadingSkeleton className="h-5 w-36 max-w-full rounded-full bg-[#cbd7dc]" />
            <LoadingSkeleton className="mt-1.5 h-3 w-44 max-w-full rounded-full bg-[#dce5e9]" />
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-[#d5e1e6] pt-2">
          <LoadingSkeleton className="h-10 min-w-0 flex-1 rounded-full bg-white ring-1 ring-[#c8d7de]" />
          <LoadingSkeleton className="h-10 w-24 shrink-0 rounded-full bg-[var(--pa-primary)] ring-2 ring-[#adc9d4]/45" />
        </div>
      </div>

      <div className="hidden max-h-[calc(100vh-7rem)] space-y-0 overflow-hidden rounded-[0.95rem] bg-white p-4 shadow-[0_10px_26px_rgba(38,63,69,0.05)] ring-1 ring-[#d8e0e6] lg:block">
        <div className="border-b border-[#d8e0e6] pb-4">
          <div className="flex items-center gap-3">
            <LoadingSkeleton className="h-6 w-6 rounded-full bg-[#e7f1f4]" />
            <LoadingSkeleton className="h-5 w-20 rounded-full bg-[#cbd7dc]" />
          </div>
          <LoadingSkeleton className="mt-3 h-4 w-36 rounded-full bg-[#d6e2e8]" />
        </div>

        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="border-b border-[#e1e8eb] py-4 last:border-b-0"
          >
            <LoadingSkeleton className="h-3.5 w-24 rounded-full bg-[#cbd7dc]" />
            <LoadingSkeleton className="mt-2.5 h-10 w-full rounded-[0.55rem] bg-[#edf1f2]" />
          </div>
        ))}

        <div className="grid gap-2 pt-4">
          <LoadingSkeleton className="h-10 w-full rounded-[0.55rem] bg-[var(--pa-primary)]" />
          <LoadingSkeleton className="h-10 w-full rounded-[0.55rem] bg-white ring-1 ring-[#9faeb8]" />
        </div>
      </div>
    </aside>
  );
}

function DesktopStoriesSkeleton() {
  return (
    <aside
      aria-hidden="true"
      className="order-3 hidden h-fit min-w-0 max-w-full overflow-hidden rounded-[0.95rem] bg-white p-5 shadow-[0_10px_26px_rgba(38,63,69,0.05)] ring-1 ring-[#d8e0e6] lg:sticky lg:top-24 lg:block"
    >
      <div className="flex items-center justify-between gap-3">
        <LoadingSkeleton className="h-5 w-20 rounded-full bg-[#cbd7dc]" />
        <LoadingSkeleton className="h-4 w-12 rounded-full bg-[#d6e2e8]" />
      </div>
      <div className="mt-5 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-[0.8rem] bg-white p-3 ring-1 ring-[#d8e0e6]"
          >
            <LoadingSkeleton className="h-12 w-12 shrink-0 rounded-full bg-[#d8e0e3] ring-2 ring-[#c8cdd3]" />
            <div className="min-w-0 flex-1">
              <LoadingSkeleton className="h-3.5 w-20 max-w-full rounded-full bg-[#cbd7dc]" />
              <LoadingSkeleton className="mt-2 h-3 w-14 rounded-full bg-[#e1e8eb]" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function SearchPageLoading({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen bg-[var(--background)] text-[#25302d]"
    >
      <DesktopAppHeaderSkeleton showDiscoverySearch={isAuthenticated} />
      {isAuthenticated ? null : <MobilePublicHeaderSkeleton />}
      <MobileDiscoverySearchSkeleton />
      {isAuthenticated ? <MobileAppNavSkeleton /> : null}

      <section
        className={[
          "pa-profile-feed-layout pa-profile-feed-layout--search sm:pb-5",
          isAuthenticated ? "pb-16" : "pb-5",
        ].join(" ")}
      >
        <CompactStoriesSkeleton />
        <SearchFiltersSkeleton />
        <DesktopStoriesSkeleton />

        <div className="order-3 min-w-0 lg:order-2">
          <div
            aria-hidden="true"
            className="mb-4 hidden items-center justify-between gap-4 border-b border-[#d8e0e6] px-1 pb-4 lg:flex"
          >
            <LoadingSkeleton className="h-4 w-40 rounded-full bg-[#cbd7dc]" />
            <LoadingSkeleton className="h-10 w-44 rounded-full bg-white ring-1 ring-[#c8d7de]" />
          </div>

          <div className="grid gap-3 lg:gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <ProfileSearchCardSkeleton key={index} index={index} />
            ))}
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
