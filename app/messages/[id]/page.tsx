import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Read and send Perfect AuPair messages.",
};

export default async function ConversationRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/messages?conversation=${encodeURIComponent(id)}`);
}
