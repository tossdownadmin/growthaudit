import { createHash } from "crypto";
import { db } from "@/lib/firebase";
import type { CompetitorConfig } from "@/lib/competitorConfig";
import type { CandidateSemantic, SemanticScores } from "@/lib/competitorEngine";
import { getCompetitorPolicy } from "@/lib/competitorPolicy";
import { callJson } from "@/lib/aiClient";

export type IdentityCuisine = {
  rank: number;
  name: string;
  relevance_score: number;
  weight: number;
  classification: string;
};

export type Identity = {
  business_vertical: string;
  primary_identity: string;
  hero_product: string;
  primary_products: string[];
  secondary_products: string[];
  cuisines: IdentityCuisine[];
  service_model: string;
  price_tier: string;
  occasions: string[];
  audiences: string[];
  specialization: string;
  specialization_score: number;
  menu_breadth_score: number;
  cuisine_concentration_score: number;
  concept_attributes: string[];
  confidence: number;
};

export function normLabel(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\b(cuisine|food|restaurant|house|shop)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "");
}

type LlmResult = { ok: true; value: any } | { ok: false; reason: string };

async function callOnce(
  model: string,
  reasoningEffort: CompetitorConfig["reasoningEffort"],
  prompt: string,
  timeoutMs: number,
  maxTokens: number,
): Promise<LlmResult> {
  // Provider-agnostic (OpenAI or Anthropic, env-driven). No key → {ok:false},
  // and the caller falls back to deterministic identity classification.
  const res = await callJson({
    model,
    system: `${getCompetitorPolicy().text}\n\nFollow this policy as the governing competitor-intelligence instruction.`,
    user: prompt,
    timeoutMs,
    maxTokens,
    reasoningEffort,
  });
  if (!res.ok) console.log("LLM unavailable:", String(res.reason).slice(0, 300));
  return res;
}

const arr = (v: any, max = 8) => Array.isArray(v)
  ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, max)
  : [];

const n100 = (v: any, fallback = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};

