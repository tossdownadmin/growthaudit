// V3-FINAL-DUAL-CALIBRATION-v3-20260817
import { NextRequest, NextResponse } from "next/server";
import { placesGet, placesPost } from "@/lib/google";
import { guard, bad } from "@/lib/http";
import { getCompetitorConfig } from "@/lib/competitorConfig";
import { classifyIdentity, type Identity, type MatchCandidateInput } from "@/lib/cuisine";
import {
  brandDisplayName,
  brandGroupKey,
  evidenceConfidenceLabel,
  isSameBrand,
  milesBetween,
  priceOverlapScore,
} from "@/lib/competitorEngine";
import {
  buildTargetCompetitionModel,
  scoreCandidatesDynamic,
  type CandidateDynamicEvaluation,
  type DiscoveryQuery,
  type TargetCompetitionModel,
} from "@/lib/competitorAiV3";
import {
  scoreCompetitorV3,
  targetCompetitiveStrength,
} from "@/lib/competitorV3";
import { getCompetitorPolicy } from "@/lib/competitorPolicy";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Universal competitor discovery v3.
 *
 * The repository-level COMPETITOR_ENGINE.md is the canonical reasoning policy.
 * It drives target-model inference and semantic candidate scoring. Deterministic
 * code enforces entity/status rules, geography, price evidence, market strength,
 * relative-strength protection, gates, penalties and final ranking.
 */

const BASE_DISCOVERY_TYPES = [
  "restaurant", "meal_takeaway", "cafe", "bakery", "fast_food_restaurant", "coffee_shop",
  "ice_cream_shop", "dessert_shop", "cake_shop", "pastry_shop", "donut_shop",
  "sandwich_shop", "pizza_restaurant", "hamburger_restaurant", "juice_shop",
  "tea_house", "snack_bar", "confectionery", "deli", "food_court",
  "shawarma_restaurant", "gyro_restaurant", "kebab_shop", "falafel_restaurant",
  "barbecue_restaurant", "pakistani_restaurant", "indian_restaurant",
  "mediterranean_restaurant", "middle_eastern_restaurant", "halal_restaurant",
];

const GENERIC_TYPES = new Set([
  "restaurant", "food", "point_of_interest", "establishment", "store",
  "meal_takeaway", "meal_delivery", "food_delivery", "catering_service",
  "service", "dine_in_restaurant", "takeout_restaurant", "family_restaurant",
  "food_store", "grocery_or_supermarket", "shop", "wholesaler", "market",
]);

const NON_COMPETING = new Set([
  "gas_station", "convenience_store", "supermarket", "grocery_store",
  "pharmacy", "lodging", "hotel", "department_store", "shopping_mall",
  "gym", "bank", "atm", "car_wash", "liquor_store",
]);

const FOOD_EXACT = new Set([
  ...BASE_DISCOVERY_TYPES,
  "meal_delivery", "food", "dessert_restaurant", "breakfast_restaurant",
  "brunch_restaurant", "fine_dining_restaurant", "buffet_restaurant",
  "chinese_restaurant", "japanese_restaurant", "korean_restaurant", "thai_restaurant",
  "turkish_restaurant", "lebanese_restaurant", "mexican_restaurant", "italian_restaurant",
  "french_restaurant", "greek_restaurant", "seafood_restaurant", "sushi_restaurant",
  "steak_house", "chicken_restaurant", "chicken_wings_restaurant", "noodle_shop",
  "ramen_restaurant", "salad_shop", "vegan_restaurant", "vegetarian_restaurant",
  "family_restaurant",
]);

const FOOD_SUFFIXES = ["_restaurant", "_shop", "_stand", "_house", "_cafe"];
const isFoodBusiness = (types: string[]) =>
  (types || []).some((t) => FOOD_EXACT.has(t) || FOOD_SUFFIXES.some((sfx) => t.endsWith(sfx)));

const SEARCH_FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location",
  "places.rating", "places.userRatingCount", "places.priceLevel",
  "places.primaryType", "places.types", "places.businessStatus",
].join(",");

const DETAIL_FIELDS = [
  "id", "displayName", "formattedAddress", "location", "primaryType", "types",
  "priceLevel", "editorialSummary", "rating", "userRatingCount", "websiteUri", "reviews",
  "regularOpeningHours",
].join(",");

type DiscoveryMatch = {
  query: string;
  lane: string;
  scope: "local" | "expanded";
  priority: number;
  reason?: string;
};

type SearchResult = {
  places: any[];
  ok: boolean;
  error?: string;
  source: string;
  discovery?: DiscoveryMatch;
};

function mappedReviews(p: any) {
  return (p?.reviews ?? []).slice(0, 5).map((r: any) => ({ text: r?.text?.text || "" }));
}

