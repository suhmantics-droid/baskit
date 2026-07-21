"use client";
/**
 * Share-target capture flow (ticket E2-7): pull the first URL out of whatever
 * the sharing app sent (Android usually hides it in `text`), run the extraction
 * ladder, save the item, land on the basket. One tap, no form — the item can
 * be edited afterwards. No URL found → fall back to a named item.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";

function firstUrl(...blobs: string[]): string | null {
  for (const b of blobs) {
    const m = b.match(/https?:\/\/[^\s"'<>]+/i);
    if (m) return m[0].replace(/[).,]+$/, "");
  }
  return null;
}

interface OwnExtract {
  priceMinor: number;
  currency: string;
  name: string | null;
  imageUrl: string | null;
  availability: "in" | "out" | null;
}

export function AddCapture({ title, text, url }: { title: string; text: string; url: string }) {
  const [phase, setPhase] = useState<"working" | "done" | "failed">("working");
  const [savedName, setSavedName] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // strict-mode double-invoke guard — save exactly once
    ran.current = true;
    (async () => {
      const link = firstUrl(url, text, title);
      const sharedName = title.trim() || text.replace(/https?:\/\/\S+/g, "").trim();
      try {
        let extracted: OwnExtract | null = null;
        if (link) {
          try {
            const res = await fetch("/api/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: link }),
            });
            if (res.ok) {
              const j = (await res.json()) as { ok: boolean; extracted: OwnExtract | null };
              if (j.ok) extracted = j.extracted;
            }
          } catch {
            // extraction is best-effort; the share still saves
          }
        }
        const name = (extracted?.name ?? sharedName ?? "").slice(0, 140) || link || "Shared item";
        if (!link && !sharedName) throw new Error("nothing shared");
        await api.createItem({
          name,
          url: link,
          imageUrl: extracted?.imageUrl ?? null,
          currency: extracted?.currency ?? "GBP",
          price: extracted?.priceMinor ?? null,
          ...(extracted?.availability ? { stock: extracted.availability } : {}),
        });
        setSavedName(name);
        setPhase("done");
        setTimeout(() => {
          window.location.replace("/");
        }, 1200);
      } catch {
        setPhase("failed");
      }
    })();
  }, [title, text, url]);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "90px 24px", textAlign: "center" }}>
      {phase === "working" && (
        <>
          <div style={{ fontSize: 34, marginBottom: 14 }}>🧺</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            Saving to your basket…
          </h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Reading the product page for you.</p>
        </>
      )}
      {phase === "done" && (
        <>
          <div style={{ fontSize: 34, marginBottom: 14 }}>✓</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            Saved
          </h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>{savedName}</p>
        </>
      )}
      {phase === "failed" && (
        <>
          <div style={{ fontSize: 34, marginBottom: 14 }}>🤔</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            Couldn&apos;t save that share
          </h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 20 }}>
            Nothing shareable arrived. Open your basket and add it there instead.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--bg)",
              fontSize: 14.5,
              textDecoration: "none",
            }}
          >
            Open your basket
          </Link>
        </>
      )}
    </main>
  );
}