function fingerprint(t: Parameters<typeof classifyIdentity>[1]) {
  const source = JSON.stringify({
    name: t.name,
    primaryType: t.primaryType,
    types: t.types,
    description: t.description,
    siteTitle: t.siteTitle,
    siteDescription: t.siteDescription,
    priceLevel: t.priceLevel,
    reviews: (t.reviews ?? []).map((r) => r.text || "").slice(0, 5),
  });
  return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

function prettyType(t?: string | null) {
  return (t || "restaurant")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function priceLabel(p?: string | null) {
  if (p === "PRICE_LEVEL_INEXPENSIVE") return "Inexpensive";
  if (p === "PRICE_LEVEL_MODERATE") return "Moderate";
  if (p === "PRICE_LEVEL_EXPENSIVE") return "Expensive";
  if (p === "PRICE_LEVEL_VERY_EXPENSIVE") return "Very Expensive";
  return "Unknown";
}

const IDENTITY_HINTS: Record<string, {
  vertical: string; products: string[]; service: string; occasions: string[]; cuisine?: string;
}> = {
  bakery: { vertical: "Bakery", products: ["Bread", "Cake", "Pastry"], service: "Bakery/Retail", occasions: ["Take-home Treat", "Celebration", "Everyday Bakery Purchase"], cuisine: "Bakery" },
  cake_shop: { vertical: "Cake Shop", products: ["Cake", "Dessert"], service: "Bakery/Retail", occasions: ["Celebration", "Dessert Treat"], cuisine: "Dessert" },
  pastry_shop: { vertical: "Pastry Shop", products: ["Pastry", "Dessert"], service: "Bakery/Retail", occasions: ["Dessert Treat", "Take-home Treat"], cuisine: "Bakery" },
  dessert_shop: { vertical: "Dessert Shop", products: ["Dessert"], service: "Dessert Parlour", occasions: ["Dessert Treat", "Evening Snack"], cuisine: "Dessert" },
  dessert_restaurant: { vertical: "Dessert Restaurant", products: ["Dessert"], service: "Dessert Parlour", occasions: ["Dessert Treat", "Evening Snack"], cuisine: "Dessert" },
  ice_cream_shop: { vertical: "Ice Cream Shop", products: ["Ice Cream", "Frozen Dessert"], service: "Dessert Parlour", occasions: ["Dessert Treat", "Evening Snack", "Family Treat"], cuisine: "Ice Cream" },
  coffee_shop: { vertical: "Coffee Shop", products: ["Coffee"], service: "Cafe", occasions: ["Coffee Break", "Casual Meeting", "Quick Snack"], cuisine: "Coffee" },
  cafe: { vertical: "Cafe", products: ["Coffee", "Light Meal"], service: "Cafe", occasions: ["Coffee Break", "Casual Meal", "Social Visit"], cuisine: "Cafe" },
  pizza_restaurant: { vertical: "Pizza Restaurant", products: ["Pizza"], service: "Quick Service", occasions: ["Casual Meal", "Family Meal", "Delivery Meal"], cuisine: "Pizza" },
  hamburger_restaurant: { vertical: "Burger Restaurant", products: ["Burger"], service: "Quick Service", occasions: ["Quick Meal", "Casual Meal", "Delivery Meal"], cuisine: "Burger" },
  pakistani_restaurant: { vertical: "Pakistani Restaurant", products: ["Pakistani Meal"], service: "Casual Dining", occasions: ["Family Dinner", "Casual Meal", "Group Meal"], cuisine: "Pakistani" },
  indian_restaurant: { vertical: "Indian Restaurant", products: ["Indian Meal"], service: "Casual Dining", occasions: ["Family Dinner", "Casual Meal", "Group Meal"], cuisine: "Indian" },
  fast_food_restaurant: { vertical: "Fast Food Restaurant", products: ["Fast Food"], service: "Quick Service", occasions: ["Quick Meal", "Casual Meal", "Delivery Meal"], cuisine: "Fast Food" },
  snack_bar: { vertical: "Snack Shop", products: ["Snack"], service: "Quick Service", occasions: ["Quick Snack", "Evening Snack"], cuisine: "Snack" },
  shawarma_restaurant: { vertical: "Shawarma Restaurant", products: ["Shawarma"], service: "Quick Service", occasions: ["Quick Meal", "Lunch", "Takeaway Meal"], cuisine: "Middle Eastern" },
  gyro_restaurant: { vertical: "Gyro Restaurant", products: ["Gyro"], service: "Quick Service", occasions: ["Quick Meal", "Lunch", "Takeaway Meal"], cuisine: "Mediterranean" },
  kebab_shop: { vertical: "Kebab Shop", products: ["Kebab"], service: "Quick Service", occasions: ["Quick Meal", "Casual Meal", "Takeaway Meal"], cuisine: "Middle Eastern" },
  steak_house: { vertical: "Steakhouse", products: ["Steak"], service: "Casual Dining", occasions: ["Dinner", "Celebration Meal"], cuisine: "Steak" },
};

function fallbackIdentity(t: Parameters<typeof classifyIdentity>[1]): Identity {
  const relevant = [t.primaryType, ...(t.types || [])].filter(Boolean) as string[];
  const key = relevant.find((x) => IDENTITY_HINTS[x]) || t.primaryType || relevant[0] || "restaurant";
  const hint = IDENTITY_HINTS[key];
  const vertical = hint?.vertical || prettyType(key);
  const cuisine = hint?.cuisine || prettyType(key).replace(/ Restaurant$/i, "");
  return {
    business_vertical: vertical,
    primary_identity: vertical,
    hero_product: (hint?.products || [cuisine])[0] || "",
    primary_products: hint?.products || [cuisine],
    secondary_products: [],
    cuisines: cuisine ? [{ rank: 1, name: cuisine, relevance_score: 70, weight: 1, classification: "primary" }] : [],
    service_model: hint?.service || "Unknown",
    price_tier: priceLabel(t.priceLevel),
    occasions: hint?.occasions || ["Casual Meal"],
    audiences: ["Local Customers"],
    specialization: ["shawarma_restaurant", "gyro_restaurant", "pizza_restaurant", "hamburger_restaurant", "ice_cream_shop", "steak_house"].includes(key)
      ? "focused"
      : ["bakery", "cake_shop", "pastry_shop", "barbecue_restaurant", "coffee_shop"].includes(key)
        ? "moderately_focused"
        : "broad",
    specialization_score: ["shawarma_restaurant", "gyro_restaurant", "pizza_restaurant", "hamburger_restaurant", "ice_cream_shop", "steak_house"].includes(key)
      ? 85
      : ["bakery", "cake_shop", "pastry_shop", "barbecue_restaurant", "coffee_shop"].includes(key)
        ? 60
        : 35,
    menu_breadth_score: ["shawarma_restaurant", "gyro_restaurant", "pizza_restaurant", "hamburger_restaurant", "ice_cream_shop", "steak_house"].includes(key)
      ? 28
      : ["bakery", "cake_shop", "pastry_shop", "barbecue_restaurant", "coffee_shop"].includes(key)
        ? 52
        : 65,
    cuisine_concentration_score: ["pakistani_restaurant", "indian_restaurant", "shawarma_restaurant", "gyro_restaurant", "pizza_restaurant", "hamburger_restaurant", "ice_cream_shop", "steak_house"].includes(key)
      ? 85
      : 55,
    concept_attributes: [],
    confidence: 0.42,
  };
}

/* ---------- call 1: what business is the target, really? ---------- */

export async function classifyIdentity(cfg: CompetitorConfig, t: {
  placeId: string;
  name: string;
  primaryType?: string | null;
  types?: string[];
  description?: string | null;
  siteTitle?: string | null;
  siteDescription?: string | null;
  website?: string | null;
  priceLevel?: string | null;
  reviews?: { text?: string }[];
}): Promise<Identity> {
  const sourceFingerprint = fingerprint(t);

  try {
    const snap = await db().collection("businessProfiles").doc(t.placeId).get();
    const d = snap.data() as any;
    const generatedAt = d?.generatedAt ? Date.parse(d.generatedAt) : 0;
    const freshMs = cfg.profileCacheDays * 86400000;
    if (
      snap.exists
      && d?.schemaVersion === cfg.schemaVersion
      && d?.classifierVersion === cfg.engineVersion
      && d?.sourceFingerprint === sourceFingerprint
      && generatedAt > 0
      && Date.now() - generatedAt < freshMs
      && d?.profile?.primary_identity
    ) return d.profile as Identity;
  } catch { /* cache miss is fine */ }

  const secondary = (t.types ?? []).filter((x) => x !== t.primaryType).slice(0, 10);
  const reviewText = (t.reviews ?? [])
    .map((r) => r.text || "")
    .filter(Boolean)
    .join(" | ")
    .slice(0, 1500);

  const prompt =
    `${cfg.identityPrompt}\n\n--- BUSINESS DATA ---\n` +
    `Name: ${t.name || "unknown"}\n` +
    `Google primary category: ${t.primaryType || "unknown"}\n` +
    `Google secondary categories: ${secondary.join(", ") || "none"}\n` +
    `Google editorial description: ${t.description || "none"}\n` +
    `Website title: ${t.siteTitle || "none"}\n` +
    `Website description: ${t.siteDescription || "none"}\n` +
    `Google price level: ${t.priceLevel || "unknown"}\n` +
    `Review mentions: ${reviewText || "none"}\n`;

  // Classification should be fast. If it misses the latency budget, the Google
  // type fallback keeps competitor discovery working instead of returning empty.
  const result = await callOnce(cfg.model, cfg.reasoningEffort, prompt, 12_000, 1100);
  if (!result.ok) return fallbackIdentity(t);
  const out = result.value;
  if (!out?.primary_identity && !out?.business_vertical) return fallbackIdentity(t);

  const cuisines: IdentityCuisine[] = Array.isArray(out.cuisines)
    ? out.cuisines.slice(0, 4).map((c: any, i: number) => ({
        rank: Number(c?.rank) || i + 1,
        name: String(c?.name || "").trim(),
        relevance_score: n100(c?.relevance_score),
        weight: Math.max(0, Math.min(1, Number(c?.weight) || 0)),
        classification: String(c?.classification || "secondary"),
      })).filter((c: IdentityCuisine) => c.name)
    : [];

  const identity: Identity = {
    business_vertical: String(out.business_vertical || out.primary_identity || "Restaurant").trim(),
    primary_identity: String(out.primary_identity || out.business_vertical || "Restaurant").trim(),
    hero_product: String(out.hero_product || (Array.isArray(out.primary_products) ? out.primary_products[0] : "") || "").trim(),
    primary_products: arr(out.primary_products, 4),
    secondary_products: arr(out.secondary_products, 4),
    cuisines,
    service_model: String(out.service_model || "Unknown").trim(),
    price_tier: String(out.price_tier || "Unknown").trim(),
    occasions: arr(out.occasions, 5),
    audiences: arr(out.audiences, 5),
    specialization: String(out.specialization || "broad").trim(),
    specialization_score: n100(out.specialization_score, out.specialization === "focused" ? 85 : out.specialization === "moderately_focused" ? 60 : 35),
    menu_breadth_score: n100(out.menu_breadth_score, out.specialization === "focused" ? 30 : out.specialization === "moderately_focused" ? 55 : 70),
    cuisine_concentration_score: n100(out.cuisine_concentration_score, cuisines.length <= 1 ? 75 : cuisines.length >= 3 ? 40 : 60),
    concept_attributes: arr(out.concept_attributes, 5),
    confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0.5)),
  };

  try {
    await db().collection("businessProfiles").doc(t.placeId).set({
      schemaVersion: cfg.schemaVersion,
      classifierVersion: cfg.engineVersion,
      generatedAt: new Date().toISOString(),
      sourceFingerprint,
      profile: identity,
    });
  } catch { /* best effort */ }

  return identity;
}

