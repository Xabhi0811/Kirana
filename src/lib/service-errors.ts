export const databaseSetupMessage =
  "Kirana database setup is incomplete. Apply all pending Supabase migrations; if tables already exist, check the API schema cache.";

export function missingDatabaseObject(code?: string) {
  return ["PGRST205", "PGRST202", "42P01", "42883"].includes(code || "");
}

// Map provider codes, never expose SQL, tokens or raw provider diagnostics.
export function authFailure(
  error: { code?: string; status?: number },
  operation: "login" | "register",
) {
  if (error.status === 429 || error.code?.startsWith("over_"))
    return {
      status: 429,
      message:
        "Too many attempts or emails sent. Wait a few minutes before trying again.",
    };
  switch (error.code) {
    case "email_not_confirmed":
      return {
        status: 403,
        message:
          "Your email is not confirmed yet. Open the confirmation link in your inbox or spam folder, or resend it below.",
      };
    case "invalid_credentials":
      return {
        status: 401,
        message:
          "Incorrect email or password. Use the account you registered, or reset your password.",
      };
    case "email_address_not_authorized":
      return {
        status: 503,
        message:
          "Signup email delivery is restricted. The project owner must configure Supabase SMTP for public registration.",
      };
    case "signup_disabled":
    case "email_provider_disabled":
      return {
        status: 503,
        message:
          "Email signup is disabled in this Supabase project. Enable the email provider and signups.",
      };
    case "email_address_invalid":
      return {
        status: 400,
        message:
          "Use a valid real email address. Supabase may reject example or test email domains.",
      };
    case "weak_password":
      return {
        status: 400,
        message:
          "This password does not meet the project's security requirements. Choose a stronger password.",
      };
    case "unexpected_failure":
      return {
        status: 503,
        message:
          "Supabase could not complete authentication. Check database migrations, signup triggers and Auth logs.",
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
            ? "Sign-in failed. Check your credentials and email confirmation, then try again."
            : "Registration failed. Check your details and the Supabase Auth logs, then try again.",
      };
  }
}
