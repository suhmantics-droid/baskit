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

const providers: NextAuthConfig["providers"] = [
  Resend({
    apiKey: process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM ?? "Baskit <onboarding@resend.dev>",
    // Branded magic-link email. DEBUG_MAGIC_LINK=1 (local dev only, never set in
    // production) additionally logs the link so the flow can be tested without
    // inbox access.
    async sendVerificationRequest({ identifier, url, provider }) {
      if (process.env.DEBUG_MAGIC_LINK === "1") console.log("MAGIC_LINK", url);
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
          subject: "Your Baskit sign-in link",
          // Written to read as the legit transactional email it is, not the
          // bare button+link shape spam filters distrust from a young domain:
          // real sender identity, context for why it arrived, and the plain URL
          // visible as a fallback (helps filters and users when the button
          // doesn't render).
          html: [
            // Warm ledger palette to match the brand: cream paper, rich warm
            // ink, deep-green accent — not washed grey on white.
            '<div style="font-family:Georgia,\'Iowan Old Style\',serif;background:#f2ebdc;padding:36px 20px">',
            '<div style="max-width:440px;margin:0 auto;background:#fbf6ea;border:1px solid rgba(36,29,19,0.14);border-radius:16px;padding:32px 28px;color:#241d13">',
            '<div style="font-weight:700;font-size:22px;letter-spacing:-0.02em;margin-bottom:20px">Baskit</div>',
            '<p style="font-size:16px;line-height:1.55;color:#241d13;margin:0 0 8px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">Hi,</p>',
            '<p style="font-size:16px;line-height:1.55;color:#3a3227;margin:0 0 22px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">Someone (hopefully you) asked to sign in to Baskit with this email address. Tap the button and your basket will be saved to your account, safe on any device.</p>',
            `<a href="${url}" style="display:inline-block;background:#241d13;color:#fbf6ea;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px;font-weight:600;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">Sign in to Baskit</a>`,
            '<p style="font-size:13px;line-height:1.5;color:#6b6051;margin:24px 0 6px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">Or paste this link into your browser:</p>',
            `<p style="font-size:12.5px;line-height:1.5;margin:0 0 24px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"><a href="${url}" style="color:#0f5f4b">${url}</a></p>`,
            '<p style="font-size:13px;line-height:1.5;color:#7a6e56;margin:0 0 5px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">This link works once and expires in 24 hours.</p>',
            '<p style="font-size:13px;line-height:1.5;color:#7a6e56;margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">If you didn\'t ask to sign in, you can safely ignore this email and nothing will happen. Questions? Just reply.</p>',
            '<p style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9a8e74;margin:24px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">Baskit &middot; a universal wishlist and price tracker</p>',
            "</div></div>",
          ].join(""),
          text: `Hi,\n\nSomeone (hopefully you) asked to sign in to Baskit with this email address. Open this link to sign in and save your basket to your account:\n\n${url}\n\nThis link works once and expires in 24 hours. If you didn't ask to sign in, you can safely ignore this email. Questions? Just reply.\n\nBaskit - a universal wishlist and price tracker`,
        }),
      });
      if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
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
  pages: {}, // default Auth.js pages until the Epic 2 UI lands
  callbacks: {
    session({ session, user }) {
      // expose the stable user id to the app (route handlers check ownership by it)
      session.user.id = user.id;
      return session;
    },
  },
});
