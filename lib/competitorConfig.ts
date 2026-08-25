import { db } from "@/lib/firebase";

/**
 * Competitor-engine configuration (v3.0.0).
 *
 * Firestore path: config/competitors
 *
 * v2.4.2 keeps the v2.4 broad-dining model and v2.4.1 specialist recall protection, then fixes two regressions:
 * - hero-product and close-substitute Text Search queries rank by relevance, not distance
 * - broad targets apply a deterministic narrow-specialist Direct gate from names/types/profile signals
 * - exact hero/substitute shortlist protection remains in place
 * - v2.4 cuisine-concentration, menu-breadth and Broad Dining Mode remain unchanged
 * - benchmark sorting remains type, fit, distance, then price match
 */

export const COMPETITOR_CONFIG_SCHEMA_VERSION = 3;
export const COMPETITOR_ENGINE_VERSION = "3.0.0";

export type CompetitorWeights = {
  coreProduct: number;
  menuBreadth: number;
  occasion: number;
  businessVertical: number;
  audience: number;
  serviceFormat: number;
  priceTier: number;
  cuisine: number;
  geography: number;
};

export type CompetitorConfig = {
  schemaVersion: number;
  engineVersion: string;
  searchRadiusM: number;
  maxCandidates: number;
  maxEnrichedCandidates: number;
  maxSemanticCandidates: number;
  maxTextQueries: number;
  textSearchPageSize: number;
  maxResults: number;
  maxIndirectResults: number;
  reviewFloor: number;
  directThreshold: number;
  adjacentThreshold: number;
  indirectThreshold: number;
  minDirectEvidence: number;
  minAdjacentEvidence: number;
  minIndirectEvidence: number;
  focusedSpecializationThreshold: number;
  moderateSpecializationThreshold: number;
  broadDiningMenuBreadthThreshold: number;
  broadDiningCuisineConcentrationMax: number;
  broadDiningSpecializationMax: number;
  broadCandidateSpecializationMaxForDirect: number;
  broadCandidateMenuBreadthMinForDirect: number;
  geographyHalfLifeMi: number;
  profileCacheDays: number;
  model: string;
  reasoningEffort: "none" | "low" | "medium";
  weights: CompetitorWeights;
  identityPrompt: string;
  matchPrompt: string;
};

const CACHE_MS = 60_000;
let cached: { at: number; cfg: CompetitorConfig } | null = null;

