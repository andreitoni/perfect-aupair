import { LogoMark } from "@/components/brand/LogoMark";
import {
  DesktopAppHeaderSkeleton,
  LoadingSkeleton,
  MobileAppNavSkeleton,
} from "@/components/layout/LoadingAppChrome";

type MessagesPageLoadingProps = {
  mode: "inbox" | "conversation";
};

function ConversationRowSkeleton({ index }: { index: number }) {
  const widths = ["w-36", "w-44", "w-32", "w-40", "w-28"];

  return (
    <div className="flex gap-3 rounded-[1.25rem] border border-black/10 bg-white p-3">
      <LoadingSkeleton className="h-12 w-12 shrink-0 rounded-full bg-[#e7f1f5]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <LoadingSkeleton
            className={`h-4 ${widths[index % widths.length]} max-w-full rounded-full bg-[#cfd9de]`}
          />
          <LoadingSkeleton className="h-3 w-10 rounded-full bg-[#d6e2e8]" />
        </div>
        <LoadingSkeleton className="mt-3 h-3 w-24 rounded-full bg-[#d6e2e8]" />
        <LoadingSkeleton className="mt-2 h-3 w-full rounded-full bg-[#e1e8ec]" />
      </div>
    </div>
  );
}

function ConversationListSkeleton({ hiddenOnMobile }: { hiddenOnMobile: boolean }) {
  return (
    <aside
      className={`h-[calc(var(--pa-message-viewport-height,100svh)-3.5rem-env(safe-area-inset-bottom))] min-h-0 min-w-0 max-w-full flex-col border-black/10 bg-[#f7f9fa] sm:h-auto sm:min-h-[calc(var(--pa-message-viewport-height,100svh)-7.75rem)] lg:h-full lg:min-h-0 lg:border-r lg:bg-[#fbfcfd] ${
        hiddenOnMobile ? "hidden lg:flex" : "flex"
      }`}
    >
      <div className="bg-[#f7f9fa] px-5 pb-3 pt-5 lg:bg-[#fbfcfd] lg:p-4">
        <div className="flex items-center justify-between gap-3">
          <LoadingSkeleton className="h-8 w-32 rounded-full bg-[#cfd9de]" />
          <LoadingSkeleton className="h-10 w-10 shrink-0 rounded-full bg-[var(--pa-primary)]" />
        </div>

        <LoadingSkeleton className="mt-4 h-12 rounded-full bg-white shadow-sm ring-1 ring-[#dfe7eb]" />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-hidden px-4 pb-4 pt-2 lg:px-3 lg:pt-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <ConversationRowSkeleton key={index} index={index} />
        ))}
      </div>
    </aside>
  );
}

function ConversationPanelSkeleton() {
  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-black/10 bg-white px-2.5 py-2 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <LoadingSkeleton className="h-10 w-10 shrink-0 rounded-full bg-[#eef4f5] ring-1 ring-black/10 lg:hidden" />
          <LoadingSkeleton className="h-10 w-10 shrink-0 rounded-full bg-[#e7f1f5] sm:h-16 sm:w-16 sm:rounded-2xl" />

          <div className="min-w-0 flex-1">
            <LoadingSkeleton className="h-5 w-36 max-w-[70%] rounded-full bg-[#cfd9de] sm:h-7 sm:w-48" />
            <LoadingSkeleton className="mt-2 h-3 w-28 rounded-full bg-[#e1e8ec] sm:w-36" />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LoadingSkeleton className="hidden h-10 w-28 rounded-full bg-[#eef4f5] sm:block" />
            <LoadingSkeleton className="h-10 w-10 rounded-full bg-[#eef4f5]" />
            <LoadingSkeleton className="h-10 w-10 rounded-full bg-[#eef4f5]" />
          </div>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white p-3 sm:p-6">
        <div className="mx-auto mb-5 flex justify-center">
          <LoadingSkeleton className="h-5 w-24 rounded-full bg-[#eef4f5]" />
        </div>
        <div className="space-y-4">
          <div className="flex justify-start">
            <div className="w-[72%] max-w-md rounded-[1.25rem] rounded-bl-md bg-[#f0f4f5] p-4">
              <LoadingSkeleton className="h-3 w-full rounded-full bg-[#d6e2e8]" />
              <LoadingSkeleton className="mt-2 h-3 w-4/5 rounded-full bg-[#d6e2e8]" />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="w-[62%] max-w-sm rounded-[1.25rem] rounded-br-md bg-[#e7f1f5] p-4">
              <LoadingSkeleton className="h-3 w-full rounded-full bg-[#bfd2da]" />
              <LoadingSkeleton className="mt-2 h-3 w-2/3 rounded-full bg-[#bfd2da]" />
            </div>
          </div>
          <div className="flex justify-start">
            <div className="w-[48%] max-w-xs rounded-[1.25rem] rounded-bl-md bg-[#f0f4f5] p-4">
              <LoadingSkeleton className="h-3 w-full rounded-full bg-[#d6e2e8]" />
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-black/10 bg-white px-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:py-3">
        <div className="flex min-h-12 items-center gap-2 rounded-[1.65rem] bg-white px-2 py-2 shadow-sm ring-1 ring-black/10 sm:min-h-[3.25rem] sm:px-2.5">
          <LoadingSkeleton className="h-10 w-10 shrink-0 rounded-full bg-[#eef4f5]" />
          <LoadingSkeleton className="h-4 min-w-0 flex-1 rounded-full bg-[#e1e8ec]" />
          <LoadingSkeleton className="h-10 w-10 shrink-0 rounded-full bg-[var(--pa-primary)]" />
        </div>
      </div>
    </div>
  );
}

