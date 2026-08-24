"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "@/components/i18n/I18nProvider";

type MessagesNavLinkProps = {
  variant?: "header" | "mobileNav";
  active?: boolean;
};

const UNREAD_POLL_INTERVAL_MS = 300_000;
const UNREAD_POLL_MAX_BACKOFF_MS = 900_000;
const UNREAD_FOCUS_FRESHNESS_MS = 60_000;
const UNREAD_NAVIGATION_GRACE_MS = 15_000;

type UnreadAuthState =
  | "unchecked"
  | "authenticated"
  | "unauthenticated"
  | "forbidden";

type UnreadAuthSubscription = {
  unsubscribe: () => void;
};

type UnreadRpcError = {
  code?: string;
  message?: string;
};

let unreadCount = 0;
let unreadClient: ReturnType<typeof createClient> | null = null;
let unreadRequest: Promise<void> | null = null;
let unreadPollTimer: number | null = null;
let unreadCleanupTimer: number | null = null;
let unreadGeneration = 0;
let unreadRefreshQueued = false;
let unreadConsecutiveFailures = 0;
let unreadLastPollStartedAt = 0;
let unreadAuthState: UnreadAuthState = "unchecked";
let unreadAuthenticatedUserId: string | null = null;
let unreadAuthRequest: Promise<boolean> | null = null;
let unreadAuthSubscription: UnreadAuthSubscription | null = null;

const unreadListeners = new Set<() => void>();

function getUnreadSnapshot() {
  return unreadCount;
}

function getUnreadServerSnapshot() {
  return 0;
}

function notifyUnreadListeners() {
  unreadListeners.forEach((listener) => listener());
}

function canUseUnreadStore() {
  return (
    typeof document !== "undefined" &&
    typeof navigator !== "undefined" &&
    unreadListeners.size > 0 &&
    !document.hidden &&
    navigator.onLine
  );
}

function canPollUnreadCount() {
  return canUseUnreadStore() && unreadAuthState === "authenticated";
}

function getUnreadClient() {
  const supabase = unreadClient ?? createClient();
  unreadClient = supabase;

  return supabase;
}

function clearUnreadCount() {
  if (unreadCount === 0) return;

  unreadCount = 0;
  notifyUnreadListeners();
}

function markUnreadUnauthenticated() {
  unreadGeneration += 1;
  unreadAuthState = "unauthenticated";
  unreadAuthenticatedUserId = null;
  unreadRefreshQueued = false;
  unreadConsecutiveFailures = 0;
  stopUnreadPolling();
  clearUnreadCount();
}

function markUnreadRpcForbidden() {
  unreadGeneration += 1;
  unreadAuthState = "forbidden";
  unreadRefreshQueued = false;
  unreadConsecutiveFailures = 0;
  stopUnreadPolling();
  clearUnreadCount();
}

function isUnreadPermissionError(error: UnreadRpcError) {
  return (
    error.code === "42501" ||
    /permission denied for function get_unread_sender_count/i.test(
      error.message ?? "",
    )
  );
}

function isUnreadSessionError(error: UnreadRpcError) {
  return (
    error.code === "PGRST301" ||
    /not authenticated|jwt.*(?:expired|invalid)/i.test(
      error.message ?? "",
    )
  );
}

function validateUnreadAuthentication() {
  if (!canUseUnreadStore()) {
    return Promise.resolve(false);
  }

  if (unreadAuthState === "authenticated") {
    return Promise.resolve(true);
  }

  if (
    unreadAuthState === "unauthenticated" ||
    unreadAuthState === "forbidden"
  ) {
    return Promise.resolve(false);
  }

  if (unreadAuthRequest) {
    return unreadAuthRequest;
  }

  const generation = unreadGeneration;
  const supabase = getUnreadClient();
  const request = (async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (generation !== unreadGeneration || unreadListeners.size === 0) {
        return false;
      }

      if (error) {
        // A transient Auth failure must never fall through to the protected RPC.
        // A later focus, online event, or route mount may validate again.
        unreadAuthState = "unchecked";
        return false;
      }

      if (!user) {
        markUnreadUnauthenticated();
        return false;
      }

      if (
        unreadAuthenticatedUserId &&
        unreadAuthenticatedUserId !== user.id
      ) {
        unreadGeneration += 1;
        clearUnreadCount();
      }

      unreadAuthenticatedUserId = user.id;
      unreadAuthState = "authenticated";
      unreadConsecutiveFailures = 0;

      return true;
    } catch {
      if (generation === unreadGeneration) {
        unreadAuthState = "unchecked";
      }

      return false;
    }
  })();

  unreadAuthRequest = request;
  void request.finally(() => {
    if (unreadAuthRequest === request) {
      unreadAuthRequest = null;
    }
  });

  return request;
}