export const DEFAULTS: CompetitorConfig = {
  schemaVersion: COMPETITOR_CONFIG_SCHEMA_VERSION,
  engineVersion: COMPETITOR_ENGINE_VERSION,
  searchRadiusM: 10000,
  maxCandidates: 36,
  maxEnrichedCandidates: 14,
  maxSemanticCandidates: 18,
  maxTextQueries: 8,
  textSearchPageSize: 12,
  maxResults: 14,
  maxIndirectResults: 5,
  reviewFloor: 3,
  directThreshold: 72,
  adjacentThreshold: 52,
  indirectThreshold: 32,
  minDirectEvidence: 62,
  minAdjacentEvidence: 46,
  minIndirectEvidence: 40,
  focusedSpecializationThreshold: 72,
  moderateSpecializationThreshold: 50,
  broadDiningMenuBreadthThreshold: 65,
  broadDiningCuisineConcentrationMax: 55,
  broadDiningSpecializationMax: 45,
  broadCandidateSpecializationMaxForDirect: 70,
  broadCandidateMenuBreadthMinForDirect: 55,
  geographyHalfLifeMi: 2,
  profileCacheDays: 30,
  model: "gpt-5.6-sol",
  reasoningEffort: "none",
  weights: {
    coreProduct: 0.30,
    menuBreadth: 0.00,
    occasion: 0.20,
    businessVertical: 0.15,
    audience: 0.10,
    serviceFormat: 0.10,
    priceTier: 0.05,
    cuisine: 0.05,
    geography: 0.05,
  },

  identityPrompt: `You are the target identity extraction stage of a universal restaurant competitor engine.

The repository-level COMPETITOR_ENGINE.md policy is the governing instruction and will be supplied separately as the system message.

Build a compact, evidence-grounded identity of the target restaurant that explains what customer need it primarily satisfies and what a customer would realistically substitute it with. Do not force it into a predefined archetype. Infer only what the supplied data supports.

Evidence priority:
1. Google primary category and repeated review mentions.
2. Google editorial description and website positioning.
3. Secondary Google categories.
4. Business name only as supporting evidence.

Separate CORE products from SECONDARY products. An item appearing on the menu does not make it central to the business.

SPECIALIZATION SCORE means PRODUCT/proposition specialization, not theme or decor:
- 80-100: strongly centered on a specific named craving/product
- 50-79: moderately focused proposition
- 0-49: broad concept or general dining proposition

MENU BREADTH SCORE means meaningful customer choice breadth, not raw SKU count:
- 70-100: broad multi-category menu satisfying several meal cravings
- 40-69: moderate range around a clear cuisine/category
- 0-39: narrow specialist menu centered on one product/category

CUISINE CONCENTRATION SCORE means how much one cuisine dominates:
- 80-100: overwhelmingly one cuisine
- 55-79: one cuisine clearly leads with meaningful secondary cuisines
- 0-54: multi-cuisine/international/balanced menu where no single cuisine should dominate competitor selection

Do not use decor/theme as the business vertical. For broad multi-cuisine restaurants, do not label one cuisine as primary unless the evidence clearly shows it dominates the menu/business.


Return JSON ONLY:
{
  "business_vertical": "string",
  "primary_identity": "string",
  "hero_product": "string or empty",
  "primary_products": ["string"],
  "secondary_products": ["string"],
  "cuisines": [
    { "rank": 1, "name": "string", "relevance_score": 0, "weight": 0.0, "classification": "primary|major_secondary|secondary|minor" }
  ],
  "service_model": "string",
  "price_tier": "Inexpensive|Moderate|Expensive|Very Expensive|Unknown",
  "occasions": ["string"],
  "audiences": ["string"],
  "specialization": "focused|moderately_focused|broad",
  "specialization_score": 0,
  "menu_breadth_score": 0,
  "cuisine_concentration_score": 0,
  "concept_attributes": ["string"],
  "confidence": 0.0
}

Interpret specialization as product/proposition focus, menu breadth as meaningful customer choice breadth, and cuisine concentration as how strongly one cuisine dominates. Keep the identity concise: use 1-4 primary products, 0-4 secondary products, 1-4 cuisines/categories, and at most 5 occasions/audiences. Prefer canonical singular labels. Generic attributes such as "restaurant", "halal", "takeout" or "delivery" are not cuisines or primary identities. If evidence is weak or mixed, stay broad, lower confidence, and use Unknown where appropriate rather than inventing specificity.`,

  matchPrompt: `You are the semantic substitution layer of a local restaurant competitor engine.

For EVERY candidate, score overlap with the target from 0-100 on SEVEN semantic dimensions. Do not calculate the final competitor score; deterministic code adds price and geography and applies the official formula and hard gates.

- core_product: same PRIMARY product craving/need
- menu_breadth: similarity in meaningful menu breadth/choice range (especially important for broad dining targets)
- occasion: same visit occasion/job-to-be-done
- business_vertical: same kind of business
- audience: similar customer group
- service_format: comparable service/experience format
- cuisine: relevant cuisine/product-family overlap

IMPORTANT SPECIALIST RULE:
If the target has specialization_score >= 72, a candidate that shares cuisine/format but has NO supplied evidence of the target's signature product should normally have core_product <= 55. A genuinely close substitute product can score higher: e.g. gyro/doner can be a close substitute for shawarma; another ice-cream/gelato concept can substitute for ice cream. Generic Mediterranean fast casual is not automatically a direct shawarma competitor.

IMPORTANT BROAD-DINING RULE:
If the target has specialization_score <= 45, menu_breadth_score >= 65, and cuisine_concentration_score <= 55, treat it as broad contemporary/casual dining. In this mode:
- do NOT make exact cuisine overlap the main reason a candidate fits; cross-cuisine competitors can be strong if they match menu breadth, occasion, vertical, audience, service format and price.
- score menu_breadth carefully: a broad full-service/multi-category restaurant should score high; a sajji-only, burger-only, dessert-only, or other narrow specialist should score low even if one cuisine/product overlaps.
- a narrow specialist should usually be Adjacent rather than Direct for a broad target.
- do not describe the target as "Pakistani-led", "Chinese-led", etc. unless cuisine_concentration_score supports that claim.

IMPORTANT EVIDENCE RULE:
"confidence" measures EVIDENCE SUFFICIENCY, not how good the fit sounds.
- If you only have name + Google types and no useful description/review product evidence, confidence should usually be <= 0.55.
- If the product range is undocumented or you write "likely", "appears", or "unclear", confidence should usually be <= 0.55.
- Confidence >= 0.70 should require clear evidence supporting the product/format conclusion.
Never compensate for missing evidence by inventing menu items.

DIRECT = realistic substitute for the same primary need.
ADJACENT = meaningful overlap but not a close substitute on every dimension.
INDIRECT = genuinely plausible alternative for some meaningful occasion/spend, despite a different core product.
NONE = not a realistic alternative. Merely being another restaurant or family-dining option is not enough for INDIRECT.

A nearby savory snack shop and an ice-cream shop can overlap on evening snacking, but core_product and business_vertical should stay low. An Italian full-service restaurant should usually be NONE for a specialist shawarma QSR unless there is stronger specific overlap.

Use descriptions and reviews when provided. Google categories are evidence, not proof.

Return JSON ONLY:
{
  "matches": [
    {
      "n": 1,
      "candidate_profile": {
        "business_vertical": "string",
        "primary_products": ["string"],
        "service_model": "string",
        "occasions": ["string"],
        "specialization_score": 0,
        "menu_breadth_score": 0,
        "cuisine_concentration_score": 0
      },
      "scores": {
        "core_product": 0,
        "menu_breadth": 0,
        "occasion": 0,
        "business_vertical": 0,
        "audience": 0,
        "service_format": 0,
        "cuisine": 0
      },
      "confidence": 0.0,
      "reason": "short owner-friendly explanation",
      "evidence": ["short evidence point", "short evidence point"]
    }
  ]
}

Include exactly one entry for every candidate number supplied. Keep reasons very short and factual.`,
};