function cleanTypeLabel(s: string) {
  return (s || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function targetSpecificTypes(primaryType: string, types: string[]) {
  const out: string[] = [];
  for (const type of [primaryType, ...(types || [])]) {
    if (!type || GENERIC_TYPES.has(type) || NON_COMPETING.has(type)) continue;
    if (!isFoodBusiness([type])) continue;
    if (!out.includes(type)) out.push(type);
  }
  return out.slice(0, 8);
}

/**
 * Guaranteed high-recall discovery lane for product-focused targets.
 *
 * The LLM target model still controls the broader discovery strategy, but
 * focused and moderately focused restaurants get a small deterministic set of
 * exact product/category searches so obvious same-craving competitors cannot
 * be crowded out by generic nearby restaurants.
 *
 * No restaurant names, cities, or calibration cases are hardcoded here.
 */
function buildDirectProductRecallQueries(
  identity: Identity,
  primaryType: string,
  types: string[],
  moderateSpecializationThreshold: number,
): DiscoveryQuery[] {
  const productFocused =
    identity.specialization_score >= moderateSpecializationThreshold
    || identity.menu_breadth_score <= 45;

  if (!productFocused) return [];

  const weakGeneric =
    /^(?:restaurant|food|fast food|fast food restaurant|casual dining|family restaurant|halal|halal restaurant)$/i;

  const rawTerms = [
    identity.hero_product,
    ...(identity.primary_products || []).slice(0, 4),
    ...targetSpecificTypes(primaryType, types)
      .slice(0, 3)
      .map(cleanTypeLabel),
  ]
    .map((x) => String(x || "").replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 3)
    .filter((x) => !weakGeneric.test(x));

  const uniqueTerms: string[] = [];
  const seen = new Set<string>();

  for (const term of rawTerms) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTerms.push(term);
  }

  return uniqueTerms.slice(0, 3).map((term, index) => {
    const alreadyBusinessLike =
      /\b(?:restaurant|cafe|coffee|bakery|shop|grill|barbecue|bbq|steakhouse)\b/i.test(term);

    return {
      query: alreadyBusinessLike ? term : `${term} restaurant`,
      lane: "direct_product_recall",
      priority: 100 - index * 4,
      scope: "local" as const,
      reason: "Guaranteed same-product recall for a focused or moderately focused target.",
    };
  });
}


/**
 * Whole-restaurant recall for broad-menu / multi-cuisine targets.
 *
 * This is intentionally target-shape based, not restaurant-name based.
 * Focused concepts keep the existing direct-product recall behavior.
 */
function isBroadMenuTarget(model: TargetCompetitionModel) {
  const summary = String(model.summary || "");
  const broad =
    /\b(?:broad[- ]menu|multi[- ]cuisine|multicuisine|extensive menu|varied menu|wide[- ]ranging menu)\b/i
      .test(summary);

  const focused =
    /\b(?:specialist|specialized|focused concept|narrow concept|dedicated to)\b/i
      .test(summary);

  return broad && !focused;
}

function buildBroadMenuRecallQueries(
  model: TargetCompetitionModel,
): DiscoveryQuery[] {
  if (!isBroadMenuTarget(model)) return [];

  return [
    {
      query: "international restaurant",
      lane: "broad_menu_recall",
      priority: 98,
      scope: "local" as const,
      reason: "Whole-restaurant recall for a broad multi-cuisine target.",
    },
    {
      query: "contemporary restaurant",
      lane: "broad_menu_recall",
      priority: 95,
      scope: "local" as const,
      reason: "Recall nearby contemporary full-meal substitutes.",
    },
    {
      query: "full service restaurant",
      lane: "broad_menu_recall",
      priority: 92,
      scope: "local" as const,
      reason: "Recall comparable sit-down whole-occasion substitutes.",
    },
    {
      query: "casual dining restaurant",
      lane: "broad_menu_recall",
      priority: 90,
      scope: "local" as const,
      reason: "Recall broad casual-dining substitutes instead of one cuisine lane.",
    },
  ];
}


/**
 * Normalize a model that has already identified the target as broad-menu.
 *
 * The target may still contain a cuisine-specific demand stream or criterion
 * from noisy upstream evidence. For broad multi-cuisine restaurants those
 * signals remain secondary evidence, not a definition of the restaurant.
 */
function broadMenuCompetitiveSummary(identity: Identity) {
  const service = String(identity.service_model || "").toLowerCase();
  const servicePrefix = /full[ -]?service|table service|sit[ -]?down/.test(service)
    ? "full-service "
    : /quick service|counter service|fast casual/.test(service)
      ? "casual "
      : "";

  return `Broad-menu ${servicePrefix}restaurant serving multiple cuisines for mixed-preference dining occasions.`
    .replace(/\s+/g, " ")
    .trim();
}

function broadCuisineNames(identity: Identity) {
  const generic = new Set([
    "international",
    "global",
    "continental",
    "fusion",
    "multi cuisine",
    "multi-cuisine",
    "multicuisine",
  ]);

  return (identity.cuisines || [])
    .map((c) => String(c.name || "").trim().toLowerCase())
    .filter((name) => name.length >= 3 && !generic.has(name));
}

function containsCuisineSpecificSignal(value: unknown, identity: Identity) {
  const text = String(value || "").toLowerCase();
  if (!text) return false;

  if (/\b(?:cuisine-specific|specific cuisine|regional cuisine|regional dining|ethnic cuisine)\b/.test(text)) {
    return true;
  }

  return broadCuisineNames(identity).some((name) => text.includes(name));
}

function normalizeBroadTargetModel(
  model: TargetCompetitionModel,
  identity: Identity,
): TargetCompetitionModel {
  const keptStreams = model.demandStreams.filter((stream) =>
    !containsCuisineSpecificSignal(
      `${stream.name} ${(stream.evidence || []).join(" ")}`,
      identity,
    )
  );

  const sourceStreams = keptStreams.length
    ? keptStreams
    : [{
        name: "Broad-menu mixed-preference dining",
        weight: 1,
        evidence: ["Whole-restaurant substitution matters more than one cuisine-specific craving."],
      }];

  const streamWeightTotal = sourceStreams.reduce(
    (sum, stream) => sum + Math.max(0, Number(stream.weight) || 0),
    0,
  );

  const demandStreams = sourceStreams.map((stream) => ({
    ...stream,
    weight: streamWeightTotal > 0
      ? Math.max(0, Number(stream.weight) || 0) / streamWeightTotal
      : 1 / sourceStreams.length,
  }));

  const adjustedCriteria = model.criteria.map((criterion) => {
    if (!containsCuisineSpecificSignal(
      `${criterion.key} ${criterion.label} ${criterion.reason}`,
      identity,
    )) {
      return criterion;
    }

    return {
      ...criterion,
      effectiveWeight: Math.min(
        0.08,
        Math.max(0, Number(criterion.effectiveWeight) || 0),
      ),
      gateStrength:
        criterion.gateStrength === "hard" || criterion.gateStrength === "strong"
          ? "soft" as const
          : criterion.gateStrength,
      reason: `${criterion.reason || ""} Broad-menu safeguard: individual cuisine overlap is secondary unless independently proven central.`
        .trim()
        .slice(0, 260),
    };
  });

  const criterionWeightTotal = adjustedCriteria.reduce(
    (sum, criterion) => sum + Math.max(0, Number(criterion.effectiveWeight) || 0),
    0,
  );

  const criteria = criterionWeightTotal > 0
    ? adjustedCriteria.map((criterion) => ({
        ...criterion,
        effectiveWeight:
          Math.max(0, Number(criterion.effectiveWeight) || 0) / criterionWeightTotal,
      }))
    : model.criteria;

  const discoveryQueries = model.discoveryQueries.filter((query) =>
    !containsCuisineSpecificSignal(
      `${query.query} ${query.lane} ${query.reason}`,
      identity,
    )
  );

  return {
    ...model,
    summary: broadMenuCompetitiveSummary(identity),
    demandStreams,
    criteria,
    discoveryQueries,
  };
}


/**
 * Candidate semantic scoring should use the same broad-menu interpretation as
 * the normalized target model. Otherwise noisy raw cuisine fields can leak back
 * into explanations and substitution scores even after the model has correctly
 * identified the target as broad-menu.
 */
function normalizeBroadIdentity(
  identity: Identity,
  model: TargetCompetitionModel,
): Identity {
  return {
    ...identity,
    primary_identity: model.summary,
    hero_product: "",
    primary_products: ["broad multi-cuisine menu"],
    secondary_products: [],
    cuisines: [],
    specialization: "broad-menu",
    specialization_score: Math.min(40, Math.max(0, Number(identity.specialization_score) || 0)),
    menu_breadth_score: Math.max(75, Number(identity.menu_breadth_score) || 0),
    cuisine_concentration_score: Math.min(
      45,
      Math.max(0, Number(identity.cuisine_concentration_score) || 0),
    ),
  };
}


function isModeratelyFocusedFullServiceTarget(
  model: TargetCompetitionModel,
  identity?: Identity,
) {
  if (isBroadMenuTarget(model)) return false;

  const summary = String(model.summary || "").toLowerCase();
  const specializationScore = Number(identity?.specialization_score);

  const moderateFocus =
    /\bmoderately focused\b/.test(summary)
    || (
      Number.isFinite(specializationScore)
      && specializationScore >= 45
      && specializationScore <= 75
      && !/\b(?:specialist|highly focused|narrow specialist)\b/.test(summary)
    );

  const fullServiceOccasion =
    /\bfull[- ]service\b/.test(summary)
    || (
      /\b(?:family|group)\b/.test(summary)
      && /\b(?:dining|restaurant|hospitality)\b/.test(summary)
    );

  return moderateFocus && fullServiceOccasion;
}

function broadRecallMatchCount(row: any) {
  return (row.discoveryMatches || []).filter(
    (match: DiscoveryMatch) => match.lane === "broad_menu_recall",
  ).length;
}

function reviewVisibilityScore(row: any) {
  return Math.min(
    100,
    Math.log10(Math.max(0, Number(row.reviewCount) || 0) + 1) * 20,
  );
}

function proximityScore(row: any, effectiveRadiusMi: number) {
  const distance =
    row.distanceMi == null
      ? effectiveRadiusMi
      : Math.max(0, Number(row.distanceMi) || 0);

  return Math.max(
    0,
    100 * (1 - Math.min(distance / effectiveRadiusMi, 1)),
  );
}

function broadCandidatePriority(row: any, effectiveRadiusMi: number) {
  const broadMatches = Math.min(4, broadRecallMatchCount(row));
  const broadEvidence = Math.min(
    100,
    ((row.discoveryLanes || []).includes("broad_menu_recall") ? 45 : 0)
      + broadMatches * 14,
  );

  const queryDiversity = Math.min(
    100,
    (Math.min(4, row.textQueriesMatched?.length || 0) / 4) * 100,
  );

  const discoveryPriority = Math.max(
    0,
    Math.min(100, Number(row.discoveryPriority) || 0),
  );

  return (
    broadEvidence * 0.30
    + reviewVisibilityScore(row) * 0.25
    + proximityScore(row, effectiveRadiusMi) * 0.25
    + discoveryPriority * 0.10
    + queryDiversity * 0.10
  );
}

async function placeDetails(placeId: string) {
  try {
    return await placesGet(`places/${placeId}`, DETAIL_FIELDS);
  } catch (e: any) {
    console.log("Place enrichment failed:", placeId, e?.message);
    return null;
  }
}

async function nearby(
  rank: "DISTANCE" | "POPULARITY",
  lat: number,
  lng: number,
  radiusM: number,
  includedTypes: string[],
): Promise<SearchResult> {
  try {
    const d = await placesPost("places:searchNearby", SEARCH_FIELDS, {
      includedTypes,
      maxResultCount: 20,
      rankPreference: rank,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: Math.max(500, Math.min(50000, Math.round(radiusM))),
        },
      },
    });
    return { places: d.places ?? [], ok: true, source: `nearby_${rank.toLowerCase()}` };
  } catch (e: any) {
    return {
      places: [],
      ok: false,
      error: e?.message || "Nearby search failed",
      source: `nearby_${rank.toLowerCase()}`,
    };
  }
}

