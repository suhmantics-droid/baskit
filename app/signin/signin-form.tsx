"use client";
/**
 * Sign-in: Google first, email code second.
 *
 * The email is remembered locally (this device only, never sent anywhere but
 * the sign-in request itself) so the code screen can pre-fill it and a returning
 * visitor does not retype an address they have already given us once.
 */
import { useState } from "react";
import { signIn } from "next-auth/react";
import { REMEMBERED_EMAIL_COOKIE, rememberEmail } from "../remember-email";

export function SignInForm({
  callbackUrl,
  error,
  hasGoogle,
  initialEmail,
}: {
  callbackUrl: string;
  error: string;
  hasGoogle: boolean;
  initialEmail: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr.includes("@")) return;
    setBusy("email");
    // A cookie rather than localStorage so the code screen can be rendered with
    // the address already in it, server-side, with no flash of an empty field.
    rememberEmail(addr);
    void REMEMBERED_EMAIL_COOKIE;
    await signIn("resend", { email: addr, callbackUrl, redirect: true });
  };

  return (
    <main className="page" style={{ maxWidth: 420, margin: "0 auto", padding: "56px 20px" }}>
      <h1 style={{ fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Sign in to Baskit</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.55, margin: "0 0 24px" }}>
        Your basket is saved to your account and follows you to any device. You stay signed in for 90 days.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            border: "1px solid var(--line-strong)",
            background: "var(--surface-2)",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 13.5,
            marginBottom: 18,
          }}
        >
          That did not work. Try again, or use the other option below.
        </div>
      )}

      {hasGoogle && (
        <>
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={busy !== null}
            onClick={() => {
              setBusy("google");
              signIn("google", { callbackUrl });
            }}
          >
            {busy === "google" ? "Opening Google…" : "Continue with Google"}
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "20px 0",
              color: "var(--ink-faint)",
              fontSize: 12.5,
            }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            or
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
        </>
      )}

      <form onSubmit={sendCode}>
        <div className="field">
          <label htmlFor="siemail">Your email</label>
          <input
            id="siemail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <button
          className={hasGoogle ? "btn ghost" : "btn"}
          type="submit"
          disabled={!email.includes("@") || busy !== null}
          style={{ width: "100%", marginTop: 14, justifyContent: "center" }}
        >
          {busy === "email" ? "Sending…" : "Email me a code"}
        </button>
      </form>

      <p style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 20, lineHeight: 1.5 }}>
        We send a short code instead of a link, because mail scanners open links and use them up before you can.
      </p>
    </main>
  );
}
