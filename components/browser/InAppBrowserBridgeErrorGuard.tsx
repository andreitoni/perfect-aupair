import { inAppBrowserBridgeErrorGuard } from "@/lib/browser/in-app-browser-bridge-guard";

export function InAppBrowserBridgeErrorGuard() {
  return (
    <script
      id="pa-in-app-browser-bridge-error-guard"
      dangerouslySetInnerHTML={{ __html: inAppBrowserBridgeErrorGuard }}
    />
  );
}
