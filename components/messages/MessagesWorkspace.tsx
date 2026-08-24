"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { LogoMark } from "@/components/brand/LogoMark";
import { ConversationCardsList } from "@/components/messages/ConversationCardsList";
import { ProfileActivityBadge } from "@/components/profile/ProfileActivityBadge";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import {
  getProfilePhotoVariantUrl,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";
import {
  formatCountryName,
  formatFamilyDisplayName,
} from "@/lib/i18n/formatters";
import type { LanguageCode } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translations";
import type { ConversationCard } from "@/lib/messages/conversation-cards";
import type { ConversationListLabels } from "@/components/messages/ConversationCardsList";

type MessagesWorkspaceLabels = ConversationListLabels & {
  messages: string;
  searchPlaceholder: string;
  newMessage: string;
  yourMessages: string;
  sendMessage: string;
  searchProfilesPlaceholder: string;
  noMatches: string;
  to: string;
  close: string;
  firstMessage: string;
  startingConversation: string;
  couldNotStartConversation: string;
};

type ProfileSuggestion = {
  id: string;
  publicSlug: string | null;
  accountType: "family" | "au_pair";
  fullName: string | null;
  city: string | null;
  country: string | null;
  photoUrl: string | null;
  activityStatus?: string | null;
  verificationStatus?: string | null;
};

type ActionResult = {
  ok: boolean;
  error?: string;
};

const profileSuggestionCache = new Map<string, ProfileSuggestion[]>();

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

function getProfileSuggestionCacheKey(scope: string, query: string) {
  return `${scope}:${query.trim().toLocaleLowerCase()}`;
}

async function loadProfileSuggestions({
  scope,
  query,
  signal,
}: {
  scope: string;
  query: string;
  signal?: AbortSignal;
}) {
  const cacheKey = getProfileSuggestionCacheKey(scope, query);
  const cachedSuggestions = profileSuggestionCache.get(cacheKey);

  if (cachedSuggestions) {
    return cachedSuggestions;
  }

  const response = await fetch(
    `/api/messages/profile-suggestions?q=${encodeURIComponent(query)}`,
    { signal },
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    suggestions?: ProfileSuggestion[];
  };
  const suggestions = payload.suggestions ?? [];

  profileSuggestionCache.set(cacheKey, suggestions);

  return suggestions;
}

type MessagesWorkspaceProps = {
  cards: ConversationCard[];
  locale: LanguageCode;
  labels: MessagesWorkspaceLabels;
  selectedConversationId?: string;
  appHeaderVisible?: boolean;
  desktopAppHeaderVisible?: boolean;
  suggestionCacheKey: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  blockAction: (formData: FormData) => Promise<ActionResult>;
  unblockAction: (formData: FormData) => Promise<ActionResult>;
  reportAction: (formData: FormData) => Promise<ActionResult>;
  children?: ReactNode;
};

function useMessageViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let delayedUpdate = 0;
    let keyboardDismissalUpdate = 0;
    let keepFocusedConversationAtBottom = false;
    let keyboardDismissalPending = false;

    const isViewportScaled = () =>
      Math.abs((window.visualViewport?.scale ?? 1) - 1) > 0.01;

    const measureViewport = () => {
      const measuredTop = window.visualViewport?.offsetTop ?? 0;
      const measuredHeight = window.visualViewport?.height ?? window.innerHeight;

      return {
        top: Math.round(measuredTop > 0 ? measuredTop : 0),
        height: Math.round(
          measuredHeight > 0 ? measuredHeight : window.innerHeight,
        ),
      };
    };

    let restingViewport = measureViewport();

    const isMessageComposerElement = (element: EventTarget | null) =>
      element instanceof Element &&
      Boolean(element.closest("[data-message-composer]"));

    const isTextEntryElement = (element: EventTarget | null) =>
      element instanceof HTMLElement &&
      (element.matches("input, textarea, select") || element.isContentEditable);

    const getFocusedConversationScrollContainer = () => {
      const activeElement = document.activeElement;
      const composerHasFocus =
        activeElement instanceof HTMLElement &&
        Boolean(activeElement.closest("[data-message-composer]"));

      if (!composerHasFocus) return null;

      return document.querySelector<HTMLElement>(
        "[data-message-scroll-container]",
      );
    };

    const isFocusedConversationNearBottom = () => {
      const scrollContainer = getFocusedConversationScrollContainer();

      if (!scrollContainer) return false;

      // Only follow the bottom when the user was actually there before the
      // keyboard resized the viewport. A wider tolerance pulls the thread
      // away from a message the user has just scrolled up to read.
      return (
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight <=
        1
      );
    };

    const applyViewport = (
      viewport: { top: number; height: number },
      scrollFocusedConversationToBottom = false,
    ) => {
      root.style.setProperty(
        "--pa-message-viewport-offset-top",
        `${viewport.top}px`,
      );
      root.style.setProperty(
        "--pa-message-viewport-height",
        `${viewport.height}px`,
      );

      if (scrollFocusedConversationToBottom) {
        window.requestAnimationFrame(() => {
          const scrollContainer = getFocusedConversationScrollContainer();

          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        });
      }
    };

    const updateHeight = (scrollFocusedConversationToBottom = false) => {
      // Pinch zoom emits the same visualViewport events as the software
      // keyboard. Keep the last scale-1 geometry so the chat cannot jump or
      // resize even if a browser-level accessibility zoom leaks through.
      if (isViewportScaled()) {
        return;
      }

      const measuredViewport = measureViewport();
      const hasFocusedTextEntry = isTextEntryElement(document.activeElement);
      // iOS can expose a transient positive offsetTop while rubber-banding a
      // non-scrollable thread. Only keyboard-driven viewport movement should
      // reposition the fixed conversation panel.
      const viewport =
        hasFocusedTextEntry || keyboardDismissalPending
          ? measuredViewport
          : { ...measuredViewport, top: 0 };

      if (keyboardDismissalPending) {
        // Safari can keep reporting the keyboard-open viewport until its native
        // closing animation has completely finished. Do not let that stale
        // value undo the optimistic focusout update below.
        const viewportHeightStillStale =
          viewport.height + 2 < restingViewport.height;
        const viewportTopStillStale =
          Math.abs(viewport.top - restingViewport.top) > 2;

        if (viewportHeightStillStale || viewportTopStillStale) {
          return;
        }

        keyboardDismissalPending = false;
        window.clearTimeout(keyboardDismissalUpdate);
      }

      applyViewport(viewport, scrollFocusedConversationToBottom);

      if (
        !getFocusedConversationScrollContainer() &&
        !hasFocusedTextEntry
      ) {
        restingViewport = viewport;
      }
    };

    const runScheduledUpdate = () => {
      const shouldKeepAtBottom = keepFocusedConversationAtBottom;
      keepFocusedConversationAtBottom = false;
      updateHeight(shouldKeepAtBottom);
    };

    const scheduleUpdate = (preserveFocusedConversationBottom = false) => {
      keepFocusedConversationAtBottom =
        preserveFocusedConversationBottom &&
        isFocusedConversationNearBottom();
      window.clearTimeout(delayedUpdate);
      // WebKit can fire the viewport event before offsetTop has settled while
      // the keyboard opens. Waiting through the next paint avoids applying the
      // transient zero offset that briefly moves the composer to the top. Keep
      // one update queued during continuous keyboard resize events so closing
      // the keyboard cannot starve the composer until the animation finishes.
      if (frame === 0) {
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            runScheduledUpdate();
          });
        });
      }
      delayedUpdate = window.setTimeout(() => {
        window.cancelAnimationFrame(frame);
        frame = 0;
        runScheduledUpdate();
      }, 260);
    };

    const scheduleResizeUpdate = () => scheduleUpdate(true);
    const schedulePositionUpdate = () => scheduleUpdate(false);

    const handleFocusIn = (event: FocusEvent) => {
      if (isViewportScaled()) {
        return;
      }

      if (isMessageComposerElement(event.target)) {
        const viewport = measureViewport();

        keyboardDismissalPending = false;
        window.clearTimeout(keyboardDismissalUpdate);

        // focusin runs before the software keyboard changes the visual
        // viewport. Preserve that resting geometry for the next dismissal.
        if (restingViewport.height - viewport.height < 120) {
          restingViewport = viewport;
        }
      } else if (isTextEntryElement(event.target)) {
        keyboardDismissalPending = false;
        window.clearTimeout(keyboardDismissalUpdate);
      }

      schedulePositionUpdate();
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!isMessageComposerElement(event.target)) {
        schedulePositionUpdate();
        return;
      }

      queueMicrotask(() => {
        if (isMessageComposerElement(document.activeElement)) {
          return;
        }

        const viewport = measureViewport();
        const focusMovedToAnotherTextEntry = isTextEntryElement(
          document.activeElement,
        );
        const keyboardLikelyOpen =
          restingViewport.height - viewport.height >= 120 &&
          window.innerHeight - viewport.height >= 120 &&
          !isViewportScaled();
        const shouldPredictKeyboardDismissal =
          !focusMovedToAnotherTextEntry &&
          keyboardLikelyOpen;

        if (!shouldPredictKeyboardDismissal) {
          schedulePositionUpdate();
          return;
        }

        window.cancelAnimationFrame(frame);
        window.clearTimeout(delayedUpdate);
        window.clearTimeout(keyboardDismissalUpdate);
        frame = 0;
        keepFocusedConversationAtBottom = false;
        keyboardDismissalPending = true;

        // WebKit may publish the restored visual viewport only after the iOS
        // keyboard is already gone. Restore the known closed geometry now so
        // the composer is revealed together with the native keyboard motion.
        applyViewport(restingViewport);

        keyboardDismissalUpdate = window.setTimeout(() => {
          const latestViewport = measureViewport();
          const viewportRestored =
            latestViewport.height + 2 >= restingViewport.height &&
            Math.abs(latestViewport.top - restingViewport.top) <= 2;

          if (viewportRestored) {
            keyboardDismissalPending = false;
            updateHeight();
          }
        }, 600);
      });
    };

    const handleOrientationChange = () => {
      keyboardDismissalPending = false;
      window.clearTimeout(keyboardDismissalUpdate);
      scheduleResizeUpdate();
    };

    updateHeight();
    window.visualViewport?.addEventListener("resize", scheduleResizeUpdate);
    window.visualViewport?.addEventListener("scroll", schedulePositionUpdate);
    window.addEventListener("resize", scheduleResizeUpdate);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayedUpdate);
      window.clearTimeout(keyboardDismissalUpdate);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleResizeUpdate,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        schedulePositionUpdate,
      );
      window.removeEventListener("resize", scheduleResizeUpdate);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      root.style.removeProperty("--pa-message-viewport-offset-top");
      root.style.removeProperty("--pa-message-viewport-height");
    };
  }, []);
}

