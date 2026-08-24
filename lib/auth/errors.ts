export function friendlyAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("email rate limit") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests")
  ) {
    return "Too many account emails were requested recently. Please wait a while and try again.";
  }

  return message;
}

type AuthUserLookupError = {
  code?: string;
  status?: number;
  message: string;
};

export function isMissingAuthUserError(error: AuthUserLookupError) {
  if (error.code === "user_not_found") {
    return true;
  }

  return (
    error.status === 404 && /^user not found\.?$/i.test(error.message.trim())
  );
}
