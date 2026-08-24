"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MessagesPageLoading } from "@/components/messages/MessagesPageLoading";

function MessagesLoadingMode() {
  const searchParams = useSearchParams();
  const opensConversation =
    searchParams.has("conversation") || searchParams.has("profile");

  return (
    <MessagesPageLoading mode={opensConversation ? "conversation" : "inbox"} />
  );
}

export default function MessagesLoading() {
  return (
    <Suspense fallback={<MessagesPageLoading mode="inbox" />}>
      <MessagesLoadingMode />
    </Suspense>
  );
}