async function textSearch(
  item: DiscoveryQuery,
  lat: number,
  lng: number,
  radiusM: number,
  pageSize: number,
): Promise<SearchResult> {
  try {
    const d = await placesPost("places:searchText", SEARCH_FIELDS, {
      textQuery: item.query,
      pageSize: Math.max(1, Math.min(20, pageSize || 12)),
      rankPreference: item.scope === "expanded" ? "RELEVANCE" : "DISTANCE",
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: Math.max(500, Math.min(50000, Math.round(radiusM))),
        },
      },
    });

    return {
      places: d.places ?? [],
      ok: true,
      source: "text_search",
      discovery: {
        query: item.query,
        lane: item.lane,
        scope: item.scope,
        priority: item.priority,
        reason: item.reason,
      },
    };
  } catch (e: any) {
    return {
      places: [],
      ok: false,
      error: e?.message || "Text search failed",
      source: "text_search",
      discovery: {
        query: item.query,
        lane: item.lane,
        scope: item.scope,
        priority: item.priority,
        reason: item.reason,
      },
    };
  }
}

function groupBrandBranches(rows: any[]) {
  const grouped = new Map<string, any[]>();

  for (const row of rows) {
    const key = brandGroupKey(row.name) || row.placeId;
    const arr = grouped.get(key) || [];
    arr.push(row);
    grouped.set(key, arr);
  }

  return [...grouped.values()].map((branches) => {
    branches.sort((a, b) => (a.distanceMi ?? 999) - (b.distanceMi ?? 999));
    const representative = { ...branches[0] };
    const sources = new Set<string>();
    const lanes = new Set<string>();
    const queries = new Set<string>();
    const matches = new Map<string, DiscoveryMatch>();

    for (const branch of branches) {
      (branch.discoverySources || []).forEach((x: string) => sources.add(x));
      (branch.discoveryLanes || []).forEach((x: string) => lanes.add(x));
      (branch.textQueriesMatched || []).forEach((x: string) => queries.add(x));
      for (const match of branch.discoveryMatches || []) {
        const key = `${match.query.toLowerCase()}|${match.lane}`;
        const prev = matches.get(key);
        if (!prev || Number(match.priority) > Number(prev.priority)) matches.set(key, match);
      }
    }

    representative.brandName = brandDisplayName(representative.name);
    representative.branchCount = branches.length;
    representative.branchPlaceIds = branches.map((b) => b.placeId);
    representative.branchNames = branches.map((b) => b.name);
    representative.discoverySources = [...sources];
    representative.discoveryLanes = [...lanes];
    representative.textQueriesMatched = [...queries];
    representative.discoveryMatches = [...matches.values()];
    representative.discoveryPriority = Math.max(0, ...[...matches.values()].map((m) => Number(m.priority) || 0));
    return representative;
  });
}


function broadWholeRestaurantFormatScore(row: any) {
  const types = new Set<string>([
    String(row.primaryType || ""),
    ...((row.types || []).map((type: unknown) => String(type))),
  ]);

  if (
    types.has("buffet_restaurant")
    || types.has("family_restaurant")
    || types.has("fine_dining_restaurant")
    || types.has("brunch_restaurant")
  ) {
    return 100;
  }

  const narrowSignals = [
    "hamburger_restaurant",
    "pizza_restaurant",
    "shawarma_restaurant",
    "gyro_restaurant",
    "kebab_shop",
    "barbecue_restaurant",
    "chicken_restaurant",
    "chicken_wings_restaurant",
    "steak_house",
    "sushi_restaurant",
    "ramen_restaurant",
    "seafood_restaurant",
    "chinese_restaurant",
    "japanese_restaurant",
    "korean_restaurant",
    "thai_restaurant",
    "turkish_restaurant",
    "lebanese_restaurant",
    "mexican_restaurant",
    "italian_restaurant",
    "pakistani_restaurant",
    "indian_restaurant",
  ];

  if (narrowSignals.some((type) => types.has(type))) return 45;
  if (types.has("cafe") || types.has("coffee_shop")) return 75;
  return 85;
}

