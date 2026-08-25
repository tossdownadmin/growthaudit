---
title: API Index
tags: [growth-audit, api, moc]
status: maintained
---

# API Index

All third-party credentials remain server-side. Unless noted, errors are JSON objects with an `error` string.

| Method | Route | Purpose | Key dependencies |
|---|---|---|---|
| GET | `/api/places/autocomplete?input=` | Restaurant suggestions | Google Places |
| GET | `/api/places/details?placeId=` | Selected location evidence | Google Places |
| GET | `/api/social/discover?url=&name=&address=` | Public profile discovery | Website, optional DataForSEO |
| GET | `/api/social/check` | Social diagnostics | Optional SocialCrawl |
| POST | `/api/direct-audit` | Complete growth audit | Multiple, gracefully degraded |
| GET | `/api/places/competitors` | V3 competitor discovery | Google, optional AI |
| POST | `/api/lead` | Lead capture and sync | Optional Firebase/GHL/webhook |
| POST | `/api/audits` | Save completed report | Optional Firebase |
| GET | `/api/audits/{id}` | Public saved report | Firebase |

## Main audit request

```json
{
  "placeId": "google-place-id",
  "name": "Restaurant Name",
  "address": "Full address",
  "websiteUrl": "https://restaurant.example",
  "googleWebsiteUrl": "https://restaurant.example",
  "lat": 0,
  "lng": 0,
  "rating": 4.6,
  "reviewCount": 320,
  "primaryType": "restaurant",
  "types": ["restaurant"],
  "priceLevel": "PRICE_LEVEL_MODERATE",
  "reviews": [],
  "openingHours": { "daysOpen": 7, "weekdayDescriptions": [] },
  "socials": { "instagram": "https://instagram.com/example" }
}
```

Required by the route: `placeId` and `name`. Most other fields improve coverage.

## Main audit response domains

- `restaurant` — normalized target identity
- `result` — deterministic score, coverage, pillars, ordering, readiness
- `interpretation` — AI or fallback owner narrative
- `website` — website and PageSpeed evidence
- `reviews` — reputation and recent-review evidence
- `reviews.topics` — deterministic product/service/experience topic map when an adequate Outscraper corpus is available
- `social` — discovered and analyzed profiles
- `benchmark` — local competitive context
- `diagnostics` — provider/configuration outcomes

## Status behavior

- 400 — invalid/missing request data
- 403 — secret/origin restriction
- 404 — report unavailable
- 429 — in-memory request limit reached
- 502 — upstream provider failure for focused adapter routes
- 503 — required provider configuration absent
- 500 — unexpected audit/persistence failure

## Related notes

- [[04-Modules/API Route Modules|API Route Modules]]
- [[06-Data/Data Model|Data Model]]
