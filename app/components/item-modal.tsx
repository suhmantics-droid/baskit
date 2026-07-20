"use client";
/**
 * Add / edit item modal (ticket E2-5) — fields, list picker with inline create,
 * and the best-effort link fetch, ported from the prototype's modal. Money is
 * entered in major units and crosses the API as integer minor units.
 *
 * Mounted with a `key` per item so all form state initialises via useState,
 * no init-effects (react-hooks/set-state-in-effect stays quiet).
 */
import { useState } from "react";
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

interface MicrolinkMeta {
  title: string;
  img: string;
  priceMajor: number | null;
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
  defaultListId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  showToast: (msg: string) => void;
}

export function ItemModal({ item, lists, categories, defaultListId, onClose, onSaved, onDeleted, showToast }: ItemModalProps) {
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
  const [priority, setPriority] = useState(item?.priority ?? "nice");
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
      priority,
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
            <div className="field">
              <label>What is it?</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sony WH-1000XM6 headphones" />
            </div>
            <div className="field">
              <label>Image URL (optional)</label>
              <input value={img} onChange={(e) => setImg(e.target.value)} placeholder="https://…/image.jpg" />
            </div>
            <div className="row3">
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
              <div className="field">
                <label>Target price</label>
                <input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="optional" />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Stock</label>
                <select value={stock} onChange={(e) => setStock(e.target.value as Item["stock"])}>
                  <option value="unknown">Unknown</option>
                  <option value="in">In stock</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </div>
              <div className="field">
                <label>Category</label>
                <input list="catListApp" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Tech, Home" />
                <datalist id="catListApp">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="field">
              <label>Add to lists</label>
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
            <div className="row2">
              <div className="field">
                <label>Tags</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. winter, gift" />
              </div>
              <div className="field">
                <label>Discount code (optional)</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SUMMER15" />
              </div>
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
            <div className="row2">
              <div className="field">
                <label>How badly?</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as Item["priority"])}>
                  <option value="must">Must have</option>
                  <option value="nice">Nice to have</option>
                  <option value="impulse">Impulse</option>
                </select>
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
            </div>
            <div className="field">
              <label>Notes (optional)</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Colour, size, alternatives…" />
            </div>
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
