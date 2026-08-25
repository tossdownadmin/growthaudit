import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

let cached: { text: string; hash: string } | null = null;

/**
 * The Markdown file is the canonical competitive-intelligence policy.
 *
 * It is intentionally loaded from the repository at runtime/build time instead
 * of duplicating the policy inside individual prompts. LLM tasks receive this
 * policy as their system instruction, while deterministic code enforces the
 * mathematical/gating parts.
 */
export function getCompetitorPolicy() {
  if (cached) return cached;

  const file = path.join(process.cwd(), "COMPETITOR_ENGINE.md");
  const text = fs.readFileSync(file, "utf8").trim();
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);

  cached = { text, hash };
  return cached;
}
