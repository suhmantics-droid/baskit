/**
 * Client-side API layer: typed fetch wrappers over /api/* plus wire→domain
 * mapping (ISO strings → epoch ms) so the pure logic (lib/decision, lib/budget)
 * runs identically in the browser and on the server.
 */
import type { Item as DomainItem, List as DomainList } from "@/lib/types";

export interface WireItem {
  id: string;
  name: string;
  url: string | null;
  domain: string | null;
  imageUrl: string | null;
  currency: string;
  price: number | null;
  targetPrice: number | null;
  stock: string;
  category: string | null;
  tags: string[];
  code: string | null;
  status: string;
  priority: string;
  cooldownDays: number;
  waitUntil: string | null;
  notes: string | null;
  bought: boolean;
  boughtAt: string | null;
  fav: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  lists: string[];
  prices?: { price: number; checkedAt: string; source: string }[];
}

export interface WireListNode {
  id: string;
  name: string;
  emoji: string;
  parentId: string | null;
  cap: number | null;
  dueDate: string | null;
  createdAt: string;
  shareToken: string | null;
  spent: number;
  bought: number;
  itemCount: number;
  capState: "none" | "ok" | "warn" | "over";
  childCapsAllocated: number;
}

export function wireToDomainItem(w: WireItem): DomainItem {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    domain: w.domain,
    imageUrl: w.imageUrl,
    code: w.code,
    notes: w.notes,
    currency: w.currency,
    price: w.price,
    targetPrice: w.targetPrice,
    stock: w.stock as DomainItem["stock"],
    category: w.category,
    tags: w.tags,
    status: w.status as DomainItem["status"],
    priority: w.priority as DomainItem["priority"],
    cooldownDays: w.cooldownDays,
    waitUntil: w.waitUntil ? Date.parse(w.waitUntil) : null,
    bought: w.bought,
    boughtAt: w.boughtAt ? Date.parse(w.boughtAt) : null,
    fav: w.fav,
    createdAt: Date.parse(w.createdAt),
    prices: w.prices?.map((p) => ({ price: p.price, checkedAt: Date.parse(p.checkedAt), source: p.source })),
    lists: w.lists,
  };
}

export function wireToDomainList(w: WireListNode): DomainList {
  return {
    id: w.id,
    name: w.name,
    emoji: w.emoji,
    parentId: w.parentId,
    cap: w.cap,
    dueDate: w.dueDate ? Date.parse(w.dueDate) : null,
  };
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  items: () => request<{ items: WireItem[] }>("/api/items"),
  createItem: (body: unknown) =>
    request<{ item: WireItem }>("/api/items", { method: "POST", body: JSON.stringify(body) }),
  patchItem: (id: string, body: unknown) =>
    request<{ item: WireItem }>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteItem: (id: string) => request<{ ok: true }>(`/api/items/${id}`, { method: "DELETE" }),
  patchMe: (body: unknown) =>
    request<{ user: unknown }>("/api/me", { method: "PATCH", body: JSON.stringify(body) }),
  deleteMe: () => request<{ ok: true }>("/api/me", { method: "DELETE" }),
  lists: () => request<{ lists: WireListNode[] }>("/api/lists"),
  createList: (body: unknown) =>
    request<{ list: WireListNode }>("/api/lists", { method: "POST", body: JSON.stringify(body) }),
  patchList: (id: string, body: unknown) =>
    request<{ list: WireListNode }>(`/api/lists/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteList: (id: string) => request<{ ok: true }>(`/api/lists/${id}`, { method: "DELETE" }),
  shareList: (id: string, enabled: boolean) =>
    request<{ shareToken: string | null }>(`/api/lists/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
};
