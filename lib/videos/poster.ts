const VIDEO_POSTER_CAPTURE_SECONDS = 0.5;
const VIDEO_POSTER_MAX_WIDTH = 960;
const VIDEO_POSTER_JPEG_QUALITY = 0.82;
const VIDEO_POSTER_TIMEOUT_MS = 5000;
const POSTER_PREVIEW_MAX_DIMENSION = 360;
const POSTER_PREVIEW_MAX_DATA_URL_LENGTH = 98_304;
const POSTER_PREVIEW_JPEG_QUALITIES = [0.78, 0.68, 0.58];

type CaptureOptions = {
  revokeSourceUrl?: boolean;
  timeoutMs?: number;
};

export function seekVideoToPreviewFrame(video: HTMLVideoElement) {
  const captureTime = getVideoPosterCaptureTime(video.duration);

  if (captureTime <= 0) {
    return;
  }

  function seek() {
    if (video.currentTime >= captureTime) {
      return;
    }

    try {
      video.currentTime = captureTime;
    } catch {
      // Some browsers can refuse programmatic seeking until media data is ready.
    }
  }

  seek();

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    video.addEventListener("loadeddata", seek, { once: true });
  }
}

function getVideoPosterCaptureTime(duration: number) {
  const safeDuration = Number.isFinite(duration) ? duration : 0;

  return safeDuration > VIDEO_POSTER_CAPTURE_SECONDS + 0.05
    ? VIDEO_POSTER_CAPTURE_SECONDS
    : 0;
}

export function captureVideoPosterFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  return captureVideoPoster(objectUrl, {
    revokeSourceUrl: true,
    timeoutMs: 12_000,
  });
}

export function createVideoPosterPreviewDataUrl(posterUrl: string) {
  return new Promise<string | null>((resolve) => {
    const image = new Image();

    image.onload = () => {
      try {
        const sourceWidth = image.naturalWidth;
        const sourceHeight = image.naturalHeight;

        if (!sourceWidth || !sourceHeight) {
          resolve(null);
          return;
        }

        const scale = Math.min(
          1,
          POSTER_PREVIEW_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));

        const context = canvas.getContext("2d");

        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        for (const quality of POSTER_PREVIEW_JPEG_QUALITIES) {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);

          if (dataUrl.length <= POSTER_PREVIEW_MAX_DATA_URL_LENGTH) {
            resolve(dataUrl);
            return;
          }
        }

        resolve(null);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = posterUrl;
  });
}

function captureVideoPoster(sourceUrl: string, options: CaptureOptions = {}) {
  let verifiedSourceUrl: string;

  try {
    const parsedSourceUrl = new URL(sourceUrl);

    if (parsedSourceUrl.protocol !== "blob:") {
      if (options.revokeSourceUrl) URL.revokeObjectURL(sourceUrl);
      return Promise.resolve(null);
    }

    verifiedSourceUrl = parsedSourceUrl.href;
  } catch {
    if (options.revokeSourceUrl) URL.revokeObjectURL(sourceUrl);
    return Promise.resolve(null);
  }

  return new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    let seekStarted = false;
    let frameCaptureScheduled = false;
    let videoFrameCallbackId: number | null = null;
    let usesVideoFrameCallback =
      typeof video.requestVideoFrameCallback === "function";
    const timeoutId = window.setTimeout(
      () => finish(null),
      options.timeoutMs ?? VIDEO_POSTER_TIMEOUT_MS,
    );

    function cleanUp() {
      window.clearTimeout(timeoutId);

      if (
        videoFrameCallbackId !== null &&
        typeof video.cancelVideoFrameCallback === "function"
      ) {
        video.cancelVideoFrameCallback(videoFrameCallbackId);
      }

      if (options.revokeSourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }

      video.removeAttribute("src");
      video.load();
    }

    function finish(posterUrl: string | null) {
      if (settled) return;

      settled = true;
      cleanUp();
      resolve(posterUrl);
    }

    function captureFrame(frameIsReady = false) {
      if (settled || frameCaptureScheduled) return;

      frameCaptureScheduled = true;

      const capture = () => {
        frameCaptureScheduled = false;

        if (settled) return;

        try {
          const sourceWidth = video.videoWidth;
          const sourceHeight = video.videoHeight;

          if (!sourceWidth || !sourceHeight) {
            finish(null);
            return;
          }

          const scale = Math.min(1, VIDEO_POSTER_MAX_WIDTH / sourceWidth);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));

          const context = canvas.getContext("2d");

          if (!context) {
            finish(null);
            return;
          }

          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", VIDEO_POSTER_JPEG_QUALITY));
        } catch {
          finish(null);
        }
      };

      if (frameIsReady) {
        capture();
      } else {
        window.requestAnimationFrame(capture);
      }
    }

    function captureNextPresentedFrame() {
      if (settled || !usesVideoFrameCallback) return false;

      try {
        videoFrameCallbackId = video.requestVideoFrameCallback(() => {
          videoFrameCallbackId = null;

          if (settled) return;

          const captureTime = getVideoPosterCaptureTime(video.duration);

          if (
            !seekStarted &&
            captureTime > 0 &&
            video.currentTime + 0.01 < captureTime
          ) {
            seekStarted = true;

            if (!captureNextPresentedFrame()) {
              captureFrame(true);
              return;
            }

            try {
              video.currentTime = captureTime;
            } catch {
              captureFrame(true);
            }

            return;
          }

          captureFrame(true);
        });
        return true;
      } catch {
        videoFrameCallbackId = null;
        usesVideoFrameCallback = false;
        return false;
      }
    }

    function seekToPreviewFrame() {
      if (settled || seekStarted) return;

      seekStarted = true;
      const captureTime = getVideoPosterCaptureTime(video.duration);

      if (usesVideoFrameCallback) {
        if (captureTime > 0) {
          try {
            video.currentTime = captureTime;
          } catch {
            // The callback registered before loading still captures the first
            // frame if WebKit refuses the early seek.
          }
        }

        return;
      }

      if (captureTime <= 0) {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          captureFrame();
        } else {
          video.addEventListener("loadeddata", () => captureFrame(), {
            once: true,
          });
        }

        return;
      }

      video.addEventListener("seeked", () => captureFrame(), { once: true });
      video.addEventListener("timeupdate", () => captureFrame(), {
        once: true,
      });

      try {
        video.currentTime = captureTime;
      } catch {
        captureFrame();
      }
    }

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", seekToPreviewFrame, { once: true });
    video.addEventListener("loadeddata", seekToPreviewFrame, { once: true });
    video.addEventListener("error", () => finish(null), { once: true });
    // WebKit can fire loadeddata/seeked before a Blob-backed video frame is
    // actually paintable. Registering this before src is assigned guarantees
    // capture as soon as the first decoded frame reaches the compositor.
    captureNextPresentedFrame();
    video.src = verifiedSourceUrl;
    video.load();
  });
}
