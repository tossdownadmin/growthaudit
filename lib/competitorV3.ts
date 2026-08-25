import type { CompetitorConfig } from "@/lib/competitorConfig";
import {
  geographyPressureScore,
  priceOverlapScore,
  evidenceConfidenceLabel,
  evidenceConfidenceScore,
} from "@/lib/competitorEngine";
import type {
  CandidateDynamicEvaluation,
  DynamicCriterion,
  TargetCompetitionModel,
} from "@/lib/competitorAiV3";

export type V3CompetitorType = "direct" | "adjacent" | "indirect" | "none";
export type V3Classification =
  | "Direct Competitor"
  | "Strong Substitute"
  | "Occasion Competitor"
  | "Product / Craving Competitor"
  | "Adjacent Competitor"
  | "Emerging Challenger"
  | "Unverified"
  | "Not Competitive";

const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

function kmToMi(km: number) {
  return km * 0.621371;
}

function criterionKind(c: DynamicCriterion) {
  const s = `${c.key} ${c.label}`.toLowerCase();
  if (/(geo|distance|location|catchment|proximity|travel)/.test(s)) return "geography";
  if (/(price|spend|wallet|economic|cost|value)/.test(s)) return "price";
  if (/(occasion|customer job|job overlap|visit purpose|demand stream)/.test(s)) return "occasion";
  if (/(product|craving|menu|food|beverage|signature|protein|preparation)/.test(s)) return "product";
  if (/(service|convenience|speed|drive|takeout|delivery|wait|throughput)/.test(s)) return "service";
  if (/(audience|customer group|segment)/.test(s)) return "audience";
  if (/(experience|position|ambience|atmosphere|heritage|destination|visit mode)/.test(s)) return "experience";
  if (/(market presence|consideration|discovery|awareness)/.test(s)) return "presence";
  return "other";
}

export function dynamicGeographyScore(distanceMi: number | null, model: TargetCompetitionModel) {
  return geographyPressureScore(distanceMi, Math.max(0.2, kmToMi(model.catchment.distanceHalfLifeKm || 3)));
}

function findDynamicScore(evaln: CandidateDynamicEvaluation, key: string) {
  const found = evaln.dimensionScores.find((d) => d.key === key);
  return found ? clamp(found.score) : 50;
}

export function resolvedDimensionScores(
  model: TargetCompetitionModel,
  evaln: CandidateDynamicEvaluation,
  input: {
    distanceMi: number | null;
    targetPrice?: string | null;
    candidatePrice?: string | null;
  },
) {
  return model.criteria.map((criterion) => {
    const kind = criterionKind(criterion);
    let score = findDynamicScore(evaln, criterion.key);
    let source = "semantic";

    if (kind === "geography") {
      score = dynamicGeographyScore(input.distanceMi, model);
      source = "deterministic_distance";
    } else if (kind === "price" && input.targetPrice && input.candidatePrice) {
      score = priceOverlapScore(input.targetPrice, input.candidatePrice);
      source = "deterministic_price_tier";
    }

    return {
      key: criterion.key,
      label: criterion.label,
      kind,
      score: Math.round(clamp(score)),
      weight: criterion.effectiveWeight,
      gateStrength: criterion.gateStrength,
      reason: evaln.dimensionScores.find((d) => d.key === criterion.key)?.reason || criterion.reason,
      evidence: evaln.dimensionScores.find((d) => d.key === criterion.key)?.evidence || [],
      scoreSource: source,
    };
  });
}

export function substitutionScore(
  model: TargetCompetitionModel,
  dimensions: ReturnType<typeof resolvedDimensionScores>,
) {
  const totalWeight = model.criteria.reduce((s, c) => s + Math.max(0, c.effectiveWeight), 0) || 1;
  const total = dimensions.reduce((s, d) => s + d.score * Math.max(0, d.weight), 0) / totalWeight;
  return Math.round(clamp(total));
}

function percentile95(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return Math.max(1, sorted[idx]);
}

function reviewStrength(reviewCount: number, p95: number) {
  const numerator = Math.log1p(Math.max(0, reviewCount));
  const denominator = Math.log1p(Math.max(1, p95));
  return Math.round(clamp((numerator / denominator) * 100));
}

function relativeReviewStrength(candidate: number, target: number) {
  const ratio = (Math.max(0, candidate) + 25) / (Math.max(0, target) + 25);
  // 50 = same order of magnitude as target; each 10x changes ~30 points.
  return Math.round(clamp(50 + 30 * Math.log10(ratio)));
}