function chooseCandidatePool(rows: any[], max: number, model: TargetCompetitionModel) {
  if (!rows.length) return [];

  const selected = new Map<string, any>();

  const add = (row: any) => {
    if (row?.placeId && selected.size < max && !selected.has(row.placeId)) {
      selected.set(row.placeId, row);
    }
  };

  const isDirectRecall = (row: any) =>
    (row.discoveryLanes || []).includes("direct_product_recall");

  const isBroadRecall = (row: any) =>
    (row.discoveryLanes || []).includes("broad_menu_recall");

  const broadMode = isBroadMenuTarget(model);
  const effectiveRadiusMi = Math.max(
    0.5,
    model.catchment.effectiveRadiusKm * 0.621371,
  );

  const focusedNeighborhoodMi = Math.max(
    0.75,
    Math.min(1.5, effectiveRadiusMi * 0.35),
  );

  const modelQueryKeys = new Set<string>(
    (model.discoveryQueries || []).map(
      (query) => `${query.query.trim().toLowerCase()}|${query.lane}`,
    ),
  );

  const directRecallMatches = (row: any) =>
    (row.discoveryMatches || []).filter(
      (match: DiscoveryMatch) => match.lane === "direct_product_recall",
    );

  const modelMatches = (row: any) =>
    (row.discoveryMatches || []).filter((match: DiscoveryMatch) =>
      modelQueryKeys.has(`${match.query.trim().toLowerCase()}|${match.lane}`)
    );

  const directRecallEvidence = (row: any) => {
    const matches = directRecallMatches(row);
    if (!matches.length) return 0;

    const countScore = Math.min(100, (matches.length / 3) * 100);
    const maxPriority = Math.max(
      0,
      ...matches.map((match: DiscoveryMatch) => Number(match.priority) || 0),
    );

    return (
      countScore * 0.50
      + maxPriority * 0.30
      + reviewVisibilityScore(row) * 0.10
      + proximityScore(row, effectiveRadiusMi) * 0.10
    );
  };

  const modelDiscoveryEvidence = (row: any) => {
    const matches = modelMatches(row);
    if (!matches.length) return 0;

    const countScore = Math.min(100, (matches.length / 4) * 100);
    const maxPriority = Math.max(
      0,
      ...matches.map((match: DiscoveryMatch) => Number(match.priority) || 0),
    );

    return (
      countScore * 0.50
      + maxPriority * 0.30
      + proximityScore(row, effectiveRadiusMi) * 0.10
      + reviewVisibilityScore(row) * 0.10
    );
  };

  const neighborhoodProximity = (row: any) => {
    const distance = row.distanceMi == null
      ? focusedNeighborhoodMi
      : Math.max(0, Number(row.distanceMi) || 0);

    return Math.max(
      0,
      100 * (1 - Math.min(distance / focusedNeighborhoodMi, 1)),
    );
  };

  const focusedLocalPriority = (row: any) => {
    const discoveryEvidence = Math.min(
      100,
      (row.discoveryLanes?.length || 0) * 22
        + (row.textQueriesMatched?.length || 0) * 12,
    );

    return (
      neighborhoodProximity(row) * 0.50
      + reviewVisibilityScore(row) * 0.25
      + discoveryEvidence * 0.25
    );
  };

  const focusedOverallPriority = (row: any) => {
    const laneDiversity = Math.min(
      100,
      ((Math.min(4, row.discoveryLanes?.length || 0)) / 4) * 100,
    );
    const discoveryPriority = Math.max(
      0,
      Math.min(100, Number(row.discoveryPriority) || 0),
    );

    return (
      directRecallEvidence(row) * 0.28
      + modelDiscoveryEvidence(row) * 0.26
      + focusedLocalPriority(row) * 0.18
      + reviewVisibilityScore(row) * 0.10
      + discoveryPriority * 0.10
      + laneDiversity * 0.08
    );
  };

  /**
   * Focused concepts use balanced admission quotas rather than one heuristic.
   *
   * Candidate generation is a recall problem; semantic scoring is the precision
   * problem. The pool therefore reserves room for four independent ways a real
   * competitor can matter:
   *   1. nearby neighborhood substitution,
   *   2. exact product / craving substitution,
   *   3. target-model discovery lanes (occasion, audience, format, etc.),
   *   4. visible market power.
   *
   * These are overlapping reserves, not forced unique buckets. A restaurant that
   * qualifies in multiple ways satisfies multiple reserves without consuming
   * extra slots. This keeps room for candidates surfaced through different paths.
   */
  if (!broadMode) {
    const localQuota = Math.min(max, Math.max(10, Math.ceil(max * 0.30)));
    const directQuota = Math.min(max, Math.max(9, Math.ceil(max * 0.28)));
    const modelQuota = Math.min(max, Math.max(9, Math.ceil(max * 0.28)));
    const marketQuota = Math.min(max, Math.max(4, Math.ceil(max * 0.11)));

    [...rows]
      .filter((candidate) =>
        candidate.distanceMi != null
        && Number(candidate.distanceMi) <= focusedNeighborhoodMi)
      .sort((a, b) =>
        focusedLocalPriority(b) - focusedLocalPriority(a)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999)
        || (b.reviewCount || 0) - (a.reviewCount || 0))
      .slice(0, localQuota)
      .forEach(add);

    [...rows]
      .filter(isDirectRecall)
      .sort((a, b) =>
        directRecallEvidence(b) - directRecallEvidence(a)
        || (b.discoveryPriority || 0) - (a.discoveryPriority || 0)
        || (b.reviewCount || 0) - (a.reviewCount || 0)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999))
      .slice(0, directQuota)
      .forEach(add);

    // Preserve at least one strong representative from each model-generated lane
    // before adding the strongest model-discovered candidates overall.
    const modelLanes: string[] = [...new Set<string>(
      (model.discoveryQueries || []).map((query) => String(query.lane || "")),
    )]
      .filter(Boolean)
      .sort((a, b) => {
        const priorityFor = (lane: string) => Math.max(
          0,
          ...(model.discoveryQueries || [])
            .filter((query) => query.lane === lane)
            .map((query) => Number(query.priority) || 0),
        );
        return priorityFor(b) - priorityFor(a);
      });

    for (const lane of modelLanes) {
      const best = [...rows]
        .filter((row) =>
          modelMatches(row).some((match: DiscoveryMatch) => match.lane === lane))
        .sort((a, b) =>
          modelDiscoveryEvidence(b) - modelDiscoveryEvidence(a)
          || (a.distanceMi ?? 999) - (b.distanceMi ?? 999)
          || (b.reviewCount || 0) - (a.reviewCount || 0))[0];

      if (best) add(best);
    }

    [...rows]
      .filter((row) => modelMatches(row).length > 0)
      .sort((a, b) =>
        modelDiscoveryEvidence(b) - modelDiscoveryEvidence(a)
        || (b.discoveryPriority || 0) - (a.discoveryPriority || 0)
        || (b.reviewCount || 0) - (a.reviewCount || 0)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999))
      .slice(0, modelQuota)
      .forEach(add);

    [...rows]
      .sort((a, b) =>
        (b.reviewCount || 0) - (a.reviewCount || 0)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999))
      .slice(0, marketQuota)
      .forEach(add);
  }

  /**
   * Broad-menu concepts: reserve a larger share for restaurants that repeatedly
   * surface in whole-restaurant searches and also have meaningful local market
   * proof. This is deliberately not a cuisine or restaurant-name rule.
   */
  if (broadMode) {
    [...rows]
      .filter(isBroadRecall)
      .sort((a, b) =>
        broadCandidatePriority(b, effectiveRadiusMi)
        - broadCandidatePriority(a, effectiveRadiusMi)
        || (b.reviewCount || 0) - (a.reviewCount || 0)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999))
      .slice(0, Math.min(max, Math.max(14, Math.ceil(max * 0.40))))
      .forEach(add);

    // Preserve diversity across target-model discovery lanes.
    const lanes = [...new Set(model.discoveryQueries.map((q) => q.lane))];

    for (const lane of lanes) {
      rows
        .filter((r) => (r.discoveryLanes || []).includes(lane))
        .sort((a, b) =>
          (b.discoveryPriority || 0) - (a.discoveryPriority || 0)
          || (a.distanceMi ?? 999) - (b.distanceMi ?? 999)
          || (b.reviewCount || 0) - (a.reviewCount || 0))
        .slice(0, 2)
        .forEach(add);
    }

    /**
     * Hyperlocal recall remains important, but broad-menu targets should not let
     * immediate proximity alone consume most of the candidate budget.
     */
    [...rows]
      .sort((a, b) =>
        (a.distanceMi ?? 999) - (b.distanceMi ?? 999)
        || (b.reviewCount || 0) - (a.reviewCount || 0))
      .slice(0, Math.max(6, Math.ceil(max * 0.20)))
      .forEach(add);

    // Preserve visible market-power candidates.
    [...rows]
      .sort((a, b) =>
        (b.reviewCount || 0) - (a.reviewCount || 0)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999))
      .slice(0, Math.max(9, Math.ceil(max * 0.25)))
      .forEach(add);
  }

  // Fill remaining slots by target-appropriate blended recall evidence.
  [...rows]
    .sort((a, b) => {
      if (broadMode) {
        const broadDelta =
          broadCandidatePriority(b, effectiveRadiusMi)
          - broadCandidatePriority(a, effectiveRadiusMi);
        if (broadDelta) return broadDelta;
      } else {
        const focusedDelta =
          focusedOverallPriority(b) - focusedOverallPriority(a);
        if (focusedDelta) return focusedDelta;
      }

      return (
        (b.discoveryLanes?.length || 0) - (a.discoveryLanes?.length || 0)
        || (b.discoveryPriority || 0) - (a.discoveryPriority || 0)
        || (b.reviewCount || 0) - (a.reviewCount || 0)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999)
      );
    })
    .forEach(add);

  /**
   * Ordering determines enrichment and the limited semantic-evaluation budget.
   * Broad targets keep their existing whole-restaurant ordering. Focused targets
   * use the same balanced evidence families as pool admission.
   */
  const semanticPriority = (row: any) => {
    const laneCount = Math.min(4, row.discoveryLanes?.length || 0);
    const queryCount = Math.min(4, row.textQueriesMatched?.length || 0);

    const discoveryPriority = Math.max(
      0,
      Math.min(100, Number(row.discoveryPriority) || 0),
    );

    const proximity = proximityScore(row, effectiveRadiusMi);
    const reviewVisibility = reviewVisibilityScore(row);

    if (broadMode) {
      const broadMatches = Math.min(4, broadRecallMatchCount(row));
      const broadEvidence = Math.min(
        100,
        (isBroadRecall(row) ? 45 : 0) + broadMatches * 14,
      );

      return (
        broadEvidence * 0.30
        + broadWholeRestaurantFormatScore(row) * 0.20
        + reviewVisibility * 0.20
        + proximity * 0.15
        + discoveryPriority * 0.07
        + (queryCount / 4) * 100 * 0.05
        + (laneCount / 4) * 100 * 0.03
      );
    }

    return (
      directRecallEvidence(row) * 0.30
      + modelDiscoveryEvidence(row) * 0.27
      + focusedLocalPriority(row) * 0.20
      + reviewVisibility * 0.10
      + discoveryPriority * 0.08
      + (laneCount / 4) * 100 * 0.05
    );
  };

  const semanticOrdered = [...selected.values()]
    .sort((a, b) =>
      semanticPriority(b) - semanticPriority(a)
      || (b.discoveryPriority || 0) - (a.discoveryPriority || 0)
      || (b.reviewCount || 0) - (a.reviewCount || 0)
      || (a.distanceMi ?? 999) - (b.distanceMi ?? 999));

  if (!broadMode) return semanticOrdered.slice(0, max);

  /**
   * Broad-menu semantic reserve.
   *
   * Keep the existing broad ranking, but guarantee that a small set of highly
   * visible, nearby whole-restaurant alternatives reach the semantic budget.
   * This prevents broad-search lane frequency from crowding out obvious
   * whole-occasion substitutes before the LLM can evaluate them.
   */
  const wholeRestaurantReserveCount = Math.min(
    max,
    Math.max(6, Math.ceil(max * 0.22)),
  );

  const wholeRestaurantReserve = [...selected.values()]
    .sort((a, b) => {
      const reserveScore = (row: any) =>
        broadWholeRestaurantFormatScore(row) * 0.35
        + reviewVisibilityScore(row) * 0.35
        + proximityScore(row, effectiveRadiusMi) * 0.30;

      return (
        reserveScore(b) - reserveScore(a)
        || (b.reviewCount || 0) - (a.reviewCount || 0)
        || (a.distanceMi ?? 999) - (b.distanceMi ?? 999)
      );
    })
    .slice(0, wholeRestaurantReserveCount);

  const broadSemanticOrder = new Map<string, any>();
  for (const row of wholeRestaurantReserve) {
    if (row?.placeId) broadSemanticOrder.set(row.placeId, row);
  }
  for (const row of semanticOrdered) {
    if (row?.placeId && !broadSemanticOrder.has(row.placeId)) {
      broadSemanticOrder.set(row.placeId, row);
    }
  }

  return [...broadSemanticOrder.values()].slice(0, max);
}