/* ---------- call 2: semantic substitution scores for candidates ---------- */

export type MatchCandidateInput = {
  placeId: string;
  name: string;
  primaryType?: string | null;
  types?: string[];
  distanceMi: number | null;
  priceLevel?: string | null;
  description?: string | null;
  website?: string | null;
  reviews?: { text?: string }[];
};

function semanticScores(v: any): SemanticScores {
  return {
    coreProduct: n100(v?.core_product),
    menuBreadth: n100(v?.menu_breadth, 50),
    occasion: n100(v?.occasion),
    businessVertical: n100(v?.business_vertical),
    audience: n100(v?.audience, 50),
    serviceFormat: n100(v?.service_format, 50),
    cuisine: n100(v?.cuisine),
  };
}

function targetPayload(identity: Identity) {
  return {
    business_vertical: identity.business_vertical,
    primary_identity: identity.primary_identity,
    hero_product: identity.hero_product,
    primary_products: identity.primary_products,
    secondary_products: identity.secondary_products,
    cuisines: identity.cuisines?.slice(0, 4).map((c) => ({ name: c.name, classification: c.classification, weight: c.weight })),
    service_model: identity.service_model,
    price_tier: identity.price_tier,
    occasions: identity.occasions,
    audiences: identity.audiences,
    specialization: identity.specialization,
    specialization_score: identity.specialization_score,
    menu_breadth_score: identity.menu_breadth_score,
    cuisine_concentration_score: identity.cuisine_concentration_score,
    concept_attributes: identity.concept_attributes,
  };
}