function branchStrength(branchCount: number) {
  const b = Math.max(1, Math.round(branchCount || 1));
  return Math.round(clamp(38 + 22 * Math.log2(b)));
}

function discoveryStrength(sources: number, lanes: number, matchedQueries: number) {
  return Math.round(clamp(
    30
    + Math.min(25, Math.max(0, sources - 1) * 8)
    + Math.min(25, Math.max(0, lanes - 1) * 7)
    + Math.min(20, matchedQueries * 5),
  ));
}

export function calculateCompetitiveStrength(
  candidate: {
    reviewCount?: number;
    branchCount?: number;
    discoverySources?: string[];
    discoveryLanes?: string[];
    textQueriesMatched?: string[];
  },
  evaln: CandidateDynamicEvaluation,
  context: {
    targetReviewCount: number;
    poolReviewCounts: number[];
  },
) {
  const candidateReviews = Math.max(0, Number(candidate.reviewCount) || 0);
  const p95 = percentile95([...context.poolReviewCounts, context.targetReviewCount]);

  const localAbsolute = reviewStrength(candidateReviews, p95);
  const reviewRelative = relativeReviewStrength(candidateReviews, context.targetReviewCount);
  const branches = branchStrength(candidate.branchCount || 1);
  const discovery = discoveryStrength(
    candidate.discoverySources?.length || 0,
    candidate.discoveryLanes?.length || 0,
    candidate.textQueriesMatched?.length || 0,
  );

  // The AI prior allows well-established brand scale to enter the model, but its
  // influence is automatically reduced when the evidence/model confidence is low.
  const priorConfidence = Math.max(0, Math.min(1, evaln.marketStrengthConfidence || 0));
  const priorWeight = 0.25 * priorConfidence;
  const deterministicWeight = 1 - priorWeight;

  const deterministic =
    localAbsolute * 0.42
    + reviewRelative * 0.28
    + branches * 0.18
    + discovery * 0.12;

  const final = deterministic * deterministicWeight + clamp(evaln.marketStrengthPrior) * priorWeight;

  return {
    score: Math.round(clamp(final)),
    components: {
      localReviewStrength: localAbsolute,
      targetRelativeReviews: reviewRelative,
      observedLocalBranchStrength: branches,
      discoveryPresence: discovery,
      brandMarketPrior: clamp(evaln.marketStrengthPrior),
      brandMarketPriorConfidence: Math.round(priorConfidence * 100),
    },
  };
}

export function targetCompetitiveStrength(
  model: TargetCompetitionModel,
  targetReviewCount: number,
  poolReviewCounts: number[],
) {
  const p95 = percentile95([...poolReviewCounts, targetReviewCount]);
  const review = reviewStrength(targetReviewCount, p95);
  const priorConfidence = Math.max(0, Math.min(1, model.targetMarketStrengthConfidence || 0));
  const priorWeight = 0.45 * priorConfidence;
  return Math.round(clamp(
    review * (1 - priorWeight) + clamp(model.targetMarketStrengthPrior) * priorWeight,
  ));
}

export function gateAssessment(
  dimensions: ReturnType<typeof resolvedDimensionScores>,
) {
  const failures = dimensions
    .filter((d) => d.gateStrength !== "none")
    .filter((d) => {
      if (d.gateStrength === "hard") return d.score < 50;
      if (d.gateStrength === "strong") return d.score < 45;
      if (d.gateStrength === "soft") return d.score < 25;
      return false;
    });

  const hardFailures = failures.filter((d) => d.gateStrength === "hard");
  const strongFailures = failures.filter((d) => d.gateStrength === "strong");
  const softFailures = failures.filter((d) => d.gateStrength === "soft");

  const penalty = Math.min(
    40,
    hardFailures.length * 24 + strongFailures.length * 12 + softFailures.length * 4,
  );

  return {
    failures,
    hardFailures,
    strongFailures,
    softFailures,
    penalty,
    directBlocked: hardFailures.length > 0 || strongFailures.length > 0,
  };
}

function strongestDimensionKind(dimensions: ReturnType<typeof resolvedDimensionScores>) {
  const weighted = [...dimensions]
    .sort((a, b) => (b.score * b.weight) - (a.score * a.weight));
  return weighted[0]?.kind || "other";
}

