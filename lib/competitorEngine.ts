import type { CompetitorConfig, CompetitorWeights } from "@/lib/competitorConfig";

export type CompetitorType = "direct" | "adjacent" | "indirect" | "none";

export type SemanticScores = {
  coreProduct: number;
  menuBreadth: number;
  occasion: number;
  businessVertical: number;
  audience: number;
  serviceFormat: number;
  cuisine: number;
};

export type FullScores = SemanticScores & {
  priceTier: number;
  geography: number;
};

export type CandidateSemantic = {
  scores: SemanticScores;
  confidence: number;
  reason: string;
  evidence: string[];
  candidateProfile?: {
    businessVertical?: string;
    primaryProducts?: string[];
    serviceModel?: string;
    occasions?: string[];
    specializationScore?: number;
    menuBreadthScore?: number;
    cuisineConcentrationScore?: number;
  };
};

export type ClassificationContext = {
  targetSpecializationScore?: number;
  targetMenuBreadthScore?: number;
  targetCuisineConcentrationScore?: number;
  candidateSpecializationScore?: number;
  candidateMenuBreadthScore?: number;
  candidateName?: string;
  candidatePrimaryType?: string | null;
  candidateTypes?: string[];
  candidateBusinessVertical?: string;
  candidatePrimaryProducts?: string[];
  evidenceConfidence?: number;
  semanticVerified?: boolean;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

const GENERIC_BRAND_WORDS = new Set([
  "branch", "outlet", "store", "location", "phase", "road", "rd", "street", "st", "and",
]);

function stripBranchSuffix(name: string) {
  let s = (name || "").trim();
  // Explicit separators usually introduce a branch/location suffix:
  // "Layers Bakeshop - MM Alam", "Tehzeeb Bakers | DHA Phase 5".
  const separated = s.split(/\s+[\-|–—|]\s+/)[0];
  if (separated && separated.length >= 3) s = separated;

  // Remove parenthetical location labels and common explicit branch markers.
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\s+[^\s]+\s+(?:branch|outlet)$/i, " ");
  s = s.replace(/\b(?:branch|outlet|location)\b.*$/i, " ");
  s = s.replace(/\b(?:dha\s*)?(?:phase|ph)\s*\d+[a-z]?\b.*$/i, " ");
  return s.trim();
}