async function enrichCandidates(candidates: any[], maxEnriched: number) {
  const selected = candidates.slice(0, Math.max(1, maxEnriched));
  const ids = new Set(selected.map((c) => c.placeId));
  const details = await Promise.all(selected.map(async (c) => ({ c, d: await placeDetails(c.placeId) })));
  const enriched = new Map<string, any>();

  for (const { c, d } of details) {
    if (!d) continue;
    enriched.set(c.placeId, {
      ...c,
      primaryType: d.primaryType ?? c.primaryType,
      types: d.types ?? c.types,
      priceLevel: d.priceLevel ?? c.priceLevel,
      description: d.editorialSummary?.text ?? null,
      website: d.websiteUri ?? null,
      reviews: mappedReviews(d),
      hours: d.regularOpeningHours?.weekdayDescriptions ?? [],
    });
  }

  return candidates.map((c) => ids.has(c.placeId) ? (enriched.get(c.placeId) || c) : c);
}

function fallbackEvaluation(model: TargetCompetitionModel, candidate: any): CandidateDynamicEvaluation {
  const discovered = Math.min(100, 35 + (candidate.discoveryLanes?.length || 0) * 8 + (candidate.textQueriesMatched?.length || 0) * 5);
  return {
    dimensionScores: model.criteria.map((criterion) => ({
      key: criterion.key,
      score: /consideration|presence|awareness/i.test(`${criterion.key} ${criterion.label}`) ? discovered : 50,
      reason: "Deterministic fallback because semantic evidence was unavailable.",
      evidence: [],
    })),
    marketStrengthPrior: Math.min(100, 35 + Math.log10((candidate.reviewCount || 0) + 1) * 18),
    marketStrengthConfidence: 0.20,
    brandScale: "unknown",
    reason: "Limited evidence; semantic competitor scoring was unavailable.",
    confidence: 0.25,
  };
}

function cleanIdentityOut(identity: Identity, model: TargetCompetitionModel) {
  return {
    primary: identity.primary_identity,
    heroProduct: identity.hero_product,
    businessVertical: identity.business_vertical,
    primaryProducts: identity.primary_products,
    secondaryProducts: identity.secondary_products,
    serviceModel: identity.service_model,
    priceTier: identity.price_tier,
    occasions: identity.occasions,
    audiences: identity.audiences,
    specialization: identity.specialization,
    specializationScore: identity.specialization_score,
    menuBreadthScore: identity.menu_breadth_score,
    cuisineConcentrationScore: identity.cuisine_concentration_score,
    conceptAttributes: identity.concept_attributes,
    confidence: identity.confidence,
    cuisines: identity.cuisines?.slice(0, 5).map((c) => c.name) ?? [],
    competitiveSummary: model.summary,
    businessScale: model.businessScale,
    demandStreams: model.demandStreams,
  };
}