function getProfileSuggestionName(
  profile: ProfileSuggestion,
  t: Translate,
) {
  return profile.accountType === "family"
    ? formatFamilyDisplayName(profile.fullName, t)
    : profile.fullName;
}

function isActivityAfter(value: string, threshold: string) {
  return new Date(value).getTime() > new Date(threshold).getTime();
}

function ProfileSuggestionRow({
  profile,
  labels,
  locale,
  onSelect,
  disabled = false,
  isStarting = false,
}: {
  profile: ProfileSuggestion;
  labels: MessagesWorkspaceLabels;
  locale: LanguageCode;
  onSelect: () => void;
  disabled?: boolean;
  isStarting?: boolean;
}) {
  const t = useTranslations();
  const name = getProfileSuggestionName(profile, t);
  const avatarPhotoUrl = profile.photoUrl
    ? getProfilePhotoVariantUrl(profile.photoUrl, 96)
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-busy={isStarting || undefined}
      className={[
        "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition",
        isStarting
          ? "cursor-wait bg-[#eaf6fa] ring-1 ring-[#bfefff]"
          : "hover:bg-[#f4f6f6]",
        disabled && !isStarting ? "cursor-not-allowed opacity-45" : "",
      ].join(" ")}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#f7f3ed]">
        {avatarPhotoUrl ? (
          <Image
            src={avatarPhotoUrl}
            alt=""
            width={48}
            height={48}
            unoptimized={shouldBypassImageOptimization(avatarPhotoUrl)}
            draggable={false}
            className="pa-protected-media h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-black text-[#25302d]/20">
            PA
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 max-w-[18ch] truncate text-sm font-black">
            {name ?? labels.profile}
          </p>
          <ProfileVerificationBadge
            status={profile.verificationStatus}
            label={labels.verified}
            compact
            iconOnly
            className="shrink-0"
          />
        </div>
        <ProfileActivityBadge
          status={profile.activityStatus}
          t={t}
          className="mt-1 shrink-0 px-2 py-1 text-[0.65rem] shadow-none"
        />
        {isStarting ? (
          <p
            role="status"
            aria-live="polite"
            className="mt-1 flex items-center gap-2 text-xs font-black text-[var(--pa-primary)]"
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--pa-primary)] border-t-transparent"
            />
            <span className="truncate">{labels.startingConversation}</span>
          </p>
        ) : (
          <p className="mt-0.5 truncate text-xs font-semibold text-[#25302d]/45">
            {profile.city ? `${profile.city}, ` : ""}
            {formatCountryName(profile.country, locale, t)}
          </p>
        )}
      </div>
    </button>
  );
}

