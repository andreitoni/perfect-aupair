import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  DesktopAppHeaderSkeleton,
  LoadingSkeleton,
  MobileAppNavSkeleton,
} from "@/components/layout/LoadingAppChrome";
import { ProfileSearchCardSkeleton } from "@/components/search/ProfileSearchCardSkeleton";

type ProfileListPageLoadingProps = {
  variant: "notifications" | "saved";
};

export function ProfileListPageLoading({
  variant,
}: ProfileListPageLoadingProps) {
  const isNotifications = variant === "notifications";

  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen bg-[var(--background)] pb-16 text-[#25302d] sm:pb-0"
    >
      <DesktopAppHeaderSkeleton
        subtitleWidth={isNotifications ? "w-36" : "w-28"}
      />
      <MobileAppNavSkeleton />

      <section
        className={`mx-auto w-full px-4 sm:px-6 ${
          isNotifications
            ? "max-w-[68rem] py-4 sm:py-7"
            : "max-w-[58rem] py-3 sm:px-8 sm:py-6"
        }`}
      >
        <div
          className={`rounded-[1.15rem] bg-white px-4 shadow-[0_10px_28px_rgba(38,63,69,0.06)] ring-1 ring-[#d6dee4] sm:px-5 ${
            isNotifications ? "mb-4 py-4 sm:py-5" : "mb-3 py-3 sm:mb-4 sm:py-4"
          }`}
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <LoadingSkeleton
                className={`h-7 max-w-full rounded-full bg-[#cbd7dc] sm:h-9 ${
                  isNotifications ? "w-52" : "w-40"
                }`}
              />
              <LoadingSkeleton
                className={`mt-2 h-3.5 max-w-full rounded-full bg-[#e1e8eb] ${
                  isNotifications ? "w-[32rem]" : "w-64"
                }`}
              />
            </div>

            {isNotifications ? (
              <LoadingSkeleton className="h-10 w-32 shrink-0 rounded-full bg-[var(--pa-header-button-bg)] ring-1 ring-[#c7d1d6]/70" />
            ) : null}
          </div>
        </div>

        <div className="grid w-full items-start gap-3 lg:gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <ProfileSearchCardSkeleton key={index} index={index} />
          ))}
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
