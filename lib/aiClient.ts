// ============================================================================
// UNIFIED PROVIDER-AGNOSTIC AI CLIENT — credit-ready, degrades honestly.
// Every LLM call (report interpretation AND V3 competitor engine) routes here.
// Env-driven; SAME build runs three ways with no code change:
//   • No key    -> callers use deterministic fallback (report renders;
//                  competitors still return via engine's deterministic path).
//   • AI_PROVIDER=openai + key    -> OpenAI.
//   • AI_PROVIDER=anthropic + key -> Anthropic.
// Turn on later (set in Vercel + redeploy):
//   AI_PROVIDER = openai | anthropic
//   AI_API_KEY  = <the key>
//   AI_MODEL    = gpt-4o | claude-3-5-sonnet-latest
// BACK-COMPAT: if AI_* unset, falls back to OPENAI_API_KEY. NEVER throws.
// Exports: callModel (text), callJson (parsed JSON), aiConfigured, aiProvider.
// ============================================================================

export type ModelResult = { ok: true; text: string } | { ok: false; reason: string };
export type JsonResult = { ok: true; value: any } | { ok: false; reason: string };

type ModelOpts = { prompt: string; system?: string; maxTokens?: number; timeoutMs?: number; json?: boolean };
type JsonOpts = { system?: string; user: string; model?: string; timeoutMs?: number; maxTokens?: number; reasoningEffort?: "none" | "low" | "medium" };

function resolveConfig(perCallModel?: string) {
  const provider = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "")).toLowerCase();
  const apiKey =
    process.env.AI_API_KEY ||
    (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) ||
    "";
  const model =
    process.env.AI_MODEL ||
    perCallModel ||
    (provider === "anthropic" ? "claude-3-5-sonnet-latest" : process.env.DIRECT_AUDIT_AI_MODEL || "gpt-4o");
  return { provider, apiKey, model };
}

export function aiConfigured(): boolean {
  const { provider, apiKey } = resolveConfig();
  return Boolean(provider && apiKey);
}
export function aiProvider(): string {
  return resolveConfig().provider || "none";
}

function parseJsonLoose(text: string): any | null {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const attempts: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) attempts.push(fence[1].trim());
  const a = trimmed.indexOf("{"), b = trimmed.lastIndexOf("}");
  if (a !== -1 && b > a) attempts.push(trimmed.slice(a, b + 1));
  for (const c of attempts) {
    try { const p = JSON.parse(c); if (p && typeof p === "object") return p; } catch {}
  }
  return null;
}

async function rawCall(args: {
  system?: string; user: string; model: string;
  maxTokens: number; timeoutMs: number; json: boolean;
  reasoningEffort?: "none" | "low" | "medium";
}): Promise<ModelResult> {
  const { provider, apiKey, model: cfgModel } = resolveConfig(args.model);
  if (!provider || !apiKey) return { ok: false, reason: "AI provider not configured" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: cfgModel, max_tokens: args.maxTokens,
          ...(args.system ? { system: args.system } : {}),
          messages: [{ role: "user", content: args.user }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) return { ok: false, reason: data?.error?.message || `HTTP ${res.status}` };
      const parts = Array.isArray(data?.content)
        ? data.content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean)
        : [];
      const text = parts.join("");
      return text ? { ok: true, text } : { ok: false, reason: "empty response" };
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: cfgModel,
        messages: [
          ...(args.system ? [{ role: "system", content: args.system }] : []),
          { role: "user", content: args.user },
        ],
        ...(args.json ? { response_format: { type: "json_object" } } : {}),
        ...(args.reasoningEffort ? { reasoning_effort: args.reasoningEffort } : {}),
        max_completion_tokens: args.maxTokens,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) return { ok: false, reason: data?.error?.message || `HTTP ${res.status}` };
    const text = data?.choices?.[0]?.message?.content ?? "";
    return text ? { ok: true, text } : { ok: false, reason: "empty response" };
  } catch (e: any) {
    return { ok: false, reason: e?.name === "AbortError" ? `timeout after ${args.timeoutMs}ms` : (e?.message || "unknown error") };
  } finally {
    clearTimeout(timer);
  }
}

export async function callModel(opts: ModelOpts): Promise<ModelResult> {
  return rawCall({
    system: opts.system, user: opts.prompt, model: "",
    maxTokens: opts.maxTokens ?? 1600, timeoutMs: opts.timeoutMs ?? 40000, json: opts.json ?? false,
  });
}

export async function callJson(opts: JsonOpts): Promise<JsonResult> {
  const res = await rawCall({
    system: opts.system, user: opts.user, model: opts.model ?? "",
    maxTokens: opts.maxTokens ?? 2000, timeoutMs: opts.timeoutMs ?? 30000, json: true,
    reasoningEffort: opts.reasoningEffort,
  });
  if (!res.ok) return res;
  const value = parseJsonLoose(res.text);
  return value ? { ok: true, value } : { ok: false, reason: "unparseable response" };
}