function competitorSort(a: any, b: any) {
  const typeRank: Record<string, number> = { direct: 0, adjacent: 1, indirect: 2, none: 3 };
  return (typeRank[a.competitorType] ?? 9) - (typeRank[b.competitorType] ?? 9)
    || (b.matchScore || 0) - (a.matchScore || 0)
    || (b.substitutionScore || 0) - (a.substitutionScore || 0)
    || (b.competitiveStrengthScore || 0) - (a.competitiveStrengthScore || 0)
    || (a.distanceMi ?? 999) - (b.distanceMi ?? 999);
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const marks: Record<string, number> = {};
  const blocked = guard(req, 20);
  if (blocked) return blocked;

  const sp = req.nextUrl.searchParams;
  const selfId = sp.get("placeId") || "";
  if (!selfId || !/^[A-Za-z0-9_\-]+$/.test(selfId)) return bad("valid placeId required");

  const cfgStarted = Date.now();
  const [cfg, targetDetails] = await Promise.all([
    getCompetitorConfig(),
    placeDetails(selfId),
  ]);
  marks.targetAndConfigMs = Date.now() - cfgStarted;
  if (!targetDetails) return bad("target restaurant could not be resolved", 502);

  const queryLat = Number(sp.get("lat"));
  const queryLng = Number(sp.get("lng"));
  const lat = Number.isFinite(targetDetails?.location?.latitude) ? targetDetails.location.latitude : queryLat;
  const lng = Number.isFinite(targetDetails?.location?.longitude) ? targetDetails.location.longitude : queryLng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("target location required");

  const selfName = targetDetails?.displayName?.text || sp.get("name") || "";
  const primaryType = targetDetails?.primaryType || sp.get("primaryType") || "";
  const targetTypes = targetDetails?.types || (sp.get("types") || "").split(",").filter(Boolean);
  const targetPrice = targetDetails?.priceLevel || sp.get("priceLevel") || null;
  const targetWebsite = targetDetails?.websiteUri || sp.get("website") || null;
  const targetReviews = mappedReviews(targetDetails);
  const targetReviewCount = targetDetails?.userRatingCount ?? 0;

  // A small local density probe is evidence for catchment inference. It is not a
  // competitor list and does not decide the answer itself.
  const densityRadiusM = Math.min(3000, Math.max(1500, cfg.searchRadiusM / 3));
  const densityStarted = Date.now();
  const densityPromise = nearby("DISTANCE", lat, lng, densityRadiusM, BASE_DISCOVERY_TYPES);
  const identityPromise = classifyIdentity(cfg, {
    placeId: selfId,
    name: selfName,
    primaryType,
    types: targetTypes,
    description: targetDetails?.editorialSummary?.text || sp.get("description"),
    siteTitle: sp.get("siteTitle"),
    siteDescription: sp.get("siteDescription"),
    website: targetWebsite,
    priceLevel: targetPrice,
    reviews: targetReviews,
  });

  const [densityProbe, identity] = await Promise.all([densityPromise, identityPromise]);
  marks.identityAndDensityMs = Date.now() - densityStarted;

  const densityFood = (densityProbe.places || []).filter((p: any) => isFoodBusiness(p.types || []));
  const densityReviews = densityFood.map((p: any) => Number(p.userRatingCount) || 0).sort((a: number, b: number) => a - b);
  const medianDensityReviews = densityReviews.length
    ? densityReviews[Math.floor(densityReviews.length / 2)]
    : null;

  const modelStarted = Date.now();
  const targetModelRaw = await buildTargetCompetitionModel(cfg, {
    name: selfName,
    address: targetDetails?.formattedAddress || null,
    primaryType,
    types: targetTypes,
    priceLevel: targetPrice,
    rating: targetDetails?.rating ?? null,
    reviewCount: targetReviewCount,
    website: targetWebsite,
    description: targetDetails?.editorialSummary?.text || null,
    reviews: targetReviews,
    identity,
    localDensitySample: {
      radiusKm: densityRadiusM / 1000,
      foodPlacesObserved: densityFood.length,
      sampleSaturated: densityFood.length >= 20,
      medianReviewCount: medianDensityReviews,
    },
  });

  const broadMenuMode = isBroadMenuTarget(targetModelRaw);
  const targetModel = broadMenuMode
    ? normalizeBroadTargetModel(targetModelRaw, identity)
    : targetModelRaw;

  const scoringIdentity = broadMenuMode
    ? normalizeBroadIdentity(identity, targetModel)
    : identity;

  marks.targetModelMs = Date.now() - modelStarted;

  const effectiveRadiusM = Math.max(
    500,
    Math.min(50000, Math.round(targetModel.catchment.effectiveRadiusKm * 1000)),
  );
  const maximumRadiusM = Math.max(
    effectiveRadiusM,
    Math.min(50000, Math.round(targetModel.catchment.maximumRadiusKm * 1000)),
  );

  const modelQueries = targetModel.discoveryQueries.length
    ? targetModel.discoveryQueries
    : [{
        query: cleanTypeLabel(primaryType || identity.business_vertical || "restaurant"),
        lane: "target_category",
        priority: 70,
        scope: "local" as const,
        reason: "Fallback target-category query.",
      }];

  const directProductRecallQueries = broadMenuMode
    ? []
    : buildDirectProductRecallQueries(
        identity,
        primaryType,
        targetTypes,
        cfg.moderateSpecializationThreshold,
      );

  const broadMenuRecallQueries = buildBroadMenuRecallQueries(targetModel);

  // Focused concepts get same-product recall. Broad-menu concepts get
  // whole-restaurant recall. Model-generated discovery remains intact.
  const dynamicQueries = [
    ...directProductRecallQueries,
    ...broadMenuRecallQueries,
    ...modelQueries,
  ]
    .filter((query, index, all) =>
      all.findIndex(
        (other) => other.query.trim().toLowerCase() === query.query.trim().toLowerCase(),
      ) === index
    )
    .slice(
      0,
      cfg.maxTextQueries
        + directProductRecallQueries.length
        + broadMenuRecallQueries.length,
    );

  const specificTypes = targetSpecificTypes(primaryType, targetTypes);
  const nearbyTypes = [...new Set([...specificTypes, ...BASE_DISCOVERY_TYPES])].slice(0, 45);

  const discoveryStarted = Date.now();
  const discoveryResults = await Promise.all([
    nearby("DISTANCE", lat, lng, effectiveRadiusM, nearbyTypes),
    nearby("POPULARITY", lat, lng, effectiveRadiusM, nearbyTypes),
    ...dynamicQueries.map((q) => textSearch(
      q,
      lat,
      lng,
      q.scope === "expanded" ? maximumRadiusM : effectiveRadiusM,
      q.lane === "direct_product_recall" || q.lane === "broad_menu_recall"
        ? 20
        : cfg.textSearchPageSize,
    )),
  ]);
  marks.discoveryMs = Date.now() - discoveryStarted;

  if (!discoveryResults.some((r) => r.ok)) {
    return NextResponse.json({
      status: "error",
      code: "PLACES_DISCOVERY_FAILED",
      message: "Competitor discovery failed. Please retry.",
      engineVersion: cfg.engineVersion,
      diagnostics: {
        errors: discoveryResults.map((r) => r.error).filter(Boolean),
        timings: { ...marks, totalMs: Date.now() - started },
      },
    }, { status: 502 });
  }

  const merged = new Map<string, any>();
  for (const result of discoveryResults) {
    for (const p of result.places || []) {
      if (!p?.id) continue;
      const row = merged.get(p.id) || {
        ...p,
        __sources: [],
        __queries: [],
        __lanes: [],
        __matches: [],
      };

      row.__sources = [...new Set([...(row.__sources || []), result.source])];
      if (result.discovery) {
        row.__queries = [...new Set([...(row.__queries || []), result.discovery.query])];
        row.__lanes = [...new Set([...(row.__lanes || []), result.discovery.lane])];
        const key = `${result.discovery.query.toLowerCase()}|${result.discovery.lane}`;
        const existing = (row.__matches || []).find((m: DiscoveryMatch) => `${m.query.toLowerCase()}|${m.lane}` === key);
        if (!existing) row.__matches = [...(row.__matches || []), result.discovery];
      }

      for (const [key, value] of Object.entries(p)) {
        if (value != null && row[key] == null) row[key] = value;
      }
      merged.set(p.id, row);
    }
  }

  const maxRadiusMi = maximumRadiusM / 1609.344;
  const rawCandidates = [...merged.values()]
    .filter((p) => p.id !== selfId)
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL")
    .filter((p) => !(p.types || []).some((t: string) => NON_COMPETING.has(t)))
    .filter((p) => isFoodBusiness(p.types || []))
    .map((p) => {
      const distanceMi = p.location
        ? milesBetween(lat, lng, p.location.latitude, p.location.longitude)
        : null;

      return {
        placeId: p.id,
        name: p.displayName?.text ?? "",
        brandName: p.displayName?.text ?? "",
        address: p.formattedAddress ?? "",
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? 0,
        priceLevel: p.priceLevel ?? null,
        primaryType: p.primaryType ?? null,
        types: p.types ?? [],
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        distanceMi: distanceMi == null ? null : Math.round(distanceMi * 100) / 100,
        description: null,
        website: null,
        reviews: [],
        discoverySources: p.__sources || [],
        discoveryLanes: p.__lanes || [],
        textQueriesMatched: p.__queries || [],
        discoveryMatches: p.__matches || [],
        discoveryPriority: Math.max(0, ...(p.__matches || []).map((m: DiscoveryMatch) => Number(m.priority) || 0)),
        branchCount: 1,
        branchPlaceIds: [p.id],
        branchNames: [p.displayName?.text ?? ""],
      };
    })
    .filter((c) => c.distanceMi == null || c.distanceMi <= maxRadiusMi + 0.1)
    .filter((c) =>
      c.reviewCount >= cfg.reviewFloor
      || c.textQueriesMatched.length > 0
      || (c.distanceMi ?? 999) <= 0.75)
    .filter((c) => !isSameBrand(
      { name: selfName, website: targetWebsite },
      { name: c.name, website: null },
    ));

  const grouped = groupBrandBranches(rawCandidates);
  let candidates = chooseCandidatePool(grouped, cfg.maxCandidates, targetModel);

  const enrichmentStarted = Date.now();
  candidates = await enrichCandidates(candidates, Math.max(cfg.maxEnrichedCandidates, Math.min(14, cfg.maxCandidates)));
  candidates = candidates.filter((c) => !isSameBrand(
    { name: selfName, website: targetWebsite },
    { name: c.name, website: c.website },
  ));
  marks.enrichmentMs = Date.now() - enrichmentStarted;

  const llmInput: Array<MatchCandidateInput & {
    rating?: number | null;
    reviewCount?: number;
    branchCount?: number;
    discoverySources?: string[];
    discoveryLanes?: string[];
    textQueriesMatched?: string[];
  }> = candidates.map((c) => ({
    placeId: c.placeId,
    name: c.name,
    primaryType: c.primaryType,
    types: c.types,
    distanceMi: c.distanceMi,
    priceLevel: c.priceLevel,
    description: c.description,
    website: c.website,
    reviews: c.reviews,
    rating: c.rating,
    reviewCount: c.reviewCount,
    branchCount: c.branchCount,
    discoverySources: c.discoverySources,
    discoveryLanes: c.discoveryLanes,
    textQueriesMatched: c.textQueriesMatched,
  }));

  const semanticStarted = Date.now();
  let evaluations: Record<string, CandidateDynamicEvaluation> = {};
  try {
    evaluations = await scoreCandidatesDynamic(cfg, {
      name: selfName,
      identity: scoringIdentity,
      model: targetModel,
    }, llmInput);
  } catch (e: any) {
    console.log("Dynamic competitor scoring failed:", e?.message);
  }
  marks.semanticMs = Date.now() - semanticStarted;

  const poolReviewCounts = candidates.map((c) => Number(c.reviewCount) || 0);
  const targetStrength = targetCompetitiveStrength(targetModel, targetReviewCount, poolReviewCounts);
  const moderateFocusCentralityMode = isModeratelyFocusedFullServiceTarget(
    targetModel,
    scoringIdentity,
  );

  const scored = candidates.map((c) => {
    const evaluation = evaluations[c.placeId] || fallbackEvaluation(targetModel, c);
    const v3 = scoreCompetitorV3(cfg, targetModel, c, evaluation, {
      targetPrice,
      targetReviewCount,
      poolReviewCounts,
      targetStrength,
    });

    let adjustedFinalScore = v3.finalCompetitionScore;
    let adjustedSubstitutionScore = v3.substitutionScore;
    let adjustedCompetitorType = v3.competitorType;
    let adjustedClassification = v3.classification;
    let centralityCapApplied = false;

    /**
     * Moderately focused full-service targets need a centrality guard.
     *
     * A broad same-cuisine restaurant can be a powerful occasion competitor
     * without being a close substitute for the target's defining product core.
     * Market strength remains untouched; only substitution/directness is capped
     * when semantic evidence says the defining proposition is secondary.
     *
     * Sharply focused fast-casual/specialist targets are intentionally excluded,
     * so their existing direct-product behavior is unchanged.
     */
    const coreCentrality = Number(evaluation.corePropositionCentrality);
    const coreCentralityConfidence = Number(
      evaluation.corePropositionCentralityConfidence,
    );

    if (
      moderateFocusCentralityMode
      && evaluations[c.placeId]
      && Number.isFinite(coreCentrality)
      && Number.isFinite(coreCentralityConfidence)
      && coreCentralityConfidence >= 0.45
      && coreCentrality < 65
    ) {
      const directRecallBonus =
        (c.discoveryLanes || []).includes("direct_product_recall") ? 3 : 0;
      const substitutionCap = Math.round(
        Math.min(74, 58 + coreCentrality * 0.20 + directRecallBonus),
      );
      const threatCap = Math.min(76, substitutionCap + 4);

      adjustedSubstitutionScore = Math.min(
        adjustedSubstitutionScore,
        substitutionCap,
      );
      adjustedFinalScore = Math.min(adjustedFinalScore, threatCap);
      centralityCapApplied = true;

      if (adjustedCompetitorType === "direct") {
        adjustedCompetitorType = "adjacent";
        adjustedClassification = coreCentrality >= 55
          ? "Strong Substitute"
          : "Occasion Competitor";
      }
    }

    return {
      ...c,

      // Backward-compatible fields expected by the current UI.
      matchScore: adjustedFinalScore,
      competitorType: adjustedCompetitorType,
      matchReason: evaluation.reason,
      priceMatchScore: v3.priceMatchScore,
      evidenceConfidence: v3.evidenceConfidence,
      evidenceConfidenceLabel: v3.evidenceConfidenceLabel,

      // V3 fields.
      classification: adjustedClassification,
      substitutionScore: adjustedSubstitutionScore,
      competitiveStrengthScore: v3.competitiveStrengthScore,
      competitiveStrengthBreakdown: v3.competitiveStrengthBreakdown,
      relativeStrength: v3.relativeStrength,
      marketPowerCapApplied: v3.marketPowerCapApplied,
      dynamicCriteria: v3.dimensions,
      gateAssessment: v3.gateAssessment,
      brandScale: evaluation.brandScale,
      marketStrengthPrior: evaluation.marketStrengthPrior,
      marketStrengthConfidence: evaluation.marketStrengthConfidence,
      corePropositionCentrality: evaluation.corePropositionCentrality ?? null,
      corePropositionCentralityConfidence:
        evaluation.corePropositionCentralityConfidence ?? null,
      centralityCapApplied,

      scoreBreakdown: {
        priceTier: v3.priceMatchScore,
        geography: v3.geographyScore,
        dynamic: v3.dimensions,
      },
      confidence: evaluation.confidence,
      evidence: v3.dimensions.flatMap((d) => d.evidence || []).slice(0, 8),
      classificationSource: evaluations[c.placeId] ? "universal_policy_v3" : "deterministic_fallback",
    };
  });

  const benchmarkCandidates = scored
    .filter((c) => c.competitorType === "direct" || c.competitorType === "adjacent")
    .sort(competitorSort)
    .slice(0, cfg.maxResults);

  const indirectCompetitors = scored
    .filter((c) => c.competitorType === "indirect")
    .sort(competitorSort)
    .slice(0, cfg.maxIndirectResults);

  const exclusions = scored
    .filter((c) => c.competitorType === "none")
    .sort((a, b) => (b.substitutionScore || 0) - (a.substitutionScore || 0))
    .slice(0, 5)
    .map((c) => ({
      placeId: c.placeId,
      name: c.brandName || c.name,
      substitutionScore: c.substitutionScore,
      competitiveStrengthScore: c.competitiveStrengthScore,
      gateFailures: c.gateAssessment?.failures || [],
      reason: c.matchReason,
    }));

  const { hash: policyHash } = getCompetitorPolicy();

  return NextResponse.json({
    status: "ok",
    mode: Object.keys(evaluations).length ? "universal_competition_v3" : "universal_v3_fallback",
    engineVersion: cfg.engineVersion,
    policyVersion: "3.0",
    policyHash,

    identity: cleanIdentityOut(scoringIdentity, targetModel),

    competitiveModel: {
      summary: targetModel.summary,
      businessScale: targetModel.businessScale,
      targetCompetitiveStrength: targetStrength,
      targetMarketStrengthPrior: targetModel.targetMarketStrengthPrior,
      targetMarketStrengthConfidence: targetModel.targetMarketStrengthConfidence,
      demandStreams: targetModel.demandStreams,
      criteria: targetModel.criteria,
      topLevelSplit: targetModel.topLevelSplit,
      catchment: targetModel.catchment,
      discoveryQueries: targetModel.discoveryQueries,
      confidence: targetModel.confidence,
    },

    competitors: benchmarkCandidates,
    indirectCompetitors,
    excludedCandidates: exclusions,

    diagnostics: {
      policyHash,
      effectiveRadiusKm: Math.round((effectiveRadiusM / 1000) * 10) / 10,
      maximumRadiusKm: Math.round((maximumRadiusM / 1000) * 10) / 10,
      localDensitySample: {
        radiusKm: densityRadiusM / 1000,
        foodPlacesObserved: densityFood.length,
        sampleSaturated: densityFood.length >= 20,
        medianReviewCount: medianDensityReviews,
      },
      broadMenuMode,
      moderateFocusCentralityMode,
      rawTargetSummary: targetModelRaw.summary,
      normalizedTargetSummary: targetModel.summary,
      scoringIdentityPrimary: scoringIdentity.primary_identity,
      focusedLocalAnchorMi: broadMenuMode
        ? null
        : Math.round(
            Math.max(
              0.75,
              Math.min(
                1.5,
                Math.max(0.5, targetModel.catchment.effectiveRadiusKm * 0.621371) * 0.35,
              ),
            ) * 100,
          ) / 100,
      focusedNeighborhoodMi: broadMenuMode
        ? null
        : Math.round(
            Math.max(
              0.75,
              Math.min(
                1.5,
                Math.max(0.5, targetModel.catchment.effectiveRadiusKm * 0.621371) * 0.35,
              ),
            ) * 100,
          ) / 100,
      focusedPoolQuotaPlan: broadMenuMode
        ? null
        : {
            local: Math.min(cfg.maxCandidates, Math.max(10, Math.ceil(cfg.maxCandidates * 0.30))),
            directProduct: Math.min(cfg.maxCandidates, Math.max(9, Math.ceil(cfg.maxCandidates * 0.28))),
            modelDiscovery: Math.min(cfg.maxCandidates, Math.max(9, Math.ceil(cfg.maxCandidates * 0.28))),
            marketStrength: Math.min(cfg.maxCandidates, Math.max(4, Math.ceil(cfg.maxCandidates * 0.11))),
          },
      focusedLocalCandidateNames: broadMenuMode
        ? []
        : grouped
            .filter((candidate) =>
              candidate.distanceMi != null
              && Number(candidate.distanceMi) <= Math.max(
                0.75,
                Math.min(
                  1.5,
                  Math.max(0.5, targetModel.catchment.effectiveRadiusKm * 0.621371) * 0.35,
                ),
              ))
            .sort((a, b) =>
              (a.distanceMi ?? 999) - (b.distanceMi ?? 999)
              || (b.reviewCount || 0) - (a.reviewCount || 0))
            .map((candidate) => ({
              name: candidate.name,
              distanceMi: candidate.distanceMi,
              reviewCount: candidate.reviewCount || 0,
              directProductRecall: (candidate.discoveryLanes || []).includes("direct_product_recall"),
              modelDiscoveryMatches: (candidate.discoveryMatches || []).filter(
                (match: DiscoveryMatch) =>
                  (targetModel.discoveryQueries || []).some(
                    (query) =>
                      query.lane === match.lane
                      && query.query.trim().toLowerCase() === match.query.trim().toLowerCase(),
                  ),
              ).length,
            })),
      directProductRecallQueries,
      broadMenuRecallQueries,
      discoveredPlaceNames: [...merged.values()]
        .map((place) => place.displayName?.text || "")
        .filter(Boolean),
      groupedBrandNames: grouped.map((candidate) => candidate.name),
      candidatePoolNames: candidates.map((candidate) => candidate.name),
      semanticCandidateNames: candidates
        .slice(0, cfg.maxSemanticCandidates)
        .map((candidate) => candidate.name),
      googleSearches: discoveryResults.length,
      googleSearchesSucceeded: discoveryResults.filter((r) => r.ok).length,
      dynamicQueries,
      discoveredPlaces: merged.size,
      rawCandidateBranches: rawCandidates.length,
      groupedBrands: grouped.length,
      candidatePool: candidates.length,
      semanticEvaluated: Object.keys(evaluations).length,
      direct: scored.filter((c) => c.competitorType === "direct").length,
      adjacent: scored.filter((c) => c.competitorType === "adjacent").length,
      indirect: scored.filter((c) => c.competitorType === "indirect").length,
      rejected: scored.filter((c) => c.competitorType === "none").length,
      targetStrength,
      timings: { ...marks, totalMs: Date.now() - started },
    },
  });
}