function NewMessageDialog({
  open,
  onClose,
  labels,
  locale,
  suggestionCacheKey,
  startingProfileId,
  error,
  onSelectProfile,
}: {
  open: boolean;
  onClose: () => void;
  labels: MessagesWorkspaceLabels;
  locale: LanguageCode;
  suggestionCacheKey: string;
  startingProfileId: string | null;
  error: string;
  onSelectProfile: (profile: ProfileSuggestion) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProfileSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const isStartingConversation = Boolean(startingProfileId);

  const handleClose = useCallback(() => {
    if (isStartingConversation) return;

    setQuery("");
    setSuggestions([]);
    setLoading(false);
    onClose();
  }, [isStartingConversation, onClose]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      handleClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const cachedSuggestions = profileSuggestionCache.get(
      getProfileSuggestionCacheKey(suggestionCacheKey, query),
    );

    if (cachedSuggestions) {
      const cachedUpdate = window.setTimeout(() => {
        setSuggestions(cachedSuggestions);
        setLoading(false);
      }, 0);

      return () => {
        window.clearTimeout(cachedUpdate);
        controller.abort();
      };
    }

    const timeout = window.setTimeout(async () => {
      setLoading(true);

      try {
        const nextSuggestions = await loadProfileSuggestions({
          scope: suggestionCacheKey,
          query,
          signal: controller.signal,
        });

        setSuggestions(nextSuggestions);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, query.trim() ? 120 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, suggestionCacheKey]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101312]/35 px-4 backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isStartingConversation) {
          handleClose();
        }
      }}
    >
      <div
        aria-busy={isStartingConversation || undefined}
        className="flex h-[min(680px,86vh)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl"
      >
        <div className="relative border-b border-black/10 px-5 py-4 text-center">
          <h2 className="text-base font-black">{labels.newMessage}</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isStartingConversation}
            aria-label={labels.close}
            className="absolute right-4 top-3 flex h-9 w-9 items-center justify-center rounded-full text-xl font-black leading-none text-[#25302d] hover:bg-[#f3f4f4] disabled:cursor-wait disabled:opacity-45"
          >
            x
          </button>
        </div>

        <label className="flex items-center gap-3 border-b border-black/10 px-5 py-3">
          <span className="text-sm font-black">{labels.to}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            disabled={isStartingConversation}
            placeholder={labels.searchProfilesPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-[#25302d]/35 disabled:cursor-wait"
          />
        </label>

        {error ? (
          <p className="mx-3 mt-3 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] px-4 py-3 text-sm font-black text-[#9d3f2f]">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain p-3">
          {loading ? (
            <p className="p-4 text-sm font-semibold text-[#25302d]/45">
              ...
            </p>
          ) : suggestions.length > 0 ? (
            suggestions.map((profile) => (
              <ProfileSuggestionRow
                key={profile.id}
                profile={profile}
                labels={labels}
                locale={locale}
                onSelect={() => {
                  onSelectProfile(profile);
                }}
                disabled={Boolean(startingProfileId)}
                isStarting={startingProfileId === profile.id}
              />
            ))
          ) : (
            <p className="p-4 text-sm font-semibold text-[#25302d]/45">
              {labels.noMatches}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessagesWorkspace({
  cards,
  locale,
  labels,
  selectedConversationId,
  appHeaderVisible = true,
  desktopAppHeaderVisible = appHeaderVisible,
  suggestionCacheKey,
  deleteAction,
  blockAction,
  unblockAction,
  reportAction,
  children,
}: MessagesWorkspaceProps) {
  useMessageViewportHeight();

  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<
    ProfileSuggestion[]
  >([]);
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] =
    useState(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [startingProfileId, setStartingProfileId] = useState<string | null>(
    null,
  );
  const [startingConversationId, setStartingConversationId] = useState<
    string | null
  >(null);
  const [conversationStartError, setConversationStartError] = useState("");
  const [hiddenConversationActivityAt, setHiddenConversationActivityAt] =
    useState<Map<string, string>>(() => new Map());

  const visibleCards = useMemo(
    () =>
      cards.filter((card) => {
        const hiddenAt = hiddenConversationActivityAt.get(
          card.conversation.id,
        );

        if (!hiddenAt) return true;

        return new Date(card.activityAt).getTime() > new Date(hiddenAt).getTime();
      }),
    [cards, hiddenConversationActivityAt],
  );

  const handleConversationDeleted = useCallback(
    (conversationId: string) => {
      const hiddenAt =
        cards.find((card) => card.conversation.id === conversationId)
          ?.activityAt ?? new Date().toISOString();

      setHiddenConversationActivityAt((current) => {
        const next = new Map(current);
        next.set(conversationId, hiddenAt);
        return next;
      });
    },
    [cards],
  );

  const startConversation = useCallback(
    (profile: ProfileSuggestion) => {
      if (startingProfileId || startingConversationId) return;

      setConversationStartError("");

      const existingConversation = cards.find(
        (card) => card.otherProfile?.id === profile.id,
      );
      const existingHiddenAt = existingConversation
        ? hiddenConversationActivityAt.get(existingConversation.conversation.id)
        : null;
      const existingConversationIsHidden =
        Boolean(existingConversation && existingHiddenAt) &&
        !isActivityAfter(
          existingConversation?.activityAt ?? "",
          existingHiddenAt ?? "",
        );

      if (existingConversation && !existingConversationIsHidden) {
        setStartingProfileId(profile.id);
        setStartingConversationId(existingConversation.conversation.id);
        router.push(
          `/messages?conversation=${existingConversation.conversation.id}`,
          { scroll: false },
        );
        return;
      }

      setStartingProfileId(profile.id);
      setStartingConversationId(null);

      void fetch("/api/messages/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId: profile.id }),
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            conversationId?: string;
          };

          if (!response.ok || !payload.conversationId) {
            throw new Error("Could not start conversation");
          }

          const conversationId = String(payload.conversationId);

          setStartingConversationId(conversationId);
          router.push(`/messages?conversation=${conversationId}`, {
            scroll: false,
          });
        })
        .catch(() => {
          setStartingProfileId((current) =>
            current === profile.id ? null : current,
          );
          setStartingConversationId(null);
          setConversationStartError(labels.couldNotStartConversation);
        });
    },
    [
      cards,
      hiddenConversationActivityAt,
      labels.couldNotStartConversation,
      router,
      startingConversationId,
      startingProfileId,
    ],
  );

  useEffect(() => {
    if (
      !startingConversationId ||
      selectedConversationId !== startingConversationId
    ) {
      return;
    }

    const closeAfterRender = window.setTimeout(() => {
      setNewMessageOpen(false);
      setSearchQuery("");
      setSearchSuggestions([]);
      setConversationStartError("");
      setStartingProfileId(null);
      setStartingConversationId(null);
    }, 0);

    return () => {
      window.clearTimeout(closeAfterRender);
    };
  }, [selectedConversationId, startingConversationId]);

  useEffect(() => {
    const normalizedSearch = searchQuery.trim();

    if (!normalizedSearch) {
      const resetSearch = window.setTimeout(() => {
        setSearchSuggestions([]);
        setSearchSuggestionsLoading(false);
      }, 0);

      return () => window.clearTimeout(resetSearch);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchSuggestionsLoading(true);

      try {
        const nextSuggestions = await loadProfileSuggestions({
          scope: suggestionCacheKey,
          query: normalizedSearch,
          signal: controller.signal,
        });

        setSearchSuggestions(nextSuggestions);
      } catch {
        if (!controller.signal.aborted) {
          setSearchSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchSuggestionsLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery, suggestionCacheKey]);

  const hasActivePanel = Boolean(selectedConversationId);
  const gridHeightClass = desktopAppHeaderVisible
    ? "lg:h-[calc(var(--pa-message-viewport-height,100svh)-7.75rem)]"
    : "lg:h-[calc(var(--pa-message-viewport-height,100svh)-4rem)]";
  const activePanelHeightClass = appHeaderVisible
    ? "h-[calc(var(--pa-message-viewport-height,100svh)-65px)] sm:h-[calc(var(--pa-message-viewport-height,100svh)-170px)]"
    : "h-[var(--pa-message-viewport-height,100svh)] sm:h-[calc(var(--pa-message-viewport-height,100svh)-64px)]";

  const leftPane = useMemo(
    () => (
      <aside
        data-messages-inbox-pane="true"
        className={`h-[calc(var(--pa-message-viewport-height,100svh)-3.5rem-env(safe-area-inset-bottom))] min-h-0 min-w-0 max-w-full flex-col border-black/10 bg-[#f7f9fa] sm:h-auto sm:min-h-[calc(var(--pa-message-viewport-height,100svh)-7.75rem)] lg:h-full lg:min-h-0 lg:border-r lg:bg-[#fbfcfd] ${
          hasActivePanel ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="bg-[#f7f9fa] px-5 pb-3 pt-5 lg:bg-[#fbfcfd] lg:p-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-2xl font-black tracking-[-0.04em]">
              {labels.messages}
            </h1>
            <button
              type="button"
              onClick={() => {
                setConversationStartError("");
                setNewMessageOpen(true);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pa-primary)] text-xl font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)]"
              aria-label={labels.newMessage}
            >
              +
            </button>
          </div>

          <label className="mt-4 flex h-12 items-center gap-2 rounded-full bg-white px-4 shadow-sm ring-1 ring-[#dfe7eb]">
            <SearchIcon className="h-5 w-5 shrink-0 text-[#25302d]/35" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-[#25302d]/38"
            />
          </label>

          {searchQuery.trim() ? (
            <div className="mt-3 overflow-hidden rounded-[1.25rem] bg-white ring-1 ring-black/10">
              {searchSuggestionsLoading ? (
                <p className="p-4 text-sm font-semibold text-[#25302d]/45">
                  ...
                </p>
              ) : searchSuggestions.length > 0 ? (
                <div className="p-1">
                  {searchSuggestions.map((profile) => (
                    <ProfileSuggestionRow
                      key={profile.id}
                      profile={profile}
                      labels={labels}
                      locale={locale}
                      onSelect={() => {
                        startConversation(profile);
                      }}
                      disabled={Boolean(startingProfileId)}
                      isStarting={startingProfileId === profile.id}
                    />
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm font-semibold text-[#25302d]/45">
                  {labels.noMatches}
                </p>
              )}
            </div>
          ) : null}

          {conversationStartError && !newMessageOpen ? (
            <p className="mt-3 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] px-4 py-3 text-sm font-black text-[#9d3f2f]">
              {conversationStartError}
            </p>
          ) : null}

        </div>

        <div
          data-messages-inbox-scroll-container="true"
          className="min-h-0 min-w-0 max-w-full flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-4 pt-2 lg:px-3 lg:pt-1"
        >
          {visibleCards.length > 0 ? (
            <ConversationCardsList
              cards={visibleCards}
              locale={locale}
              labels={labels}
              compact
              selectedConversationId={selectedConversationId}
              showActions
              deleteAction={deleteAction}
              blockAction={blockAction}
              unblockAction={unblockAction}
              reportAction={reportAction}
              redirectToMessagesAfterDelete
              onConversationDeleted={handleConversationDeleted}
              searchQuery={searchQuery}
            />
          ) : (
            <div className="rounded-[1.25rem] bg-[var(--background)] p-5 text-center ring-1 ring-black/5">
              <LogoMark decorative className="mx-auto h-14 w-14" />
              <p className="mt-3 text-sm font-black text-[#25302d]">
                {labels.noMessages}
              </p>
              <button
                type="button"
                onClick={() => {
                  setConversationStartError("");
                  setNewMessageOpen(true);
                }}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[var(--pa-primary)] px-4 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
              >
                {labels.newMessage}
              </button>
            </div>
          )}
        </div>
      </aside>
    ),
    [
      blockAction,
      deleteAction,
      handleConversationDeleted,
      hasActivePanel,
      labels,
      locale,
      reportAction,
      searchQuery,
      searchSuggestions,
      searchSuggestionsLoading,
      conversationStartError,
      newMessageOpen,
      selectedConversationId,
      startConversation,
      startingProfileId,
      unblockAction,
      visibleCards,
    ],
  );

  return (
    <>
      <section className="mx-auto w-full min-w-0 max-w-full flex-1 bg-white px-0 py-0 sm:bg-transparent sm:px-4 sm:py-4 lg:max-w-none lg:px-5 lg:py-3">
        <div
          className={[
            "grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-hidden bg-white sm:rounded-[1.5rem] sm:shadow-sm sm:ring-1 sm:ring-black/5 lg:grid-cols-[clamp(320px,24vw,410px)_minmax(0,1fr)]",
            gridHeightClass,
          ].join(" ")}
        >
          {leftPane}

          <div
            className={`${activePanelHeightClass} min-h-0 min-w-0 max-w-full flex-col lg:h-full ${
              hasActivePanel ? "flex" : "hidden lg:flex"
            }`}
          >
            {children ?? (
              <div className="flex min-h-[520px] flex-1 items-center justify-center border-l border-black/10 bg-[#f4f7f8] p-8 text-center">
                <div className="w-full max-w-sm rounded-[1.5rem] bg-white px-6 py-8 shadow-sm ring-1 ring-black/5">
                  <LogoMark decorative className="mx-auto h-20 w-20" />
                  <h2 className="mt-6 text-2xl font-black tracking-[-0.04em]">
                    {labels.yourMessages}
                  </h2>
                  <p className="mt-2 text-sm font-semibold text-[#25302d]/45">
                    {labels.sendMessage}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setConversationStartError("");
                      setNewMessageOpen(true);
                    }}
                    className="mt-5 rounded-xl bg-[var(--pa-primary)] px-5 py-3 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
                  >
                    {labels.newMessage}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <NewMessageDialog
        open={newMessageOpen}
        onClose={() => {
          setConversationStartError("");
          setNewMessageOpen(false);
        }}
        labels={labels}
        locale={locale}
        suggestionCacheKey={suggestionCacheKey}
        startingProfileId={startingProfileId}
        error={conversationStartError}
        onSelectProfile={startConversation}
      />
    </>
  );
}
