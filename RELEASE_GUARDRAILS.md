# Restaurant Growth Audit — Release Guardrails

This release treats the following as launch gates:

1. No contradictory pass/fail states.
2. Unknown or weak evidence can never render as a pass.
3. The local benchmark uses the calibrated V3 competitor engine when configured.
4. Small review/social samples cannot produce false precision.

## Reliability / fallback behavior

The owner-facing report should remain useful even when one upstream provider is slow:

- Reviews: Outscraper full sample -> polling -> Google rating/review-count baseline.
- Social: SocialCrawl retry -> confirmed public profile presence without invented activity metrics.
- Website: direct HTML -> Browserless fallback -> PageSpeed/Lighthouse verification.
- Competitors: calibrated V3 competitor service -> clearly lower-confidence local context.

Missing evidence is never converted to zero and never converted to green.
Provider failure language is kept out of the restaurant-owner report.

## New Vercel environment variable

Add:

COMPETITOR_ENGINE_URL=https://YOUR-WORKING-COMPETITOR-ENGINE-DEPLOYMENT

It can be either:
- the deployment base URL, or
- the full `/api/places/competitors` URL.

The audit will call the existing V3 competitor engine for the actual
substitution/threat set. If that service cannot be reached, the audit keeps a
directional local reference set so the main audit still renders.

## Key scoring guards

- A Growth Engine section cannot render green unless evidence coverage is >= 70%.
- Review-response scoring requires at least 10 reviews.
- Negative-review response rate becomes a primary score component only with at
  least 3 negative reviews in the sample.
- Google Places' small relevance-selected review sample never produces a precise
  recent-sentiment percentage.
- Social cadence requires >= 4 posts and reasonable evidence confidence.
- Social engagement requires >= 5 posts, >= 100 followers, and sufficient confidence.
- Extreme social engagement/cadence values are suppressed rather than shown as
  precise facts.
- Paid media `ready` now requires strong website/direct conversion, reputation,
  retention, measurement, and evidence-coverage gates.

## Validation performed here

- TypeScript/TSX syntax transpilation: PASS for all 25 TS/TSX files.
- A full dependency-aware Next.js typecheck/build cannot run in this container
  because node_modules/registry access is unavailable. Run `pnpm install`,
  `pnpm typecheck`, and `pnpm build` in v0/Vercel/local before production.
