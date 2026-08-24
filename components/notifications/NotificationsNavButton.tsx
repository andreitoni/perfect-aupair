"use client";

import Link from "next/link";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  markSystemNotificationRead,
  respondToSocialMediaConsentNotification,
  type SocialMediaConsentResponse,
} from "@/app/notifications/actions";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { LogoMark } from "@/components/brand/LogoMark";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import { VerificationRejectedGuidance } from "@/components/profile/VerificationRejectedGuidance";
import { useAccessibleDialog } from "@/components/ui/useAccessibleDialog";
import { createClient } from "@/lib/supabase/client";
import type { SystemNotificationCard } from "@/lib/messages/system-notifications";

type ViewerProfile = {
  id: string;
  public_slug: string | null;
  account_type: "family" | "au_pair" | null;
  onboarding_completed: boolean | null;
};

type NotificationSummary = {
  profile_view_count: number | null;
  profile_view_latest_at: string | null;
  profile_favorite_count: number | null;
  profile_favorite_latest_at: string | null;
};

type OverlayItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  createdAt: string | null;
  tone: "views" | "saved" | "system";
  type?: string;
  unread?: boolean;
};

type NotificationsNavButtonProps = {
  variant?: "header" | "mobileNav";
  active?: boolean;
};

function BellIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="currentColor"
    >
      <path d="M12 2a6 6 0 0 0-6 6v2.8c0 1.3-.43 2.55-1.23 3.58l-1.06 1.36A1.4 1.4 0 0 0 4.82 18h14.36a1.4 1.4 0 0 0 1.11-2.26l-1.06-1.36A5.78 5.78 0 0 1 18 10.8V8a6 6 0 0 0-6-6Z" />
      <path d="M9.55 20a2.5 2.5 0 0 0 4.9 0h-4.9Z" />
    </svg>
  );
}

function ProfileViewIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.1"
    >
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <circle cx="10" cy="10.4" r="2.1" />
      <path d="M7 16c.72-2 5.28-2 6 0" />
      <path d="M15.5 10h1.8" />
      <path d="M15.5 13.4h1.8" />
    </svg>
  );
}

function SavedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.1"
    >
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ItemIcon({
  item,
}: {
  item: OverlayItem;
}) {
  const tone = item.tone;
  const toneClass =
    tone === "views"
      ? "bg-[#e7f1f5] text-[#45636f] ring-[#c7dce6]"
      : tone === "saved"
        ? "bg-[#f4f1ea] text-[#5a5144] ring-[#ded6c7]"
        : "bg-white text-[#25302d] ring-[#d8e0e6]";

  if (tone === "system") {
    return <LogoMark decorative className="h-11 w-11 shrink-0" />;
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ${toneClass}`}
    >
      {tone === "views" ? <ProfileViewIcon /> : <SavedIcon />}
    </span>
  );
}

function NotificationItemDetails({ item }: { item: OverlayItem }) {
  const t = useTranslations();

  return (
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span
          className={`min-w-0 flex-1 break-words text-sm font-black leading-5 ${
            item.type === "verification_rejected" ? "text-[#b33f2d]" : ""
          }`}
        >
          <span>{item.title}</span>
          {item.type === "verification_approved" ? (
            <ProfileVerificationBadge
              status="verified"
              label={t("verification.verified")}
              compact
              className="ml-1.5 inline-flex align-[-0.35rem]"
            />
          ) : null}
        </span>
        {item.unread ? (
          <span
            aria-hidden="true"
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#3b8fd9]"
          />
        ) : null}
      </span>
      {item.type === "verification_rejected" ? (
        <VerificationRejectedGuidance
          fullFaceLabel={t("verification.requirement.fullFace")}
          smileLabel={t("verification.requirement.smile")}
          twoFingersLabel={t("verification.requirement.twoFingers")}
          imageAlt={t("verification.exampleSelfieAlt")}
          compact
        />
      ) : (
        <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-[#25302d]/55">
          {item.body}
        </span>
      )}
    </span>
  );
}

function sortByCreatedAt(first: OverlayItem, second: OverlayItem) {
  const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
  const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;

  return secondTime - firstTime;
}

function opensNotificationDetail(item: OverlayItem) {
  return (
    item.type === "report_action_taken" || item.type === "conduct_warning"
  );
}

export function NotificationsNavButton({
  variant = "header",
  active = false,
}: NotificationsNavButtonProps) {
  const t = useTranslations();
  const overlayId = useId();
  const overlayTitleId = `${overlayId}-title`;
  const detailTitleId = `${overlayId}-detail-title`;
  const detailBodyId = `${overlayId}-detail-body`;
  const supabase = useMemo(() => createClient(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [detailNotification, setDetailNotification] =
    useState<OverlayItem | null>(null);
  const [visible, setVisible] = useState(true);
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [systemNotifications, setSystemNotifications] = useState<
    SystemNotificationCard[]
  >([]);
  const [respondingNotificationId, setRespondingNotificationId] = useState<
    string | null
  >(null);
  const [notificationActionError, setNotificationActionError] = useState<
    string | null
  >(null);

  const closeDetailNotification = useCallback(() => {
    setDetailNotification(null);
  }, []);
  const {
    dialogRef: detailDialogRef,
    handleDialogKeyDown: handleDetailDialogKeyDown,
  } = useAccessibleDialog({
    open: Boolean(detailNotification),
    onClose: closeDetailNotification,
    initialFocusRef: detailCloseButtonRef,
    returnFocusRef: triggerRef,
  });

  const loadNotifications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setVisible(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, public_slug, account_type, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle<ViewerProfile>();

    if (!profileRow?.onboarding_completed) {
      setVisible(false);
      return;
    }

    setVisible(true);
    setProfile(profileRow);

    const [summaryResult, notificationsResult] = await Promise.all([
      supabase.rpc("get_profile_notification_summary"),
      supabase
        .from("system_notifications")
        .select("id, type, title, body, image_url, action_href, created_at, read_at")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const loadedSummary =
      ((summaryResult.data ?? []) as NotificationSummary[])[0] ?? {
        profile_view_count: 0,
        profile_view_latest_at: null,
        profile_favorite_count: 0,
        profile_favorite_latest_at: null,
      };
    const loadedNotifications =
      (notificationsResult.data ?? []) as SystemNotificationCard[];

    setSummary(loadedSummary);
    setSystemNotifications(loadedNotifications);
  }, [supabase]);

  useEffect(() => {
    const viewportQuery = window.matchMedia("(max-width: 639px)");

    function loadForActiveViewport() {
      const isActiveViewport =
        variant === "mobileNav" ? viewportQuery.matches : !viewportQuery.matches;

      if (isActiveViewport) {
        void loadNotifications();
      }
    }

    loadForActiveViewport();
    viewportQuery.addEventListener("change", loadForActiveViewport);

    return () => {
      viewportQuery.removeEventListener("change", loadForActiveViewport);
    };
  }, [loadNotifications, variant]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!visible) {
    return null;
  }

  const actorSingular =
    profile?.account_type === "family"
      ? t("common.auPair")
      : t("common.family");
  const actorPlural =
    profile?.account_type === "family"
      ? t("common.auPairs")
      : t("common.families");
  const unreadProfileViewNotificationCount = systemNotifications.filter(
    (notification) =>
      notification.type === "profile_view_interest" && !notification.read_at,
  ).length;
  const visibleSystemNotifications = systemNotifications.filter(
    (notification) => !notification.read_at,
  );
  const viewCount = Math.max(
    Number(summary?.profile_view_count ?? 0) -
      unreadProfileViewNotificationCount,
    0,
  );
  const favoriteCount = Number(summary?.profile_favorite_count ?? 0);
  const ownProfileHref = profile
    ? `/profile/${encodeURIComponent(profile.public_slug ?? profile.id)}`
    : "/account#profile-verification";

  const items: OverlayItem[] = [];

  if (viewCount > 0) {
    items.push({
      id: "profile-views",
      title: t(
        viewCount === 1
          ? "notifications.profileViewsOne"
          : "notifications.profileViewsMany",
        {
          count: viewCount,
          profileType: actorSingular.toLocaleLowerCase(),
          profileTypePlural: actorPlural.toLocaleLowerCase(),
        },
      ),
      body: t("notifications.profileViewsBody"),
      href: "/notifications/views",
      createdAt: summary?.profile_view_latest_at ?? null,
      tone: "views",
    });
  }

  if (favoriteCount > 0) {
    items.push({
      id: "profile-saved",
      title: t(
        favoriteCount === 1
          ? "notifications.profileSavedOne"
          : "notifications.profileSavedMany",
        {
          count: favoriteCount,
          profileType: actorSingular.toLocaleLowerCase(),
          profileTypePlural: actorPlural.toLocaleLowerCase(),
        },
      ),
      body: t("notifications.profileSavedBody"),
      href: "/notifications/saved",
      createdAt: summary?.profile_favorite_latest_at ?? null,
      tone: "saved",
    });
  }

  items.push(
    ...visibleSystemNotifications.map((notification): OverlayItem => {
      let localizedCopy = {
        title: notification.title,
        body: notification.body,
      };

      if (notification.type === "profile_view_interest") {
        localizedCopy = {
          title: t("notifications.profileViewInterestTitle"),
          body: t("notifications.profileViewInterestBody"),
        };
      } else if (notification.type === "verification_approved") {
        localizedCopy = {
          title: t("verification.verifiedProfile"),
          body: t("verification.approvedHelp"),
        };
      } else if (notification.type === "verification_rejected") {
        localizedCopy = {
          title: t("verification.rejectedNotificationTitle"),
          body: t("verification.selfieRejectedInstructions"),
        };
      } else if (notification.type === "report_action_taken") {
        localizedCopy = {
          title: t("notifications.reportActionTitle"),
          body: t("notifications.reportActionBody"),
        };
      } else if (notification.type === "conduct_warning") {
        localizedCopy = {
          title: t("notifications.conductWarningTitle"),
          body: t("notifications.conductWarningBody"),
        };
      } else if (notification.type === "social_media_consent_request") {
        localizedCopy = {
          title: t("notifications.socialMediaConsentTitle"),
          body: t("notifications.socialMediaConsentBody"),
        };
      }

      return {
        id: notification.id,
        ...localizedCopy,
        href:
          notification.action_href ??
          (notification.type === "verification_approved"
            ? ownProfileHref
            : notification.type === "verification_rejected"
              ? "/account#profile-verification"
              : notification.type === "social_media_consent_request"
                ? "/account/settings#social-media-consent"
            : `/messages?notification=${notification.id}`),
        createdAt: notification.created_at,
        tone: "system",
        type: notification.type,
        unread: !notification.read_at,
      };
    }),
  );

  items.sort(sortByCreatedAt);

  const totalBadgeCount =
    viewCount +
    favoriteCount +
    systemNotifications.filter((notification) => !notification.read_at).length;
  const badgeLabel = totalBadgeCount > 9 ? "9+" : String(totalBadgeCount);
  const isMobileNav = variant === "mobileNav";
  const hasRejectedNotification = items.some(
    (item) => item.type === "verification_rejected",
  );

  async function handleSocialMediaConsentResponse(
    item: OverlayItem,
    response: SocialMediaConsentResponse,
  ) {
    setRespondingNotificationId(item.id);
    setNotificationActionError(null);

    try {
      const result = await respondToSocialMediaConsentNotification(
        item.id,
        response,
      );

      if (!result.ok) {
        setNotificationActionError(item.id);
        return;
      }

      setSystemNotifications((currentNotifications) =>
        currentNotifications.filter(
          (notification) => notification.id !== item.id,
        ),
      );
    } catch {
      setNotificationActionError(item.id);
    } finally {
      setRespondingNotificationId(null);
    }
  }

  function handleItemClick(
    event: MouseEvent<HTMLAnchorElement>,
    item: OverlayItem,
  ) {
    setOpen(false);

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    if (item.tone === "system" && item.unread) {
      const readAt = new Date().toISOString();
      setSystemNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === item.id
            ? { ...notification, read_at: readAt }
            : notification,
        ),
      );

      void markSystemNotificationRead(item.id)
        .then((result) => {
          if (!result.ok) {
            void loadNotifications();
          }
        })
        .catch(() => {
          void loadNotifications();
        });

      if (item.type === "profile_view_interest") {
        setSummary((currentSummary) =>
          currentSummary
            ? {
                ...currentSummary,
                profile_view_count: 0,
                profile_view_latest_at: null,
              }
            : currentSummary,
        );

        void supabase
          .rpc("mark_profile_activity_notifications_read", { p_kind: "views" })
          .then(({ error }) => {
            if (error) {
              void loadNotifications();
            }
          });
      }
    }

    if (opensNotificationDetail(item)) {
      event.preventDefault();
      setDetailNotification(item);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("nav.notifications")}
        title={t("nav.notifications")}
        aria-expanded={open}
        aria-controls={open ? overlayId : undefined}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            void loadNotifications();
          }
        }}
        className={
          isMobileNav
            ? [
                "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95",
                active || open
                  ? "bg-[#e9f3f6] text-[#101817] ring-1 ring-[#bdd8e2]"
                  : "text-[#101817]",
              ].join(" ")
            : "relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--pa-header-button-bg)] text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:-translate-y-0.5 hover:bg-[var(--pa-header-button-hover)] hover:shadow-md sm:h-12 sm:w-12"
        }
      >
        <BellIcon className={isMobileNav ? "h-6 w-6" : "h-5 w-5"} />
        {totalBadgeCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d95f49] px-1 text-[0.68rem] font-black leading-none text-white ring-2 ring-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={overlayId}
          role="region"
          aria-labelledby={overlayTitleId}
          className={
            isMobileNav
              ? "fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 mx-auto w-auto max-w-[22rem] overflow-hidden rounded-[1.25rem] bg-white text-[#25302d] shadow-2xl ring-1 ring-black/10"
              : `fixed left-3 right-3 top-[4.5rem] z-50 mx-auto w-auto max-w-[22rem] overflow-hidden rounded-[1.25rem] bg-white text-[#25302d] shadow-2xl ring-1 ring-black/10 sm:absolute sm:left-auto sm:right-0 sm:top-[3.35rem] sm:mx-0 sm:max-w-none ${
                  hasRejectedNotification
                    ? "sm:w-[min(28rem,calc(100vw-1.5rem))]"
                    : "sm:w-[min(22rem,calc(100vw-1.5rem))]"
                }`
          }
        >
          <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <h2
              id={overlayTitleId}
              className="text-base font-black tracking-normal"
            >
              {t("notifications.title")}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-lg font-black leading-none hover:bg-[#f3f4f4]"
            >
              x
            </button>
          </div>

          <div className="max-h-[min(70vh,31rem)] overflow-y-auto">
            {items.length > 0 ? (
              <ul className="p-2">
                {items.map((item) => (
                  <li key={item.id}>
                    {item.type === "social_media_consent_request" ? (
                      <div className="rounded-[1rem] p-3 text-left transition hover:bg-[#f4f6f6]">
                        <div className="flex gap-3">
                          <ItemIcon item={item} />
                          <NotificationItemDetails item={item} />
                        </div>
                        <div className="ml-14 mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={respondingNotificationId === item.id}
                            onClick={() =>
                              void handleSocialMediaConsentResponse(
                                item,
                                "accepted",
                              )
                            }
                            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-[#2f7d55] px-4 text-xs font-black text-white transition hover:bg-[#246542] disabled:cursor-wait disabled:opacity-60"
                          >
                            {t("notifications.accept")}
                          </button>
                          <button
                            type="button"
                            disabled={respondingNotificationId === item.id}
                            onClick={() =>
                              void handleSocialMediaConsentResponse(
                                item,
                                "declined",
                              )
                            }
                            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-[#b54535] px-4 text-xs font-black text-white transition hover:bg-[#943729] disabled:cursor-wait disabled:opacity-60"
                          >
                            {t("notifications.decline")}
                          </button>
                        </div>
                        {notificationActionError === item.id ? (
                          <p
                            role="alert"
                            className="ml-14 mt-2 text-xs font-bold leading-5 text-[#b54535]"
                          >
                            {t("notifications.responseFailed")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        prefetch={false}
                        data-pa-navigation-feedback={
                          opensNotificationDetail(item) ? "off" : undefined
                        }
                        onClick={(event) => handleItemClick(event, item)}
                        className="group flex gap-3 rounded-[1rem] p-3 text-left transition hover:bg-[#f4f6f6]"
                      >
                        <ItemIcon item={item} />
                        <NotificationItemDetails item={item} />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="m-2 px-5 py-8 text-center">
                <LogoMark decorative className="mx-auto h-14 w-14" />
                <p className="mt-3 text-sm font-black">
                  {t("notifications.emptyTitle")}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#25302d]/55">
                  {t("notifications.emptyBody")}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {detailNotification && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-[#101817]/55 p-4 backdrop-blur-[2px]"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeDetailNotification();
                }
              }}
            >
              <div
                ref={detailDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={detailTitleId}
                aria-describedby={detailBodyId}
                tabIndex={-1}
                onKeyDown={handleDetailDialogKeyDown}
                data-testid="notification-detail-dialog"
                className="w-full max-w-lg overflow-hidden rounded-[1.5rem] bg-white text-[#25302d] shadow-2xl ring-1 ring-black/10"
              >
                <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e7f1f5] text-[#25302d] ring-1 ring-[#c7dce6]"
                    >
                      <BellIcon className="h-5 w-5" />
                    </span>
                    <p className="text-sm font-black text-[#25302d]/60">
                      {t("notifications.title")}
                    </p>
                  </div>
                  <button
                    ref={detailCloseButtonRef}
                    type="button"
                    onClick={closeDetailNotification}
                    aria-label={t("common.close")}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-black leading-none transition hover:bg-[#f3f4f4]"
                  >
                    ×
                  </button>
                </div>

                <div className="max-h-[min(60vh,30rem)] overflow-y-auto px-5 py-6 sm:px-6">
                  <h2
                    id={detailTitleId}
                    className="text-xl font-black leading-tight tracking-[-0.02em] sm:text-2xl"
                  >
                    {detailNotification.title}
                  </h2>
                  <p
                    id={detailBodyId}
                    className="mt-4 whitespace-pre-wrap text-base font-semibold leading-7 text-[#25302d]/75"
                  >
                    {detailNotification.body}
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-black/10 bg-[#fafbfb] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                  {detailNotification.type === "conduct_warning" ? (
                    <Link
                      href="/safety"
                      prefetch={false}
                      onClick={closeDetailNotification}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#9caaae] bg-white px-5 text-sm font-black text-[#25302d] transition hover:bg-[#f0f4f5]"
                    >
                      {t("notifications.readSafetyRules")}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeDetailNotification}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#25302d] px-5 text-sm font-black text-white transition hover:bg-[#111817]"
                  >
                    {t("common.close")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
