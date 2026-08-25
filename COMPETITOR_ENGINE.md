# Universal Restaurant Competitor Intelligence Engine

**Version:** 3.0  
**Role:** Core policy and reasoning specification for the competitor engine.

## 1. Objective

The engine must identify the restaurants that represent the most meaningful real-world competitive threats to a specific target restaurant and branch, anywhere in the world.

The governing question is:

> **If this specific restaurant disappeared today, which other restaurants would most realistically absorb its customer demand?**

The engine must distinguish:

1. **Similarity** — how much two restaurants resemble one another.
2. **Substitutability** — how likely a customer is to choose one instead of the other.
3. **Competitive strength** — whether the candidate has enough real market power to capture meaningful demand.
4. **Competitive threat** — the final combination of realistic substitution and relative market power.

The final ranking must represent **competitive threat**, not superficial similarity.

---

## 2. Universal Invariants

These rules hold globally.

### 2.1 Evidence before assumptions
Infer what matters from current evidence. Do not force a restaurant into a pre-authored archetype.

### 2.2 Local before broad
Start with the target's practical local market and expand only when local alternatives are insufficient.

### 2.3 Density determines catchment
A dense category creates a tight catchment. A scarce or destination-led concept can justify a wider catchment.

### 2.4 Eligibility before scoring
A candidate that materially fails an essential customer-choice condition must not recover through unrelated high scores.

### 2.5 Customer job before cuisine label
Restaurants compete for customer demand and occasions, not merely taxonomic cuisine similarity.

### 2.6 Relative market power matters
A highly similar but commercially weak candidate is not automatically a major threat.

### 2.7 Context controls gate strength
Any feature may be a hard gate, strong gate, soft feature, weak modifier, or irrelevant depending on the target and market.

### 2.8 Candidate recall before ranking precision
Candidate discovery should gather the plausible market broadly; ranking should then be selective.

### 2.9 Current operating reality
Closed, stale, duplicated, wrong-branch, or same-parent entities must not be treated as active external competitors.

### 2.10 Explainability
Every top ranking must be traceable to evidence, weights, gates, and market-strength signals.

---

## 3. Target Competitive DNA

Before competitor ranking, resolve and profile the target branch.

Discover the dimensions that actually drive customer choice. Possible dimensions include, but are not limited to:

- core products and beverages,
- customer craving or purchase intent,
- cuisine,
- menu breadth and specialization,
- ingredient or preparation identity,
- typical spend,
- service model,
- convenience and speed,
- dine-in/takeout/delivery behavior,
- operating dayparts,
- customer occasions,
- audience,
- visit mode,
- group behavior,
- atmosphere,
- experience mechanics,
- cultural or dietary requirements,
- brand positioning,
- signature items,
- heritage and destination intent,
- access and travel behavior,
- any market-specific factor that materially affects customer substitution.

This list is illustrative, not exhaustive.

The engine must be able to introduce new competitive dimensions when the evidence requires them.

---

## 4. Core Demand Streams

Identify the major customer jobs satisfied by the target.

For each demand stream store:

```json
{
  "name": "human-readable customer job",
  "weight": 0.0,
  "evidence": ["short evidence"]
}
```

Demand-stream weights should sum approximately to 1.0.

The restaurant-level competitor score should reflect the combined demand streams, while the system may additionally expose demand-stream-specific competitors.

---

## 5. Dynamic Criteria Model

The engine begins with a global prior, then creates a target-specific effective model.

### 5.1 Default prior

| Criterion | Base Weight |
|---|---:|
| Dining occasion / customer job | 20% |
| Core product / craving / menu proposition | 18% |
| Geographic substitutability | 15% |
| Price / typical spend | 12% |
| Service model / convenience | 10% |
| Audience overlap | 7% |
| Restaurant experience / positioning | 6% |
| Consideration-set / market presence inside substitution | 12% |
| **Total** | **100%** |

These are priors, not fixed production weights.

### 5.2 Effective criteria

For each target, output 5–10 material criteria:

