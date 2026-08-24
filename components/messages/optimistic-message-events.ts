"use client";

export const OPTIMISTIC_MESSAGE_ADD_EVENT = "pa:message-optimistic-add";
export const OPTIMISTIC_MESSAGE_UPDATE_EVENT = "pa:message-optimistic-update";
export const OPTIMISTIC_MESSAGE_REMOVE_EVENT = "pa:message-optimistic-remove";
export const OPTIMISTIC_MESSAGE_RETRY_EVENT = "pa:message-optimistic-retry";
export const OPTIMISTIC_MESSAGE_DISMISS_EVENT = "pa:message-optimistic-dismiss";

export type OptimisticVideoStatus = "preparing" | "uploading" | "failed";

export type OptimisticMessagePayload = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  imageObjectUrl?: string | null;
  imageMimeType?: string | null;
  videoObjectUrl?: string | null;
  videoMimeType?: string | null;
  audioObjectUrl?: string | null;
  audioMimeType?: string | null;
  audioDurationSeconds?: number | null;
};

export type OptimisticMessageUpdatePayload = {
  id: string;
  conversationId: string;
  videoStatus: OptimisticVideoStatus;
  videoProgressPercent?: number | null;
};

export type OptimisticMessageActionPayload = {
  id: string;
  conversationId: string;
};

export function dispatchOptimisticMessageAdd(payload: OptimisticMessagePayload) {
  window.dispatchEvent(
    new CustomEvent<OptimisticMessagePayload>(OPTIMISTIC_MESSAGE_ADD_EVENT, {
      detail: payload,
    }),
  );
}

export function dispatchOptimisticMessageUpdate(
  payload: OptimisticMessageUpdatePayload,
) {
  window.dispatchEvent(
    new CustomEvent<OptimisticMessageUpdatePayload>(
      OPTIMISTIC_MESSAGE_UPDATE_EVENT,
      { detail: payload },
    ),
  );
}

export function dispatchOptimisticMessageRemove(id: string) {
  window.dispatchEvent(
    new CustomEvent<string>(OPTIMISTIC_MESSAGE_REMOVE_EVENT, {
      detail: id,
    }),
  );
}

export function dispatchOptimisticMessageRetry(
  payload: OptimisticMessageActionPayload,
) {
  window.dispatchEvent(
    new CustomEvent<OptimisticMessageActionPayload>(
      OPTIMISTIC_MESSAGE_RETRY_EVENT,
      { detail: payload },
    ),
  );
}

export function dispatchOptimisticMessageDismiss(
  payload: OptimisticMessageActionPayload,
) {
  window.dispatchEvent(
    new CustomEvent<OptimisticMessageActionPayload>(
      OPTIMISTIC_MESSAGE_DISMISS_EVENT,
      { detail: payload },
    ),
  );
}
