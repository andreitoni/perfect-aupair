"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { MessageEmptySubmitGuard } from "@/components/messages/MessageEmptySubmitGuard";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { trackFunnelEvent } from "@/lib/analytics/client";
import {
  OPTIMISTIC_MESSAGE_DISMISS_EVENT,
  OPTIMISTIC_MESSAGE_RETRY_EVENT,
  dispatchOptimisticMessageAdd,
  dispatchOptimisticMessageRemove,
  dispatchOptimisticMessageUpdate,
  type OptimisticMessageActionPayload,
} from "@/components/messages/optimistic-message-events";
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
  IMAGE_UPLOAD_MAX_SIZE,
  compressImageForUpload,
  formatImageFileSize,
  validateImageUploadFile,
} from "@/lib/images/compress";
import {
  createMessageVideoStoragePath,
  removeMessageAudioFiles,
  removeMessageVideoFiles,
  uploadMessageAudioFile,
  uploadMessageVideoFile,
} from "@/lib/images/storage";
import { createClient } from "@/lib/supabase/client";
import {
  MESSAGE_AUDIO_MAX_DURATION_SECONDS,
  formatAudioDuration,
  getMessageAudioUploadFileExtension,
  getSupportedMessageAudioRecorderMimeType,
  validateMessageAudioDuration,
  validateMessageAudioUploadFile,
} from "@/lib/audio/upload";
import {
  MESSAGE_VIDEO_UPLOAD_ACCEPT,
  MESSAGE_VIDEO_STORAGE_MAX_SIZE,
  getMessageVideoMetadata,
  type ProfileVideoMetadata,
  validateMessageVideoUploadFile,
} from "@/lib/videos/upload";
import { prepareMessageVideoForUpload } from "@/lib/videos/message-video-compression";
import { MESSAGE_TEXT_MAX_LENGTH } from "@/lib/messages/limits";

type MessageFormProps = {
  conversationId: string;
  currentUserId: string;
  action: (formData: FormData) => void | Promise<void>;
  shouldTrackFirstMessage?: boolean;
  disabled?: boolean;
  isOtherTyping?: boolean;
  typingLabel?: string;
  onTypingChange?: (active: boolean) => void;
};

type SelectedAttachment = {
  kind: "image";
  file: File;
  name: string;
  size: string;
  url: string;
};

const MESSAGE_MEDIA_ACCEPT = `${IMAGE_UPLOAD_ACCEPT},${MESSAGE_VIDEO_UPLOAD_ACCEPT}`;
const RECORDING_WAVEFORM_BAR_COUNT = 18;
const RECORDING_WAVEFORM_MIN_HEIGHT = 6;
const RECORDING_WAVEFORM_MAX_HEIGHT = 30;
const RECORDING_WAVEFORM_UPDATE_MS = 70;
const MESSAGE_TEXT_COUNTER_THRESHOLD = MESSAGE_TEXT_MAX_LENGTH - 120;
const MESSAGE_RESERVATION_TIMEOUT_MS = 10_000;
const MESSAGE_RESERVATION_MAX_ATTEMPTS = 2;
const TRANSIENT_MESSAGE_SEND_ERROR_PATTERN =
  /abort|cancel(?:led|ed)?|fetch|load failed|network|connection|offline|request failed|unexpected response|statement timeout|timed out|timeout/i;
const MESSAGE_DRAFT_STORAGE_PREFIX = "pa_message_draft:v1";
const MESSAGE_PENDING_DRAFT_STORAGE_PREFIX = "pa_message_pending_drafts:v1";
const MESSAGE_PENDING_RESERVATION_GRACE_MS =
  MESSAGE_RESERVATION_TIMEOUT_MS + 2_000;
const MESSAGE_UNKNOWN_OUTCOME_GRACE_MS = 60_000;
const MESSAGE_OUTCOME_STABLE_ABSENCE_CHECKS = 3;
const MESSAGE_OUTCOME_RECHECK_MS = 2_000;
const MESSAGE_ACTIVE_RECONCILIATION_MS = 2_000;
const MAX_PERSISTED_PENDING_DRAFTS = 50;
const MESSAGE_COMPOSER_MAX_HEIGHT = 112;
const ATTACHMENT_CAPTION_MAX_HEIGHT = 96;
const MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subscribeToHydration = () => () => {};

type PendingTextDraft = {
  text: string;
  createdAt: number;
  dispatchedAt: number | null;
  absentChecks: number;
};

type FailedVideoSend = {
  body: string;
  file: File;
  metadata: ProfileVideoMetadata;
  storagePath: string;
};

type RuntimePendingDraftRegistry = {
  drafts: Map<string, PendingTextDraft>;
  hydrated: boolean;
  restoreSubscribers: Set<(drafts: string[]) => void>;
  refreshSubscribers: Set<() => void>;
  unseenFailure: boolean;
  needsRefresh: boolean;
};

// Client-side navigations can remount the conversation while an upload that the
// user already sent is still running. Keep that in-flight identity across those
// remounts so a new MessageForm does not cancel its reservation as abandoned.
const runtimeActiveMessageSends = new Set<string>();
const runtimePendingDraftRegistries = new Map<
  string,
  RuntimePendingDraftRegistry
>();

function getRuntimePendingDraftRegistry(storageKey: string) {
  const existingRegistry = runtimePendingDraftRegistries.get(storageKey);

  if (existingRegistry) return existingRegistry;

  const registry: RuntimePendingDraftRegistry = {
    drafts: new Map(),
    hydrated: false,
    restoreSubscribers: new Set(),
    refreshSubscribers: new Set(),
    unseenFailure: false,
    needsRefresh: false,
  };
  runtimePendingDraftRegistries.set(storageKey, registry);
  return registry;
}

function isTransientMessageSendError(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";

  return TRANSIENT_MESSAGE_SEND_ERROR_PATTERN.test(message);
}

function readPersistedPendingTextDrafts(rawValue: string | null) {
  const pendingDrafts = new Map<string, PendingTextDraft>();

  if (!rawValue) return pendingDrafts;

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) return pendingDrafts;

    for (const entry of parsed.slice(-MAX_PERSISTED_PENDING_DRAFTS)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const candidate = entry as {
        messageId?: unknown;
        text?: unknown;
        createdAt?: unknown;
        dispatchedAt?: unknown;
        absentChecks?: unknown;
      };

      if (
        typeof candidate.messageId !== "string" ||
        !MESSAGE_ID_PATTERN.test(candidate.messageId) ||
        typeof candidate.text !== "string" ||
        typeof candidate.createdAt !== "number" ||
        !Number.isFinite(candidate.createdAt)
      ) {
        continue;
      }

      pendingDrafts.set(candidate.messageId, {
        text: candidate.text.slice(0, MESSAGE_TEXT_MAX_LENGTH),
        createdAt: Math.min(candidate.createdAt, Date.now()),
        dispatchedAt:
          typeof candidate.dispatchedAt === "number" &&
          Number.isFinite(candidate.dispatchedAt)
            ? Math.min(candidate.dispatchedAt, Date.now())
            : null,
        absentChecks:
          typeof candidate.absentChecks === "number" &&
          Number.isInteger(candidate.absentChecks)
            ? Math.max(
                0,
                Math.min(
                  candidate.absentChecks,
                  MESSAGE_OUTCOME_STABLE_ABSENCE_CHECKS - 1,
                ),
              )
            : 0,
      });
    }
  } catch {
    // Ignore invalid or legacy local outbox data.
  }

  return pendingDrafts;
}

function isTouchFirstDevice() {
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

function shouldSubmitOnEnter(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
) {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing &&
    !isTouchFirstDevice()
  );
}

function resizeComposerTextarea(
  textarea: HTMLTextAreaElement | null,
  maxHeight: number,
) {
  if (!textarea) return;

  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function createSilentRecordingWaveform() {
  return Array.from(
    { length: RECORDING_WAVEFORM_BAR_COUNT },
    () => RECORDING_WAVEFORM_MIN_HEIGHT,
  );
}

function getAudioContextConstructor() {
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
    null
  );
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}

function GalleryIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
    >
      <path d="M3.5 16.5v-10a3 3 0 0 1 3-3h10" />
      <rect x="6.5" y="6.5" width="14" height="14" rx="3" />
      <circle cx="11" cy="11" r="1.25" fill="currentColor" stroke="none" />
      <path d="m8.5 17 3.4-3.5 2.8 2.8 1.8-1.8 2.2 2.3" />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function MicrophoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

function SendArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.7"
    >
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function MessageForm({
  conversationId,
  currentUserId,
  action,
  shouldTrackFirstMessage = false,
  disabled = false,
  isOtherTyping = false,
  typingLabel = "",
  onTypingChange,
}: MessageFormProps) {
  const router = useRouter();
  const t = useTranslations();
  const formRef = useRef<HTMLFormElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentCaptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputId = useId();
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioMeterContextRef = useRef<AudioContext | null>(null);
  const audioMeterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioMeterAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioMeterDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioMeterAnimationRef = useRef<number | null>(null);
  const audioMeterLastUpdateRef = useRef(0);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRecordingStartedAtRef = useRef<number | null>(null);
  const sendAudioAfterStopRef = useRef(false);
  const optimisticMessageTimestampRef = useRef(0);
  const messageReservationTailRef = useRef(Promise.resolve());
  const pendingTextDraftsRef = useRef(new Map<string, PendingTextDraft>());
  const activeMessageSendsRef = useRef(new Set<string>());
  const failedVideoSendsRef = useRef(new Map<string, FailedVideoSend>());
  const messageFormMountedRef = useRef(true);
  const activeConversationIdRef = useRef(conversationId);
  const failedVideoActionHandlerRef = useRef<
    (action: "retry" | "dismiss", messageId: string) => void
  >(() => undefined);
  const pendingDraftReconciliationSchedulerRef = useRef<
    (delayMs: number) => void
  >(() => undefined);
  const attachmentSelectionSequenceRef = useRef(0);
  const shouldTrackFirstMessageRef = useRef(shouldTrackFirstMessage);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bodyValue, setBodyValue] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<
    SelectedAttachment[]
  >([]);
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [isRequestingAudioPermission, setIsRequestingAudioPermission] =
    useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isStoppingAudio, setIsStoppingAudio] = useState(false);
  const [audioRecordingSeconds, setAudioRecordingSeconds] = useState(0);
  const [audioRecordingWaveform, setAudioRecordingWaveform] = useState(
    createSilentRecordingWaveform,
  );
  const isInteractive = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const draftStorageKey = `${MESSAGE_DRAFT_STORAGE_PREFIX}:${currentUserId}:${conversationId}`;
  const pendingDraftStorageKey = `${MESSAGE_PENDING_DRAFT_STORAGE_PREFIX}:${currentUserId}:${conversationId}`;
  const selectedAttachment =
    selectedAttachments[activeAttachmentIndex] ?? selectedAttachments[0] ?? null;
  activeConversationIdRef.current = conversationId;

  const persistDraftValue = useCallback(
    (value: string) => {
      try {
        if (value) {
          window.localStorage.setItem(draftStorageKey, value);
        } else {
          window.localStorage.removeItem(draftStorageKey);
        }
      } catch {
        // Keep the composer usable when local storage is unavailable.
      }
    },
    [draftStorageKey],
  );

  const updateBodyValue = useCallback(
    (value: string) => {
      setBodyValue(value);
      persistDraftValue(value);
    },
    [persistDraftValue],
  );

  const persistPendingTextDrafts = useCallback(() => {
    try {
      const entries = Array.from(pendingTextDraftsRef.current.entries())
        .slice(-MAX_PERSISTED_PENDING_DRAFTS)
        .map(([messageId, pendingDraft]) => ({
          messageId,
          text: pendingDraft.text,
          createdAt: pendingDraft.createdAt,
          dispatchedAt: pendingDraft.dispatchedAt,
          absentChecks: pendingDraft.absentChecks,
        }));

      if (entries.length) {
        window.localStorage.setItem(
          pendingDraftStorageKey,
          JSON.stringify(entries),
        );
      } else {
        window.localStorage.removeItem(pendingDraftStorageKey);
      }
    } catch {
      // Keep the composer usable when local storage is unavailable.
    }
  }, [pendingDraftStorageKey]);

  const restorePendingDrafts = useCallback(
    (drafts: string[]) => {
      const restorableDrafts = drafts.filter(Boolean);
      const registry = getRuntimePendingDraftRegistry(pendingDraftStorageKey);
      const subscribers = Array.from(registry.restoreSubscribers);

      if (subscribers.length) {
        subscribers.forEach((subscriber) => subscriber(restorableDrafts));
        return;
      }

      registry.unseenFailure = true;

      if (!restorableDrafts.length) return;

      let currentDraft = "";

      try {
        currentDraft = window.localStorage.getItem(draftStorageKey) ?? "";
      } catch {
        // Persist what can be recovered even when local storage cannot be read.
      }

      persistDraftValue(
        [currentDraft, ...restorableDrafts].filter(Boolean).join("\n\n"),
      );
    },
    [draftStorageKey, pendingDraftStorageKey, persistDraftValue],
  );

  const refreshCommittedMessageAfterRemount = useCallback(() => {
    if (
      messageFormMountedRef.current &&
      activeConversationIdRef.current === conversationId
    ) {
      return;
    }

    const registry = getRuntimePendingDraftRegistry(pendingDraftStorageKey);
    const subscribers = Array.from(registry.refreshSubscribers);

    if (subscribers.length) {
      subscribers.forEach((subscriber) => subscriber());
      return;
    }

    registry.needsRefresh = true;
  }, [conversationId, pendingDraftStorageKey]);

  useEffect(() => {
    messageFormMountedRef.current = true;
    const registry = getRuntimePendingDraftRegistry(pendingDraftStorageKey);
    pendingTextDraftsRef.current = registry.drafts;
    const handleRestorePendingDrafts = (drafts: string[]) => {
      if (drafts.length) {
        const currentDraft = messageInputRef.current?.value ?? "";
        const restoredDraft = [currentDraft, ...drafts]
          .filter(Boolean)
          .join("\n\n");

        persistDraftValue(restoredDraft);

        if (messageFormMountedRef.current) {
          setBodyValue(restoredDraft);
        }
      }

      if (messageFormMountedRef.current) {
        setError(t("messages.sendFailed"));
      }
    };
    const handleRefreshCommittedMessage = () => router.refresh();
    registry.restoreSubscribers.add(handleRestorePendingDrafts);
    registry.refreshSubscribers.add(handleRefreshCommittedMessage);

    if (registry.unseenFailure) {
      registry.unseenFailure = false;
      handleRestorePendingDrafts([]);
    }

    if (registry.needsRefresh) {
      registry.needsRefresh = false;
      handleRefreshCommittedMessage();
    }

    if (!registry.hydrated) {
      registry.hydrated = true;

      try {
        const persistedPendingDrafts = readPersistedPendingTextDrafts(
          window.localStorage.getItem(pendingDraftStorageKey),
        );

        persistedPendingDrafts.forEach((pendingDraft, messageId) => {
          if (!registry.drafts.has(messageId)) {
            registry.drafts.set(messageId, pendingDraft);
          }
        });
        persistPendingTextDrafts();
      } catch {
        // Keep the in-memory outbox usable when local storage is unavailable.
      }
    }

    return () => {
      messageFormMountedRef.current = false;
      registry.restoreSubscribers.delete(handleRestorePendingDrafts);
      registry.refreshSubscribers.delete(handleRefreshCommittedMessage);
    };
  }, [
    pendingDraftStorageKey,
    persistDraftValue,
    persistPendingTextDrafts,
    router,
    t,
  ]);

  useEffect(() => {
    const activeMessageSends = activeMessageSendsRef.current;
    const failedVideoSends = failedVideoSendsRef.current;
    const pendingTextDrafts = pendingTextDraftsRef.current;

    return () => {
      const abandonedFailedVideos = Array.from(
        failedVideoSends.entries(),
      );

      if (!abandonedFailedVideos.length) return;

      abandonedFailedVideos.forEach(([messageId]) => {
        activeMessageSends.delete(messageId);
        runtimeActiveMessageSends.delete(messageId);
        failedVideoSends.delete(messageId);
        pendingTextDrafts.delete(messageId);
      });
      persistPendingTextDrafts();
      restorePendingDrafts(
        abandonedFailedVideos.map(([, failedVideo]) => failedVideo.body),
      );

      const supabase = createClient();
      void Promise.allSettled(
        abandonedFailedVideos.map(([messageId]) =>
          supabase.rpc("cancel_message_send_slot", {
            p_conversation_id: conversationId,
            p_message_id: messageId,
          }),
        ),
      );
    };
  }, [conversationId, persistPendingTextDrafts, restorePendingDrafts]);

  function registerPendingTextDraft(messageId: string, value: string) {
    activeMessageSendsRef.current.add(messageId);
    runtimeActiveMessageSends.add(messageId);
    failedVideoSendsRef.current.delete(messageId);
    pendingTextDraftsRef.current.set(messageId, {
      text: value,
      createdAt: Date.now(),
      dispatchedAt: null,
      absentChecks: 0,
    });
    persistPendingTextDrafts();
    pendingDraftReconciliationSchedulerRef.current(
      MESSAGE_PENDING_RESERVATION_GRACE_MS,
    );
  }

  function restartPendingTextDraft(messageId: string, value: string) {
    activeMessageSendsRef.current.add(messageId);
    runtimeActiveMessageSends.add(messageId);
    failedVideoSendsRef.current.delete(messageId);
    pendingTextDraftsRef.current.set(messageId, {
      text: value,
      createdAt: Date.now(),
      dispatchedAt: null,
      absentChecks: 0,
    });
    persistPendingTextDrafts();
    pendingDraftReconciliationSchedulerRef.current(
      MESSAGE_PENDING_RESERVATION_GRACE_MS,
    );
  }

  function markPendingTextDraftDispatched(messageId: string) {
    const pendingDraft = pendingTextDraftsRef.current.get(messageId);

    if (!pendingDraft) return;

    pendingTextDraftsRef.current.set(messageId, {
      ...pendingDraft,
      dispatchedAt: Date.now(),
      absentChecks: 0,
    });
    persistPendingTextDrafts();
    pendingDraftReconciliationSchedulerRef.current(
      MESSAGE_UNKNOWN_OUTCOME_GRACE_MS,
    );
  }

  function settlePendingTextDraft(messageId: string, sent: boolean) {
    activeMessageSendsRef.current.delete(messageId);
    runtimeActiveMessageSends.delete(messageId);
    failedVideoSendsRef.current.delete(messageId);
    const pendingDraft = pendingTextDraftsRef.current.get(messageId);
    pendingTextDraftsRef.current.delete(messageId);
    persistPendingTextDrafts();

    if (!pendingDraft) return;

    if (!sent) {
      restorePendingDrafts([pendingDraft.text]);
      return;
    }

    if (
      !messageFormMountedRef.current ||
      activeConversationIdRef.current !== conversationId
    ) {
      return;
    }

    const currentDraft = messageInputRef.current?.value ?? "";

    if (currentDraft) {
      persistDraftValue(currentDraft);
      return;
    }

    try {
      if (window.localStorage.getItem(draftStorageKey) === pendingDraft.text) {
        persistDraftValue("");
      }
    } catch {
      // Keep the composer usable when local storage is unavailable.
    }
  }

  function deferPendingTextDraftReconciliation(messageId: string) {
    activeMessageSendsRef.current.delete(messageId);
    runtimeActiveMessageSends.delete(messageId);
    const pendingDraft = pendingTextDraftsRef.current.get(messageId);

    if (!pendingDraft) return;

    const outcomeDeadline = pendingDraft.dispatchedAt
      ? pendingDraft.dispatchedAt + MESSAGE_UNKNOWN_OUTCOME_GRACE_MS
      : pendingDraft.createdAt + MESSAGE_PENDING_RESERVATION_GRACE_MS;

    pendingDraftReconciliationSchedulerRef.current(
      Math.max(250, outcomeDeadline - Date.now()),
    );
  }

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const savedDraft = window.localStorage.getItem(draftStorageKey) ?? "";
        setBodyValue(savedDraft.slice(0, MESSAGE_TEXT_MAX_LENGTH));
      } catch {
        setBodyValue("");
      }
    });
  }, [draftStorageKey]);

  useEffect(() => {
    let disposed = false;
    let reconciliationTimer: number | null = null;
    let reconciliationDueAt: number | null = null;
    const supabase = createClient();

    function scheduleReconciliation(delayMs: number) {
      if (disposed) return;

      const dueAt = Date.now() + Math.max(0, delayMs);

      if (
        reconciliationTimer !== null &&
        reconciliationDueAt !== null &&
        reconciliationDueAt <= dueAt
      ) {
        return;
      }

      if (reconciliationTimer !== null) {
        window.clearTimeout(reconciliationTimer);
      }

      reconciliationDueAt = dueAt;
      reconciliationTimer = window.setTimeout(() => {
        reconciliationTimer = null;
        reconciliationDueAt = null;
        void reconcilePendingDrafts();
      }, Math.max(0, dueAt - Date.now()));
    }

    pendingDraftReconciliationSchedulerRef.current = scheduleReconciliation;

    async function reconcilePendingDrafts() {
      const pendingEntries = Array.from(pendingTextDraftsRef.current.entries());

      if (!pendingEntries.length || disposed) return;

      const messageIds = pendingEntries.map(([messageId]) => messageId);
      const { data, error: lookupError } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .in("id", messageIds);

      if (disposed) return;

      if (lookupError) {
        scheduleReconciliation(5_000);
        return;
      }

      const committedMessageIds = new Set(
        (data ?? []).map((message) => message.id as string),
      );
      const now = Date.now();
      const failedDrafts: Array<[string, PendingTextDraft]> = [];
      let pendingDraftsChanged = false;
      let committedMessageFound = false;
      let nextReconciliationAt = Number.POSITIVE_INFINITY;

      for (const [messageId] of pendingEntries) {
        const pendingDraft = pendingTextDraftsRef.current.get(messageId);

        if (!pendingDraft) continue;

        if (committedMessageIds.has(messageId)) {
          activeMessageSendsRef.current.delete(messageId);
          runtimeActiveMessageSends.delete(messageId);
          failedVideoSendsRef.current.delete(messageId);
          pendingTextDraftsRef.current.delete(messageId);
          pendingDraftsChanged = true;
          committedMessageFound = true;
          continue;
        }

        if (failedVideoSendsRef.current.has(messageId)) {
          continue;
        }

        if (
          activeMessageSendsRef.current.has(messageId) ||
          runtimeActiveMessageSends.has(messageId)
        ) {
          nextReconciliationAt = Math.min(
            nextReconciliationAt,
            now + MESSAGE_ACTIVE_RECONCILIATION_MS,
          );
          continue;
        }

        const outcomeDeadline = pendingDraft.dispatchedAt
          ? pendingDraft.dispatchedAt + MESSAGE_UNKNOWN_OUTCOME_GRACE_MS
          : pendingDraft.createdAt + MESSAGE_PENDING_RESERVATION_GRACE_MS;

        if (now < outcomeDeadline) {
          nextReconciliationAt = Math.min(
            nextReconciliationAt,
            outcomeDeadline,
          );
          continue;
        }

        const absentChecks = pendingDraft.absentChecks + 1;

        if (absentChecks < MESSAGE_OUTCOME_STABLE_ABSENCE_CHECKS) {
          pendingTextDraftsRef.current.set(messageId, {
            ...pendingDraft,
            absentChecks,
          });
          pendingDraftsChanged = true;
          nextReconciliationAt = Math.min(
            nextReconciliationAt,
            now + MESSAGE_OUTCOME_RECHECK_MS,
          );
        } else {
          activeMessageSendsRef.current.delete(messageId);
          runtimeActiveMessageSends.delete(messageId);
          pendingTextDraftsRef.current.delete(messageId);
          dispatchOptimisticMessageRemove(messageId);
          failedDrafts.push([messageId, pendingDraft]);
          pendingDraftsChanged = true;
        }
      }

      if (pendingDraftsChanged) {
        persistPendingTextDrafts();
      }

      if (committedMessageFound) {
        router.refresh();
      }

      if (failedDrafts.length) {
        restorePendingDrafts(
          failedDrafts.map(([, pendingDraft]) => pendingDraft.text),
        );
        void Promise.allSettled(
          failedDrafts
            .filter(([, pendingDraft]) => !pendingDraft.dispatchedAt)
            .map(([messageId]) =>
              supabase.rpc("cancel_message_send_slot", {
                p_conversation_id: conversationId,
                p_message_id: messageId,
              }),
            ),
        );
      }

      if (
        pendingTextDraftsRef.current.size > 0 &&
        Number.isFinite(nextReconciliationAt)
      ) {
        scheduleReconciliation(
          Math.max(250, nextReconciliationAt - Date.now()),
        );
      }
    }

    void reconcilePendingDrafts();

    return () => {
      disposed = true;
      pendingDraftReconciliationSchedulerRef.current = () => undefined;

      if (reconciliationTimer !== null) {
        window.clearTimeout(reconciliationTimer);
      }
    };
  }, [
    conversationId,
    pendingDraftStorageKey,
    persistPendingTextDrafts,
    restorePendingDrafts,
    router,
  ]);

  useEffect(() => {
    const handleRetry = (event: Event) => {
      const payload = (event as CustomEvent<OptimisticMessageActionPayload>)
        .detail;

      if (!payload || payload.conversationId !== conversationId) return;
      failedVideoActionHandlerRef.current("retry", payload.id);
    };
    const handleDismiss = (event: Event) => {
      const payload = (event as CustomEvent<OptimisticMessageActionPayload>)
        .detail;

      if (!payload || payload.conversationId !== conversationId) return;
      failedVideoActionHandlerRef.current("dismiss", payload.id);
    };

    window.addEventListener(OPTIMISTIC_MESSAGE_RETRY_EVENT, handleRetry);
    window.addEventListener(OPTIMISTIC_MESSAGE_DISMISS_EVENT, handleDismiss);

    return () => {
      window.removeEventListener(OPTIMISTIC_MESSAGE_RETRY_EVENT, handleRetry);
      window.removeEventListener(
        OPTIMISTIC_MESSAGE_DISMISS_EVENT,
        handleDismiss,
      );
    };
  }, [conversationId]);

  useEffect(() => {
    const persistCurrentDraft = () => {
      persistDraftValue(messageInputRef.current?.value ?? "");
      persistPendingTextDrafts();
    };

    window.addEventListener("pagehide", persistCurrentDraft);

    return () => {
      window.removeEventListener("pagehide", persistCurrentDraft);
    };
  }, [persistDraftValue, persistPendingTextDrafts]);

  useLayoutEffect(() => {
    const messageInput = messageInputRef.current;
    const scrollContainer =
      messageInput
        ?.closest("form[data-message-composer]")
        ?.parentElement?.querySelector<HTMLElement>(
          "[data-message-scroll-container]",
        ) ?? null;
    const shouldKeepConversationAtBottom =
      document.activeElement === messageInput &&
      scrollContainer !== null &&
      scrollContainer.scrollHeight -
        scrollContainer.scrollTop -
        scrollContainer.clientHeight <=
        1;

    resizeComposerTextarea(messageInputRef.current, MESSAGE_COMPOSER_MAX_HEIGHT);
    resizeComposerTextarea(
      attachmentCaptionInputRef.current,
      ATTACHMENT_CAPTION_MAX_HEIGHT,
    );

    if (!shouldKeepConversationAtBottom || !scrollContainer) {
      return;
    }

    const scrollToBottom = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [bodyValue, selectedAttachments.length]);

  function trackFirstMessageSent(params: {
    message_kind: string;
    has_text: boolean;
  }) {
    if (!shouldTrackFirstMessageRef.current) return;

    shouldTrackFirstMessageRef.current = false;
    trackFunnelEvent("message_sent", params);
  }

  function createOptimisticMessageCreatedAt() {
    const timestamp = Math.max(
      Date.now(),
      optimisticMessageTimestampRef.current + 1,
    );

    optimisticMessageTimestampRef.current = timestamp;

    return new Date(timestamp).toISOString();
  }

  function reserveMessageSentAt(messageId: string) {
    const reservation = messageReservationTailRef.current.then(async () => {
      const deadline = Date.now() + MESSAGE_RESERVATION_TIMEOUT_MS;

      for (
        let attempt = 0;
        attempt < MESSAGE_RESERVATION_MAX_ATTEMPTS;
        attempt += 1
      ) {
        const remainingTime = deadline - Date.now();

        if (remainingTime <= 0) {
          throw new Error(t("messages.sendFailed"));
        }

        const supabase = createClient();
        const abortController = new AbortController();
        const timeout = window.setTimeout(
          () => abortController.abort(),
          remainingTime,
        );

        try {
          const { error: reservationError } = await supabase
            .rpc("reserve_message_send_slot", {
              p_conversation_id: conversationId,
              p_message_id: messageId,
            })
            .abortSignal(abortController.signal);

          if (!reservationError) return;

          const retryableReservationError =
            abortController.signal.aborted ||
            isTransientMessageSendError(reservationError.message);

          if (
            retryableReservationError &&
            attempt + 1 < MESSAGE_RESERVATION_MAX_ATTEMPTS
          ) {
            continue;
          }

          throw new Error(t("messages.sendFailed"));
        } catch (error) {
          const retryableReservationError =
            abortController.signal.aborted ||
            isTransientMessageSendError(error);

          if (
            retryableReservationError &&
            attempt + 1 < MESSAGE_RESERVATION_MAX_ATTEMPTS
          ) {
            continue;
          }

          throw new Error(t("messages.sendFailed"));
        } finally {
          window.clearTimeout(timeout);
        }
      }
    });

    messageReservationTailRef.current = reservation.then(
      () => undefined,
      () => undefined,
    );

    return reservation;
  }

  function cancelMessageReservation(
    messageId: string,
    reservation: Promise<void>,
  ) {
    void reservation
      .catch(() => undefined)
      .then(async () => {
        const supabase = createClient();

        await supabase.rpc("cancel_message_send_slot", {
          p_conversation_id: conversationId,
          p_message_id: messageId,
        });
      })
      .catch(() => undefined);
  }

  const revokeSelectedAttachmentUrls = useCallback(() => {
    setSelectedAttachments((current) => {
      current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.url);
      });

      return [];
    });
    setActiveAttachmentIndex(0);
  }, []);

  useEffect(() => {
    return () => {
      revokeSelectedAttachmentUrls();
    };
  }, [revokeSelectedAttachmentUrls]);

  useEffect(() => {
    if (disabled) {
      onTypingChange?.(false);
    }

    return () => {
      onTypingChange?.(false);
    };
  }, [disabled, onTypingChange]);

  useEffect(() => {
    if (!attachmentMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        attachmentMenuRef.current?.contains(target)
      ) {
        return;
      }

      setAttachmentMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAttachmentMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [attachmentMenuOpen]);

  useEffect(() => {
    if (!isRecordingAudio) {
      return;
    }

    const interval = window.setInterval(() => {
      const startedAt = audioRecordingStartedAtRef.current;

      if (!startedAt) {
        setAudioRecordingSeconds(0);
        return;
      }

      const elapsedSeconds = (Date.now() - startedAt) / 1000;

      setAudioRecordingSeconds(elapsedSeconds);

      if (
        elapsedSeconds >= MESSAGE_AUDIO_MAX_DURATION_SECONDS &&
        audioRecorderRef.current?.state === "recording"
      ) {
        sendAudioAfterStopRef.current = true;
        setIsStoppingAudio(true);
        audioRecorderRef.current.stop();
        stopAudioLevelMeter(false);
      }
    }, 200);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRecordingAudio]);

  useEffect(() => {
    return () => {
      sendAudioAfterStopRef.current = false;

      if (audioRecorderRef.current?.state === "recording") {
        audioRecorderRef.current.stop();
      }

      stopAudioLevelMeter(false);
      stopAudioStream();
    };
  }, []);

  function resetComposer(form: HTMLFormElement) {
    form.reset();
    attachmentSelectionSequenceRef.current += 1;
    updateBodyValue("");
    onTypingChange?.(false);
    setAttachmentMenuOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    revokeSelectedAttachmentUrls();
  }

  function isComposerInputFocused() {
    const activeElement = document.activeElement;

    return (
      activeElement === messageInputRef.current ||
      activeElement === attachmentCaptionInputRef.current
    );
  }

  function keepComposerFocusOnActionPointerDown(
    event: ReactPointerEvent<HTMLElement>,
  ) {
    if (isComposerInputFocused()) {
      event.preventDefault();
    }
  }

  function restoreComposerFocusAfterSend(shouldRestoreFocus: boolean) {
    if (!shouldRestoreFocus) return;

    messageInputRef.current?.focus({ preventScroll: true });
  }

  function stopAudioStream() {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }

  function stopAudioLevelMeter(resetWaveform = true) {
    if (audioMeterAnimationRef.current !== null) {
      cancelAnimationFrame(audioMeterAnimationRef.current);
      audioMeterAnimationRef.current = null;
    }

    audioMeterSourceRef.current?.disconnect();
    audioMeterSourceRef.current = null;
    audioMeterAnalyserRef.current?.disconnect();
    audioMeterAnalyserRef.current = null;
    audioMeterDataRef.current = null;
    audioMeterLastUpdateRef.current = 0;

    const audioContext = audioMeterContextRef.current;
    audioMeterContextRef.current = null;

    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }

    if (resetWaveform) {
      setAudioRecordingWaveform(createSilentRecordingWaveform());
    }
  }

  function startAudioLevelMeter(stream: MediaStream) {
    stopAudioLevelMeter();

    try {
      const AudioContextConstructor = getAudioContextConstructor();

      if (!AudioContextConstructor) {
        return;
      }

      const audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      const data = new Uint8Array(analyser.fftSize);
      source.connect(analyser);

      audioMeterContextRef.current = audioContext;
      audioMeterSourceRef.current = source;
      audioMeterAnalyserRef.current = analyser;
      audioMeterDataRef.current = data;

      const updateMeter = (timestamp: number) => {
        const currentAnalyser = audioMeterAnalyserRef.current;
        const currentData = audioMeterDataRef.current;

        if (!currentAnalyser || !currentData) {
          return;
        }

        if (
          timestamp - audioMeterLastUpdateRef.current >=
          RECORDING_WAVEFORM_UPDATE_MS
        ) {
          currentAnalyser.getByteTimeDomainData(currentData);

          let squaredSum = 0;

          for (let index = 0; index < currentData.length; index += 1) {
            const sample = currentData[index];
            const centeredSample = (sample - 128) / 128;
            squaredSum += centeredSample * centeredSample;
          }

          const rms = Math.sqrt(squaredSum / currentData.length);
          const voiceLevel = Math.min(1, Math.max(0, (rms - 0.012) / 0.18));
          const scaledVoiceLevel = Math.pow(voiceLevel, 0.72);
          const nextHeight = Math.round(
            RECORDING_WAVEFORM_MIN_HEIGHT +
              scaledVoiceLevel *
                (RECORDING_WAVEFORM_MAX_HEIGHT -
                  RECORDING_WAVEFORM_MIN_HEIGHT),
          );

          audioMeterLastUpdateRef.current = timestamp;
          setAudioRecordingWaveform((current) => [
            ...current.slice(1),
            nextHeight,
          ]);
        }

        audioMeterAnimationRef.current = requestAnimationFrame(updateMeter);
      };

      void audioContext.resume().catch(() => undefined);
      audioMeterAnimationRef.current = requestAnimationFrame(updateMeter);
    } catch {
      stopAudioLevelMeter();
    }
  }

  function resetAudioRecordingState() {
    audioRecorderRef.current = null;
    audioChunksRef.current = [];
    audioRecordingStartedAtRef.current = null;
    stopAudioLevelMeter();
    setIsRequestingAudioPermission(false);
    setIsRecordingAudio(false);
    setIsStoppingAudio(false);
    setAudioRecordingSeconds(0);
    stopAudioStream();
  }

  function openAttachmentPicker() {
    if (
      disabled ||
      isRequestingAudioPermission ||
      isRecordingAudio ||
      isStoppingAudio
    ) {
      return;
    }

    setError("");
    setAttachmentMenuOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleFileChange(fileList: FileList | null) {
    setError("");
    setAttachmentMenuOpen(false);
    attachmentSelectionSequenceRef.current += 1;

    const files = Array.from(fileList ?? []);

    if (!files.length) {
      return;
    }

    const hasVideoSelection = files.some(isVideoFile);

    if (files.length > 1 && hasVideoSelection) {
      clearSelectedFile();
      setError(t("messages.mediaTypeError"));
      return;
    }

    if (files.length > 1) {
      const imageAttachments: SelectedAttachment[] = [];

      for (const file of files) {
        if (!isImageFile(file)) {
          imageAttachments.forEach((attachment) => {
            URL.revokeObjectURL(attachment.url);
          });
          clearSelectedFile();
          setError(t("messages.mediaTypeError"));
          return;
        }

        const validationError = validateImageUploadFile(file, {
          maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
        });

        if (validationError) {
          imageAttachments.forEach((attachment) => {
            URL.revokeObjectURL(attachment.url);
          });
          clearSelectedFile();
          setError(validationError);
          return;
        }

        imageAttachments.push({
          kind: "image",
          file,
          name: file.name,
          size: formatImageFileSize(file.size),
          url: URL.createObjectURL(file),
        });
      }

      const startIndex = selectedAttachments.length;
      setSelectedAttachments((current) => [...current, ...imageAttachments]);
      setActiveAttachmentIndex(startIndex);
      return;
    }

    const file = files[0];

    if (isImageFile(file)) {
      const validationError = validateImageUploadFile(file, {
        maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
      });

      if (validationError) {
        clearSelectedFile();
        setError(validationError);
        return;
      }

      const startIndex = selectedAttachments.length;
      setSelectedAttachments((current) => [
        ...current,
        {
          kind: "image",
          file,
          name: file.name,
          size: formatImageFileSize(file.size),
          url: URL.createObjectURL(file),
        },
      ]);
      setActiveAttachmentIndex(startIndex);
      return;
    }

    if (!isVideoFile(file)) {
      clearSelectedFile();
      setError(t("messages.mediaTypeError"));
      return;
    }

    const validationError = validateMessageVideoUploadFile(file, {
      type: t("messages.videoTypeError"),
      size: t("messages.videoSizeError"),
    });

    if (validationError) {
      clearSelectedFile();
      setError(validationError);
      return;
    }

    sendVideoAttachment(file);
  }

  function sendVideoAttachment(file: File) {
    const body = bodyValue.trim();
    const form = formRef.current;
    const shouldRestoreComposerFocus = isComposerInputFocused();

    if (!form || !isMessageBodyValid(body)) {
      return;
    }

    setNotice("");

    const optimisticMessageId = crypto.randomUUID();
    const optimisticMediaObjectUrl = URL.createObjectURL(file);

    flushSync(() => {
      dispatchOptimisticMessageAdd({
        id: optimisticMessageId,
        conversationId,
        senderId: currentUserId,
        body,
        createdAt: createOptimisticMessageCreatedAt(),
        videoObjectUrl: optimisticMediaObjectUrl,
        videoMimeType: file.type,
      });
    });

    const reservation = reserveMessageSentAt(optimisticMessageId);
    resetComposer(form);
    registerPendingTextDraft(optimisticMessageId, body);
    restoreComposerFocusAfterSend(shouldRestoreComposerFocus);

    const formData = new FormData();
    formData.set("conversation_id", conversationId);
    formData.set("message_id", optimisticMessageId);
    formData.set("body", body);
    formData.set("image", file);

    void sendFormData(formData, {
      attachmentKind: "video",
      optimisticMessageId,
      reservation,
      videoMetadata: null,
    });
  }

  async function startAudioRecording() {
    if (
      disabled ||
      isRequestingAudioPermission ||
      isRecordingAudio ||
      selectedAttachment ||
      bodyValue.trim()
    ) {
      return;
    }

    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(t("messages.audioUnsupported"));
      return;
    }

    setError("");
    setAttachmentMenuOpen(false);
    setIsRequestingAudioPermission(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const mimeType = getSupportedMessageAudioRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioRecorderRef.current = recorder;
      audioChunksRef.current = [];
      sendAudioAfterStopRef.current = false;
      startAudioLevelMeter(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const shouldSend = sendAudioAfterStopRef.current;
        const chunks = audioChunksRef.current;
        const durationSeconds =
          audioRecordingStartedAtRef.current === null
            ? audioRecordingSeconds
            : (Date.now() - audioRecordingStartedAtRef.current) / 1000;
        const rawType = recorder.mimeType || chunks[0]?.type || "audio/webm";
        const type = rawType.split(";")[0]?.trim() || "audio/webm";
        const blob = new Blob(chunks, { type });

        resetAudioRecordingState();

        if (!shouldSend) {
          return;
        }

        if (blob.size <= 0) {
          setError(t("messages.audioRecordingEmpty"));
          return;
        }

        const file = new File(
          [blob],
          `voice-message.${getMessageAudioUploadFileExtension({ type })}`,
          { type },
        );

        void sendAudioMessage(file, durationSeconds);
      };

      recorder.onerror = () => {
        resetAudioRecordingState();
        setError(t("messages.audioRecordingFailed"));
      };

      audioRecordingStartedAtRef.current = Date.now();
      setAudioRecordingSeconds(0);
      recorder.start();
      setIsRequestingAudioPermission(false);
      setIsRecordingAudio(true);
    } catch {
      resetAudioRecordingState();
      setError(t("messages.audioPermissionDenied"));
    }
  }

  function stopAudioRecording(shouldSend: boolean) {
    const recorder = audioRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      resetAudioRecordingState();
      return;
    }

    sendAudioAfterStopRef.current = shouldSend;
    setIsStoppingAudio(true);
    recorder.stop();
    stopAudioLevelMeter(false);
  }

  async function sendAudioMessage(file: File, durationSeconds: number) {
    const validationError =
      validateMessageAudioUploadFile(file, {
        type: t("messages.audioTypeError"),
        size: t("messages.audioSizeError"),
      }) ??
      validateMessageAudioDuration(durationSeconds, {
        duration: t("messages.audioDurationTooLong"),
      });

    if (validationError) {
      setError(validationError);
      return;
    }

    const roundedDurationSeconds = Math.round(durationSeconds * 100) / 100;
    const optimisticMessageId = crypto.randomUUID();
    const optimisticCreatedAt = createOptimisticMessageCreatedAt();
    const optimisticAudioObjectUrl = URL.createObjectURL(file);
    let uploadedAudioPath: string | null = null;
    let actionStarted = false;

    flushSync(() => {
      dispatchOptimisticMessageAdd({
        id: optimisticMessageId,
        conversationId,
        senderId: currentUserId,
        body: "",
        createdAt: optimisticCreatedAt,
        audioObjectUrl: optimisticAudioObjectUrl,
        audioMimeType: file.type,
        audioDurationSeconds: roundedDurationSeconds,
      });
    });

    registerPendingTextDraft(optimisticMessageId, "");
    const reservation = reserveMessageSentAt(optimisticMessageId);

    const formData = new FormData();
    formData.set("conversation_id", conversationId);
    formData.set("message_id", optimisticMessageId);
    formData.set("body", "");

    setError("");

    try {
      await reservation;
      const supabase = createClient();
      const uploadedAudio = await uploadMessageAudioFile({
        supabase,
        conversationId,
        file,
      });
      uploadedAudioPath = uploadedAudio.storagePath;

      formData.set("audio_storage_path", uploadedAudio.storagePath);
      formData.set("audio_mime_type", uploadedAudio.mimeType);
      formData.set("audio_size_bytes", String(file.size));
      formData.set("audio_duration_seconds", String(roundedDurationSeconds));

      actionStarted = true;
      markPendingTextDraftDispatched(optimisticMessageId);
      await action(formData);
      settlePendingTextDraft(optimisticMessageId, true);
      refreshCommittedMessageAfterRemount();

      trackFirstMessageSent({
        message_kind: "audio",
        has_text: false,
      });
    } catch (caughtError) {
      const outcomeUnknown =
        actionStarted && isTransientMessageSendError(caughtError);

      if (!outcomeUnknown) {
        cancelMessageReservation(optimisticMessageId, reservation);
      }

      if (uploadedAudioPath && !outcomeUnknown) {
        const supabase = createClient();
        try {
          await removeMessageAudioFiles(supabase, uploadedAudioPath);
        } catch {
          // The server-side action also removes uploaded audio when insert fails.
        }
      }

      if (!outcomeUnknown) {
        dispatchOptimisticMessageRemove(optimisticMessageId);
        settlePendingTextDraft(optimisticMessageId, false);
      } else {
        deferPendingTextDraftReconciliation(optimisticMessageId);
      }

      const message =
        caughtError instanceof Error &&
        !isTransientMessageSendError(caughtError)
          ? caughtError.message
          : t("messages.sendFailed");

      setError(message);
    }
  }

  function getMessageTooLongError() {
    return t("messages.messageTooLong", { max: MESSAGE_TEXT_MAX_LENGTH });
  }

  function handleBodyChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextBody = event.target.value;

    updateBodyValue(nextBody);
    onTypingChange?.(nextBody.trim().length > 0);
  }

  function handleBodyPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData("text");

    if (!pastedText) {
      return;
    }

    const target = event.currentTarget;
    const selectedLength = Math.max(
      0,
      target.selectionEnd - target.selectionStart,
    );
    const availableCharacters =
      MESSAGE_TEXT_MAX_LENGTH - (bodyValue.length - selectedLength);

    if (pastedText.length > Math.max(availableCharacters, 0)) {
      setError(
        t("messages.messagePasteTrimmed", { max: MESSAGE_TEXT_MAX_LENGTH }),
      );
    }
  }

  function isMessageBodyValid(body: string) {
    if (body.length <= MESSAGE_TEXT_MAX_LENGTH) {
      return true;
    }

    setError(getMessageTooLongError());
    return false;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      disabled ||
      isRequestingAudioPermission ||
      isRecordingAudio ||
      isStoppingAudio
    ) {
      return;
    }

    if (selectedAttachments.length) {
      void submitSelectedAttachments();
      return;
    }

    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("body") ?? "").trim();
    const shouldRestoreComposerFocus = isComposerInputFocused();

    if (!body) {
      setError(t("messages.emptySubmit"));
      return;
    }

    if (!isMessageBodyValid(body)) {
      return;
    }

    const optimisticMessageId = crypto.randomUUID();
    const optimisticCreatedAt = createOptimisticMessageCreatedAt();

    flushSync(() => {
      dispatchOptimisticMessageAdd({
        id: optimisticMessageId,
        conversationId,
        senderId: currentUserId,
        body,
        createdAt: optimisticCreatedAt,
      });
    });

    const reservation = reserveMessageSentAt(optimisticMessageId);

    formData.set("message_id", optimisticMessageId);

    resetComposer(form);
    registerPendingTextDraft(optimisticMessageId, body);
    restoreComposerFocusAfterSend(shouldRestoreComposerFocus);

    void sendFormData(formData, {
      attachmentKind: null,
      optimisticMessageId,
      reservation,
      videoMetadata: null,
    });
  }

  async function submitSelectedAttachments() {
    if (
      disabled ||
      isRequestingAudioPermission ||
      isRecordingAudio ||
      isStoppingAudio ||
      !selectedAttachments.length
    ) {
      return;
    }

    const attachments = selectedAttachments;
    const body = bodyValue.trim();
    const form = formRef.current;
    const shouldRestoreComposerFocus = isComposerInputFocused();

    setError("");

    if (!isMessageBodyValid(body)) {
      return;
    }

    for (const attachment of attachments) {
      if (attachment.kind === "image") {
        const validationError = validateImageUploadFile(attachment.file, {
          maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
        });

        if (validationError) {
          setError(validationError);
          return;
        }
      }

    }

    if (form) {
      resetComposer(form);
      restoreComposerFocusAfterSend(shouldRestoreComposerFocus);
    } else {
      updateBodyValue("");
      revokeSelectedAttachmentUrls();
    }

    const pendingAttachments = attachments.map((attachment, index) => ({
      attachment,
      messageBody: index === 0 ? body : "",
      optimisticMessageId: crypto.randomUUID(),
      optimisticMediaObjectUrl: URL.createObjectURL(attachment.file),
      createdAt: createOptimisticMessageCreatedAt(),
    }));

    pendingAttachments.forEach(({ messageBody, optimisticMessageId }) => {
      registerPendingTextDraft(optimisticMessageId, messageBody);
    });

    flushSync(() => {
      pendingAttachments.forEach(
        ({
          attachment,
          messageBody,
          optimisticMessageId,
          optimisticMediaObjectUrl,
          createdAt,
        }) => {
          dispatchOptimisticMessageAdd({
            id: optimisticMessageId,
            conversationId,
            senderId: currentUserId,
            body: messageBody,
            createdAt,
            imageObjectUrl: optimisticMediaObjectUrl,
            imageMimeType: attachment.file.type,
          });
        },
      );
    });

    const reservedAttachments = pendingAttachments.map((pendingAttachment) => ({
      ...pendingAttachment,
      reservation: reserveMessageSentAt(
        pendingAttachment.optimisticMessageId,
      ),
    }));

    void Promise.allSettled(
      reservedAttachments.map(
        ({ attachment, messageBody, optimisticMessageId, reservation }) => {
          const formData = new FormData();
          formData.set("conversation_id", conversationId);
          formData.set("message_id", optimisticMessageId);
          formData.set("body", messageBody);
          formData.set("image", attachment.file);

          return sendFormData(formData, {
            attachmentKind: attachment.kind,
            optimisticMessageId,
            reservation,
            videoMetadata: null,
          });
        },
      ),
    );
  }

  async function sendFormData(
    formData: FormData,
    {
      attachmentKind,
      optimisticMessageId,
      reservation,
      videoMetadata,
      videoStoragePath,
    }: {
      attachmentKind: "image" | "video" | null;
      optimisticMessageId: string | null;
      reservation: Promise<void>;
      videoMetadata: ProfileVideoMetadata | null;
      videoStoragePath?: string | null;
    },
  ) {
    const body = String(formData.get("body") ?? "").trim();

    setError("");

    if (!isMessageBodyValid(body)) {
      if (optimisticMessageId) {
        dispatchOptimisticMessageRemove(optimisticMessageId);
        cancelMessageReservation(optimisticMessageId, reservation);
        settlePendingTextDraft(optimisticMessageId, false);
      }

      return;
    }

    let uploadedVideoPath: string | null = null;
    let actionStarted = false;
    let videoUploadInProgress = false;
    let failedVideoRetry: FailedVideoSend | null = null;

    try {
      const attachment = formData.get("image");
      const attachmentFile =
        attachment instanceof File && attachment.size > 0 ? attachment : null;

      if (
        (attachmentKind === "image" || attachmentKind === "video") &&
        !attachmentFile
      ) {
        throw new Error(t("messages.sendFailed"));
      }

      await reservation;

      if (attachmentKind === "image") {
        if (!attachmentFile) {
          throw new Error(t("messages.sendFailed"));
        }

        formData.set(
          "image",
          await compressImageForUpload(attachmentFile, {
            maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
            maxOutputSizeBytes: IMAGE_UPLOAD_MAX_SIZE,
            messages: {
              compressedSize: t("messages.imageTooLarge"),
            },
          }),
        );
      }

      if (attachmentKind === "video") {
        if (!attachmentFile) {
          throw new Error(t("messages.sendFailed"));
        }

        const resolvedVideoMetadata =
          videoMetadata ??
          (await getMessageVideoMetadata(attachmentFile, {
            duration: t("messages.videoDurationTooLong"),
            metadata: t("messages.videoMetadataError"),
          }));

        if (!resolvedVideoMetadata?.durationSeconds) {
          throw new Error(t("messages.videoMetadataError"));
        }

        let lastVideoProgressPercent = -1;
        const preparedVideo = await prepareMessageVideoForUpload(
          attachmentFile,
          (progress) => {
            if (!optimisticMessageId) return;

            const progressPercent = Math.min(
              99,
              Math.max(1, Math.round(progress * 100)),
            );

            if (progressPercent === lastVideoProgressPercent) return;

            lastVideoProgressPercent = progressPercent;
            dispatchOptimisticMessageUpdate({
              id: optimisticMessageId,
              conversationId,
              videoStatus: "preparing",
              videoProgressPercent: progressPercent,
            });
          },
        );

        if (preparedVideo.file.size > MESSAGE_VIDEO_STORAGE_MAX_SIZE) {
          throw new Error(t("messages.videoCompressionRequired"));
        }

        if (optimisticMessageId) {
          dispatchOptimisticMessageUpdate({
            id: optimisticMessageId,
            conversationId,
            videoStatus: "uploading",
            videoProgressPercent: null,
          });
        }

        if (
          preparedVideo.compressionAttempted &&
          !preparedVideo.compressed
        ) {
          if (
            messageFormMountedRef.current &&
            activeConversationIdRef.current === conversationId
          ) {
            setNotice(t("messages.videoCompressionFallback"));
          }
        }

        const resolvedVideoStoragePath =
          videoStoragePath ??
          createMessageVideoStoragePath(conversationId, preparedVideo.file);
        failedVideoRetry = {
          body,
          file: preparedVideo.file,
          metadata: resolvedVideoMetadata,
          storagePath: resolvedVideoStoragePath,
        };

        videoUploadInProgress = true;
        const supabase = createClient();
        const uploadedVideo = await uploadMessageVideoFile({
          supabase,
          conversationId,
          file: preparedVideo.file,
          storagePath: resolvedVideoStoragePath,
          onProgress: (progress) => {
            if (!optimisticMessageId) return;

            dispatchOptimisticMessageUpdate({
              id: optimisticMessageId,
              conversationId,
              videoStatus: "uploading",
              videoProgressPercent: Math.min(
                99,
                Math.max(1, Math.round(progress * 100)),
              ),
            });
          },
        });
        videoUploadInProgress = false;
        uploadedVideoPath = uploadedVideo.storagePath;

        formData.delete("image");
        formData.set("video_storage_path", uploadedVideo.storagePath);
        formData.set("video_mime_type", uploadedVideo.mimeType);
        formData.set("video_size_bytes", String(preparedVideo.file.size));
        formData.set(
          "video_duration_seconds",
          String(resolvedVideoMetadata.durationSeconds),
        );
      }

      actionStarted = true;
      if (optimisticMessageId) {
        markPendingTextDraftDispatched(optimisticMessageId);
      }
      await action(formData);

      if (optimisticMessageId) {
        settlePendingTextDraft(optimisticMessageId, true);
        refreshCommittedMessageAfterRemount();
      }

      trackFirstMessageSent({
        message_kind: attachmentKind ?? "text",
        has_text: Boolean(String(formData.get("body") ?? "").trim()),
      });
    } catch (caughtError) {
      const outcomeUnknown =
        actionStarted && isTransientMessageSendError(caughtError);
      const canRetryVideoUpload = Boolean(
        attachmentKind === "video" &&
          videoUploadInProgress &&
          optimisticMessageId &&
          failedVideoRetry &&
          messageFormMountedRef.current &&
          activeConversationIdRef.current === conversationId,
      );

      if (
        attachmentKind === "video" &&
        messageFormMountedRef.current &&
        activeConversationIdRef.current === conversationId
      ) {
        setNotice("");
      }

      if (
        canRetryVideoUpload &&
        optimisticMessageId &&
        failedVideoRetry
      ) {
        activeMessageSendsRef.current.delete(optimisticMessageId);
        runtimeActiveMessageSends.delete(optimisticMessageId);
        failedVideoSendsRef.current.set(
          optimisticMessageId,
          failedVideoRetry,
        );
        dispatchOptimisticMessageUpdate({
          id: optimisticMessageId,
          conversationId,
          videoStatus: "failed",
          videoProgressPercent: null,
        });
        setError(t("messages.sendFailed"));
        return;
      }

      if (optimisticMessageId && !outcomeUnknown) {
        cancelMessageReservation(optimisticMessageId, reservation);
      }

      if (uploadedVideoPath && !outcomeUnknown) {
        const supabase = createClient();
        try {
          await removeMessageVideoFiles(supabase, uploadedVideoPath);
        } catch {
          // The server-side action also removes uploaded videos when insert fails.
        }
      }

      if (optimisticMessageId && !outcomeUnknown) {
        dispatchOptimisticMessageRemove(optimisticMessageId);
        settlePendingTextDraft(optimisticMessageId, false);
      } else if (optimisticMessageId) {
        deferPendingTextDraftReconciliation(optimisticMessageId);
      }

      const message =
        attachmentKind === "video" &&
        caughtError instanceof Error &&
        caughtError.message.toLowerCase().includes("maximum allowed size")
          ? t("messages.videoCompressionRequired")
          : caughtError instanceof Error &&
              !isTransientMessageSendError(caughtError)
            ? caughtError.message
            : t("messages.sendFailed");

      if (
        messageFormMountedRef.current &&
        activeConversationIdRef.current === conversationId
      ) {
        setError(message);
      }
    }
  }

  function retryFailedVideoSend(messageId: string) {
    const failedVideo = failedVideoSendsRef.current.get(messageId);

    if (!failedVideo) return;

    restartPendingTextDraft(messageId, failedVideo.body);
    dispatchOptimisticMessageUpdate({
      id: messageId,
      conversationId,
      videoStatus: "preparing",
      videoProgressPercent: null,
    });
    setError("");

    const formData = new FormData();
    formData.set("conversation_id", conversationId);
    formData.set("message_id", messageId);
    formData.set("body", failedVideo.body);
    formData.set("image", failedVideo.file);

    void sendFormData(formData, {
      attachmentKind: "video",
      optimisticMessageId: messageId,
      reservation: reserveMessageSentAt(messageId),
      videoMetadata: failedVideo.metadata,
      videoStoragePath: failedVideo.storagePath,
    });
  }

  function dismissFailedVideoSend(messageId: string) {
    if (!failedVideoSendsRef.current.has(messageId)) return;

    failedVideoSendsRef.current.delete(messageId);
    cancelMessageReservation(messageId, Promise.resolve());
    dispatchOptimisticMessageRemove(messageId);
    settlePendingTextDraft(messageId, false);
  }

  failedVideoActionHandlerRef.current = (actionName, messageId) => {
    if (actionName === "retry") {
      retryFailedVideoSend(messageId);
      return;
    }

    dismissFailedVideoSend(messageId);
  };

  const clearSelectedFile = useCallback(function clearSelectedFile() {
    if (disabled) {
      return;
    }

    attachmentSelectionSequenceRef.current += 1;

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setAttachmentMenuOpen(false);
    revokeSelectedAttachmentUrls();
    setError("");
  }, [disabled, revokeSelectedAttachmentUrls]);

  useEffect(() => {
    if (!selectedAttachment) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key !== "Escape"
      ) {
        return;
      }

      event.preventDefault();
      clearSelectedFile();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearSelectedFile, selectedAttachment]);

  const isSubmitDisabled =
    !isInteractive ||
    disabled ||
    isRequestingAudioPermission ||
    isRecordingAudio ||
    isStoppingAudio;
  const hasComposerContent =
    bodyValue.trim().length > 0 || Boolean(selectedAttachment);
  const bodyCharacterCount = bodyValue.length;
  const showTextCounter = bodyCharacterCount >= MESSAGE_TEXT_COUNTER_THRESHOLD;
  const textCounterLabel = t("messages.characterLimit", {
    current: bodyCharacterCount,
    max: MESSAGE_TEXT_MAX_LENGTH,
  });
  const showSendButton = hasComposerContent;
  const actionButtonLabel = showSendButton
    ? t("messages.send")
    : t("messages.voiceMessage");
  return (
    <form
      ref={formRef}
      data-message-composer
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-black/10 bg-white px-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:py-3"
    >
      <MessageEmptySubmitGuard />
      <input type="hidden" name="conversation_id" value={conversationId} />

      <div
        data-message-typing-indicator
        data-active={isOtherTyping ? "true" : "false"}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={!isOtherTyping}
        className={[
          "flex h-5 min-w-0 items-center gap-1.5 overflow-hidden px-3 text-[0.72rem] font-bold leading-5 text-[#6f8793] transition-opacity duration-150",
          isOtherTyping ? "visible opacity-100" : "invisible opacity-0",
        ].join(" ")}
      >
        {isOtherTyping ? (
          <>
            <span className="truncate">{typingLabel}</span>
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center gap-0.5"
            >
              <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s] motion-reduce:animate-none" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s] motion-reduce:animate-none" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-current motion-reduce:animate-none" />
            </span>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="mb-3 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-3 text-sm font-semibold text-[#9d3f2f]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mb-3 rounded-2xl border border-[#bfe8ff] bg-[#f4fbff] p-3 text-sm font-semibold text-[#2f6472]">
          {notice}
        </div>
      ) : null}

      {selectedAttachment ? (
        <div
          data-photo-preview-card="true"
          className="fixed inset-0 z-50 flex flex-col bg-white text-[#25302d]"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 px-3 sm:h-16 sm:px-5">
            <button
              type="button"
              onClick={clearSelectedFile}
              className="flex h-10 w-10 items-center justify-center rounded-full text-3xl font-light text-[#25302d]/70 transition hover:bg-[var(--background)] hover:text-[#25302d]"
              aria-label={t("common.remove")}
              title={t("common.remove")}
            >
              ×
            </button>

            <div className="min-w-0 px-3 text-center">
              <p className="truncate text-xs font-black uppercase tracking-[0.18em] text-[#6f8793]">
                {t("messages.photoPreview")}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[#25302d]/45">
                {selectedAttachments.length > 1
                  ? `${activeAttachmentIndex + 1}/${selectedAttachments.length}`
                  : selectedAttachment.name}
              </p>
            </div>

            <span className="h-10 w-10" aria-hidden="true" />
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center bg-white px-3 py-4 sm:px-6 sm:py-8">
            <div className="relative h-full w-full max-w-6xl">
              <Image
                src={selectedAttachment.url}
                alt=""
                fill
                sizes="100vw"
                unoptimized
                draggable={false}
                className="pa-protected-media object-contain"
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-black/10 bg-white px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-4xl items-center gap-2 rounded-[1.4rem] bg-[var(--background)] px-4 py-2 ring-1 ring-black/5">
              <textarea
                ref={attachmentCaptionInputRef}
                disabled={!isInteractive || disabled}
                value={bodyValue}
                onChange={handleBodyChange}
                onFocus={(event) => {
                  onTypingChange?.(event.currentTarget.value.trim().length > 0);
                }}
                onBlur={() => {
                  onTypingChange?.(false);
                }}
                onPaste={handleBodyPaste}
                onKeyDown={(event) => {
                  if (shouldSubmitOnEnter(event)) {
                    event.preventDefault();
                    void submitSelectedAttachments();
                  }
                }}
                enterKeyHint="enter"
                maxLength={MESSAGE_TEXT_MAX_LENGTH}
                rows={1}
                placeholder={t("messages.writePlaceholder")}
                className="max-h-24 min-h-9 flex-1 resize-none bg-transparent py-1 text-base font-normal leading-6 outline-none placeholder:text-[#25302d]/35 disabled:cursor-not-allowed disabled:opacity-55 sm:text-sm"
              />
            </div>
            {showTextCounter ? (
              <p
                className={[
                  "mx-auto mt-1 w-full max-w-4xl pr-2 text-right text-[0.7rem] font-black tabular-nums",
                  bodyCharacterCount >= MESSAGE_TEXT_MAX_LENGTH
                    ? "text-[#b04b36]"
                    : "text-[#25302d]/45",
                ].join(" ")}
              >
                {textCounterLabel}
              </p>
            ) : null}

            <div className="mx-auto mt-3 flex w-full max-w-5xl items-center gap-3">
              <div className="min-w-0 flex flex-1 items-center justify-center gap-2 overflow-x-auto pb-1">
                {selectedAttachments.map((attachment, index) => (
                  <button
                    key={attachment.url}
                    type="button"
                    onClick={() => setActiveAttachmentIndex(index)}
                    className={[
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#f7f3ed] ring-inset transition sm:h-16 sm:w-16",
                      index === activeAttachmentIndex
                        ? "ring-[3px] ring-[var(--pa-primary)]"
                        : "ring-1 ring-black/10 hover:ring-2 hover:ring-[#25302d]/20",
                    ].join(" ")}
                    aria-label={t("messages.photoPreview")}
                  >
                    <Image
                      src={attachment.url}
                      alt=""
                      fill
                      sizes="64px"
                      unoptimized
                      draggable={false}
                      className="pa-protected-media object-cover object-top"
                    />
                  </button>
                ))}

                <button
                  type="button"
                  onClick={openAttachmentPicker}
                  disabled={!isInteractive || disabled}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white text-[#25302d] ring-1 ring-inset ring-black/25 transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-16 sm:w-16"
                  aria-label={t("messages.attachMedia")}
                  title={t("messages.attachMedia")}
                >
                  <PlusIcon className="h-8 w-8" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => void submitSelectedAttachments()}
                onPointerDown={keepComposerFocusOnActionPointerDown}
                disabled={!isInteractive || disabled}
                aria-label={t("messages.send")}
                title={t("messages.send")}
                className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--pa-primary)] text-[var(--pa-primary-ink)] shadow-lg shadow-black/15 transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-16 sm:w-16"
              >
                <SendArrowIcon className="h-7 w-7" />
                {selectedAttachments.length > 1 ? (
                  <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-black text-[#25302d] shadow ring-1 ring-black/10">
                    {selectedAttachments.length}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isRequestingAudioPermission || isRecordingAudio || isStoppingAudio ? (
        <div className="flex min-h-12 items-center gap-3 rounded-[1.65rem] bg-white px-2.5 py-2 shadow-sm ring-1 ring-black/10 sm:min-h-[3.25rem] sm:px-3">
          <button
            type="button"
            onClick={() => stopAudioRecording(false)}
            disabled={isRequestingAudioPermission || isStoppingAudio}
            aria-label={t("common.remove")}
            title={t("common.remove")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#25302d] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <TrashIcon className="h-5 w-5" />
          </button>

          <div className="flex min-w-[4rem] items-center gap-2 text-[#25302d]">
            <span
              className={[
                "h-2.5 w-2.5 rounded-full bg-[#d70f3f]",
                isStoppingAudio || isRequestingAudioPermission
                  ? ""
                  : "animate-pulse",
              ].join(" ")}
            />
            <span className="text-lg font-black tabular-nums">
              {formatAudioDuration(audioRecordingSeconds)}
            </span>
          </div>

          <div className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden">
            {audioRecordingWaveform.map((height, index) => (
              <span
                key={`audio-wave-${index}`}
                className="w-1.5 shrink-0 rounded-full bg-[#25302d]/45 transition-[height] duration-75"
                style={{ height }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => stopAudioRecording(true)}
            disabled={isRequestingAudioPermission || isStoppingAudio}
            aria-label={t("messages.send")}
            title={t("messages.send")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pa-primary)] text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11"
          >
            {isStoppingAudio || isRequestingAudioPermission ? (
              <span className="h-2.5 w-2.5 rounded-full bg-current animate-pulse" />
            ) : (
              <SendArrowIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="relative flex min-h-12 items-end gap-1.5 rounded-[1.65rem] bg-white px-2 py-2 shadow-sm ring-1 ring-black/10 sm:min-h-[3.25rem] sm:gap-2 sm:px-2.5">
            <div ref={attachmentMenuRef} className="relative shrink-0">
              {attachmentMenuOpen ? (
                <div className="absolute bottom-[calc(100%+0.7rem)] left-[-0.25rem] z-20 w-[13.5rem] max-w-[calc(100vw-1.5rem)]">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-1 left-[1.15rem] h-3 w-3 rotate-45 border-b border-r border-[#d6e2e8] bg-white"
                  />
                  <div className="relative overflow-hidden rounded-[1.1rem] border border-[#d6e2e8] bg-white p-1.5 shadow-[0_14px_38px_rgba(31,47,53,0.16)]">
                    <label
                      role="button"
                      tabIndex={0}
                      htmlFor={fileInputId}
                      onPointerDown={keepComposerFocusOnActionPointerDown}
                      onClick={(event) => {
                        if (
                          disabled ||
                          isRequestingAudioPermission ||
                          isRecordingAudio ||
                          isStoppingAudio
                        ) {
                          event.preventDefault();
                          return;
                        }

                        setError("");
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                        window.setTimeout(
                          () => setAttachmentMenuOpen(false),
                          0,
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        openAttachmentPicker();
                      }}
                      className="flex min-h-12 w-full items-center gap-2.5 rounded-[0.8rem] bg-[#f3f7f9] px-2.5 py-2 text-left text-[0.9rem] font-bold tracking-[-0.01em] text-[#25302d] transition hover:bg-[#eaf1f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-primary-focus-ring)] active:scale-[0.99]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-[var(--pa-primary)] text-white shadow-sm">
                        <GalleryIcon className="h-[1.15rem] w-[1.15rem]" />
                      </span>
                      <span className="min-w-0 leading-tight">
                        {t("messages.photosAndVideos")}
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                aria-expanded={attachmentMenuOpen}
                aria-label={t("messages.attachMedia")}
                title={t("messages.attachMedia")}
                disabled={
                  !isInteractive ||
                  disabled ||
                  isRequestingAudioPermission ||
                  isRecordingAudio ||
                  isStoppingAudio
                }
                onPointerDown={keepComposerFocusOnActionPointerDown}
                onClick={() => setAttachmentMenuOpen((current) => !current)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#25302d] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon className="h-6 w-6" />
              </button>

              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                name="image"
                accept={
                  selectedAttachments.length
                    ? IMAGE_UPLOAD_ACCEPT
                    : MESSAGE_MEDIA_ACCEPT
                }
                multiple
                disabled={!isInteractive || disabled}
                className="hidden"
                onChange={(event) => {
                  void handleFileChange(event.target.files);
                }}
              />
            </div>

            <textarea
              ref={messageInputRef}
              disabled={
                !isInteractive ||
                disabled ||
                isRequestingAudioPermission
              }
              value={bodyValue}
              onChange={handleBodyChange}
              onFocus={(event) => {
                onTypingChange?.(event.currentTarget.value.trim().length > 0);
              }}
              onBlur={() => {
                onTypingChange?.(false);
              }}
              onPaste={handleBodyPaste}
              onPointerDown={(event) => {
                if (
                  event.pointerType !== "touch" ||
                  document.activeElement === event.currentTarget
                ) {
                  return;
                }

                event.preventDefault();
                event.currentTarget.focus({ preventScroll: true });
              }}
              onKeyDown={(event) => {
                if (shouldSubmitOnEnter(event)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              enterKeyHint="enter"
              name="body"
              maxLength={MESSAGE_TEXT_MAX_LENGTH}
              rows={1}
              placeholder={t("messages.writePlaceholder")}
              className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base font-normal leading-6 outline-none transition placeholder:text-[#25302d]/35 disabled:cursor-not-allowed disabled:opacity-55 sm:text-sm"
            />

            <button
              type={showSendButton ? "submit" : "button"}
              aria-label={actionButtonLabel}
              title={actionButtonLabel}
              disabled={
                showSendButton
                  ? isSubmitDisabled
                  : !isInteractive ||
                    disabled ||
                    isRequestingAudioPermission ||
                    isRecordingAudio ||
                    isStoppingAudio
              }
              onClick={
                showSendButton ? undefined : () => void startAudioRecording()
              }
              onPointerDown={
                showSendButton ? keepComposerFocusOnActionPointerDown : undefined
              }
              className={[
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11",
                showSendButton
                  ? "bg-[var(--pa-primary)] text-[var(--pa-primary-ink)] hover:bg-[var(--pa-primary-hover)]"
                  : "bg-transparent text-[#25302d] hover:bg-[var(--background)]",
              ].join(" ")}
            >
              {showSendButton ? (
                <SendArrowIcon className="h-5 w-5" />
              ) : (
                <MicrophoneIcon className="h-5 w-5" />
              )}
            </button>
          </div>
          {showTextCounter ? (
            <p
              className={[
                "mt-1 pr-3 text-right text-[0.7rem] font-black tabular-nums",
                bodyCharacterCount >= MESSAGE_TEXT_MAX_LENGTH
                  ? "text-[#b04b36]"
                  : "text-[#25302d]/45",
              ].join(" ")}
            >
              {textCounterLabel}
            </p>
          ) : null}
        </>
      )}
    </form>
  );
}