```json
{
  "key": "snake_case_key",
  "label": "Human-readable label",
  "base_weight": 0.15,
  "effective_weight": 0.24,
  "gate_strength": "none|soft|strong|hard",
  "reason": "Why this factor matters for this target",
  "evidence_confidence": 0.0
}
```

Effective weights must sum to 1.0.

Remove irrelevant criteria. Add newly discovered criteria when needed.

---

## 6. Contextual Gates

For each meaningful criterion determine whether it is:

- **hard** — failure normally eliminates direct competition,
- **strong** — failure prevents Direct unless exceptional evidence exists,
- **soft** — ranking feature,
- **none** — not an eligibility gate.

Do not create universal rules around any one attribute.

Gate strength must be derived from the target's customer decision and local market.

---

## 7. Geographic Catchment

Do not use one universal radius.

Infer a practical competitive catchment using:

- local restaurant density,
- category scarcity,
- format and travel behavior,
- destination intent,
- brand pull,
- road/transport patterns,
- neighborhood and commercial-cluster boundaries,
- availability of substitutes,
- delivery behavior where relevant.

Return:

```json
{
  "initial_radius_km": 0.0,
  "effective_radius_km": 0.0,
  "maximum_radius_km": 0.0,
  "distance_half_life_km": 0.0,
  "density": "very_dense|dense|moderate|sparse|very_sparse|unknown",
  "reason": "",
  "stop_after_strong_candidates": 0
}
```

Search from local to broad and stop expanding direct-competitor discovery once enough credible substitutes exist.

---

## 8. Candidate Discovery

Use multiple independent retrieval lanes. The exact lanes must adapt to the target.

Potential lanes:

- geography / same commercial area,
- category,
- core product or craving,
- customer occasion,
- service model,
- experience mechanic,
- broader substitute category,
- search-discovery co-occurrence,
- customer-review comparisons,
- social/content co-occurrence,
- local market prominence.

The target model should generate search queries in a generic form:

```json
{
  "query": "",
  "lane": "dynamic_lane_name",
  "priority": 0,
  "scope": "local|expanded",
  "reason": ""
}
```

Do not depend on a fixed hard-coded list of product synonyms.

---

## 9. Price Compatibility

Prefer actual menu-derived or order-basket spend over generic price symbols.

When only coarse price tiers are available, treat them as lower-confidence evidence.

A useful default economic corridor is:

- 0.80–1.25× target spend: very strong,
- 0.65–0.80× or 1.25–1.50×: moderate mismatch,
- 0.50–0.65× or 1.50–2.00×: strong mismatch,
- <0.50× or >2.00×: usually not direct unless the target model says price is weakly relevant.

This corridor is a prior, not a universal law.

---

## 10. Substitutability Score

For each eligible candidate, score the target-specific criteria from 0–100.

```json
{
  "criterion_key": "",
  "score": 0,
  "reason": "",
  "evidence": []
}
```

Then:

```text
SubstitutionScore =
Σ(criterion_score × effective_weight)
```

Apply contextual gate failures after the weighted score.

Do not let unrelated dimensions compensate for a failed hard gate.

---

## 11. Competitive Strength

Competitive strength is separate from substitution.

Potential current-market signals include:

- local review volume,
- review velocity,
- recent review activity,
- local search visibility,
- brand awareness,
- nearby branch network,
- city/regional/global scale,
- delivery prominence,
- social and creator visibility,
- years in market,
- customer familiarity,
- operational throughput,
- queue or footfall evidence,
- advertising presence,
- any relevant first-party behavioral evidence.

Do not reduce strength to raw review count or follower count.

Normalize signals against the target, category, business age, and local market where possible.

---

## 12. Relative Market Power

Compute or infer:

```text
RelativeStrength =
CandidateCompetitiveStrength / TargetCompetitiveStrength
```

A candidate may be highly similar yet too weak to be a major threat relative to the target.

Conversely, a powerful candidate can rank highly with slightly lower conceptual similarity when customers realistically consider it.

The target-specific model should choose the top-level split between substitutability and competitive strength.

Recommended prior:

```text
70% Substitutability
30% Competitive Strength
```

This split is dynamic and must be documented.

---

