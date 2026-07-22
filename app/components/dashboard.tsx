"use client";
/**
 * Signed-in dashboard (ticket E2-3): hero, stat tiles, status chips, category/
 * sort filters, search and the item grid — behaviour ported from the prototype's
 * renderStats/renderStatusChips/visibleItems/renderGrid. Scores come from the
 * same pure scoreItem() the server uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { api, wireToDomainItem, wireToDomainList, type WireListNode } from "@/lib/client/api";
import { scoreItem, type Decision } from "@/lib/decision";
import { firstPrice, latestPrice } from "@/lib/items";
import { formatMoney, daysBetween } from "@/lib/format";
import type { Item, List } from "@/lib/types";
import { subtreeIds } from "@/lib/budget";
import { ItemCard } from "./item-card";
import { ItemModal } from "./item-modal";
import { DetailPanel } from "./detail-panel";
import { Sidebar, type Scope } from "./sidebar";
import { ListModal } from "./list-modal";
import { ListHeader } from "./list-header";
import { MomentsBell } from "./moments-bell";
import { BudgetView } from "./budget-view";
import { Tour } from "./tour";
import { enablePushNotifications } from "@/lib/client/push";
import { PlanPanel } from "./plan-panel";
import { SegDash } from "./seg-dash";

type StatusFilter = "all" | "want" | "later" | "research" | "ready";
type SortKey = "score" | "recent" | "priceHigh" | "priceLow" | "priority" | "cooldown" | "drop";

/** Scoring reference time: page load. Day-granularity logic doesn't need a live clock. */
const PAGE_LOADED_AT = Date.now();

export interface DashboardProps {
  user: { name: string | null; email: string; monthlyBudget: number | null };
}

function isReady(it: Item, now: number): boolean {
  return it.cooldownDays > 0 && !!it.waitUntil && daysBetween(it.waitUntil, now) <= 0;
}