function ensureUnreadAuthSubscription() {
  if (unreadAuthSubscription) return;

  const supabase = getUnreadClient();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      markUnreadUnauthenticated();
      return;
    }

    if (
      (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
      session?.user
    ) {
      const userChanged = Boolean(
        unreadAuthenticatedUserId &&
          unreadAuthenticatedUserId !== session.user.id,
      );

      if (unreadAuthState === "forbidden" && !userChanged) {
        return;
      }

      if (userChanged) {
        unreadGeneration += 1;
        clearUnreadCount();
      }

      unreadAuthenticatedUserId = session.user.id;
      unreadAuthState = "authenticated";
      unreadConsecutiveFailures = 0;
      // Supabase advises keeping Auth callbacks free of follow-up client calls.
      // Defer the RPC until the callback has released the Auth client lock.
      window.setTimeout(refreshUnreadWhenActive, 0);
    }
  });

  unreadAuthSubscription = data.subscription;
}

function getNextUnreadPollDelay() {
  return Math.min(
    UNREAD_POLL_INTERVAL_MS * 2 ** unreadConsecutiveFailures,
    UNREAD_POLL_MAX_BACKOFF_MS,
  );
}

function refreshUnreadCount(queueIfInFlight = false) {
  if (!canPollUnreadCount()) {
    return Promise.resolve();
  }

  if (unreadRequest) {
    if (queueIfInFlight) {
      unreadRefreshQueued = true;
    }

    return unreadRequest;
  }

  unreadRefreshQueued = false;
  const generation = unreadGeneration;
  const supabase = getUnreadClient();
  unreadLastPollStartedAt = Date.now();

  const request = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_unread_sender_count");

      if (generation !== unreadGeneration || unreadListeners.size === 0) {
        return;
      }

      if (error) {
        if (isUnreadPermissionError(error)) {
          // A missing execute grant cannot heal through polling. Keep this
          // user blocked until an explicit sign-out/sign-in or account change.
          markUnreadRpcForbidden();
          return;
        }

        if (isUnreadSessionError(error)) {
          // A refreshed or newly signed-in session may recover later. Until
          // then, do not turn one stale tab into an endless 401 poll.
          markUnreadUnauthenticated();
          return;
        }

        unreadConsecutiveFailures = Math.min(
          unreadConsecutiveFailures + 1,
          2,
        );
        return;
      }

      unreadConsecutiveFailures = 0;

      const parsedCount = Number(data ?? 0);
      const nextCount = Number.isFinite(parsedCount)
        ? Math.max(0, parsedCount)
        : 0;

      if (nextCount !== unreadCount) {
        unreadCount = nextCount;
        notifyUnreadListeners();
      }
    } catch {
      unreadConsecutiveFailures = Math.min(unreadConsecutiveFailures + 1, 2);
      // Keep the last known count and retry with a bounded backoff.
    }
  })();

  unreadRequest = request;
  void request.finally(() => {
    if (unreadRequest === request) {
      unreadRequest = null;

      if (
        unreadRefreshQueued &&
        unreadListeners.size > 0 &&
        canPollUnreadCount()
      ) {
        unreadRefreshQueued = false;
        void refreshUnreadCount();
        return;
      }

      scheduleUnreadPolling();
    }
  });

  return request;
}

function stopUnreadPolling() {
  if (unreadPollTimer === null) return;

  window.clearTimeout(unreadPollTimer);
  unreadPollTimer = null;
}

function scheduleUnreadPolling() {
  stopUnreadPolling();

  if (!canPollUnreadCount()) return;

  unreadPollTimer = window.setTimeout(() => {
    unreadPollTimer = null;
    void refreshUnreadCount();
  }, getNextUnreadPollDelay());
}

function refreshUnreadWhenActive() {
  if (!canUseUnreadStore()) return;

  if (unreadAuthState !== "authenticated") {
    if (unreadAuthState === "unchecked") {
      void validateUnreadAuthentication().then((authenticated) => {
        if (authenticated) refreshUnreadWhenActive();
      });
    }

    return;
  }

  if (
    Date.now() - unreadLastPollStartedAt >=
    UNREAD_FOCUS_FRESHNESS_MS
  ) {
    void refreshUnreadCount(true);
    return;
  }

  scheduleUnreadPolling();
}

function handleUnreadVisibilityChange() {
  if (document.hidden) {
    stopUnreadPolling();
    return;
  }

  refreshUnreadWhenActive();
}

function handleUnreadRefreshEvent() {
  if (!canUseUnreadStore()) return;

  if (unreadAuthState === "authenticated") {
    void refreshUnreadCount(true);
    return;
  }

  if (unreadAuthState === "unchecked") {
    void validateUnreadAuthentication().then((authenticated) => {
      if (authenticated) void refreshUnreadCount(true);
    });
  }
}