## 13. Final Competitive Threat

```text
FinalCompetitionScore =
(SubstitutionScore × SubstitutionWeight)
+
(CompetitiveStrengthScore × StrengthWeight)
-
ContextualPenalties
```

Clamp to 0–100.

Do not imply false precision: small score differences may represent effectively tied competitors.

---

## 14. Classification

Suggested classifications:

- Direct Competitor
- Strong Substitute
- Occasion Competitor
- Product / Craving Competitor
- Adjacent Competitor
- Benchmark
- Emerging Challenger
- Internal / Sister Concept
- Inactive
- Unverified

The engine may introduce a more accurate label if justified.

A Direct Competitor should normally require:

- high substitution,
- sufficient evidence,
- no failed hard gate,
- no material strong-gate mismatch,
- enough relative market strength to matter.

---

## 15. Market-Strength Protection

When the target has very high market strength, a low-scale candidate must not become a top competitive threat from menu similarity alone.

A low-scale candidate can still rank strongly if evidence demonstrates exceptional local strength, momentum, search demand, delivery prominence, queues/footfall, or other market proof.

Do not implement a simplistic chain-over-independent rule. Compare market strength relative to the target.

---

## 16. Evidence Confidence

Keep competition score and confidence separate.

```text
Confidence =
f(entity certainty,
  evidence completeness,
  source quality,
  freshness,
  cross-source agreement,
  price certainty,
  operating-status certainty,
  market-strength certainty)
```

High fit with weak evidence may yield:

```text
Competition Score = high
Confidence = moderate/low
```

The UI and API must preserve both.

---

## 17. Source and Service Matrix

No single service is sufficient globally.

| Signal | Preferred Source / Service | Secondary / Fallback |
|---|---|---|
| Entity, address, coordinates, status, categories, ratings/reviews | Google Places API or equivalent local-business provider | Official website, search/local directories |
| Travel time / route accessibility | Google Routes API, Mapbox, HERE, OSM routing | Haversine distance fallback |
| Current menu / pricing | Official menu / ordering site | Delivery platforms, reputable menu listings |
| Restaurant website positioning | Official website | Search snippets / business descriptions |
| Local category discovery / SERP visibility | DataForSEO, SerpApi, equivalent search provider | Search engine / Maps search |
| Branch network | Official location finder | Local-business search |
| Social links | Official website cross-links + verified social profiles | Search |
| Social awareness / creator activity | Public social/search data | Search results |
| Delivery prominence | Relevant delivery platform | Search / official ordering |
| Brand history / heritage | Official history + reputable independent sources | Search |
| Review comparisons | Review platforms / public discussions | Social comments |
| Review velocity | Historical snapshots stored by this system | Third-party analytics |
| Footfall | Licensed mobility source / first-party telemetry | Public queue/review evidence |
| Orders / menu views / switching | First-party analytics | None; strongest observed signal |
| CRM / loyalty overlap | First-party CRM / loyalty | None |
| Reservations | First-party / reservation integration | Booking platforms |

Use the best current source available for the fact being established.

---

## 18. Evidence Priority

Prefer current first-party or structured evidence where possible:

1. official restaurant/brand source,
2. official menu/order page,
3. structured mapping/business data,
4. delivery/booking sources,
5. official social profiles,
6. current search results,
7. reputable review platforms,
8. reputable press,
9. local directories,
10. public discussion.

This hierarchy is guidance, not a rigid law. Source appropriateness depends on the fact being established.

---

## 19. Social Presence

Collect verified social URLs where practical, but use social as evidence of awareness, discovery, momentum, and cultural relevance—not as the definition of competition.

Do not equate follower count with competitive strength.

---

## 20. Heritage / Destination Intent

Activate heritage only when there is evidence that history, signature dishes, nostalgia, cultural significance, tourist behavior, or local-institution status materially drives customer choice.

Age alone is not a competitive advantage.

When heritage is activated, it may affect:

- customer job,
- experience similarity,
- destination catchment,
- brand strength.

---

## 21. Ownership and Brand Family

Do not rank same-parent or sister concepts as external competitors unless internal cannibalization is explicitly requested.

