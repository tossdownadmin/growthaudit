---
title: Design Principles
tags: [growth-audit, architecture, principles]
status: maintained
---

# Design Principles

## Deterministic facts, optional interpretation

Evidence adapters and scoring functions own facts and numeric results. AI turns those facts into concise strategy but must not contradict scores, ordering status, review-source limits, or competitor eligibility.

## Graceful degradation

Most provider failures are non-fatal:

- No AI: deterministic interpretation is used.
- No Outscraper: Google Places review baseline/sample is used where possible.
- No SocialCrawl: profiles can still be discovered, but activity is unknown.
- No Browserless: direct website-fetch evidence remains authoritative.
- No Firebase: report renders without a share link.
- No CRM: audit flow still proceeds.
- Competitor engine failure: lightweight Google benchmark is attempted.

## Unknown is not zero

Evidence coverage is separate from performance. Unknown signals reduce coverage, and insufficiently covered pillars can publish a null score rather than a misleading high or low number.

## Public evidence only

Absence of a visible loyalty, CRM, analytics, or advertising signal means “not publicly detected,” not “the business does not have it.”

## Bounded provider cost

Paid review, social, and PageSpeed integrations run only for the target restaurant. Competitors receive Google business facts and shallow website ordering checks.

## Best-effort side effects

Lead capture, webhook synchronization, CRM upsert, audit persistence, URL rewriting, and post-audit lead enrichment do not block delivery of the report.

## Privacy by projection

Stored Firestore audit documents may contain lead details; the public report API creates an explicit response that excludes `lead`.

## Related notes

- [[08-Operations/Security and Reliability|Security and Reliability]]
- [[04-Modules/Core Scoring Modules|Core Scoring Modules]]
