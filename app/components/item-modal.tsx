"use client";
/**
 * Add / edit item modal (ticket E2-5) — fields, list picker with inline create,
 * and the best-effort link fetch, ported from the prototype's modal. Money is
 * entered in major units and crosses the API as integer minor units.
 *
 * Mounted with a `key` per item so all form state initialises via useState,
 * no init-effects (react-hooks/set-state-in-effect stays quiet).
 */
import { useRef, useState } from "react";
import { api, type WireListNode } from "@/lib/client/api";
import { fromMinorUnits, toMinorUnits } from "@/lib/format";
import type { Item } from "@/lib/types";

const CURRENCIES: [string, string][] = [
  ["GBP", "£"],
  ["USD", "$"],
  ["EUR", "€"],
  ["INR", "₹"],
  ["JPY", "¥"],
];

/** Symbol shown in the picker ↔ ISO code the FX proxy speaks. */
const ISO_OF: Record<string, string> = { GBP: "GBP", USD: "USD", EUR: "EUR", INR: "INR", JPY: "JPY" };

/**
 * Today's rate via our own /api/fx proxy (frankfurter, er-api fallback). Cached
 * for 12h in localStorage so a basket full of foreign items costs one request.
 * Returns null on any failure — the caller then leaves the price alone rather
 * than inventing a conversion.
 */
async function fxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const key = `baskit.fx.${from}.${to}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) {
      const { r, t } = JSON.parse(hit) as { r: number; t: number };
      if (Date.now() - t < 12 * 3_600_000) return r;
    }
  } catch {}
  try {
    const res = await fetch(`/api/fx?from=${ISO_OF[from] ?? from}&to=${ISO_OF[to] ?? to}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { rate?: number };
    if (typeof j.rate !== "number") return null;
    try {
      localStorage.setItem(key, JSON.stringify({ r: j.rate, t: Date.now() }));
    } catch {}
    return j.rate;
  } catch {
    return null;
  }
}

/**
 * Shrink a camera roll photo to something a basket can carry: longest edge 480px,
 * JPEG q0.7, which lands around 20-40KB. Testers screenshot things constantly and
 * then delete the original, so the picture has to live in the item.
 */
function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("decode failed"));
      image.onload = () => {
        const MAX = 480;
        const scale = Math.min(1, MAX / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

interface MicrolinkMeta {
  title: string;
  img: string;
  priceMajor: number | null;
}

interface OwnExtract {
  priceMinor: number;
  currency: string;
  name: string | null;
  imageUrl: string | null;
  availability: "in" | "out" | null;
  confidence: "high" | "low";
}

/** Baskit's own server-side ladder (E3-2) — null means fall back to microlink. */
async function fetchOwnExtract(url: string): Promise<OwnExtract | null> {
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { ok: boolean; extracted: OwnExtract | null };
    return j.ok ? j.extracted : null;
  } catch {
    return null;
  }
}

async function fetchLinkMeta(url: string): Promise<MicrolinkMeta> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`https://api.microlink.io/?meta=true&url=${encodeURIComponent(url)}`, {
      signal: ctrl.signal,
    });
    const j = await res.json();
    if (j?.status !== "success" || !j.data) throw new Error("nodata");
    const d = j.data;
    let priceMajor: number | null = null;
    if (d.price != null && !Number.isNaN(parseFloat(d.price))) priceMajor = parseFloat(d.price);
    else {
      const blob = [d.description, d.title].filter(Boolean).join(" ");
      const m = blob.match(/[£$€]\s?([0-9]{1,6}(?:[.,][0-9]{2})?)/);
      if (m) priceMajor = parseFloat(m[1].replace(",", "."));
    }
    return { title: d.title ?? "", img: d.image?.url ?? d.logo?.url ?? "", priceMajor };
  } finally {
    clearTimeout(timer);
  }
}

export interface ItemModalProps {
  /** null = creating; an Item = editing it. */
  item: Item | null;
  lists: WireListNode[];
  categories: string[];
  /** Most-used tags across the basket, commonest first — offered as chips. */
  tagSuggestions?: string[];
  defaultListId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  showToast: (msg: string) => void;
}

