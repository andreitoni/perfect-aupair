export function scrollToInstantly(top = 0, left = 0) {
  if (typeof window === "undefined") {
    return;
  }

  const root = document.documentElement;
  const body = document.body;
  const previousRootScrollBehavior = root.style.scrollBehavior;
  const previousBodyScrollBehavior = body.style.scrollBehavior;

  root.style.scrollBehavior = "auto";
  body.style.scrollBehavior = "auto";

  window.scrollTo({ top, left, behavior: "auto" });
  root.scrollTop = top;
  root.scrollLeft = left;
  body.scrollTop = top;
  body.scrollLeft = left;

  window.requestAnimationFrame(() => {
    root.style.scrollBehavior = previousRootScrollBehavior;
    body.style.scrollBehavior = previousBodyScrollBehavior;
  });
}

export function scrollToPageTopInstantly() {
  scrollToInstantly(0, 0);
}
