---
title: Core Scoring Modules
tags: [growth-audit, modules, scoring]
status: maintained
---

# Core Scoring Modules

## `lib/growthEngine.ts`

Canonical Growth Engine scorer.

### Key logic

- `sectionScore` normalizes only known signals and calculates evidence coverage.
- `statusFor` keeps confidence separate from performance; a high score needs sufficient coverage to render as good.
- `ratingScore` maps roughly 3.5 to 0 and 4.8+ to 100.
- competitor reputation functions score target rating and review-volume position against local medians.
- `orderingScore` gives owned ordering the strongest value, followed by branded direct, mixed, unclear, marketplace, and none.
- website/customer-path helpers score Google website agreement, search readiness, measurement tags, conversion paths, and retention signals.
- `scoreGrowthEngine` publishes five sections, overall weighted score, coverage, provisional state, ordering, and paid-media readiness.
- `fallbackGrowthInterpretation` produces safe owner-facing text when AI is unavailable.

Paid media becomes ready only when score, coverage, website/ordering, reputation, retention, and measurement thresholds are all sufficiently strong. Low evidence coverage cannot unlock readiness.

## `lib/reviewAudit.ts`

Normalizes Google review evidence and scores customer-response behavior.

- submits/polls Outscraper jobs
- normalizes inconsistent provider date, rating, and response shapes
- maps the limited Google Places review sample as fallback evidence
- computes rating distribution, sentiment shares, response rates, negative-response rates, and median response time
- requests up to 60 newest reviews (with a 30-review recovery attempt) to balance interactive latency with meaningful theme detection
- builds a deterministic review topic map from repeated review language, separating **product**, **service**, **experience**, and other operational signals
- assigns each topic a positive, negative, neutral, or mixed star-rating-backed sentiment and an evidence-confidence label
- reports whether response behavior was actually measurable
- `scoreReviewResponse` evaluates response coverage and timeliness
- `scoreSentiment` evaluates recent customer sentiment

The topic map is a deterministic fallback and does not require an AI key. It is only shown when an Outscraper corpus is large enough for the declared confidence level. AI may add owner-friendly interpretation but never replaces the measured topic map.

Precise themes/percentages should not be inferred from the small Google Places sample.

## `lib/social.ts`

Social discovery, provider normalization, activity calculation, and section scoring.

- recognizes Instagram, Facebook, TikTok, YouTube, X/Twitter, Threads, LinkedIn, Pinterest, Snapchat, and WhatsApp
- rejects generic/share/login URLs and cleans tracking noise
- optionally discovers missing core profiles through DataForSEO search
- extracts canonical platform handles
- calculates post cadence, recency, engagement, and confidence from heterogeneous payloads
- calls SocialCrawl with retries/endpoint variants
- normalizes profiles and provider envelopes
- classifies profile activity
- scores the social section while suppressing implausible or under-supported exact metrics

## Legacy scoring in `lib/audit.ts`

`scoreAudit` and `fallbackInterpretation` represent the earlier Direct Relationship Score model. The current primary route uses `scoreGrowthEngine` and `fallbackGrowthInterpretation`; legacy exports remain for compatibility and historical evolution.

## Related notes

- [[01-Project/Project Overview|Project Overview]]
- [[06-Data/Data Model|Data Model]]
