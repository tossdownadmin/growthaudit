# MASTER BUILD PROMPT — tossdown Restaurant Growth Audit V1

Preserve the current working integrations and build around this product:

> Show restaurant owners where growth is working and where customers, orders, or repeat visits are leaking.

Do not add questionnaires. Do not ask users to choose competitors.

## Preserve

- Google Places
- website HTML + Browserless fallback
- metadata extraction
- PageSpeed mobile/desktop
- Outscraper review analysis + owner responses
- SocialCrawl public social activity
- OpenAI interpretation
- lead/share persistence code as-is
- current Tossdown visual language

## Growth Engine Score

1. Website + Ordering — 25
2. Reputation + Local Presence — 25
3. Customer Retention — 20
4. Customer Engagement — 15
5. Measurement + Growth — 15

Unknown evidence is excluded from scoring and lowers coverage.

## Ordering

Classify public order paths as:
owned / branded_direct / mixed / marketplace / unclear / none.

Marketplace checkout must not be treated as equivalent to owned/branded ordering.

## Local benchmark

Automatically build a small Google Places comparison set using location, category/concept evidence, distance and public business strength.

Benchmark only lightweight public signals:
rating, review count, website, shallow ordering posture.

Do not run paid review/social/PageSpeed APIs on competitors.

## LLM

Use the LLM only after deterministic evidence/scoring.

It should explain:
- biggest growth leak
- three highest-priority actions
- how the restaurant stacks up locally
- whether paid media should be added now or after fixing the engine

Keep restaurant-owner language.

## Report

Lead with business diagnosis, not technical SEO:
- Growth Engine Score
- five pillar scores
- biggest leak
- ordering ownership
- local benchmark
- reviews
- social
- paid-media readiness
- complete Tossdown growth-engine map
- technical evidence last

Technical metadata/PageSpeed remain available lower in the report.

Before finishing:
- pnpm typecheck
- pnpm build
- preserve current integrations
- do not hardcode restaurant brands