export function ItemModal({ item, lists, categories, tagSuggestions = [], defaultListId, onClose, onSaved, onDeleted, showToast }: ItemModalProps) {
  const editing = item !== null;
  const [name, setName] = useState(item?.name ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [img, setImg] = useState(item?.imageUrl ?? "");
  const [currency, setCurrency] = useState(item?.currency ?? "GBP");
  const [price, setPrice] = useState(item?.price != null ? String(fromMinorUnits(item.price, item.currency)) : "");
  const [target, setTarget] = useState(
    item?.targetPrice != null ? String(fromMinorUnits(item.targetPrice, item.currency)) : "",
  );
  const [stock, setStock] = useState(item?.stock ?? "unknown");
  const [category, setCategory] = useState(item?.category ?? "");
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  const [code, setCode] = useState(item?.code ?? "");
  const [status, setStatus] = useState(item?.status ?? "want");
  // One control for "how much do I want it": the heart. Priority is derived from
  // it on save, so the two can never disagree the way they used to.
  const [want, setWant] = useState(item?.fav ?? false);
  const [cooldown, setCooldown] = useState(String(item?.cooldownDays ?? 7));
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(item?.lists ?? (defaultListId ? [defaultListId] : [])),
  );
  const [newList, setNewList] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);

  const roots = lists.filter((l) => !l.parentId);
  const childrenOf = (id: string) => lists.filter((l) => l.parentId === id);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doFetch = async () => {
    const u = url.trim();
    if (!u) {
      showToast("Paste a product link first");
      return;
    }
    setFetching(true);
    try {
      // Our own extractor first: structured data + retailer adapters, server-side.
      const own = await fetchOwnExtract(u);
      if (own) {
        if (own.name && !name) setName(own.name);
        if (own.imageUrl && !img) setImg(own.imageUrl);
        let note = "";
        if (!price) {
          const storeMajor = fromMinorUnits(own.priceMinor, own.currency);
          // Keep the shopper in their own currency: a US store quoting dollars
          // should still land in the basket as pounds, at today's rate.
          if (own.currency !== currency) {
            const rate = await fxRate(own.currency, currency);
            if (rate != null) {
              setPrice(String(Math.round(storeMajor * rate * 100) / 100));
              note = ` (converted from ${own.currency} at today's rate)`;
            } else {
              setPrice(String(storeMajor));
              setCurrency(own.currency);
            }
          } else {
            setPrice(String(storeMajor));
          }
        }
        if (own.availability) setStock(own.availability);
        showToast(
          (own.confidence === "low"
            ? "Best guess from the page, double-check the price"
            : "Pulled details straight from the store") + note,
        );
        return;
      }
      // Microlink fallback — its headless renderer can read JS-only pages.
      const m = await fetchLinkMeta(u);
      if (m.title && !name) setName(m.title);
      if (m.img && !img) setImg(m.img);
      if (m.priceMajor != null && !price) setPrice(String(m.priceMajor));
      showToast(m.priceMajor != null ? "Pulled details from the link" : "Pulled title and image, add the price");
    } catch {
      showToast("Couldn't read that link, fill it in by hand");
    } finally {
      setFetching(false);
    }
  };

  const photoInput = useRef<HTMLInputElement>(null);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUri = await compressPhoto(file);
      setImg(dataUri);
      showToast(`Photo added, about ${Math.round(dataUri.length / 1024)}KB`);
    } catch {
      showToast("Couldn't read that image, try another");
    }
  };

  const currentTags = tags.split(",").map((s) => s.trim()).filter(Boolean);
  const toggleTag = (t: string) => {
    const has = currentTags.some((x) => x.toLowerCase() === t.toLowerCase());
    const next = has ? currentTags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...currentTags, t];
    setTags(next.join(", "));
  };

  const listSummary =
    picked.size === 0
      ? "none yet"
      : picked.size > 2
        ? `${picked.size} lists selected`
        : lists.filter((l) => picked.has(l.id)).map((l) => l.name).join(", ");

  const createList = async () => {
    const n = newList.trim();
    if (!n) return;
    try {
      const res = await api.createList({ name: n });
      setPicked((prev) => new Set(prev).add(res.list.id));
      setNewList("");
      onSaved(); // refresh lists in the parent
      showToast("List created");
    } catch {
      showToast("Couldn't create that list");
    }
  };

  const save = async () => {
    const n = name.trim();
    if (!n) {
      showToast("Give it a name first");
      return;
    }
    const parseMoney = (s: string) => {
      const v = parseFloat(s);
      return s.trim() === "" || Number.isNaN(v) ? null : toMinorUnits(v, currency);
    };
    const body = {
      name: n,
      url: url.trim() || null,
      imageUrl: img.trim() || null,
      currency,
      price: parseMoney(price),
      targetPrice: parseMoney(target),
      stock,
      category: category.trim() || null,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      code: code.trim() || null,
      status,
      fav: want,
      priority: want ? "must" : "nice",
      cooldownDays: parseInt(cooldown, 10) || 0,
      notes: notes.trim() || null,
      lists: [...picked],
    };
    setBusy(true);
    try {
      if (editing) await api.patchItem(item.id, body);
      else await api.createItem(body);
      onSaved();
      onClose();
      showToast(editing ? "Saved changes" : "Added to your basket");
    } catch {
      showToast("Couldn't save, check the link is a real product URL");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!editing) return;
    if (!confirm(`Remove “${item.name}”?`)) return;
    setBusy(true);
    try {
      await api.deleteItem(item.id);
      onDeleted?.();
      onClose();
      showToast("Removed");
    } finally {
      setBusy(false);
    }
  };

  const pickerRow = (l: WireListNode, depth: number) => (
    <div key={l.id}>
      <label className="lp-row" style={{ paddingLeft: 6 + depth * 16 }}>
        <input type="checkbox" checked={picked.has(l.id)} onChange={() => togglePick(l.id)} />{" "}
        <span>
          {l.emoji} {l.name}
        </span>
      </label>
      {childrenOf(l.id).map((c) => pickerRow(c, depth + 1))}
    </div>
  );

  return (
    <>
      <div className="overlay open" onClick={onClose} />
      <div className="modal-wrap open">
        <div className="modal">
          <div className="mhead">
            <h2>{editing ? "Edit item" : "Add an item"}</h2>
            <button className="close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="mbody">
            <div className="urlrow">
              <div className="field">
                <label>Link (paste a product URL)</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
              <button className="btn ghost sm" style={{ height: 40 }} onClick={doFetch} disabled={fetching}>
                {fetching ? "…" : "Fetch"}
              </button>
            </div>
            <div style={{ marginTop: -6 }}>
              <button className="btn ghost sm" type="button" onClick={() => photoInput.current?.click()}>
                📷 Add from a photo or screenshot
              </button>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  onPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="field">
              <label>What is it?</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sony WH-1000XM6 headphones" />
            </div>
            <div className="row2">
              <div className="field">
                <label>Price</label>
                <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="field">
                <label>Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map(([c, sym]) => (
                    <option key={c} value={c}>
                      {sym} {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Category</label>
              <input list="catListApp" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Holiday, Tech, Home" />
              <datalist id="catListApp">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>Status</label>
              <div className="seg">
                {(
                  [
                    ["want", "Want now"],
                    ["later", "Save for later"],
                    ["research", "Researching"],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} className={status === v ? "on" : ""} onClick={() => setStatus(v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>How much do you want it?</label>
              <div className="seg wantdial">
                <button type="button" data-want="0" className={want ? "" : "on"} onClick={() => setWant(false)}>
                  ♡ Nice to have
                </button>
                <button type="button" data-want="1" className={want ? "on" : ""} onClick={() => setWant(true)}>
                  ♥ Must have
                </button>
              </div>
            </div>
            <div className="field">
              <label>Cool off before deciding</label>
              <select value={cooldown} onChange={(e) => setCooldown(e.target.value)}>
                <option value="0">No cool-off</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
            <details className="optdrop">
              <summary>
                <span>Add to lists</span>
                <em>{listSummary}</em>
              </summary>
              <div className="optbody">
                <div className="listpick">
                  {roots.length === 0 && <div className="hint" style={{ padding: 6 }}>No lists yet, create one below.</div>}
                  {roots.map((l) => pickerRow(l, 0))}
                </div>
                <div className="lp-add">
                  <input
                    value={newList}
                    onChange={(e) => setNewList(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createList();
                      }
                    }}
                    placeholder="Create a new list…"
                  />
                  <button className="btn ghost sm" onClick={createList}>
                    Add
                  </button>
                </div>
              </div>
            </details>
            <div className="field">
              <label>Notes (optional)</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Colour, size, alternatives…" />
            </div>
            <details className="optdrop">
              <summary>
                <span>More options</span>
                <em>image · target price · stock · tags · code</em>
              </summary>
              <div className="optbody">
                <div className="field">
                  <label>Image URL</label>
                  <input value={img} onChange={(e) => setImg(e.target.value)} placeholder="https://…/image.jpg" />
                </div>
                <div className="row2">
                  <div className="field">
                    <label>Target price</label>
                    <input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="optional" />
                  </div>
                  <div className="field">
                    <label>Stock</label>
                    <select value={stock} onChange={(e) => setStock(e.target.value as Item["stock"])}>
                      <option value="unknown">Unknown</option>
                      <option value="in">In stock</option>
                      <option value="low">Low stock</option>
                      <option value="out">Out of stock</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Discount code</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SUMMER15" />
                </div>
                <div className="field">
                  <label>Tags (group things across lists)</label>
                  <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. keval, holiday" />
                  {tagSuggestions.length > 0 && (
                    <div className="chips" style={{ marginTop: 7 }}>
                      {tagSuggestions.slice(0, 8).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={currentTags.some((x) => x.toLowerCase() === t.toLowerCase()) ? "chip active" : "chip"}
                          onClick={() => toggleTag(t)}
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>
          <div className="mfoot">
            {editing ? (
              <button className="del" onClick={del} disabled={busy}>
                Delete
              </button>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save item"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
