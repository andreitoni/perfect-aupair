import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DisableMessagesZoom } from "@/components/messages/DisableMessagesZoom";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DisableMessagesZoom />
      {children}
    </>
  );
}
