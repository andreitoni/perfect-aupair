type ReportHrefOptions = {
  type: "profile";
  id: string;
  returnTo?: string;
};

export function buildReportHref({ type, id, returnTo }: ReportHrefOptions) {
  const params = new URLSearchParams({
    type,
    id,
  });

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  return `/report?${params.toString()}`;
}
