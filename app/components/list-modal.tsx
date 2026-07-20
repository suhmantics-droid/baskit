"use client";
/**
 * List create/edit modal (ticket E2-4) — name, emoji, parent, spend cap and
 * date, ported from the prototype's list modal. Cap entered in major units,
 * stored in minor units. Delete moves children up a level (server behaviour).
 */
import { useState } from "react";
import { api, type WireListNode } from "@/lib/client/api";
import { fromMinorUnits, toMinorUnits } from "@/lib/format";

export interface ListModalProps {
  /** null = creating; a node = editing it. */
  list: WireListNode | null;
  parentId: string | null;
  lists: WireListNode[];
  onClose: () => void;
  onSaved: (selectId?: string) => void;
  showToast: (msg: string) => void;
}

function descendants(lists: WireListNode[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (cur: string) => {
    for (const l of lists) {
      if (l.parentId === cur && !out.has(l.id)) {
        out.add(l.id);
        walk(l.id);
      }
    }
  };
  walk(id);
  return out;
}

export function ListModal({ list, parentId, lists, onClose, onSaved, showToast }: ListModalProps) {
  const editing = list !== null;
  const [name, setName] = useState(list?.name ?? "");
  const [emoji, setEmoji] = useState(list?.emoji ?? "🎁");
  const [parent, setParent] = useState(list?.parentId ?? parentId ?? "");
  const [cap, setCap] = useState(list?.cap != null ? String(fromMinorUnits(list.cap)) : "");
  const [due, setDue] = useState(list?.dueDate ? list.dueDate.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);

  const excluded = editing ? new Set([list.id, ...descendants(lists, list.id)]) : new Set<string>();
  const parentOptions = lists.filter((l) => !excluded.has(l.id));

  const save = async () => {
    const n = name.trim();
    if (!n) {
      showToast("Name the list");
      return;
    }
    const capMinor = cap.trim() === "" || Number.isNaN(parseFloat(cap)) ? null : toMinorUnits(parseFloat(cap));
    const body = {
      name: n,
      emoji: emoji.trim() || "🗂",
      parentId: parent || null,
      cap: capMinor,
      dueDate: due || null,
    };
    setBusy(true);
    try {
      if (editing) {
        await api.patchList(list.id, body);
        onSaved();
        showToast("List updated");
      } else {
        const res = await api.createList(body);
        onSaved(res.list.id);
        showToast("List created");
      }
      onClose();
    } catch {
      showToast("Couldn't save the list");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!editing) return;
    if (!confirm(`Delete “${list.name}”? Items stay in your basket; groups inside move up a level.`)) return;
    setBusy(true);
    try {
      await api.deleteList(list.id);
      onSaved();
      onClose();
      showToast("List deleted");
    } catch {
      showToast("Couldn't delete the list");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="overlay open" onClick={onClose} />
      <div className="modal-wrap open">
        <div className="modal" style={{ maxWidth: 460 }}>
          <div className="mhead">
            <h2>{editing ? "Edit list" : "New list"}</h2>
            <button className="close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="mbody">
            <div className="row2">
              <div className="field" style={{ maxWidth: 90 }}>
                <label>Icon</label>
                <input value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} placeholder="🎁" />
              </div>
              <div className="field">
                <label>List name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Christmas gifts" />
              </div>
            </div>
            <div className="field">
              <label>Parent list</label>
              <select value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">None (top-level list)</option>
                {parentOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.emoji} {l.name}
                  </option>
                ))}
              </select>
              <div className="hint">Nest this inside another list, e.g. Mum inside Christmas.</div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Spend cap (optional)</label>
                <input type="number" step="0.01" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="e.g. 500" />
              </div>
              <div className="field">
                <label>Date (optional)</label>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="mfoot">
            {editing ? (
              <button className="del" onClick={del} disabled={busy}>
                Delete list
              </button>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save list"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
