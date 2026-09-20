export const databaseSetupMessage =
  "Kirana database setup is incomplete. Check your MongoDB connection and ensure all collections are initialized.";

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export function mongoErrorMessage(error: unknown): string | null {
  if (isDuplicateKeyError(error)) {
    return "A record with these details already exists. Phone numbers must be unique and orders can be reviewed only once.";
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "ValidationError"
  ) {
    return "Invalid data provided. Check all fields and try again.";
  }
  return null;
}

// Map auth failures to user-friendly messages.
export function authFailure(
  error: { code?: string; status?: number },
  operation: "login" | "register",
) {
  if (error.status === 429 || error.code?.startsWith("over_"))
    return {
      status: 429,
      message:
        "Too many attempts. Wait a few minutes before trying again.",
    };
  switch (error.code) {
    case "invalid_credentials":
      return {
        status: 401,
        message:
          "Incorrect email or password. Check your credentials and try again.",
      };
    case "email_exists":
      return {
        status: 409,
        message:
          "An account with this email already exists. Try signing in instead.",
      };
    case "weak_password":
      return {
        status: 400,
        message:
          "This password does not meet the security requirements. Choose a stronger password.",
      };
    default:
      return {
        status:
          !error.status || error.status >= 500
            ? 503
            : operation === "login"
              ? 401
              : 400,
        message:
          operation === "login"
            ? "Sign-in failed. Check your credentials and try again."
            : "Registration failed. Check your details and try again.",
      };
  }
}