function handleUnreadOffline() {
  stopUnreadPolling();
}

function subscribeToUnreadCount(listener: () => void) {
  if (unreadCleanupTimer !== null) {
    window.clearTimeout(unreadCleanupTimer);
    unreadCleanupTimer = null;
  }

  unreadListeners.add(listener);

  if (unreadListeners.size === 1) {
    ensureUnreadAuthSubscription();
    document.addEventListener("visibilitychange", handleUnreadVisibilityChange);
    window.addEventListener("focus", refreshUnreadWhenActive);
    window.addEventListener("online", refreshUnreadWhenActive);
    window.addEventListener("offline", handleUnreadOffline);
    window.addEventListener(
      "pa:messages-read-state-changed",
      handleUnreadRefreshEvent,
    );

    refreshUnreadWhenActive();
  }

  return () => {
    unreadListeners.delete(listener);

    if (unreadListeners.size === 0) {
      // Header and mobile navigation remount together during client route
      // transitions. Defer teardown briefly so that a normal navigation does
      // not reset the shared store and immediately repeat the unread RPC.
      unreadCleanupTimer = window.setTimeout(() => {
        unreadCleanupTimer = null;

        if (unreadListeners.size > 0) return;

        stopUnreadPolling();
        document.removeEventListener(
          "visibilitychange",
          handleUnreadVisibilityChange,
        );
        window.removeEventListener("focus", refreshUnreadWhenActive);
        window.removeEventListener("online", refreshUnreadWhenActive);
        window.removeEventListener("offline", handleUnreadOffline);
        window.removeEventListener(
          "pa:messages-read-state-changed",
          handleUnreadRefreshEvent,
        );

        unreadAuthSubscription?.unsubscribe();
        unreadAuthSubscription = null;

        unreadGeneration += 1;
        unreadCount = 0;
        unreadClient = null;
        unreadRequest = null;
        unreadRefreshQueued = false;
        unreadConsecutiveFailures = 0;
        unreadLastPollStartedAt = 0;
        unreadAuthState = "unchecked";
        unreadAuthenticatedUserId = null;
        unreadAuthRequest = null;
      }, UNREAD_NAVIGATION_GRACE_MS);
    }
  };
}

function EnvelopeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="m5 7 7 6 7-6" />
    </svg>
  );
}

export function MessagesNavLink({
  variant = "header",
  active = false,
}: MessagesNavLinkProps) {
  const t = useTranslations();
  const count = useSyncExternalStore(
    subscribeToUnreadCount,
    getUnreadSnapshot,
    getUnreadServerSnapshot,
  );
  const unreadLabel = count > 9 ? "9+" : String(count);
  const isMobileNav = variant === "mobileNav";
  const messagesAriaLabel =
    count > 0
      ? t("messages.unreadConversations", { count })
      : t("nav.messages");

  return (
    <Link
      href="/messages"
      prefetch={false}
      aria-label={messagesAriaLabel}
      title={t("nav.messages")}
      className={
        isMobileNav
          ? [
              "relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-full transition active:scale-95",
              active
                ? "bg-[#e9f3f6] text-[#101817] ring-1 ring-[#bdd8e2]"
                : "text-[#101817]",
            ].join(" ")
          : "relative inline-flex h-12 w-12 shrink-0 items-center justify-center gap-1.5 overflow-visible rounded-full bg-[var(--pa-feed-action)] px-0 text-xs font-bold leading-none text-[var(--pa-feed-action-text)] shadow-sm ring-1 ring-[var(--pa-feed-action-ring)] transition hover:-translate-y-0.5 hover:bg-[var(--pa-feed-action-hover)] hover:shadow-md sm:h-12 sm:w-12 lg:w-auto lg:gap-2 lg:px-3.5 lg:text-sm"
      }
    >
      <EnvelopeIcon className={isMobileNav ? "h-6 w-6" : "h-5 w-5"} />
      {isMobileNav ? null : (
        <span className="hidden lg:inline">{t("nav.messages")}</span>
      )}

      {count > 0 ? (
        <span
          aria-hidden="true"
          className={
            isMobileNav
              ? "pointer-events-none absolute -right-0.5 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d95f49] px-1 text-[0.68rem] font-black leading-none text-white shadow-sm ring-2 ring-white"
              : "pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#bfefff] px-1 text-[0.68rem] font-black leading-none text-[#25302d] shadow-sm ring-2 ring-white lg:static lg:h-5 lg:min-w-5 lg:px-1.5 lg:text-[0.68rem] lg:shadow-none lg:ring-0"
          }
        >
          {unreadLabel}
        </span>
      ) : null}
    </Link>
  );
}
