/**
 * Auth.js (next-auth v5) configuration — ticket E0-3.
 *
 * Sign-in methods (docs/01, docs/02):
 *  - Email magic link via Resend (primary; zero-password by design — a passcode
 *    stored client-side would be theatre, the emailed link proves inbox ownership).
 *  - Google OAuth (enabled only when AUTH_GOOGLE_ID/SECRET are present, so dev
 *    works without a Google Cloud project).
 *
 * Sessions are database-backed (Session table) via the Prisma adapter, so a
 * signed-in user's basket follows them across devices.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

/**
 * Sign-in codes, not sign-in links.
 *
 * Outlook, Hotmail and every corporate mail gateway run link scanners that
 * FETCH each URL in a message to check it for malware. Auth.js verification
 * tokens are single use, so the scanner consumes the token and the human then
 * taps a link that no longer exists: "the sign-in link is no longer valid".
 * The giveaway was a token being created on request and no row surviving for
 * anyone to click.
 *
 * A code cannot be clicked. Ambiguous characters (0/O, 1/I/L) are excluded so
 * it can be read off a screen and typed without a second attempt. 30 usable
 * characters over 7 places is about 2.2e10 combinations, and codes live 15
 * minutes rather than 24 hours, so guessing is not a realistic route in.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no O, 0, I, L, 1
const CODE_LENGTH = 7;

function generateSignInCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

const providers: NextAuthConfig["providers"] = [
  Resend({
    apiKey: process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM ?? "Baskit <onboarding@resend.dev>",
    maxAge: 15 * 60,
    generateVerificationToken: generateSignInCode,
    // Branded sign-in email. DEBUG_MAGIC_LINK=1 (local dev only, never set in
    // production) additionally logs the code so the flow can be tested without
    // inbox access. There is deliberately NO clickable verification link in this
    // email: a scanner that follows one burns the single-use token.
    async sendVerificationRequest({ identifier, url, provider, token }) {
      if (process.env.DEBUG_MAGIC_LINK === "1") console.log("SIGNIN_CODE", token, url);
      const enterAt = new URL(url).origin + "/verify";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: provider.from,
          to: [identifier],
          // The branded sender is send-only (no inbox) — replies reach a human.
          reply_to: process.env.EMAIL_REPLY_TO ?? "suhmantics@gmail.com",
          subject: `${token} is your Baskit sign-in code`,
          html: [
            // Warm ledger palette to match the brand: cream paper, rich warm
            // ink, deep-green accent, not washed grey on white.
            '<div style="font-family:Georgia,\'Iowan Old Style\',serif;background:#f2ebdc;padding:36px 20px">',
            '<div style="max-width:440px;margin:0 auto;background:#fbf6ea;border:1px solid rgba(36,29,19,0.14);border-radius:16px;padding:32px 28px;color:#241d13">',
            '<div style="font-weight:700;font-size:22px;letter-spacing:-0.02em;margin-bottom:20px">Baskit</div>',
            '<p style="font-size:16px;line-height:1.55;color:#241d13;margin:0 0 8px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">Hi,</p>',
            '<p style="font-size:16px;line-height:1.55;color:#3a3227;margin:0 0 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">Someone (hopefully you) asked to sign in to Baskit. Enter this code on the sign-in page:</p>',
            `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.16em;text-align:center;background:#f2ebdc;border:1px solid rgba(36,29,19,0.14);border-radius:12px;padding:18px 10px;margin:0 0 20px;color:#241d13">${token}</div>`,
            `<p style="font-size:14px;line-height:1.55;color:#3a3227;margin:0 0 22px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">Go to <strong>${enterAt.replace(/^https?:\/\//, "")}</strong> and type it in. Already have the sign-in page open? Just enter it there.</p>`,
            '<p style="font-size:13px;line-height:1.5;color:#7a6e56;margin:0 0 5px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">The code works once and expires in 15 minutes.</p>',
            '<p style="font-size:13px;line-height:1.5;color:#7a6e56;margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">If you didn\'t ask to sign in, you can safely ignore this email and nothing will happen. Questions? Just reply.</p>',
            '<p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9a8e74;margin:24px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">Baskit &middot; a universal wishlist and price tracker</p>',
            "</div></div>",
          ].join(""),
          text: `Hi,\n\nSomeone (hopefully you) asked to sign in to Baskit.\n\nYour sign-in code is: ${token}\n\nGo to ${enterAt} and type it in. The code works once and expires in 15 minutes.\n\nIf you didn't ask to sign in, you can safely ignore this email. Questions? Just reply.\n\nBaskit - a universal wishlist and price tracker`,
        }),
      });
      if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  // Link to an existing magic-link account when the email matches. Auth.js calls
  // this "dangerous" because some OAuth providers hand over emails they never
  // verified; Google is not one of those. Without it, someone who signed up by
  // email and later taps "Continue with Google" hits a dead-end
  // OAuthAccountNotLinked error instead of their own basket — the exact failure
  // this whole change existed to prevent.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

// Microsoft sign-in, for the hotmail/outlook/live half of the world — the same
// mailboxes whose spam filters are harshest on a young sending domain, so these
// are exactly the users a magic link serves worst. Issuer is deliberately left
// unset: Auth.js then defaults to /common/, which admits personal Microsoft
// accounts as well as work ones. Inert until the two env vars exist.
if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  providers.push(MicrosoftEntraID);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  // 90 days, refreshed daily while someone keeps using Baskit. Every sign-in
  // means digging a magic link out of a junk folder, so the honest trade is a
  // longer session: this is a shopping list, not a bank, and the basket is
  // already only reachable from the signed-in device.
  session: {
    strategy: "database",
    maxAge: 90 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    // After asking for a code, land on the form that takes it. Auth.js would
    // otherwise show "check your email for a link", which is no longer true.
    verifyRequest: "/verify",
    // A wrong or already-used code comes back to the same form with a reason,
    // rather than a dead-end error screen.
    error: "/verify",
  },
  callbacks: {
    session({ session, user }) {
      // expose the stable user id to the app (route handlers check ownership by it)
      session.user.id = user.id;
      return session;
    },
  },
});
