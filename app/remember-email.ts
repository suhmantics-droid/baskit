/**
 * Remembering the address someone signs in with, on their own device.
 *
 * You type your email to ask for a code, then the code screen asked for it
 * again, which is pure friction for no security gain. A cookie rather than
 * localStorage so the server can render the field already filled, with no
 * flash of an empty input.
 *
 * It holds an email address the person just typed into this same site, is
 * readable by their own browser only, and is never used for auth on its own:
 * the code still has to be right.
 */
export const REMEMBERED_EMAIL_COOKIE = "baskit.lastEmail";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Client-side write. Lax so it survives the round trip out to Google and back. */
export function rememberEmail(email: string): void {
  try {
    document.cookie = `${REMEMBERED_EMAIL_COOKIE}=${encodeURIComponent(email)}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
  } catch {}
}