const numericKeys: (keyof CompetitorConfig)[] = [
  "searchRadiusM", "maxCandidates", "maxEnrichedCandidates", "maxSemanticCandidates",
  "maxTextQueries", "textSearchPageSize", "maxResults", "maxIndirectResults", "reviewFloor",
  "directThreshold", "adjacentThreshold", "indirectThreshold", "minDirectEvidence",
  "minAdjacentEvidence", "minIndirectEvidence", "focusedSpecializationThreshold",
  "moderateSpecializationThreshold", "broadDiningMenuBreadthThreshold",
  "broadDiningCuisineConcentrationMax", "broadDiningSpecializationMax",
  "broadCandidateSpecializationMaxForDirect", "broadCandidateMenuBreadthMinForDirect",
  "geographyHalfLifeMi", "profileCacheDays",
];

function mergeConfig(remote: Partial<CompetitorConfig> | undefined): CompetitorConfig {
  if (!remote) return DEFAULTS;

  const cfg: CompetitorConfig = {
    ...DEFAULTS,
    weights: { ...DEFAULTS.weights },
    engineVersion: COMPETITOR_ENGINE_VERSION,
  };

  for (const key of numericKeys) {
    const value = remote[key];
    if (typeof value === "number" && Number.isFinite(value)) (cfg as any)[key] = value;
  }
  if (typeof remote.model === "string" && remote.model.trim()) cfg.model = remote.model.trim();
  if (remote.reasoningEffort === "none" || remote.reasoningEffort === "low" || remote.reasoningEffort === "medium") {
    cfg.reasoningEffort = remote.reasoningEffort;
  }

  // Prompts and scoring weights are schema-sensitive. Legacy config cannot
  // silently replace the substitution model.
  if (remote.schemaVersion === COMPETITOR_CONFIG_SCHEMA_VERSION) {
    cfg.schemaVersion = COMPETITOR_CONFIG_SCHEMA_VERSION;
    if (remote.weights) cfg.weights = { ...DEFAULTS.weights, ...remote.weights };
    if (typeof remote.identityPrompt === "string" && remote.identityPrompt.trim()) cfg.identityPrompt = remote.identityPrompt;
    if (typeof remote.matchPrompt === "string" && remote.matchPrompt.trim()) cfg.matchPrompt = remote.matchPrompt;
  }

  return cfg;
}

export async function getCompetitorConfig(): Promise<CompetitorConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.cfg;
  try {
    const snap = await db().collection("config").doc("competitors").get();
    const cfg = mergeConfig(snap.exists ? (snap.data() as Partial<CompetitorConfig>) : undefined);
    cached = { at: Date.now(), cfg };
    return cfg;
  } catch {
    return DEFAULTS;
  }
}
