/**
 * Extraction result shapes (docs/05, tiering from docs/spike/E3-1-findings.md).
 * Pure data — no I/O here. Money is integer minor units, like everywhere
 * server-side.
 */

export type ExtractMethod = "jsonld" | "adapter" | "og" | "microdata" | "regex";

/** "high" = structured/purpose-built source; "low" = pattern-matched guess. */
export type Confidence = "high" | "low";

export interface Extracted {
  priceMinor: number;
  currency: string;
  name: string | null;
  imageUrl: string | null;
  /** From JSON-LD offers.availability when present. */
  availability: "in" | "out" | null;
  method: ExtractMethod;
  confidence: Confidence;
}

export interface ExtractOutcome {
  ok: boolean;
  /** HTTP status of the product page, or null on a network error. */
  status: number | null;
  /** Bot wall detected (403/429/503 or challenge-page markup). */
  blocked: boolean;
  extracted: Extracted | null;
  note: string | null;
}

/** What a parser stage returns before the orchestrator finishes it. */
export interface PartialExtract {
  price: number; // major units as found on the page
  currency: string | null;
  name?: string | null;
  imageUrl?: string | null;
  availability?: "in" | "out" | null;
}