async function matchBatch(
  cfg: CompetitorConfig,
  identity: Identity,
  batch: { c: MatchCandidateInput; globalIndex: number }[],
): Promise<Record<string, CandidateSemantic>> {
  const list = batch.map(({ c }, i) => {
    const reviewText = (c.reviews ?? []).map((r) => r.text || "").filter(Boolean).join(" | ").slice(0, 420);
    const desc = (c.description || "").slice(0, 240);
    return [
      `${i + 1}. ${c.name}`,
      `primary=${c.primaryType || "unknown"}`,
      `types=${(c.types || []).filter((x) => x !== c.primaryType).slice(0, 6).join(",") || "none"}`,
      `description=${desc || "none"}`,
      `reviews=${reviewText || "none"}`,
    ].join(" | ");
  }).join("\n");

  const prompt =
    `${cfg.matchPrompt}\n\n--- TARGET ---\n${JSON.stringify(targetPayload(identity))}\n\n` +
    `--- CANDIDATES ---\n${list}\n`;

  const result = await callOnce(cfg.model, cfg.reasoningEffort, prompt, 18_000, 1900);
  if (!result.ok) return {};

  const out = result.value;
  const map: Record<string, CandidateSemantic> = {};
  for (const m of out?.matches ?? []) {
    const localIdx = Number(m?.n ?? m?.index ?? m?.id) - 1;
    const item = batch[localIdx];
    if (!item) continue;
    map[item.c.placeId] = {
      scores: semanticScores(m?.scores),
      confidence: Math.max(0, Math.min(1, Number(m?.confidence) || 0.5)),
      reason: String(m?.reason || "").trim().slice(0, 180),
      evidence: arr(m?.evidence, 4),
      candidateProfile: m?.candidate_profile ? {
        businessVertical: String(m.candidate_profile.business_vertical || "").trim() || undefined,
        primaryProducts: arr(m.candidate_profile.primary_products, 4),
        serviceModel: String(m.candidate_profile.service_model || "").trim() || undefined,
        occasions: arr(m.candidate_profile.occasions, 5),
        specializationScore: n100(m.candidate_profile.specialization_score, 50),
        menuBreadthScore: n100(m.candidate_profile.menu_breadth_score, 50),
        cuisineConcentrationScore: n100(m.candidate_profile.cuisine_concentration_score, 50),
      } : undefined,
    };
  }
  return map;
}

export async function matchCandidates(
  cfg: CompetitorConfig,
  identity: Identity,
  candidates: MatchCandidateInput[],
): Promise<Record<string, CandidateSemantic>> {
  const slice = candidates.slice(0, cfg.maxSemanticCandidates);
  if (!slice.length) return {};

  // Two small requests in parallel are faster and less fragile than asking one
  // model response to emit scores for 25-35 businesses.
  const batchSize = 7;
  const batches: { c: MatchCandidateInput; globalIndex: number }[][] = [];
  for (let i = 0; i < slice.length; i += batchSize) {
    batches.push(slice.slice(i, i + batchSize).map((c, j) => ({ c, globalIndex: i + j })));
  }

  const parts = await Promise.all(batches.map((b) => matchBatch(cfg, identity, b)));
  return Object.assign({}, ...parts);
}