Group multiple nearby branches of the same external brand as one competitor brand while preserving branch-level evidence.

---

## 22. Operating Status

Permanently closed candidates are excluded from active competition.

Temporarily closed candidates may be returned separately as inactive.

Unverified current status reduces confidence and should prevent aggressive ranking.

---

## 23. Explainability

For every top candidate be able to answer:

- Why is it a realistic substitute?
- Why is it ranked above the next candidate?
- Which criteria mattered most?
- Which gates passed or failed?
- What market-strength evidence supports the threat?
- What prevents it from scoring higher?
- How confident is the system?

Return notable exclusions to show that obvious candidates were considered and rejected for explicit reasons.

---

## 24. Candidate Search Stop Rule

The system should stop broadening direct-competitor discovery when the local market already contains enough credible substitutes to explain most of the target's demand.

Do not widen geography merely to fill a result count.

When insufficient substitutes exist, expand gradually by:

```text
exact / closest proposition
→ same customer job
→ same experience or service model
→ broader substitute category
```

---

## 25. LLM vs Deterministic Responsibilities

### LLM / intelligence layer
Use for:

- target competitive-DNA inference,
- customer-job extraction,
- dynamic criterion generation,
- gate-strength inference,
- query generation,
- semantic candidate scoring,
- interpreting reviews and positioning,
- heritage/destination inference,
- explaining rankings.

### Deterministic application layer
Use for:

- entity matching,
- operating-status exclusions,
- numeric distance,
- routing when available,
- price math,
- weight normalization,
- weighted scoring,
- market-strength normalization,
- relative-strength math,
- gate enforcement,
- penalties/caps,
- classification,
- stop conditions,
- confidence aggregation,
- sorting.

The LLM interprets. Code ranks. Evidence is the truth layer.

---

## 26. Required Target-Model Output

The target-model stage must return:

```json
{
  "summary": "",
  "business_scale": "independent|small_chain|regional|national|global|unknown",
  "target_market_strength_prior": 0,
  "target_market_strength_confidence": 0.0,
  "demand_streams": [
    {"name": "", "weight": 0.0, "evidence": []}
  ],
  "criteria": [
    {
      "key": "",
      "label": "",
      "base_weight": 0.0,
      "effective_weight": 0.0,
      "gate_strength": "none|soft|strong|hard",
      "reason": "",
      "evidence_confidence": 0.0
    }
  ],
  "top_level_split": {
    "substitutability": 0.70,
    "competitive_strength": 0.30
  },
  "catchment": {
    "initial_radius_km": 0.0,
    "effective_radius_km": 0.0,
    "maximum_radius_km": 0.0,
    "distance_half_life_km": 0.0,
    "density": "unknown",
    "reason": "",
    "stop_after_strong_candidates": 5
  },
  "discovery_queries": [
    {
      "query": "",
      "lane": "",
      "priority": 0,
      "scope": "local|expanded",
      "reason": ""
    }
  ],
  "confidence": 0.0
}
```

---

## 27. Required Candidate-Scoring Output

For each candidate return:

```json
{
  "candidate_number": 1,
  "dimension_scores": [
    {
      "key": "",
      "score": 0,
      "reason": "",
      "evidence": []
    }
  ],
  "market_strength_prior": 0,
  "market_strength_confidence": 0.0,
  "brand_scale": "independent|small_chain|regional|national|global|unknown",
  "reason": "",
  "confidence": 0.0
}
```

All requested candidate numbers must be returned.

---

## 28. Final Decision Test

Before returning a top Direct Competitor, confirm:

> **Would a meaningful number of this target restaurant's customers realistically choose this candidate instead for substantially the same customer job, within the same practical market, at a compatible economic and experiential level—and does the candidate have enough current market strength to meaningfully capture that demand?**

If not, do not rank it as a top Direct Competitor.

---

## 29. North Star

The system is not trying to find restaurants that look similar.

It is trying to model the **local market of customer substitution** around the target restaurant.

As first-party behavioral evidence becomes available, observed substitution should progressively outweigh inferred similarity.
