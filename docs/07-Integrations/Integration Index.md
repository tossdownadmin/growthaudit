---
title: Integration Index
tags: [growth-audit, integrations, moc]
status: maintained
---

# Integration Index

## Provider matrix

| Provider | Role | Required? | Failure behavior |
|---|---|---:|---|
| Google Places (New) | search, details, reviews baseline, competitors | Core flow | focused routes fail; audit coverage degrades |
| PageSpeed Insights | mobile/desktop technical evidence | No | website evidence continues |
| Outscraper | recent Google reviews and owner responses | No | Google baseline/sample fallback |
| SocialCrawl | social profile/post activity | No | profiles remain discovered; activity unknown |
| SerpApi | Google-result discovery of missing websites and social profiles | No | website links only |
| Browserless | JavaScript/challenge HTML fallback | No | direct HTML result retained |
| OpenAI | interpretation and competitor semantics | No | deterministic fallbacks |
| Anthropic | alternative AI provider | No | deterministic fallbacks |
| Firestore | saved reports and leads | No | no share link/persistence |
| GoHighLevel | lead/contact sync | No | lead flow reports success |
| Lead webhook | generic lead integration | No | failure logged and ignored |
| Google Analytics 4 | anonymous page and audit-funnel measurement | No | tracking calls are disabled when the Measurement ID is absent |

## Google

Server-side requests use Places API (New) endpoints for autocomplete, details, nearby search, and text search. One key may also authorize PageSpeed Insights. Provider keys must never use `NEXT_PUBLIC_` names.

## Reviews

Outscraper supplies up to 60 newest reviews and owner responses, with a 30-review recovery attempt if the primary request is slow or empty. The adapter handles immediate and asynchronous result shapes, polls bounded result URLs, calculates rating-backed sentiment, and builds a deterministic product/service topic map from repeated language. The small Google Place Details review sample is useful as examples but insufficient for precise recent sentiment, response behavior, or topic mapping.

## Social

SocialCrawl payloads vary by platform and envelope, so the adapter probes endpoint variants and normalizes author, posts, computed metrics, cadence, follower counts, timestamps, likes, comments, and engagement. Guardrails suppress precise claims from weak or implausible evidence.

## AI

The same provider-agnostic client supports report prose and competitor semantics. AI is invoked in bounded calls with timeouts and token caps. Results are JSON-normalized; failures never replace deterministic facts.

## Persistence and CRM

Firestore Admin runs only server-side. GoHighLevel uses a private integration token. A generic webhook receives the lead payload as JSON. All three are best-effort relative to delivering the report.

## Analytics

GA4 is a browser-side, optional analytics integration. It records public, aggregate funnel events only and must never receive lead PII or private report data. See [[GA4 Analytics]].

## Related notes

- [[04-Modules/Provider Modules|Provider Modules]]
- [[09-Reference/Environment Variables|Environment Variables]]
