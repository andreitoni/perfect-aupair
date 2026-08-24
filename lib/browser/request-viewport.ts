export function isLikelyDesktopRequest(requestHeaders: Headers) {
  if (requestHeaders.get("sec-ch-ua-mobile") === "?1") return false;

  const userAgent = requestHeaders.get("user-agent") ?? "";

  return !/(?:Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini)/i.test(
    userAgent,
  );
}
