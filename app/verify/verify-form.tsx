"use client";
/**
 * The code entry form. Submitting navigates to the Auth.js email callback with
 * the typed code as the token, which is the same endpoint a magic link would
 * have hit, minus the clickable link that scanners kept consuming.
 */
import { useState } from "react";

const CODE_LENGTH = 7;

export function VerifyForm({ initialEmail, error }: { initialEmail: string; error: string }) {
  // Arrives already filled from the cookie set on the previous screen.
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ready = clean.length === CODE_LENGTH && email.includes("@");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const params = new URLSearchParams({ token: clean, email: email.trim(), callbackUrl: "/" });
    window.location.href = `/api/auth/callback/resend?${params.toString()}`;
  };

  return (
    <main className="page" style={{ maxWidth: 420, margin: "0 auto", padding: "56px 20px" }}>
      <h1 style={{ fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Enter your code</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.55, margin: "0 0 22px" }}>
        We sent a {CODE_LENGTH} character code to your email. It works once and lasts 15 minutes.
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
          That code was not right, or it has already been used. Request a fresh one and try again.
        </div>
      )}

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="vemail">Your email</label>
          <input
            id="vemail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="vcode">Sign-in code</label>
          <input
            id="vcode"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="one-time-code"
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="ABC2345"
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 22,
              letterSpacing: "0.18em",
              textAlign: "center",
            }}
          />
        </div>
        <button className="btn" type="submit" disabled={!ready || busy} style={{ width: "100%", marginTop: 18 }}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>

      <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 20 }}>
        No code yet?{" "}
        <button
          type="button"
          onClick={() => {
            window.location.href = "/api/auth/signin";
          }}
          style={{ color: "var(--accent)", background: "none", border: "none", padding: 0, font: "inherit", textDecoration: "underline" }}
        >
          Request another
        </button>
        .
      </p>
    </main>
  );
}