export function normalizeBrandName(name: string) {
  return stripBranchSuffix(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTokens(name: string) {
  return normalizeBrandName(name)
    .split(" ")
    .filter((x) => x && !GENERIC_BRAND_WORDS.has(x));
}

export function hasBranchHint(name: string) {
  return /\s+[\-|–—|]\s+|\b(branch|outlet|location|dha|phase|ph\s*\d+)\b/i.test(name || "");
}

/**
 * Conservative brand grouping key. Exact normalized names always group. Names
 * with an explicit branch/location hint may group by the first two stable brand
 * tokens, which handles examples like Layers Bakeshop - MM Alam / Y Block DHA.
 */
export function brandGroupKey(name: string) {
  const exact = normalizeBrandName(name);
  const tokens = normalizedTokens(name);
  if (!exact) return "";
  if (hasBranchHint(name) && tokens.length >= 2) return tokens.slice(0, 2).join(" ");
  return exact;
}

export function brandDisplayName(name: string) {
  return stripBranchSuffix(name) || name;
}

function domainOf(url?: string | null) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

function looseBrandMatch(aName: string, bName: string) {
  const an = normalizeBrandName(aName);
  const bn = normalizeBrandName(bName);
  if (!an || !bn) return false;
  if (an === bn) return true;

  const at = normalizedTokens(aName);
  const bt = normalizedTokens(bName);
  if (at.length < 2 || bt.length < 2) return false;

  const firstTwoEqual = at[0] === bt[0] && at[1] === bt[1];
  if (!firstTwoEqual) return false;

  // Only use this looser rule when at least one name clearly looks branch-like.
  return hasBranchHint(aName) || hasBranchHint(bName);
}

export function isSameBrand(a: { name?: string; website?: string | null }, b: { name?: string; website?: string | null }) {
  const ad = domainOf(a.website);
  const bd = domainOf(b.website);
  if (ad && bd && ad === bd) return true;
  return looseBrandMatch(a.name || "", b.name || "");
}

export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

/**
 * Spatial pressure decays with distance. A half-life keeps the rule intuitive:
 * at halfLifeMi the geography score is 50; at 2x halfLifeMi it is 25.
 */
export function geographyPressureScore(distanceMi: number | null, halfLifeMi: number) {
  if (distanceMi == null || !Number.isFinite(distanceMi)) return 35;
  const halfLife = Math.max(0.25, halfLifeMi || 2);
  return Math.round(clamp(100 * Math.pow(0.5, Math.max(0, distanceMi) / halfLife)));
}

const PRICE_ORDER: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function priceOverlapScore(target?: string | null, candidate?: string | null) {
  const a = target ? PRICE_ORDER[target] : undefined;
  const b = candidate ? PRICE_ORDER[candidate] : undefined;
  if (a == null || b == null) return 50;
  const d = Math.abs(a - b);
  if (d === 0) return 100;
  if (d === 1) return 70;
  if (d === 2) return 35;
  return 10;
}

export function normalizeWeights(weights: CompetitorWeights): CompetitorWeights {
  const total = Object.values(weights).reduce((s, n) => s + (Number.isFinite(n) ? Math.max(0, n) : 0), 0) || 1;
  return {
    coreProduct: Math.max(0, weights.coreProduct) / total,
    menuBreadth: Math.max(0, weights.menuBreadth) / total,
    occasion: Math.max(0, weights.occasion) / total,
    businessVertical: Math.max(0, weights.businessVertical) / total,
    audience: Math.max(0, weights.audience) / total,
    serviceFormat: Math.max(0, weights.serviceFormat) / total,
    priceTier: Math.max(0, weights.priceTier) / total,
    cuisine: Math.max(0, weights.cuisine) / total,
    geography: Math.max(0, weights.geography) / total,
  };
}


/**
 * V2.4 adaptive weighting.
 *
 * Specialist mode retains the v2.3 rule:
 * specialization 0   => Product 30%, Occasion 20%
 * specialization 50  => Product 35%, Occasion 15%
 * specialization 100 => Product 40%, Occasion 10%
 *
 * Broad Dining Mode is different because exact dish/cuisine overlap is not the
 * main competitive question. It emphasizes breadth + occasion + vertical:
 * Menu breadth 20%, Occasion 20%, Vertical 20%, Service 15%, Audience 10%,
 * Price 5%, Cuisine 5%, Geography 5%, Core product 0%.
 */
export function isBroadDiningTarget(
  targetSpecializationScore?: number | string | null,
  targetMenuBreadthScore?: number | string | null,
  targetCuisineConcentrationScore?: number | string | null,
  cfg?: Pick<CompetitorConfig, "broadDiningSpecializationMax" | "broadDiningMenuBreadthThreshold" | "broadDiningCuisineConcentrationMax">,
) {
  const spec = specializationScore(targetSpecializationScore);
  const breadth = clamp(Number(targetMenuBreadthScore));
  const cuisineConcentration = clamp(Number(targetCuisineConcentrationScore));
  const specMax = cfg?.broadDiningSpecializationMax ?? 45;
  const breadthMin = cfg?.broadDiningMenuBreadthThreshold ?? 65;
  const cuisineMax = cfg?.broadDiningCuisineConcentrationMax ?? 55;
  return spec <= specMax && breadth >= breadthMin && cuisineConcentration <= cuisineMax;
}

export function dynamicCompetitorWeights(
  base: CompetitorWeights,
  targetSpecializationScore?: number | string | null,
  targetMenuBreadthScore?: number | string | null,
  targetCuisineConcentrationScore?: number | string | null,
  cfg?: CompetitorConfig,
): CompetitorWeights {
  if (isBroadDiningTarget(targetSpecializationScore, targetMenuBreadthScore, targetCuisineConcentrationScore, cfg)) {
    return normalizeWeights({
      coreProduct: 0.00,
      menuBreadth: 0.20,
      occasion: 0.20,
      businessVertical: 0.20,
      audience: 0.10,
      serviceFormat: 0.15,
      priceTier: 0.05,
      cuisine: 0.05,
      geography: 0.05,
    });
  }

  const spec = specializationScore(targetSpecializationScore) / 100;
  const productBase = Number.isFinite(base.coreProduct) ? Math.max(0, base.coreProduct) : 0.30;
  const occasionBase = Number.isFinite(base.occasion) ? Math.max(0, base.occasion) : 0.20;
  const transferable = Math.min(0.10, occasionBase);
  const shift = transferable * spec;
  return normalizeWeights({
    ...base,
    menuBreadth: Math.max(0, base.menuBreadth || 0),
    coreProduct: productBase + shift,
    occasion: occasionBase - shift,
  });
}

export function weightedCompetitorScore(scores: FullScores, weights: CompetitorWeights) {
  const w = normalizeWeights(weights);
  const total =
    clamp(scores.coreProduct) * w.coreProduct
    + clamp(scores.menuBreadth) * w.menuBreadth
    + clamp(scores.occasion) * w.occasion
    + clamp(scores.businessVertical) * w.businessVertical
    + clamp(scores.audience) * w.audience
    + clamp(scores.serviceFormat) * w.serviceFormat
    + clamp(scores.priceTier) * w.priceTier
    + clamp(scores.cuisine) * w.cuisine
    + clamp(scores.geography) * w.geography;
  return Math.round(total);
}

export function specializationScore(value?: number | string | null, label?: string | null) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.round(clamp(numeric));
  if (label === "focused") return 85;
  if (label === "moderately_focused") return 60;
  return 35;
}

/**
 * Fit and evidence are separate. A candidate can look like a plausible fit but
 * cannot become a high-confidence benchmark without enough evidence.
 */
export function evidenceConfidenceScore(candidate: {
  primaryType?: string | null;
  description?: string | null;
  website?: string | null;
  reviews?: { text?: string }[];
  reviewCount?: number;
  textQueriesMatched?: string[];
  categoryEvidence?: number;
}, semanticConfidence: number, semanticVerified: boolean) {
  let data = 12;
  if (candidate.primaryType && candidate.primaryType !== "restaurant") data += 15;
  if ((candidate.categoryEvidence ?? 0) >= 55) data += 8;
  if (candidate.description?.trim()) data += 20;
  const usefulReviews = (candidate.reviews ?? []).filter((r) => (r.text || "").trim().length >= 12).length;
  if (usefulReviews >= 1) data += 14;
  if (usefulReviews >= 3) data += 8;
  if (candidate.website) data += 7;
  if ((candidate.textQueriesMatched ?? []).length > 0) data += 8;
  if ((candidate.reviewCount ?? 0) >= 20) data += 4;
  if ((candidate.reviewCount ?? 0) >= 200) data += 4;
  if (semanticVerified) data += 5;
  data = clamp(data);

  const llm = clamp((Number.isFinite(semanticConfidence) ? semanticConfidence : 0.45) * 100);
  // LLM confidence explicitly measures evidence sufficiency in the v2.4 prompt.
  const combined = semanticVerified ? (data * 0.55 + llm * 0.45) : Math.min(45, data * 0.8);
  return Math.round(clamp(combined));
}

export function evidenceConfidenceLabel(score: number) {
  if (score >= 75) return "High evidence";
  if (score >= 58) return "Good evidence";
  if (score >= 45) return "Limited evidence";
  return "Low evidence";
}

const NARROW_SPECIALIST_TYPES = new Set([
  "shawarma_restaurant", "gyro_restaurant", "kebab_shop", "pizza_restaurant",
  "hamburger_restaurant", "ice_cream_shop", "sushi_restaurant", "steak_house",
  "donut_shop", "cake_shop", "dessert_shop",
]);

const NARROW_SPECIALIST_NAME_RE = /\b(?:sajji|karahi|shawarma|gyro|doner|kebab|kabob|burger|hamburger|pizza|pizzeria|steak|sushi|gelato|ice\s*cream|frozen\s*yogurt|donut|doughnut)\b/i;
const NARROW_SPECIALIST_VERTICAL_RE = /(?:shawarma|gyro|doner|kebab|kabob|burger|pizza|steak|sushi|ice\s*cream|gelato|sajji|karahi|specialist)/i;

/**
 * Deterministic narrow-concept signal used only when the TARGET is broad dining.
 * It prevents an optimistic LLM breadth score from turning an obviously focused
 * sajji/karahi/shawarma/pizza/etc. concept into a Direct competitor for a broad
 * multi-category restaurant. The candidate may still qualify as Adjacent.
 */
export function hasNarrowSpecialistSignal(context: ClassificationContext = {}) {
  const name = context.candidateName || "";
  const typeList = [context.candidatePrimaryType, ...(context.candidateTypes || [])].filter(Boolean) as string[];
  const vertical = context.candidateBusinessVertical || "";
  const products = (context.candidatePrimaryProducts || []).join(" ");

  if (NARROW_SPECIALIST_NAME_RE.test(name)) return true;
  if (typeList.some((t) => NARROW_SPECIALIST_TYPES.has(t))) return true;
  if (NARROW_SPECIALIST_VERTICAL_RE.test(vertical)) return true;

  // Product text is weaker than name/type/vertical. Only use it when the model
  // itself also says the candidate is fairly specialized.
  const candidateSpec = clamp(Number(context.candidateSpecializationScore));
  return candidateSpec >= 70 && NARROW_SPECIALIST_VERTICAL_RE.test(products);
}

/**
 * Hard gates stop geography, price or generic cuisine overlap from manufacturing
 * a Direct competitor. v2.4.2 adds a deterministic narrow-specialist gate for
 * broad targets while retaining core-product requirements for specialist targets
 * and separating evidence confidence from fit.
 */
export function classifyCompetitorType(
  score: number,
  s: FullScores,
  cfg: CompetitorConfig,
  context: ClassificationContext = {},
): CompetitorType {
  const core = clamp(s.coreProduct);
  const breadth = clamp(s.menuBreadth);
  const occasion = clamp(s.occasion);
  const vertical = clamp(s.businessVertical);
  const geo = clamp(s.geography);
  const format = clamp(s.serviceFormat);
  const cuisine = clamp(s.cuisine);
  const evidence = clamp(context.evidenceConfidence ?? 50);
  const semanticVerified = context.semanticVerified !== false;
  const spec = specializationScore(context.targetSpecializationScore);
  const broadDining = isBroadDiningTarget(
    context.targetSpecializationScore,
    context.targetMenuBreadthScore,
    context.targetCuisineConcentrationScore,
    cfg,
  );

  if (broadDining) {
    const candidateSpec = clamp(Number(context.candidateSpecializationScore));
    const candidateBreadth = clamp(Number(context.candidateMenuBreadthScore));
    const semanticNarrowMismatch = candidateSpec >= cfg.broadCandidateSpecializationMaxForDirect
      && candidateBreadth < cfg.broadCandidateMenuBreadthMinForDirect;

    // Deterministic safeguard: if the candidate explicitly presents as a narrow
    // specialist, Direct requires unusually strong independent evidence that it
    // is actually broad. This is intentionally stricter than the normal breadth
    // gate so examples like "Shahenshah Sajji And Grill" remain Adjacent to a
    // Zouk-like broad restaurant even if the LLM assigns optimistic breadth.
    const deterministicNarrow = hasNarrowSpecialistSignal(context);
    const deterministicBroadOverride = candidateBreadth >= 75 && candidateSpec <= 55;
    const narrowSpecialistMismatch = semanticNarrowMismatch
      || (deterministicNarrow && !deterministicBroadOverride);

    if (
      semanticVerified
      && !narrowSpecialistMismatch
      && evidence >= cfg.minDirectEvidence
      && score >= cfg.directThreshold
      && breadth >= cfg.broadCandidateMenuBreadthMinForDirect
      && occasion >= 58
      && vertical >= 52
      && format >= 50
    ) return "direct";

    if (
      semanticVerified
      && evidence >= cfg.minAdjacentEvidence
      && score >= cfg.adjacentThreshold
      && occasion >= 50
      && vertical >= 30
      && (breadth >= 35 || format >= 50)
    ) return "adjacent";
  } else {
    let directCoreMin = 55;
    if (spec >= cfg.focusedSpecializationThreshold) directCoreMin = 75;
    else if (spec >= cfg.moderateSpecializationThreshold) directCoreMin = 65;

    if (
      semanticVerified
      && evidence >= cfg.minDirectEvidence
      && score >= cfg.directThreshold
      && core >= directCoreMin
      && occasion >= 55
      && vertical >= 48
    ) return "direct";
  }

  if (
    semanticVerified
    && evidence >= cfg.minAdjacentEvidence
    && score >= cfg.adjacentThreshold
    && (core >= 32 || occasion >= 55)
    && vertical >= 24
  ) return "adjacent";

  // Indirect still needs a real substitution mechanism. "Both are restaurants"
  // is insufficient. This keeps examples like Olive Garden vs shawarma out.
  if (
    semanticVerified
    && evidence >= cfg.minIndirectEvidence
    && score >= cfg.indirectThreshold
    && occasion >= 50
    && geo >= 20
    && (core >= 18 || vertical >= 25 || cuisine >= 25 || format >= 45)
  ) return "indirect";

  return "none";
}

export function composeFullScores(
  semantic: SemanticScores,
  targetPrice: string | null | undefined,
  candidatePrice: string | null | undefined,
  distanceMi: number | null,
  cfg: CompetitorConfig,
): FullScores {
  return {
    coreProduct: clamp(semantic.coreProduct),
    menuBreadth: clamp(semantic.menuBreadth),
    occasion: clamp(semantic.occasion),
    businessVertical: clamp(semantic.businessVertical),
    audience: clamp(semantic.audience),
    serviceFormat: clamp(semantic.serviceFormat),
    cuisine: clamp(semantic.cuisine),
    priceTier: priceOverlapScore(targetPrice, candidatePrice),
    geography: geographyPressureScore(distanceMi, cfg.geographyHalfLifeMi),
  };
}

const COMPETITOR_TYPE_RANK: Record<string, number> = {
  direct: 0,
  adjacent: 1,
  indirect: 2,
  none: 3,
  manual: 4,
};

function finiteDistance(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function priceMatchFromRow(row: any) {
  const n = Number(row?.scoreBreakdown?.priceTier ?? row?.priceMatchScore);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Official visible benchmark order requested by the product team:
 * 1. Direct before Adjacent
 * 2. Higher fit score first
 * 3. If fit ties, nearer distance first
 * 4. If those tie, closer price-tier match first
 */
export function benchmarkPrioritySort(a: any, b: any) {
  const typeA = COMPETITOR_TYPE_RANK[String(a?.competitorType || "none")] ?? 9;
  const typeB = COMPETITOR_TYPE_RANK[String(b?.competitorType || "none")] ?? 9;
  return typeA - typeB
    || (Number(b?.matchScore) || 0) - (Number(a?.matchScore) || 0)
    || finiteDistance(a?.distanceMi) - finiteDistance(b?.distanceMi)
    || priceMatchFromRow(b) - priceMatchFromRow(a)
    || String(a?.brandName || a?.name || "").localeCompare(String(b?.brandName || b?.name || ""));
}

/** Indirect alternatives use the same quality tie-breaks inside their own class. */
export function indirectPrioritySort(a: any, b: any) {
  return (Number(b?.matchScore) || 0) - (Number(a?.matchScore) || 0)
    || finiteDistance(a?.distanceMi) - finiteDistance(b?.distanceMi)
    || priceMatchFromRow(b) - priceMatchFromRow(a)
    || String(a?.brandName || a?.name || "").localeCompare(String(b?.brandName || b?.name || ""));
}
