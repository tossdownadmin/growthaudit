import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

let cached: { text: string; hash: string } | null = null;

/**
 * The Markdown file is the canonical competitive-intelligence policy. It is
 * loaded from the repo and passed to LLM tasks as their system instruction,
 * while deterministic code enforces the mathematical/gating parts.
 *
 * HARDENED for serverless: tries several locations, and if the file cannot be
 * found (e.g. not bundled into a Vercel function), falls back to a compact
 * inline policy so the engine NEVER 500s on a missing file — it degrades to its
 * deterministic path instead.
 */
const FALLBACK_POLICY = `# Competitor Intelligence Policy (inline fallback)
You identify the restaurants that most realistically compete for a target
restaurant's customers in its local market.
Distinguish similarity, substitutability, and competitive threat.
Rank by competitive threat: how much real customer demand a candidate could
absorb if the target disappeared, considering product/craving overlap, dining
occasion, geography/travel time, price tier, service model, audience, and
market strength (reviews, prominence, network).
Prefer close substitutes over merely nearby restaurants. Exclude wrong-format,
wrong-occasion, or far-away places unless local density is sparse.
Return only well-evidenced competitors; when evidence is weak, say so rather
than inventing confidence.`;

function tryRead(): string | null {
  const candidates = [
    path.join(process.cwd(), "COMPETITOR_ENGINE.md"),
    path.join(process.cwd(), "public", "COMPETITOR_ENGINE.md"),
    // In some bundlers the file sits next to the compiled module.
    path.join(__dirname, "..", "COMPETITOR_ENGINE.md"),
    path.join(__dirname, "COMPETITOR_ENGINE.md"),
  ];
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, "utf8").trim();
      if (text) return text;
    } catch {
      // try next
    }
  }
  return null;
}

export function getCompetitorPolicy() {
  if (cached) return cached;
  const text = tryRead() || FALLBACK_POLICY;
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  cached = { text, hash };
  return cached;
}
