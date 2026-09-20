// Read-only connectivity/schema check. Never prints credentials or user records.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI environment */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error("Configure Supabase URL and public key first.");
async function main() {
  for (const path of [
    "/auth/v1/settings",
    "/rest/v1/categories?select=id&limit=0",
    "/rest/v1/users?select=id&limit=0",
  ]) {
    try {
      const response = await fetch(url + path, {
        headers: { apikey: key!, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      console.log(
        path.split("?")[0],
        response.status,
        response.ok
          ? path.includes("settings")
            ? {
                signupDisabled: data.disable_signup,
                emailEnabled: data.external?.email,
                emailAutoConfirm: data.mailer_autoconfirm,
              }
            : "table accessible"
          : { code: data.code, message: data.message || data.msg },
      );
      if (!response.ok) process.exitCode = 1;
    } catch (error) {
      console.log(
        path.split("?")[0],
        "network check failed",
        (error as { cause?: { code?: string } }).cause?.code ||
          "timeout/network error",
      );
      process.exitCode = 1;
    }
  }
}
void main();
