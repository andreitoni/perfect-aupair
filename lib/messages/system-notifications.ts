export type SystemNotificationCard = {
  id: string;
  type: string;
  title: string;
  body: string;
  image_url: string | null;
  action_href?: string | null;
  created_at: string;
  read_at: string | null;
};

export const VERIFICATION_APPROVED_NOTIFICATION = {
  type: "verification_approved",
  title: "Your profile is verified",
  body: "Your Perfect AuPair profile has been manually verified by our admin team. The verified badge is now visible on your profile.",
  imageUrl: "/brand/verified-badge-message.svg",
} as const;

export const VERIFICATION_SELFIE_REJECTED_REASON =
  "The photo must be a selfie taken by you. Hold the phone yourself, make sure your face is clear and fully visible, and take the photo while smiling with two fingers raised. Please take a new verification selfie using the live camera.";

export const VERIFICATION_REJECTED_NOTIFICATION = {
  type: "verification_rejected",
  title: "Verification rejected",
  body: "• Show your full face\n• Smile\n• Raise two fingers",
  imageUrl: null,
} as const;

export function getVerificationApprovedDedupeKey(profileId: string) {
  return `verification_approved:${profileId}`;
}

export function getVerificationRejectedDedupeKey(requestId: string) {
  return `verification_rejected:${requestId}`;
}
