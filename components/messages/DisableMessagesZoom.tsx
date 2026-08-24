"use client";

import { useEffect } from "react";

export function DisableMessagesZoom() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootTouchAction = root.style.touchAction;
    const previousBodyTouchAction = body.style.touchAction;

    // Mobile Safari can ignore the viewport's user-scalable setting. Native
    // vertical scrolling is enabled only on the messages scroll containers.
    root.style.touchAction = "none";
    body.style.touchAction = "none";

    let multiTouchActive = false;

    const isMessageImageZoomTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest('[data-message-image-zoom-surface="true"]'));

    const preventMultiTouch = (event: TouchEvent) => {
      if (isMessageImageZoomTarget(event.target)) {
        return;
      }

      if (multiTouchActive || event.touches.length > 1) {
        multiTouchActive = true;

        if (event.cancelable) {
          event.preventDefault();
        }
      }
    };
    const finishMultiTouch = (event: TouchEvent) => {
      if (isMessageImageZoomTarget(event.target)) {
        if (event.touches.length === 0) {
          multiTouchActive = false;
        }

        return;
      }

      if (multiTouchActive && event.cancelable) {
        event.preventDefault();
      }

      if (event.touches.length === 0) {
        multiTouchActive = false;
      }
    };
    const preventGesture = (event: Event) => {
      multiTouchActive = true;

      if (event.cancelable) {
        event.preventDefault();
      }
    };
    const finishGesture = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
      }

      multiTouchActive = false;
    };
    const nonPassiveCapture: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };

    window.addEventListener(
      "touchstart",
      preventMultiTouch,
      nonPassiveCapture,
    );
    window.addEventListener("touchmove", preventMultiTouch, nonPassiveCapture);
    window.addEventListener("touchend", finishMultiTouch, nonPassiveCapture);
    window.addEventListener("touchcancel", finishMultiTouch, nonPassiveCapture);
    window.addEventListener("gesturestart", preventGesture, nonPassiveCapture);
    window.addEventListener("gesturechange", preventGesture, nonPassiveCapture);
    window.addEventListener("gestureend", finishGesture, nonPassiveCapture);

    return () => {
      root.style.touchAction = previousRootTouchAction;
      body.style.touchAction = previousBodyTouchAction;
      window.removeEventListener("touchstart", preventMultiTouch, true);
      window.removeEventListener("touchmove", preventMultiTouch, true);
      window.removeEventListener("touchend", finishMultiTouch, true);
      window.removeEventListener("touchcancel", finishMultiTouch, true);
      window.removeEventListener("gesturestart", preventGesture, true);
      window.removeEventListener("gesturechange", preventGesture, true);
      window.removeEventListener("gestureend", finishGesture, true);
    };
  }, []);

  return null;
}
