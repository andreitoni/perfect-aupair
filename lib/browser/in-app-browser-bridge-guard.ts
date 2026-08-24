export const inAppBrowserBridgeErrorGuard = String.raw`
  (() => {
    const userAgent = window.navigator.userAgent;
    const isFacebookAndroidInAppBrowser =
      userAgent.includes("Android") &&
      userAgent.includes("[FB_IAB/FB4A;");
    const isMetaIosInAppBrowser =
      /(?:iPhone|iPad|iPod)/.test(userAgent) &&
      /(?:Instagram|FBAN\/|FB_IAB\/)/i.test(userAgent);

    if (!isFacebookAndroidInAppBrowser && !isMetaIosInAppBrowser) return;

    window.addEventListener(
      "error",
      (event) => {
        const rawMessage =
          typeof event.error?.message === "string"
            ? event.error.message
            : typeof event.message === "string"
              ? event.message
              : "";
        const message = rawMessage
          .replace(/^Uncaught (?:Error: |TypeError: )?/, "")
          .replace(/^TypeError: /, "");

        const isDetachedFacebookAndroidBridge =
          isFacebookAndroidInAppBrowser &&
          message === "Error invoking postMessage: Java object is gone";

        const isMissingMetaIosBridge = (() => {
          if (!isMetaIosInAppBrowser) return false;

          const isKnownMessage =
            message ===
              "undefined is not an object (evaluating 'window.webkit.messageHandlers')" ||
            message ===
              "undefined is not an object (evaluating 'window.webkit.messagehandlers')";
          if (!isKnownMessage) return false;

          const filename =
            typeof event.filename === "string" ? event.filename : "";
          const stack =
            typeof event.error?.stack === "string" ? event.error.stack : "";
          const referencesInjectedSource =
            filename === "app:///" ||
            filename.startsWith("app:///:") ||
            stack.includes("app:///");
          const referencesNativeBridgeFunction =
            stack.includes("sendDataToNative") ||
            stack.includes("sendPageHideMessage");

          return referencesInjectedSource || referencesNativeBridgeFunction;
        })();

        if (
          !isDetachedFacebookAndroidBridge &&
          !isMissingMetaIosBridge
        ) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true },
    );
  })();
`;