export function scoreCompetitorV3(
  cfg: CompetitorConfig,
  model: TargetCompetitionModel,
  candidate: {
    primaryType?: string | null;
    description?: string | null;
    website?: string | null;
    reviews?: { text?: string }[];
    reviewCount?: number;
    branchCount?: number;
    textQueriesMatched?: string[];
    categoryEvidence?: number;
    discoverySources?: string[];
    discoveryLanes?: string[];
    distanceMi: number | null;
    priceLevel?: string | null;
  },
  evaln: CandidateDynamicEvaluation,
  context: {
    targetPrice?: string | null;
    targetReviewCount: number;
    poolReviewCounts: number[];
    targetStrength: number;
  },
) {
  const dimensions = resolvedDimensionScores(model, evaln, {
    distanceMi: candidate.distanceMi,
    targetPrice: context.targetPrice,
    candidatePrice: candidate.priceLevel,
  });
  const substitution = substitutionScore(model, dimensions);
  const strength = calculateCompetitiveStrength(candidate, evaln, {
    targetReviewCount: context.targetReviewCount,
    poolReviewCounts: context.poolReviewCounts,
  });
  const relativeStrength = context.targetStrength > 0
    ? Math.max(0, Math.min(2, strength.score / context.targetStrength))
    : 1;

  const gates = gateAssessment(dimensions);
  const sWeight = Math.max(0, Math.min(1, model.topLevelSplit.substitutability));
  const mWeight = Math.max(0, Math.min(1, model.topLevelSplit.competitiveStrength));
  const totalWeight = sWeight + mWeight || 1;
  // Substitutability establishes whether the restaurant is genuinely competitive.
  // Market strength modifies the seriousness of that substitute rather than
  // independently overpowering a materially better fit.
  const strengthInfluence = mWeight / totalWeight;
  const strengthModifier = (strength.score - 50) * strengthInfluence * 0.35;
  const rawThreat = substitution + strengthModifier;
  let final = Math.round(clamp(rawThreat - gates.penalty));

  const evidenceConfidence = evidenceConfidenceScore(
    candidate,
    evaln.confidence,
    true,
  );

  const targetDominant = context.targetStrength >= 78 || model.businessScale === "global" || model.businessScale === "national";
  const lowScaleChallenge =
    targetDominant
    && strength.score < 58
    && relativeStrength < 0.70
    && (evaln.brandScale === "independent" || evaln.brandScale === "unknown");

  if (lowScaleChallenge) final = Math.min(final, 79);

  let competitorType: V3CompetitorType = "none";
  let classification: V3Classification = "Not Competitive";

  if (
    !gates.directBlocked
    && !lowScaleChallenge
    && evidenceConfidence >= Math.max(50, cfg.minDirectEvidence - 8)
    && substitution >= 68
    && final >= 72
  ) {
    competitorType = "direct";
    classification = "Direct Competitor";
  } else if (
    substitution >= 72
    && (lowScaleChallenge || strength.score < 55)
    && evidenceConfidence >= 45
  ) {
    competitorType = "adjacent";
    classification = "Emerging Challenger";
  } else if (
    evidenceConfidence >= Math.max(42, cfg.minAdjacentEvidence - 4)
    && substitution >= 52
    && final >= 50
    && gates.hardFailures.length === 0
  ) {
    competitorType = "adjacent";
    const strongest = strongestDimensionKind(dimensions);
    classification = strongest === "occasion"
      ? "Occasion Competitor"
      : strongest === "product"
        ? "Product / Craving Competitor"
        : substitution >= 65
          ? "Strong Substitute"
          : "Adjacent Competitor";
  } else if (
    evidenceConfidence >= Math.max(35, cfg.minIndirectEvidence - 5)
    && substitution >= 34
    && final >= 32
  ) {
    competitorType = "indirect";
    classification = "Adjacent Competitor";
  }

  if (evidenceConfidence < 35 && competitorType !== "none") {
    competitorType = "adjacent";
    classification = "Unverified";
  }

  return {
    finalCompetitionScore: final,
    substitutionScore: substitution,
    competitiveStrengthScore: strength.score,
    competitiveStrengthBreakdown: strength.components,
    relativeStrength: Math.round(relativeStrength * 100) / 100,
    competitorType,
    classification,
    evidenceConfidence,
    evidenceConfidenceLabel: evidenceConfidenceLabel(evidenceConfidence),
    dimensions,
    gateAssessment: {
      penalty: gates.penalty,
      directBlocked: gates.directBlocked,
      failures: gates.failures.map((d) => ({
        key: d.key,
        label: d.label,
        score: d.score,
        gateStrength: d.gateStrength,
      })),
    },
    marketPowerCapApplied: lowScaleChallenge,
    priceMatchScore: priceOverlapScore(context.targetPrice, candidate.priceLevel),
    geographyScore: dynamicGeographyScore(candidate.distanceMi, model),
  };
}
