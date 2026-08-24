export async function fetchUpstreamWithResponseTimeout(
  input: string | URL,
  init: Omit<RequestInit, "signal">,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      new DOMException(
        "The upstream response timed out.",
        "TimeoutError",
      ),
    );
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    // fetch() resolves when the upstream response headers arrive. Clear the
    // connection timeout before returning its body so it cannot abort a stream
    // that Next.js is already piping to the browser.
    clearTimeout(timeoutId);
  }
}