function EmptyConversationSkeleton() {
  return (
    <div className="hidden min-h-[520px] flex-1 items-center justify-center border-l border-black/10 bg-[#f4f7f8] p-8 text-center lg:flex">
      <div className="w-full max-w-sm rounded-[1.5rem] bg-white px-6 py-8 shadow-sm ring-1 ring-black/5">
        <LogoMark decorative className="mx-auto h-20 w-20 opacity-80" />
        <LoadingSkeleton className="mx-auto mt-6 h-8 w-44 rounded-full bg-[#cfd9de]" />
        <LoadingSkeleton className="mx-auto mt-3 h-4 w-64 max-w-full rounded-full bg-[#e1e8ec]" />
        <LoadingSkeleton className="mx-auto mt-5 h-11 w-36 rounded-xl bg-[var(--pa-primary)]" />
      </div>
    </div>
  );
}

export function MessagesPageLoading({ mode }: MessagesPageLoadingProps) {
  const opensConversation = mode === "conversation";

  return (
    <main
      aria-busy="true"
      aria-live="polite"
      data-messages-loading-mode={mode}
      className={[
        "flex flex-col bg-[var(--background)] text-[#25302d]",
        opensConversation
          ? "fixed inset-x-0 top-[var(--pa-message-viewport-offset-top,0px)] z-50 h-[var(--pa-message-viewport-height,100svh)] overflow-hidden lg:static lg:z-auto lg:h-auto lg:min-h-screen lg:overflow-visible"
          : "min-h-screen",
      ].join(" ")}
    >
      {opensConversation ? (
        <div className="hidden lg:block">
          <DesktopAppHeaderSkeleton width="full" />
        </div>
      ) : (
        <>
          <DesktopAppHeaderSkeleton width="full" />
          <MobileAppNavSkeleton />
        </>
      )}

      <section className="mx-auto w-full min-w-0 max-w-full flex-1 bg-white px-0 py-0 sm:bg-transparent sm:px-4 sm:py-4 lg:max-w-none lg:px-5 lg:py-3">
        <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-hidden bg-white sm:rounded-[1.5rem] sm:shadow-sm sm:ring-1 sm:ring-black/5 lg:h-[calc(var(--pa-message-viewport-height,100svh)-7.75rem)] lg:grid-cols-[clamp(320px,24vw,410px)_minmax(0,1fr)]">
          <ConversationListSkeleton hiddenOnMobile={opensConversation} />

          <div
            className={`min-h-0 min-w-0 max-w-full flex-col lg:h-full ${
              opensConversation
                ? "flex h-[var(--pa-message-viewport-height,100svh)] sm:h-[calc(var(--pa-message-viewport-height,100svh)-64px)]"
                : "hidden"
            }`}
          >
            {opensConversation ? <ConversationPanelSkeleton /> : null}
          </div>

          {opensConversation ? null : <EmptyConversationSkeleton />}
        </div>
      </section>
    </main>
  );
}
