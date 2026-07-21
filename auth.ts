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
          subject: "Sign in to Baskit",
          html: [
            '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px">',
            '<div style="font-weight:600;font-size:20px;letter-spacing:-0.02em;margin-bottom:16px">baskit</div>',
            '<p style="font-size:15px;color:#444;margin:0 0 20px">Tap the button to sign in. This link works once and expires in 24 hours.</p>',
            `<a href="${url}" style="display:inline-block;background:#16130f;color:#fafaf8;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:500">Sign in to Baskit</a>`,
            '<p style="font-size:12.5px;color:#999;margin:24px 0 0">If you didn\'t request this, you can safely ignore it.</p>',
            "</div>",
          ].join(""),
          text: `Sign in to Baskit: ${url}\n\nThis link works once and expires in 24 hours. If you didn't request it, ignore this email.`,
        }),
      });
      if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: "database" },
  pages: {}, // default Auth.js pages until the Epic 2 UI lands
  callbacks: {
    session({ session, user }) {
      // expose the stable user id to the app (route handlers check ownership by it)
      session.user.id = user.id;
      return session;
    },
  },
});
