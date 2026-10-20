/**
 * Readable messages for the `?error=<code>` that Better Auth adds when it
 * sends someone back to the sign-in page after a failed OAuth sign-in.
 * Unknown codes get a generic message; the raw code is never shown.
 */
const MESSAGES: Record<string, string> = {
  access_denied: "Sign-in was cancelled. You can try again whenever you like.",
  account_not_linked:
    "This email already belongs to a SoleUp account. Sign in with the provider you used before.",
  unable_to_link_account:
    "That account couldn't be connected because its email isn't verified with the provider. Sign in with the provider you used before.",
  email_does_not_match:
    "That account uses a different email, so it couldn't be connected.",
  account_already_linked_to_different_user:
    "That account is already connected to a different SoleUp user.",
  email_not_found:
    "The provider didn't share an email address. Add a verified email to that account, or use the other provider.",
  email_not_verified:
    "The provider reports that email as unverified. Verify it with the provider, or use the other provider.",
  oauth_provider_not_found: "That sign-in option isn't available right now.",
};

const FALLBACK = "Sign-in didn't complete. Please try again.";

export function signInErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code]! : FALLBACK;
}
