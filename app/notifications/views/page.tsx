import { NotificationProfilesPage } from "@/components/notifications/NotificationProfilesPage";

export default async function ProfileViewsNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;

  return <NotificationProfilesPage kind="views" page={page} />;
}
