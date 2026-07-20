import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { Dashboard } from "./components/dashboard";

export default async function Home() {
  const session = await auth().catch(() => null);
  const sessionUser = session?.user;

  if (sessionUser?.id) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { name: true, email: true, monthlyBudget: true },
    });
    if (user) return <Dashboard user={user} />;
  }

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "80px 24px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <svg width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path d="M20 6v36" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          <circle cx="33" cy="29.5" r="13" stroke="currentColor" strokeWidth="6" />
          <path d="M9.5 40H14l6 16.5a5 5 0 0 0 4.8 3.5h14.4a5 5 0 0 0 4.8-3.5L50 40h4.5" stroke="#3fbf9f" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M26.5 49.5h11" stroke="#3fbf9f" strokeWidth="5.5" strokeLinecap="round" />
        </svg>
        <span style={{ fontWeight: 600, fontSize: 20, letterSpacing: "-0.02em" }}>baskit</span>
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            border: "1px solid var(--line-strong)",
            padding: "2px 6px",
            borderRadius: 999,
          }}
        >
          beta
        </span>
      </div>
      <h1 style={{ fontSize: 25, letterSpacing: "-0.03em", margin: "0 0 8px", fontWeight: 600 }}>
        Everything you want, in one place.
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, margin: "0 0 24px", maxWidth: 560 }}>
        Decide better. Buy intentional. Sign in and your basket follows you to any device.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn();
        }}
      >
        <button
          type="submit"
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid var(--ink)",
            background: "var(--ink)",
            color: "var(--bg)",
            fontSize: 14.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Sign in / create your basket
        </button>
      </form>
      <p style={{ marginTop: 40, fontSize: 12.5 }}>
        <a href="https://baskit.suhmantics.com/privacy.html" style={{ color: "var(--ink-faint)" }}>
          Privacy
        </a>
      </p>
    </main>
  );
}
