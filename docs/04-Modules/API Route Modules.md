---
title: API Route Modules
tags: [growth-audit, modules, api]
status: maintained
---

# API Route Modules

## `app/api/places/autocomplete/route.ts`

`GET` adapter for Google Places Autocomplete (New). Requires `input` and `GOOGLE_PLACES_API_KEY`, maps provider predictions to a compact UI shape, and returns 502/503-safe error messages.

## `app/api/places/details/route.ts`

`GET` adapter for Google Place Details. Requests identity, address, coordinates, website, Maps URL, reputation, types, price, reviews, and regular hours. It converts weekday descriptions into a `daysOpen` summary.

## `app/api/social/discover/route.ts`

`GET`, Node.js, maximum 30 seconds. Fetches the confirmed website, extracts social links, then optionally uses search fallback for missing Instagram, Facebook, and TikTok profiles.

## `app/api/social/check/route.ts`

`GET`, Node.js, maximum 60 seconds. Operational diagnostic route for SocialCrawl configuration, raw response envelopes, URL discovery, and normalized probe output. It exposes key presence and length, never the secret.

> [!warning]
> The raw diagnostic mode can expose provider response samples and should be treated as an operational endpoint, not a customer feature.

## `app/api/direct-audit/route.ts`

`POST`, Node.js, maximum 120 seconds. Primary orchestrator.

1. validates restaurant identity
2. inspects the target website
3. runs PageSpeed, social, reviews, and competitors concurrently
4. derives provider-specific sections
5. computes the deterministic Growth Engine result
6. requests optional AI interpretation
7. returns report evidence plus provider diagnostics

Every independent phase catches failure so one provider normally cannot collapse the entire report.

## `app/api/places/competitors/route.ts`

`GET`, Node.js, maximum 120 seconds. Universal V3 competitor engine. It loads Google evidence and the canonical policy, models the target, builds broad and focused discovery queries, searches nearby/text results, excludes invalid entities and same-brand branches, enriches candidates, scores substitution and market strength, applies gates, and returns ranked competitors.

## `app/api/lead/route.ts`

`POST`, Node.js. Rate-limited lead capture with email validation and optional submit secret. Best-effort side effects:

- merge/add Firestore lead
- POST a configured webhook
- upsert GoHighLevel contact

Failures are logged but the endpoint returns success so the audit is not blocked.

## `app/api/audits/route.ts`

`POST`, Node.js. Rate-limited optional audit persistence. Generates `aud_` plus a ten-character safe ID, stores normalized audit/business/score/lead data, and returns a public URL. When Firebase is absent it returns a soft success with `persisted: false`.

## `app/api/audits/[id]/route.ts`

`GET`, Node.js. Rate-limited public report lookup. Reads Firestore and explicitly projects a response without contact/lead details.

## Related notes

- [[05-APIs/API Index|API Index]]
- [[08-Operations/Security and Reliability|Security and Reliability]]