export function Dashboard({ user }: DashboardProps) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [lists, setLists] = useState<WireListNode[] | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  /** undefined = closed, null = adding, Item = editing that item. */
  const [modal, setModal] = useState<Item | null | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** undefined = closed; otherwise create (list null) or edit under a parent. */
  const [listModal, setListModal] = useState<{ list: WireListNode | null; parentId: string | null } | undefined>(undefined);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const now = PAGE_LOADED_AT;

  // Personalisation: greet by name, and collect it on first sign-in (magic-link
  // only gives us an email). displayName drives the header/greeting live.
  const [displayName, setDisplayName] = useState((user.name ?? "").trim());
  const [needsName, setNeedsName] = useState(!user.name || user.name === "Me");
  const [nameDraft, setNameDraft] = useState("");
  const greetedRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  // Greet returning users by name (once per load). New users get the name
  // prompt instead — that's their greeting.
  useEffect(() => {
    if (greetedRef.current || !user.name || user.name === "Me") return;
    greetedRef.current = true;
    const t = setTimeout(() => showToast(`👋 Welcome back, ${user.name}`), 600);
    return () => clearTimeout(t);
  }, [showToast, user.name]);

  const saveName = useCallback(async () => {
    const n = nameDraft.trim();
    setNeedsName(false);
    if (!n) return; // let them skip
    try {
      await api.patchMe({ name: n });
      setDisplayName(n);
      greetedRef.current = true; // don't also fire "welcome back" this session
      showToast(`Lovely to meet you, ${n}! 👋`);
    } catch {
      showToast("Couldn't save your name, you can set it later in the menu");
    }
  }, [nameDraft, showToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [itemsRes, listsRes] = await Promise.all([api.items(), api.lists()]);
        if (cancelled) return;
        setItems(itemsRes.items.map(wireToDomainItem));
        setLists(listsRes.lists);
      } catch {
        if (!cancelled) showToast("Couldn't load your basket — refresh to retry");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    document.addEventListener("click", close);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(undefined);
        setDetailId(null);
        setListModal(undefined);
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [itemsRes, listsRes] = await Promise.all([api.items(), api.lists()]);
      setItems(itemsRes.items.map(wireToDomainItem));
      setLists(listsRes.lists);
    } catch {
      showToast("Couldn't refresh, reload the page");
    }
  }, [showToast]);

  const handleShare = useCallback(
    async (node: WireListNode) => {
      try {
        if (node.shareToken) {
          const link = `${window.location.origin}/s/${node.shareToken}`;
          await navigator.clipboard.writeText(link).catch(() => {});
          if (confirm(`Share link copied:\n${link}\n\nStop sharing instead? (OK stops, Cancel keeps sharing)`)) {
            await api.shareList(node.id, false);
            await refreshData();
            showToast("Sharing stopped, the link is dead");
          } else {
            showToast("Link copied");
          }
        } else {
          const res = await api.shareList(node.id, true);
          const link = `${window.location.origin}/s/${res.shareToken}`;
          await navigator.clipboard.writeText(link).catch(() => {});
          await refreshData();
          showToast("Sharing on, link copied");
        }
      } catch {
        showToast("Couldn't change sharing");
      }
    },
    [refreshData, showToast],
  );

  const domainLists: List[] = useMemo(() => (lists ?? []).map(wireToDomainList), [lists]);
  const listNames = useMemo(() => {
    const m = new Map<string, { name: string; emoji: string }>();
    for (const l of domainLists) m.set(l.id, { name: l.name, emoji: l.emoji });
    return m;
  }, [domainLists]);

  const decisions = useMemo(() => {
    const m = new Map<string, Decision>();
    for (const it of items ?? []) m.set(it.id, scoreItem(it, { now, budget: user.monthlyBudget }));
    return m;
  }, [items, now, user.monthlyBudget]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items ?? []) {
      const c = it.category || "Uncategorised";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  /** Effective view: a scoped list can vanish (deleted) — fall back to All without state churn. */
  const view: Scope = useMemo(() => {
    if (scope === "all" || scope === "__fav" || scope === "__bought" || scope === "__budget") return scope;
    return lists == null || lists.some((l) => l.id === scope) ? scope : "all";
  }, [scope, lists]);

  /** Current list node + breadcrumb chain, when a real list is scoped. */
  const listView = useMemo(() => {
    if (view === "all" || view === "__fav" || view === "__bought" || view === "__budget" || !lists) return null;
    const node = lists.find((l) => l.id === view);
    if (!node) return null;
    const chain: WireListNode[] = [];
    let cur: WireListNode | undefined = node;
    while (cur) {
      chain.unshift(cur);
      const parentId: string | null = cur.parentId;
      cur = parentId ? lists.find((l) => l.id === parentId) : undefined;
    }
    return { node, chain };
  }, [view, lists]);

  const scopedBase = useMemo(() => {
    const all = items ?? [];
    if (view === "all") return all;
    if (view === "__budget") return [];
    if (view === "__fav") return all.filter((i) => i.fav);
    if (view === "__bought") return all.filter((i) => i.bought);
    const inSubtree = new Set(subtreeIds(domainLists, view));
    return all.filter((i) => i.lists.some((id) => inSubtree.has(id)));
  }, [items, view, domainLists]);

  const visible = useMemo(() => {
    let list = [...scopedBase];
    const query = q.trim().toLowerCase();
    list = list.filter((it) => {
      if (status === "ready") {
        if (!isReady(it, now)) return false;
      } else if (status !== "all" && it.status !== status) return false;
      if (cat !== "all" && (it.category || "Uncategorised") !== cat) return false;
      if (query) {
        const hay = [it.name, it.category, it.tags.join(" "), it.lists.map((id) => listNames.get(id)?.name ?? "").join(" ")]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    const score = (it: Item) => decisions.get(it.id)?.score ?? 0;
    list.sort((a, b) => {
      switch (sort) {
        case "priceHigh":
          return (latestPrice(b) ?? 0) - (latestPrice(a) ?? 0);
        case "priceLow":
          return (latestPrice(a) ?? 0) - (latestPrice(b) ?? 0);
        case "priority": {
          const o: Record<string, number> = { must: 0, nice: 1, impulse: 2 };
          return o[a.priority] - o[b.priority];
        }
        case "cooldown":
          return (a.waitUntil ?? Infinity) - (b.waitUntil ?? Infinity);
        case "drop":
          return (firstPrice(b) ?? 0) - (latestPrice(b) ?? 0) - ((firstPrice(a) ?? 0) - (latestPrice(a) ?? 0));
        case "recent":
          return b.createdAt - a.createdAt;
        default:
          return score(b) - score(a);
      }
    });
    return list;
  }, [scopedBase, status, cat, sort, q, now, decisions, listNames]);

  const counts = useMemo(() => {
    const all = scopedBase;
    const c = (s: string) => all.filter((i) => i.status === s).length;
    return {
      all: all.length,
      want: c("want"),
      later: c("later"),
      research: c("research"),
      ready: all.filter((i) => isReady(i, now)).length,
    };
  }, [scopedBase, now]);

  const stats = useMemo(() => {
    const all = items ?? [];
    const total = all.reduce((s, i) => s + (latestPrice(i) ?? 0), 0);
    const over = (lists ?? []).filter((l) => l.capState === "over").length;
    const capped = (lists ?? []).filter((l) => l.cap != null).length;
    return { total, over, capped, ready: counts.ready, listCount: (lists ?? []).length };
  }, [items, lists, counts.ready]);

  const patchLocal = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, ...patch } : it)) : prev));
  }, []);

  const toggleBought = useCallback(
    async (id: string) => {
      const it = items?.find((i) => i.id === id);
      if (!it) return;
      patchLocal(id, { bought: !it.bought });
      try {
        await api.patchItem(id, { bought: !it.bought });
        showToast(!it.bought ? "Marked as bought" : "Marked not bought");
        api.lists().then((r) => setLists(r.lists)); // caps use bought totals eventually
      } catch {
        patchLocal(id, { bought: it.bought });
        showToast("Couldn't save that — try again");
      }
    },
    [items, patchLocal, showToast],
  );

  const toggleFav = useCallback(
    async (id: string) => {
      const it = items?.find((i) => i.id === id);
      if (!it) return;
      patchLocal(id, { fav: !it.fav });
      try {
        await api.patchItem(id, { fav: !it.fav });
        showToast(!it.fav ? "Added to favourites ♥" : "Removed from favourites");
      } catch {
        patchLocal(id, { fav: it.fav });
        showToast("Couldn't save that — try again");
      }
    },
    [items, patchLocal, showToast],
  );

  const toggleTheme = useCallback(() => {
    const el = document.documentElement;
    const effective =
      el.getAttribute("data-theme") ??
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = effective === "dark" ? "light" : "dark";
    el.setAttribute("data-theme", next);
    try {
      localStorage.setItem("baskit.theme", next);
    } catch {}
  }, []);

  const initial = (displayName || user.email || "?").trim().charAt(0).toUpperCase();
  const loading = items === null || lists === null;

  return (
    <>
      <Tour />
      {needsName && (
        <>
          <div className="overlay open" style={{ zIndex: 100 }} />
          <div className="modal-wrap open" style={{ zIndex: 101 }}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <div className="mhead">
                <h2>Welcome to Baskit 🧺</h2>
              </div>
              <div className="mbody">
                <div className="field">
                  <label>What should we call you?</label>
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="e.g. Stephanie"
                    maxLength={80}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                    }}
                  />
                </div>
                <p className="hint" style={{ marginTop: -2 }}>
                  We&rsquo;ll use it to say hello when you come back. You can change it any time.
                </p>
                <button className="btn" style={{ width: "100%" }} onClick={saveName}>
                  {nameDraft.trim() ? "That’s me" : "Skip for now"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <header className="app-header">
        <div className="bar">
          <button className="icon-btn hamb" title="Lists" onClick={() => setSidebarOpen((v) => !v)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div className="logo">
            <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path d="M20 6v36" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              <circle cx="33" cy="29.5" r="13" stroke="currentColor" strokeWidth="6" />
              <path d="M9.5 40H14l6 16.5a5 5 0 0 0 4.8 3.5h14.4a5 5 0 0 0 4.8-3.5L50 40h4.5" stroke="#3fbf9f" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M26.5 49.5h11" stroke="#3fbf9f" strokeWidth="5.5" strokeLinecap="round" />
            </svg>{" "}
            baskit <span className="beta">beta</span>
          </div>
          <div className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input placeholder="Search everything…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="hbtns">
            <MomentsBell now={now} onOpenItem={(id) => setDetailId(id)} />
            <button className="icon-btn" title="Theme" onClick={toggleTheme}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
              </svg>
            </button>
            <div className="profile">
              <div
                className="avatar"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
              >
                {initial}
              </div>
              <div className={`menu${menuOpen ? " open" : ""}`}>
                <div className="mi">
                  <small>{displayName ? `${displayName} · ${user.email}` : user.email}</small>
                </div>
                <div className="sep" />
                <button
                  className="mi"
                  style={{ width: "100%", border: "none", background: "none" }}
                  onClick={() => {
                    setNameDraft(displayName);
                    setNeedsName(true);
                  }}
                >
                  ✏️ {displayName ? "Change your name" : "Set your name"}
                </button>
                <a className="mi" href="/api/me/export">
                  ⬇ Export my data
                </a>
                <button
                  className="mi"
                  style={{ width: "100%", border: "none", background: "none" }}
                  onClick={() => importInputRef.current?.click()}
                >
                  ⬆ Import demo backup
                </button>
                <button
                  className="mi"
                  style={{ width: "100%", border: "none", background: "none" }}
                  onClick={async () => showToast(await enablePushNotifications())}
                >
                  🔔 Turn on notifications
                </button>
                <button
                  className="mi"
                  style={{ width: "100%", border: "none", background: "none", color: "var(--bad)" }}
                  onClick={async () => {
                    if (!confirm("Delete your account and everything in it? This cannot be undone.")) return;
                    try {
                      await api.deleteMe();
                      signOut({ callbackUrl: "/" });
                    } catch {
                      showToast("Couldn't delete the account, email us instead");
                    }
                  }}
                >
                  🗑 Delete account
                </button>
                <div className="sep" />
                <a className="mi" href={`mailto:suhmantics@gmail.com?subject=${encodeURIComponent("Baskit feedback")}&body=${encodeURIComponent("One thing I would use:\n\nOne thing that annoyed me:\n\n")}`}>
                  💬 Send feedback
                </a>
                <a className="mi" href="https://baskit.suhmantics.com/privacy.html" target="_blank" rel="noopener noreferrer">
                  🔒 Privacy
                </a>
                <a className="mi" href="https://baskit.suhmantics.com/terms.html" target="_blank" rel="noopener noreferrer">
                  📄 Terms
                </a>
                <button className="mi" style={{ width: "100%", border: "none", background: "none" }} onClick={() => signOut({ callbackUrl: "/" })}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="app">
        <Sidebar
          lists={lists ?? []}
          scope={scope}
          allCount={(items ?? []).length}
          favCount={(items ?? []).filter((i) => i.fav).length}
          boughtCount={(items ?? []).filter((i) => i.bought).length}
          open={sidebarOpen}
          onSelect={(s) => {
            setScope(s);
            setSidebarOpen(false);
            window.scrollTo(0, 0);
          }}
          onNewList={(parentId) => setListModal({ list: null, parentId })}
          onEditList={(id) => {
            const l = (lists ?? []).find((x) => x.id === id);
            if (l) setListModal({ list: l, parentId: null });
          }}
        />
        <main className="page">
          {view === "all" && (
            <div className="hero">
              <div>
                <h1>{displayName && displayName !== "Me" ? `${displayName}’s basket` : "Your basket"}</h1>
                <p>Your record. Your budget. The right time to buy.</p>
              </div>
              <button className="btn" onClick={() => setModal(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add item
              </button>
            </div>
          )}

          {view === "__fav" && (
            <div className="lhead">
              <div className="crumb">
                <a onClick={() => setScope("all")}>All items</a> <span>›</span> <span>Favourites</span>
              </div>
              <div className="lt">
                <h1>
                  <span style={{ color: "#e0426e" }}>♥</span> Favourites
                </h1>
                <div className="lacts">
                  <button className="btn sm" onClick={() => setModal(null)}>
                    ＋ Add item
                  </button>
                </div>
              </div>
              <div className="budget-wrap">
                <div className="budget-nums">
                  <div className="bn">
                    <div className="k">Items</div>
                    <div className="v">{scopedBase.length}</div>
                  </div>
                  <div className="bn">
                    <div className="k">Total value</div>
                    <div className="v">{formatMoney(scopedBase.reduce((s, i) => s + (latestPrice(i) ?? 0), 0))}</div>
                  </div>
                </div>
                <div className="hint">Tap the ♡ on any card to keep it here — favourites get a small boost in their score.</div>
              </div>
            </div>
          )}

          {view === "__bought" && (
            <div className="lhead">
              <div className="crumb">
                <a onClick={() => setScope("all")}>All items</a> <span>›</span> <span>Purchases</span>
              </div>
              <div className="lt">
                <h1>
                  <span>🧾</span> Purchases
                </h1>
              </div>
              <div className="budget-wrap">
                <div className="budget-nums">
                  <div className="bn">
                    <div className="k">Bought</div>
                    <div className="v">{scopedBase.length}</div>
                  </div>
                  <div className="bn">
                    <div className="k">Total spent</div>
                    <div className="v">{formatMoney(scopedBase.reduce((s, i) => s + (latestPrice(i) ?? 0), 0))}</div>
                  </div>
                </div>
                <div className="hint">Your record. Prices are what each item cost when you marked it bought.</div>
              </div>
            </div>
          )}

          {view === "__budget" && (
            <BudgetView
              items={items ?? []}
              budget={user.monthlyBudget}
              now={now}
              onGoAll={() => setScope("all")}
              onBudgetSaved={() => window.location.reload()}
              showToast={showToast}
            />
          )}

          {listView && (
            <ListHeader
              node={listView.node}
              chain={listView.chain}
              domainLists={domainLists}
              items={items ?? []}
              now={now}
              onGo={(s) => setScope(s)}
              onAddItem={() => setModal(null)}
              onAddSub={() => setListModal({ list: null, parentId: listView.node.id })}
              onEdit={() => setListModal({ list: listView.node, parentId: null })}
              onShare={() => handleShare(listView.node)}
            />
          )}

          {view === "all" && (
          <div className="stats">
            <div className="stat">
              <div className="k"><span className="ki">🧺</span>Items saved</div>
              <div className="v">{counts.all}</div>
              <div className="s">in {stats.listCount} lists</div>
            </div>
            <div className="stat">
              <div className="k"><span className="ki">💷</span>Total value</div>
              <div className="v">{formatMoney(stats.total)}</div>
              <div className="s">across your basket</div>
            </div>
            <div className="stat">
              <div className="k"><span className="ki">⏳</span>Ready to decide</div>
              <div className="v">{stats.ready}</div>
              <div className="s">{stats.ready ? "cool-off finished" : "none waiting"}</div>
            </div>
            <div className="stat">
              <div className="k"><span className="ki">🚦</span>Lists over cap</div>
              <div className="v">{stats.over}</div>
              <div className="s">{stats.capped ? (stats.over ? "trim these" : "all within budget") : "no caps set"}</div>
            </div>
          </div>
          )}

          {view === "all" && items && items.length > 0 && (
            <PlanPanel
              items={items}
              budget={user.monthlyBudget}
              now={now}
              onOpen={setDetailId}
              onBudgetSaved={() => window.location.reload()}
              showToast={showToast}
            />
          )}
          {view === "all" && (
            <SegDash
              lists={lists ?? []}
              domainLists={domainLists}
              items={items ?? []}
              onSelect={(s) => {
                setScope(s);
                window.scrollTo(0, 0);
              }}
              onNewList={(parentId) => setListModal({ list: null, parentId })}
            />
          )}

          {view !== "all" && view !== "__fav" && view !== "__bought" && view !== "__budget" && (
            <div className="sublists">
              {(lists ?? [])
                .filter((l) => l.parentId === view)
                .map((c) => (
                  <div key={c.id} className="lcard" onClick={() => setScope(c.id)}>
                    <div className="lc-t">
                      <span>{c.emoji}</span> {c.name}
                    </div>
                    <div className="lc-s">
                      {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                    </div>
                    {c.cap != null ? (
                      <div className={`side-cap cap-${c.capState}`}>
                        <div className="capbar">
                          <span style={{ width: `${Math.min(100, (c.spent / c.cap) * 100).toFixed(0)}%` }} />
                        </div>
                        <div className="lbl">
                          <span>{formatMoney(c.spent)}</span>
                          <span>{c.spent > c.cap ? `+${formatMoney(c.spent - c.cap)} over` : `of ${formatMoney(c.cap)}`}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="lc-s">{formatMoney(c.spent)} · no cap</div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {view !== "__budget" && (
          <div className="toolbar">
            <div className="chips">
              {(
                [
                  ["all", "All"],
                  ["want", "Want now"],
                  ["later", "Save for later"],
                  ["research", "Researching"],
                  ["ready", "Ready to decide"],
                ] as [StatusFilter, string][]
              ).map(([key, label]) => (
                <button key={key} className={`chip${status === key ? " active" : ""}`} onClick={() => setStatus(key)}>
                  {label}
                  <span className="n">{counts[key]}</span>
                </button>
              ))}
            </div>
            <div className="spacer" />
            <select className="sel" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map(([c, n]) => (
                <option key={c} value={c}>
                  {c} ({n})
                </option>
              ))}
            </select>
            <select className="sel" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="score">Best decision score</option>
              <option value="recent">Newest first</option>
              <option value="priceHigh">Price: high → low</option>
              <option value="priceLow">Price: low → high</option>
              <option value="priority">Priority</option>
              <option value="cooldown">Cool-off ending soon</option>
              <option value="drop">Biggest price drop</option>
            </select>
          </div>
          )}

          {view === "__budget" ? null : loading ? (
            <div className="empty">
              <div className="ic">🧺</div>
              <h3>Loading your basket…</h3>
            </div>
          ) : counts.all === 0 ? (
            <div className="empty">
              <div className="ic">🧺</div>
              <h3>{displayName && displayName !== "Me" ? `${displayName}, your basket is empty` : "Your basket is empty"}</h3>
              <p>Add the first thing you&rsquo;ve got your eye on — paste a product link and Baskit pulls the details.</p>
              <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setModal(null)}>
                  Add an item
                </button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="ic">🔍</div>
              <h3>Nothing here yet</h3>
              <p>Change the filters, or clear the search.</p>
            </div>
          ) : (
            <div className="grid">
              {visible.map((it) => (
                <ItemCard
                  key={it.id}
                  item={it}
                  decision={decisions.get(it.id)!}
                  listNames={listNames}
                  onToggleBought={toggleBought}
                  onToggleFav={toggleFav}
                  onOpen={setDetailId}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {modal !== undefined && (
        <ItemModal
          key={modal?.id ?? "new"}
          item={modal}
          lists={lists ?? []}
          categories={categories.map(([c]) => c)}
          defaultListId={view !== "all" && view !== "__fav" && view !== "__bought" ? scope : null}
          onClose={() => setModal(undefined)}
          onSaved={refreshData}
          onDeleted={refreshData}
          showToast={showToast}
        />
      )}
      {listModal !== undefined && (
        <ListModal
          key={listModal.list?.id ?? `new-${listModal.parentId ?? "root"}`}
          list={listModal.list}
          parentId={listModal.parentId}
          lists={lists ?? []}
          onClose={() => setListModal(undefined)}
          onSaved={(selectId) => {
            refreshData();
            if (selectId) setScope(selectId);
          }}
          showToast={showToast}
        />
      )}
      {detailId && (
        <DetailPanel
          itemId={detailId}
          budget={user.monthlyBudget}
          listNames={listNames}
          now={now}
          onClose={() => setDetailId(null)}
          onEdit={(it) => {
            setDetailId(null);
            setModal(it);
          }}
          onChanged={refreshData}
          showToast={showToast}
        />
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const text = await file.text();
            const res = await fetch("/api/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: text,
            });
            const data = await res.json();
            if (!res.ok) {
              showToast("That file doesn't look like a Baskit backup");
              return;
            }
            await refreshData();
            showToast(`Imported ${data.importedItems} items and ${data.importedLists} lists — safe in your account now`);
          } catch {
            showToast("Couldn't read that file");
          }
        }}
      />
      <div className={`toast${toast ? " show" : ""}`}>{toast}</div>
    </>
  );
}
