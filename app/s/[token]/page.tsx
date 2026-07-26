/**
 * Public shared-list page (ticket E5-1): /s/[token]
 * Viewable with NO account (the Moonsift growth loop). Read-only items with
 * prices and reservation state; givers reserve with just a name. The owner
 * never sees who reserved what — their own app hides reservations entirely.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { subtreeIds } from "@/lib/budget";
import { toDomainList } from "@/lib/api/lists";
import { formatMoney } from "@/lib/format";
import { ReserveButton } from "./reserve-button";

export const metadata: Metadata = { title: "A Baskit list has been shared with you" };

export default async function SharedList({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await prisma.list.findUnique({ where: { shareToken: token } });
  if (!shared) notFound();

  const allLists = await prisma.list.findMany({ where: { ownerId: shared.ownerId } });
  const scope = new Set(subtreeIds(allLists.map(toDomainList), shared.id));
  const items = await prisma.item.findMany({
    where: { userId: shared.ownerId, lists: { some: { listId: { in: [...scope] } } } },
    orderBy: { createdAt: "asc" },
  });
  const reservations = await prisma.reservation.findMany({ where: { itemId: { in: items.map((i) => i.id) } } });
  const reserved = new Set(reservations.map((r) => r.itemId));
  const openItems = items.filter((i) => !i.bought);

  return (
    <div className="app no-sidebar">
      <main className="page" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="hero" style={{ marginTop: 20 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 6 }}>
              Shared with you via Baskit
            </div>
            <h1>
              {shared.emoji} {shared.name}
            </h1>
            <p>Reserve a gift below and nobody doubles up. The list owner cannot see who reserved what.</p>
          </div>
        </div>

        {openItems.length === 0 ? (
          <div className="empty">
            <div className="ic">🎁</div>
            <h3>Nothing to reserve right now</h3>
          </div>
        ) : (
          <div className="grid">
            {openItems.map((it) => {
              const isReserved = reserved.has(it.id);
              return (
                <div key={it.id} className="card" style={{ cursor: "default", opacity: isReserved ? 0.65 : 1 }}>
                  <div className="thumb">
                    {it.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote product images
                      <img src={it.imageUrl} alt="" />
                    ) : (
                      <div className="ph">🎁</div>
                    )}
                    {isReserved && (
                      <div className="status">
                        <span className="badge got">✓ Reserved</span>
                      </div>
                    )}
                  </div>
                  <div className="body">
                    <div className="top">
                      <span className="name">{it.name}</span>
                      <span className="price">{formatMoney(it.price, it.currency)}</span>
                    </div>
                    {it.category && (
                      <div className="meta">
                        <span className="tag cat">{it.category}</span>
                      </div>
                    )}
                    {it.url && (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
                      >
                        View in store ↗
                      </a>
                    )}
                    <div style={{ marginTop: "auto", paddingTop: 8 }}>
                      {isReserved ? (
                        <div className="verdict cool" style={{ justifyContent: "center" }}>
                          Someone has this covered
                        </div>
                      ) : (
                        <ReserveButton token={token} itemId={it.id} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ marginTop: 40, fontSize: 12.5, color: "var(--ink-faint)", textAlign: "center" }}>
          Made with <a href="https://baskit.suhmantics.com" style={{ color: "var(--accent)" }}>Baskit</a>: your record,
          your budget, the right time to buy ·{" "}
          <a href="https://baskit.suhmantics.com/privacy.html" style={{ color: "inherit" }}>
            Privacy
          </a>
        </p>
      </main>
    </div>
  );
}
