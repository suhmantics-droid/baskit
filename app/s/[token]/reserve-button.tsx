"use client";
/**
 * Reserve control on the public shared-list page (E5-2). No account needed:
 * the giver types their name, the item locks for everyone else.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReserveButton({ token, itemId }: { token: string; itemId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const reserve = async () => {
    const name = prompt("Your name (so others know it's taken):");
    if (name === null) return;
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/s/${token}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, name: name.trim() }),
      });
      if (res.status === 409) alert("Someone beat you to this one.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn sm" onClick={reserve} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
      {busy ? "Reserving…" : "🎁 Reserve this gift"}
    </button>
  );
}
